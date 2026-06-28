// ipc — canal local GUI <-> daemon (Unix socket, JSON por linha). NUNCA na rede.
// É por aqui que o VALOR de um segredo entra: grava no vault local cifrado e
// registra só o metadado (secret_ref) no cérebro via REST.
use crate::vault::Vault;
use rand::rngs::OsRng;
use rand::RngCore;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

pub fn socket_path() -> String {
    std::env::var("APIFOR_IPC").unwrap_or_else(|_| {
        let home = std::env::var("APIFOR_HOME").unwrap_or_else(|_| "/var/lib/apifor".into());
        format!("{home}/ipc.sock")
    })
}

fn token_path() -> std::path::PathBuf {
    let home = std::env::var("APIFOR_HOME").unwrap_or_else(|_| "/var/lib/apifor".into());
    std::path::Path::new(&home).join("ipc.token")
}

/// Garante o token de processo do IPC (gera 32 bytes na 1ª vez; arquivo 0600).
/// O VALOR de segredos só entra pelo socket local — o token barra outros processos.
fn ensure_token() -> std::io::Result<String> {
    use std::os::unix::fs::OpenOptionsExt;
    let path = token_path();
    if let Ok(t) = std::fs::read_to_string(&path) {
        let t = t.trim().to_string();
        if !t.is_empty() {
            return Ok(t);
        }
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut b = [0u8; 32];
    OsRng.fill_bytes(&mut b);
    let tok: String = b.iter().map(|x| format!("{x:02x}")).collect();
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .mode(0o600)
        .open(&path)?;
    use std::io::Write;
    f.write_all(tok.as_bytes())?;
    Ok(tok)
}

/// Lê o token (lado cliente da CLI). None se o daemon não subiu ainda.
fn load_token() -> Option<String> {
    std::fs::read_to_string(token_path())
        .ok()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}

/// True só se a requisição traz o token de processo correto.
fn authorized(req: &serde_json::Value, token: &str) -> bool {
    req.get("token").and_then(|v| v.as_str()) == Some(token)
}

const DEMO_LOGIN: &str = r#"{"email":"demo@apifor.dev","password":"demo"}"#;

#[derive(serde::Deserialize)]
struct LoginResp {
    access_token: String,
}

/// Sobe o servidor IPC. `cerebro_http` é usado p/ registrar o secret_ref (metadado).
pub async fn serve(vault: Arc<Vault>, cerebro_http: String) -> std::io::Result<()> {
    let path = socket_path();
    let _ = std::fs::remove_file(&path); // limpa socket anterior
    if let Some(dir) = std::path::Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let listener = UnixListener::bind(&path)?;
    // socket só p/ o dono (defesa extra além do token)
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    let token = Arc::new(ensure_token()?);
    println!("IPC ouvindo em {path} (token de processo ativo)");
    loop {
        let (stream, _) = listener.accept().await?;
        let v = vault.clone();
        let http = cerebro_http.clone();
        let tok = token.clone();
        tokio::spawn(async move {
            if let Err(e) = handle(stream, v, http, tok).await {
                eprintln!("ipc handler: {e}");
            }
        });
    }
}

async fn handle(
    stream: UnixStream,
    vault: Arc<Vault>,
    http: String,
    token: Arc<String>,
) -> std::io::Result<()> {
    let (rd, mut wr) = stream.into_split();
    let mut lines = BufReader::new(rd).lines();
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let resp = dispatch(&line, &vault, &http, &token).await;
        wr.write_all(resp.to_string().as_bytes()).await?;
        wr.write_all(b"\n").await?;
    }
    Ok(())
}

