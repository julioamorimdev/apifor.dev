// relay — fronteira de privacidade do M2.1.
// O cérebro manda só a ESTRUTURA (template + refs). Aqui, LOCAL:
//   1. resolve as refs (lê o código no workdir),
//   2. preenche o prompt,
//   3. chama a Anthropic COM A CHAVE LOCAL (vault),
//   4. devolve só PLANO ESTRUTURADO (passos/arquivos/decisão) — nunca código bruto.
use crate::vault::Vault;

pub struct PlanStepOut {
    pub idx: i32,
    pub kind: i32, // StepKind do proto: 1=plan 2=exec 3=test 4=review 5=merge 6=question
    pub label: String,
}

pub struct PlanOut {
    pub steps: Vec<PlanStepOut>,
    pub target_files: Vec<String>,
    pub decision: String,
    pub tokens: i64,
}

const MODEL: &str = "claude-opus-4-8";
const REF_CAP: usize = 6000; // limite por arquivo de contexto (chars)

fn kind_from_str(s: &str) -> i32 {
    match s.to_ascii_lowercase().as_str() {
        "plan" => 1,
        "exec" => 2,
        "test" => 3,
        "review" => 4,
        "merge" => 5,
        "question" => 6,
        _ => 2,
    }
}

/// Lê as refs sob o workdir e monta o bloco de contexto (fica LOCAL).
fn resolve_refs(workdir: &str, refs: &[String]) -> (String, Vec<String>) {
    let mut ctx = String::new();
    let mut found = Vec::new();
    for r in refs {
        // evita path traversal pra fora do workdir
        if r.contains("..") {
            continue;
        }
        let path = std::path::Path::new(workdir).join(r);
        match std::fs::read_to_string(&path) {
            Ok(mut content) => {
                content.truncate(REF_CAP);
                ctx.push_str(&format!("\n===== {} =====\n{}\n", r, content));
                found.push(r.clone());
            }
            Err(_) => ctx.push_str(&format!("\n===== {} (não encontrado) =====\n", r)),
        }
    }
    (ctx, found)
}

/// Lê a KB local (APIFOR_HOME/kb/*) e devolve como contexto adicional (fica LOCAL).
fn local_kb() -> String {
    let home = std::env::var("APIFOR_HOME").unwrap_or_else(|_| "/var/lib/apifor".into());
    let dir = std::path::Path::new(&home).join("kb");
    let mut out = String::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten().take(10) {
            if let Ok(mut c) = std::fs::read_to_string(e.path()) {
                c.truncate(2000);
                out.push_str(&format!(
                    "\n----- KB: {} -----\n{}\n",
                    e.file_name().to_string_lossy(),
                    c
                ));
            }
        }
    }
    out
}

pub async fn plan(workdir: &str, template: &str, refs: &[String], vault: &Vault) -> PlanOut {
    let (mut context, found) = resolve_refs(workdir, refs);
    let kb = local_kb();
    if !kb.is_empty() {
        println!("relay: KB local anexada ao contexto");
        context.push_str("\n===== BASE DE CONHECIMENTO (local) =====");
        context.push_str(&kb);
    }

    match vault.get("anthropic") {
        Some(key) => match call_anthropic(&key, template, &context).await {
            Ok(p) => p,
            Err(e) => {
                eprintln!("relay: chamada Anthropic falhou ({e}); usando stub");
                stub(template, &found, &format!("falha na chamada: {e}"))
            }
        },
        None => {
            eprintln!("relay: sem chave 'anthropic' no vault; usando stub");
            stub(template, &found, "sem chave local configurada (secret.put)")
        }
    }
}

// ───────────────────────── chamada real ─────────────────────────

#[derive(serde::Deserialize)]
struct AnthropicResp {
    content: Vec<Block>,
    usage: Usage,
}
#[derive(serde::Deserialize)]
struct Block {
    #[serde(default)]
    text: String,
}
#[derive(serde::Deserialize)]
struct Usage {
    #[serde(default)]
    input_tokens: i64,
    #[serde(default)]
    output_tokens: i64,
}

#[derive(serde::Deserialize)]
struct PlanJson {
    #[serde(default)]
    steps: Vec<StepJson>,
    #[serde(default)]
    target_files: Vec<String>,
    #[serde(default)]
    decision: String,
}
#[derive(serde::Deserialize)]
struct StepJson {
    #[serde(default)]
    kind: String,
    #[serde(default)]
    label: String,
}

async fn call_anthropic(key: &str, template: &str, context: &str) -> Result<PlanOut, String> {
    let system = "Você é um planejador de mudanças de código. Receba um pedido e o \
        contexto (trechos de arquivos) e responda APENAS com um plano ESTRUTURADO: \
        os passos a executar e os arquivos-alvo. NUNCA escreva o código em si nem o \
        conteúdo dos arquivos — só decisões e metadados. Cada passo tem um 'kind' em \
        {plan,exec,test,review,merge,question}.";
    let user = format!("PEDIDO:\n{template}\n\nCONTEXTO (local):\n{context}");

    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["steps", "target_files", "decision"],
        "properties": {
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["kind", "label"],
                    "properties": {
                        "kind": { "type": "string", "enum": ["plan","exec","test","review","merge","question"] },
                        "label": { "type": "string" }
                    }
                }
            },
            "target_files": { "type": "array", "items": { "type": "string" } },
            "decision": { "type": "string" }
        }
    });
    let body = serde_json::json!({
        "model": MODEL,
        "max_tokens": 2000,
        "system": system,
        "output_config": { "format": { "type": "json_schema", "schema": schema } },
        "messages": [{ "role": "user", "content": user }]
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
        return Err(format!("HTTP {status}: {}", &txt[..txt.len().min(200)]));
    }
    let parsed: AnthropicResp = serde_json::from_str(&txt).map_err(|e| e.to_string())?;
    let json_text = parsed
        .content
        .iter()
        .map(|b| b.text.as_str())
        .collect::<String>();
    let pj: PlanJson = serde_json::from_str(json_text.trim()).map_err(|e| e.to_string())?;

    let steps = pj
        .steps
        .iter()
        .enumerate()
        .map(|(i, s)| PlanStepOut {
            idx: i as i32,
            kind: kind_from_str(&s.kind),
            label: s.label.clone(),
        })
        .collect();
    Ok(PlanOut {
        steps,
        target_files: pj.target_files,
        decision: if pj.decision.is_empty() {
            "plano gerado pela Anthropic (chave local)".into()
        } else {
            pj.decision
        },
        tokens: parsed.usage.input_tokens + parsed.usage.output_tokens,
    })
}

// ───────────────────────── fallback determinístico ─────────────────────────

fn stub(template: &str, found: &[String], reason: &str) -> PlanOut {
    let first = template.lines().next().unwrap_or("tarefa").trim();
    let steps = vec![
        PlanStepOut {
            idx: 0,
            kind: 1,
            label: format!("Planejar: {first}"),
        },
        PlanStepOut {
            idx: 1,
            kind: 2,
            label: "Implementar a mudança nos arquivos de contexto".into(),
        },
        PlanStepOut {
            idx: 2,
            kind: 3,
            label: "Rodar a suíte de testes".into(),
        },
        PlanStepOut {
            idx: 3,
            kind: 4,
            label: "Revisar o diff antes do PR".into(),
        },
    ];
    PlanOut {
        steps,
        target_files: found.to_vec(),
        decision: format!("stub local ({reason})"),
        tokens: 0,
    }
}
