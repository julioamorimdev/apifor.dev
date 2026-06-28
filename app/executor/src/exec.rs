// exec — pipeline de execução real do M2.2.
// DispatchStep(exec) -> workdir isolado por tarefa -> clone -> agente coda
// (Anthropic com a chave do user, ou stub) -> commit -> push -> abre PR.
// Código e credenciais ficam LOCAIS; o cérebro só recebe branch + url do PR.
use crate::vault::Vault;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(serde::Deserialize)]
pub struct Instr {
    pub repo_url: String,
    #[serde(default = "default_branch")]
    pub base_branch: String,
    pub branch: String,
    #[serde(default)]
    pub change_request: String,
    #[serde(default)]
    pub target_files: Vec<String>,
    #[serde(default)]
    pub model: String, // M4.2: modelo do agente desta etapa (coder/reviewer)
}
fn default_branch() -> String {
    "main".into()
}

const FALLBACK_MODEL: &str = "claude-opus-4-8";
fn model_or(instr: &Instr) -> String {
    if instr.model.is_empty() {
        FALLBACK_MODEL.into()
    } else {
        instr.model.clone()
    }
}

pub struct ExecResult {
    pub branch: String,
    pub url: String,
}

fn repo_path(task_id: &str) -> PathBuf {
    base_dir().join(task_id).join("repo")
}

fn base_dir() -> PathBuf {
    PathBuf::from(std::env::var("APIFOR_HOME").unwrap_or_else(|_| "/var/lib/apifor".into())).join("work")
}