async fn dispatch(line: &str, vault: &Arc<Vault>, http: &str, token: &str) -> serde_json::Value {
    let req: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => return serde_json::json!({"ok": false, "error": format!("json inválido: {e}")}),
    };
    // exige o token de processo (barra processos locais não autorizados)
    if !authorized(&req, token) {
        return serde_json::json!({"ok": false, "error": "token de processo inválido"});
    }
    let cmd = req.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
    match cmd {
        "secret.put" => {
            let name = req.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let value = req.get("value").and_then(|v| v.as_str()).unwrap_or("");
            let kind = req
                .get("kind")
                .and_then(|v| v.as_str())
                .unwrap_or("api_key");
            if name.is_empty() || value.is_empty() {
                return serde_json::json!({"ok": false, "error": "name e value obrigatórios"});
            }
            match vault.put(name, value, kind) {
                Ok(fp) => {
                    // registra o metadado no cérebro (sem valor)
                    let registered = register_secret_ref(http, name, kind, &fp).await;
                    serde_json::json!({"ok": true, "fingerprint": fp, "registered": registered})
                }
                Err(e) => serde_json::json!({"ok": false, "error": e.to_string()}),
            }
        }
        "secret.delete" => {
            let name = req.get("name").and_then(|v| v.as_str()).unwrap_or("");
            match vault.delete(name) {
                Ok(existed) => serde_json::json!({"ok": true, "existed": existed}),
                Err(e) => serde_json::json!({"ok": false, "error": e.to_string()}),
            }
        }
        "kb.import" => {
            let name = req.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let category = req
                .get("category")
                .and_then(|v| v.as_str())
                .unwrap_or("doc");
            let content = req.get("content").and_then(|v| v.as_str()).unwrap_or("");
            if name.is_empty() || content.is_empty() {
                return serde_json::json!({"ok": false, "error": "name e content obrigatórios"});
            }
            let home = std::env::var("APIFOR_HOME").unwrap_or_else(|_| "/var/lib/apifor".into());
            let dir = std::path::Path::new(&home).join("kb");
            let _ = std::fs::create_dir_all(&dir);
            // sanitiza o nome (sem path traversal)
            let safe: String = name
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
                .collect();
            if std::fs::write(dir.join(&safe), content).is_err() {
                return serde_json::json!({"ok": false, "error": "falha ao gravar KB local"});
            }
            let file_ref = format!("kb/{safe}");
            let registered = register_kb_doc(http, name, category, &file_ref).await;
            serde_json::json!({"ok": true, "file_ref": file_ref, "registered": registered})
        }
        "status" | "daemon.status" => {
            let secrets: Vec<_> = vault
                .list()
                .into_iter()
                .map(|(n, k, f)| serde_json::json!({"name": n, "kind": k, "fingerprint": f}))
                .collect();
            serde_json::json!({"ok": true, "secrets": secrets})
        }
        other => serde_json::json!({"ok": false, "error": format!("cmd desconhecido: {other}")}),
    }
}

/// Faz login demo e registra o secret_ref (só metadado) no cérebro.
async fn register_secret_ref(http: &str, name: &str, kind: &str, fp: &str) -> bool {
    let client = reqwest::Client::new();
    let lr: LoginResp = match client
        .post(format!("{http}/v1/auth/login"))
        .header("content-type", "application/json")
        .body(DEMO_LOGIN)
        .send()
        .await
        .and_then(|r| r.error_for_status())
    {
        Ok(r) => match r.json().await {
            Ok(j) => j,
            Err(_) => return false,
        },
        Err(_) => return false,
    };
    client
        .post(format!("{http}/v1/secrets"))
        .bearer_auth(lr.access_token)
        .json(&serde_json::json!({"name": name, "type": kind, "fingerprint": fp}))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Registra o metadado do KB no cérebro (o arquivo fica local).
async fn register_kb_doc(http: &str, name: &str, category: &str, file_ref: &str) -> bool {
    let client = reqwest::Client::new();
    let lr: LoginResp = match client
        .post(format!("{http}/v1/auth/login"))
        .header("content-type", "application/json")
        .body(DEMO_LOGIN)
        .send()
        .await
        .and_then(|r| r.error_for_status())
    {
        Ok(r) => match r.json().await {
            Ok(j) => j,
            Err(_) => return false,
        },
        Err(_) => return false,
    };
    client
        .post(format!("{http}/v1/kb-documents"))
        .bearer_auth(lr.access_token)
        .json(&serde_json::json!({"name": name, "category": category, "file_ref": file_ref}))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

// ───────────────────────── cliente CLI ─────────────────────────

/// Envia uma requisição JSON ao socket e devolve a resposta (1 linha).
/// Injeta o token de processo lido do keystore local.
pub async fn call(mut req: serde_json::Value) -> std::io::Result<serde_json::Value> {
    if let (Some(obj), Some(tok)) = (req.as_object_mut(), load_token()) {
        obj.insert("token".into(), serde_json::Value::String(tok));
    }
    let path = socket_path();
    let stream = UnixStream::connect(&path).await?;
    let (rd, mut wr) = stream.into_split();
    wr.write_all(req.to_string().as_bytes()).await?;
    wr.write_all(b"\n").await?;
    wr.flush().await?;
    let mut lines = BufReader::new(rd).lines();
    match lines.next_line().await? {
        Some(l) => {
            Ok(serde_json::from_str(&l)
                .unwrap_or_else(|_| serde_json::json!({"ok": false, "raw": l})))
        }
        None => Ok(serde_json::json!({"ok": false, "error": "sem resposta"})),
    }
}

#[cfg(test)]
mod tests {
    use super::authorized;
    use serde_json::json;

    #[test]
    fn token_de_processo() {
        let tok = "abc123";
        assert!(!authorized(&json!({"cmd": "status"}), tok)); // sem token
        assert!(!authorized(
            &json!({"cmd": "status", "token": "errado"}),
            tok
        )); // errado
        assert!(authorized(
            &json!({"cmd": "status", "token": "abc123"}),
            tok
        )); // certo
    }
}