/// Roda git num diretório e devolve stdout (erro = stderr).
fn git(dir: &Path, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .output()
        .map_err(|e| format!("git spawn: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(format!(
            "git {:?}: {}",
            args,
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

/// Injeta o token na URL https do GitHub (fica só local, no remote do clone).
fn authed_url(repo_url: &str, token: &Option<String>) -> String {
    match token {
        Some(t) if repo_url.starts_with("https://github.com/") => {
            repo_url.replacen("https://", &format!("https://x-access-token:{t}@"), 1)
        }
        _ => repo_url.to_string(),
    }
}

pub async fn run(task_id: &str, instr_json: &str, vault: &Vault) -> Result<ExecResult, String> {
    let instr: Instr = serde_json::from_str(instr_json).map_err(|e| format!("instr inválida: {e}"))?;
    let gh_token = vault.get("github");

    // 1. workdir isolado por tarefa (limpa execução anterior)
    let work = base_dir().join(task_id);
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let repo = work.join("repo");

    // 2. clone (URL com token se for GitHub privado)
    let clone_url = authed_url(&instr.repo_url, &gh_token);
    git(&work, &["clone", "--depth", "1", "-b", &instr.base_branch, &clone_url, repo.to_str().unwrap()])
        .or_else(|_| git(&work, &["clone", "--depth", "1", &clone_url, repo.to_str().unwrap()]))?;

    // 3. branch novo
    git(&repo, &["checkout", "-b", &instr.branch])?;

    // 4. agente coda (LOCAL): Anthropic com a chave do user, ou stub determinístico
    let summary = match vault.get("anthropic") {
        Some(key) => match code_with_llm(&key, &repo, &instr).await {
            Ok(n) => format!("{n} arquivo(s) editado(s) pela Anthropic ({})", model_or(&instr)),
            Err(e) => {
                eprintln!("exec: coder LLM falhou ({e}); usando stub");
                stub_code(&repo, &instr)
            }
        },
        None => stub_code(&repo, &instr),
    };

    // 5. commit
    git(&repo, &["add", "-A"])?;
    git(
        &repo,
        &[
            "-c", "user.email=bot@apifor.dev",
            "-c", "user.name=apifor bot",
            "commit", "-m", &format!("apifor: {}", first_line(&instr.change_request)),
        ],
    )?;

    // 6. push do branch
    git(&repo, &["push", "origin", &instr.branch])?;
    println!("exec: branch {} pushed ({summary})", instr.branch);

    // 7. abre PR (GitHub API se houver token + remote github; senão registra o branch)
    let url = match open_pr(&instr, &gh_token).await {
        Ok(u) => u,
        Err(e) => {
            eprintln!("exec: PR via API falhou/indisponível ({e}); registrando branch local");
            format!("local:{}#{}", instr.repo_url, instr.branch)
        }
    };

    Ok(ExecResult { branch: instr.branch, url })
}

fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or("mudança").trim().to_string()
}

// ───────────────────────── M4: test / review / merge ─────────────────────────
// Reusam o workdir já clonado pelo exec (persistente em APIFOR_HOME/work/<task>).

/// run_test — roda a checagem no workdir. Default: passa (sem testes configurados);
/// APIFOR_TEST_CMD roda um comando real; APIFOR_TEST_FAIL=1 força falha (p/ demo do gate).
pub fn run_test(task_id: &str, instr_json: &str) -> Result<(bool, String), String> {
    let instr: Instr = serde_json::from_str(instr_json).map_err(|e| e.to_string())?;
    let repo = repo_path(task_id);
    if !repo.exists() {
        return Err("workdir da tarefa ausente".into());
    }
    let _ = git(&repo, &["checkout", &instr.branch]);
    if std::env::var("APIFOR_TEST_FAIL").ok().as_deref() == Some("1") {
        return Ok((false, "teste falhou (APIFOR_TEST_FAIL=1)".into()));
    }
    match std::env::var("APIFOR_TEST_CMD") {
        Ok(cmd) if !cmd.is_empty() => {
            let out = Command::new("bash")
                .current_dir(&repo)
                .args(["-c", &cmd])
                .output()
                .map_err(|e| e.to_string())?;
            let log = String::from_utf8_lossy(&out.stdout);
            Ok((out.status.success(), format!("`{cmd}`: {}", log.trim().chars().take(160).collect::<String>())))
        }
        _ => Ok((true, "sem testes configurados (ok)".into())),
    }
}

/// run_review — revisa o DIFF (fica local); só o veredicto vai ao cérebro.
/// Anthropic com a chave do user (modelo do agente reviewer) ou stub.
pub async fn run_review(task_id: &str, instr_json: &str, vault: &Vault) -> Result<(bool, String), String> {
    let instr: Instr = serde_json::from_str(instr_json).map_err(|e| e.to_string())?;
    let repo = repo_path(task_id);
    if !repo.exists() {
        return Err("workdir da tarefa ausente".into());
    }
    let diff = git(&repo, &["diff", &format!("{}..{}", instr.base_branch, instr.branch)]).unwrap_or_default();
    if diff.trim().is_empty() {
        return Ok((false, "diff vazio — nada a revisar".into()));
    }
    match vault.get("anthropic") {
        Some(key) => review_with_llm(&key, &model_or(&instr), &instr.change_request, &diff).await,
        None => Ok((true, "stub: revisão aprovada (sem chave anthropic)".into())),
    }
}

#[derive(serde::Deserialize)]
struct ReviewJson {
    #[serde(default)]
    approved: bool,
    #[serde(default)]
    comments: String,
}

async fn review_with_llm(key: &str, model: &str, change: &str, diff: &str) -> Result<(bool, String), String> {
    println!("reviewer: usando modelo {model}");
    let capped: String = diff.chars().take(12000).collect();
    let system = "Você é um revisor de código sênior. Avalie o diff frente ao pedido e \
        responda em JSON {\"approved\":bool,\"comments\":string}. Aprove se a mudança é \
        correta e segura; senão approved=false com o motivo curto.";
    let user = format!("PEDIDO:\n{change}\n\nDIFF:\n{capped}");
    let schema = serde_json::json!({
        "type":"object","additionalProperties":false,"required":["approved","comments"],
        "properties":{"approved":{"type":"boolean"},"comments":{"type":"string"}}
    });
    let body = serde_json::json!({
        "model":model,"max_tokens":1000,"system":system,
        "output_config":{"format":{"type":"json_schema","schema":schema}},
        "messages":[{"role":"user","content":user}]
    });
    let resp = reqwest::Client::new()
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let txt = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    #[derive(serde::Deserialize)]
    struct R {
        content: Vec<B>,
    }
    #[derive(serde::Deserialize)]
    struct B {
        #[serde(default)]
        text: String,
    }
    let parsed: R = serde_json::from_str(&txt).map_err(|e| e.to_string())?;
    let json_text: String = parsed.content.iter().map(|b| b.text.as_str()).collect();
    let rj: ReviewJson = serde_json::from_str(json_text.trim()).map_err(|e| e.to_string())?;
    Ok((rj.approved, rj.comments))
}

/// run_merge — integra o branch na base e dá push (respeita a estratégia básica).
pub fn run_merge(task_id: &str, instr_json: &str) -> Result<String, String> {
    let instr: Instr = serde_json::from_str(instr_json).map_err(|e| e.to_string())?;
    let repo = repo_path(task_id);
    if !repo.exists() {
        return Err("workdir da tarefa ausente".into());
    }
    git(&repo, &["checkout", &instr.base_branch])?;
    let msg = format!("apifor merge: {}", first_line(&instr.change_request));
    git(
        &repo,
        &[
            "-c", "user.email=bot@apifor.dev", "-c", "user.name=apifor bot",
            "merge", "--no-ff", "-m", &msg, &instr.branch,
        ],
    )?;
    git(&repo, &["push", "origin", &instr.base_branch])?;
    Ok(format!("local:{}#{}", instr.repo_url, instr.base_branch))
}

// ───────────────────────── coder ─────────────────────────

#[derive(serde::Deserialize)]
struct CoderResp {
    content: Vec<Block>,
}
#[derive(serde::Deserialize)]
struct Block {
    #[serde(default)]
    text: String,
}
#[derive(serde::Deserialize)]
struct FilesJson {
    #[serde(default)]
    files: Vec<FileEdit>,
}
#[derive(serde::Deserialize)]
struct FileEdit {
    path: String,
    content: String,
}

/// Pede ao modelo o conteúdo NOVO dos arquivos-alvo e grava LOCAL. Nada disso sai da máquina.
async fn code_with_llm(key: &str, repo: &Path, instr: &Instr) -> Result<usize, String> {
    let mut ctx = String::new();
    for f in &instr.target_files {
        if f.contains("..") {
            continue;
        }
        if let Ok(c) = std::fs::read_to_string(repo.join(f)) {
            ctx.push_str(&format!("\n===== {f} (atual) =====\n{}\n", &c[..c.len().min(6000)]));
        }
    }
    let system = "Você é um agente que escreve código. Receba um pedido e o conteúdo atual \
        dos arquivos-alvo. Devolva o conteúdo NOVO COMPLETO de cada arquivo que precisa mudar, \
        em JSON {\"files\":[{\"path\":...,\"content\":...}]}. Edite o mínimo necessário.";
    let user = format!("PEDIDO:\n{}\n\nARQUIVOS:\n{ctx}", instr.change_request);
    let model = model_or(instr);
    println!("coder: usando modelo {model}");
    let schema = serde_json::json!({
        "type":"object","additionalProperties":false,"required":["files"],
        "properties":{"files":{"type":"array","items":{
            "type":"object","additionalProperties":false,"required":["path","content"],
            "properties":{"path":{"type":"string"},"content":{"type":"string"}}}}}
    });
    let body = serde_json::json!({
        "model":model,"max_tokens":4000,"system":system,
        "output_config":{"format":{"type":"json_schema","schema":schema}},
        "messages":[{"role":"user","content":user}]
    });
    let resp = reqwest::Client::new()
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let txt = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", &txt[..txt.len().min(160)]));
    }
    let parsed: CoderResp = serde_json::from_str(&txt).map_err(|e| e.to_string())?;
    let json_text: String = parsed.content.iter().map(|b| b.text.as_str()).collect();
    let fj: FilesJson = serde_json::from_str(json_text.trim()).map_err(|e| e.to_string())?;
    let mut n = 0;
    for fe in fj.files {
        if fe.path.contains("..") {
            continue;
        }
        let p = repo.join(&fe.path);
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        std::fs::write(&p, fe.content).map_err(|e| e.to_string())?;
        n += 1;
    }
    if n == 0 {
        return Err("modelo não devolveu arquivos".into());
    }
    Ok(n)
}

/// Stub determinístico: registra a mudança pedida (garante um diff não-vazio).
fn stub_code(repo: &Path, instr: &Instr) -> String {
    let note = format!(
        "# Mudança proposta (apifor stub)\n\n{}\n\nArquivos-alvo: {:?}\n",
        instr.change_request, instr.target_files
    );
    let _ = std::fs::write(repo.join("APIFOR_CHANGE.md"), note);
    "stub local (sem chave anthropic): registrou APIFOR_CHANGE.md".into()
}

// ───────────────────────── PR ─────────────────────────

#[derive(serde::Deserialize)]
struct PrResp {
    #[serde(default)]
    html_url: String,
}

async fn open_pr(instr: &Instr, token: &Option<String>) -> Result<String, String> {
    let token = token.as_ref().ok_or("sem token github no vault")?;
    let (owner, repo) = parse_github(&instr.repo_url).ok_or("remote não é github.com")?;
    let body = serde_json::json!({
        "title": format!("apifor: {}", first_line(&instr.change_request)),
        "head": instr.branch,
        "base": instr.base_branch,
        "body": "PR aberto automaticamente pelo apifor (M2.2). Código gerado e enviado localmente."
    });
    let resp = reqwest::Client::new()
        .post(format!("https://api.github.com/repos/{owner}/{repo}/pulls"))
        .header("authorization", format!("Bearer {token}"))
        .header("accept", "application/vnd.github+json")
        .header("user-agent", "apifor-executor")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let txt = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", &txt[..txt.len().min(160)]));
    }
    let pr: PrResp = serde_json::from_str(&txt).map_err(|e| e.to_string())?;
    Ok(pr.html_url)
}

fn parse_github(url: &str) -> Option<(String, String)> {
    let rest = url.strip_prefix("https://github.com/")?;
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let mut it = rest.splitn(2, '/');
    Some((it.next()?.to_string(), it.next()?.to_string()))
}
