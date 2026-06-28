// executor — data plane do apifor.dev.
// M1: login -> Enroll -> Stream -> Lease -> DispatchTask(fake) -> StepCompleted.
// M2.1: vault local cifrado + IPC (secret.put) + relay de planejamento
//       (RequestPlan -> lê refs locais -> chama Anthropic com a chave do user -> PlanResult).
//
// Subcomandos (cliente IPC):
//   executor secret-put <name> [kind]   (valor em $VALUE ou stdin)
//   executor secret-del <name>
//   executor status
pub mod pb {
    tonic::include_proto!("apifor.v1");
}
mod exec;
mod ipc;
mod relay;
mod tlsid;
mod vault;

use pb::envelope::Payload;
use pb::orchestrator_client::OrchestratorClient;
use pb::{
    EnrollRequest, Envelope, Heartbeat, LeaseRequest, MsgType, PlanResult, PlanStep, StepEvent,
    StepPhase, TaskStateSnapshot, WorkerSource,
};
use std::env;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use tokio_stream::wrappers::ReceiverStream;
use tonic::transport::{Certificate, ClientTlsConfig, Endpoint, Identity};
use tonic::Request;

#[derive(serde::Deserialize)]
struct LoginResp {
    access_token: String,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

/// Lista os task_ids que ainda têm workdir local (APIFOR_HOME/work/<task>).
fn local_task_dirs() -> Vec<String> {
    let home = env::var("APIFOR_HOME").unwrap_or_else(|_| "/var/lib/apifor".into());
    let work = std::path::Path::new(&home).join("work");
    let mut out = vec![];
    if let Ok(rd) = std::fs::read_dir(work) {
        for e in rd.flatten() {
            if e.path().is_dir() {
                if let Some(name) = e.file_name().to_str() {
                    if name.starts_with("tsk_") {
                        out.push(name.to_string());
                    }
                }
            }
        }
    }
    out
}

fn env_msg(t: MsgType, p: Payload) -> Envelope {
    Envelope {
        id: format!("msg_{}", now_ms()),
        correlation_id: String::new(),
        idempotency_key: String::new(),
        r#type: t as i32,
        ts: now_ms(),
        payload: Some(p),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        Some("secret-put") => return cli_secret_put(&args).await,
        Some("secret-del") => return cli_secret_del(&args).await,
        Some("kb-import") => return cli_kb_import(&args).await,
        Some("status") => return cli_status().await,
        _ => {}
    }
    run_daemon().await
}

// ───────────────────────── cliente IPC ─────────────────────────

async fn cli_secret_put(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let name = args.get(2).cloned().unwrap_or_else(|| "anthropic".into());
    let kind = args
        .get(3)
        .cloned()
        .unwrap_or_else(|| "anthropic_api_key".into());
    let value = match env::var("VALUE") {
        Ok(v) if !v.is_empty() => v,
        _ => {
            use std::io::Read;
            let mut s = String::new();
            std::io::stdin().read_to_string(&mut s)?;
            s.trim().to_string()
        }
    };
    let resp = ipc::call(serde_json::json!({
        "cmd": "secret.put", "name": name, "value": value, "kind": kind
    }))
    .await?;
    println!("{resp}");
    Ok(())
}

async fn cli_secret_del(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let name = args.get(2).cloned().unwrap_or_default();
    let resp = ipc::call(serde_json::json!({"cmd": "secret.delete", "name": name})).await?;
    println!("{resp}");
    Ok(())
}

async fn cli_kb_import(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let name = args.get(2).cloned().unwrap_or_default();
    let category = args.get(3).cloned().unwrap_or_else(|| "doc".into());
    let content = match env::var("VALUE") {
        Ok(v) if !v.is_empty() => v,
        _ => {
            use std::io::Read;
            let mut s = String::new();
            std::io::stdin().read_to_string(&mut s)?;
            s
        }
    };
    let resp = ipc::call(serde_json::json!({
        "cmd": "kb.import", "name": name, "category": category, "content": content
    }))
    .await?;
    println!("{resp}");
    Ok(())
}

async fn cli_status() -> Result<(), Box<dyn std::error::Error>> {
    let resp = ipc::call(serde_json::json!({"cmd": "status"})).await?;
    println!("{resp}");
    Ok(())
}

// ───────────────────────── daemon ─────────────────────────

async fn run_daemon() -> Result<(), Box<dyn std::error::Error>> {
    let http = env::var("CEREBRO_HTTP").unwrap_or_else(|_| "http://cerebro:8080".into());
    let grpc = env::var("CEREBRO_GRPC").unwrap_or_else(|_| "http://cerebro:9090".into());
    let workdir = env::var("APIFOR_WORKDIR").unwrap_or_else(|_| "/workspace".into());
    println!("executor M2.1: http={http} grpc={grpc} workdir={workdir}");

    // vault local + servidor IPC (canal por onde a chave do user entra)
    let vault = Arc::new(vault::Vault::open()?);
    {
        let v = vault.clone();
        let h = http.clone();
        tokio::spawn(async move {
            if let Err(e) = ipc::serve(v, h).await {
                eprintln!("ipc serve: {e}");
            }
        });
    }

    // 1. login -> JWT (com retry: cérebro pode ainda estar subindo)
    let client_http = reqwest::Client::new();
    let lr: LoginResp = loop {
        match client_http
            .post(format!("{http}/v1/auth/login"))
            .json(&serde_json::json!({"email":"demo@apifor.dev","password":"demo"}))
            .send()
            .await
        {
            Ok(r) => match r.json::<LoginResp>().await {
                Ok(j) => break j,
                Err(e) => eprintln!("login json falhou: {e}"),
            },
            Err(e) => eprintln!("login retry: {e}"),
        }
        sleep(Duration::from_secs(2)).await;
    };
    println!("login ok");

    // 2. bootstrap da CA (busca o cert público por HTTP) + CSR gerado LOCAL
    let ca_pem: Vec<u8> = loop {
        match client_http.get(format!("{http}/v1/ca")).send().await {
            Ok(r) => match r.bytes().await {
                Ok(b) if !b.is_empty() => break b.to_vec(),
                _ => eprintln!("ca vazia, retry"),
            },
            Err(e) => eprintln!("ca fetch retry: {e}"),
        }
        sleep(Duration::from_secs(2)).await;
    };
    let ca = Certificate::from_pem(ca_pem);

    // 3. Identidade: reutiliza a salva (reconnect como MESMO device) ou faz enroll.
    let (cert_pem, key_pem) = match tlsid::load_identity() {
        Some((c, k)) => {
            println!("identidade local reutilizada (reconnect como mesmo device)");
            (c, k)
        }
        None => {
            let (csr_pem, key_pem) = tlsid::make_csr();
            println!("CSR gerado (chave privada fica local)");
            let enroll_tls = ClientTlsConfig::new()
                .ca_certificate(ca.clone())
                .domain_name("cerebro");
            let enroll_ch = loop {
                match Endpoint::from_shared(grpc.clone())?
                    .tls_config(enroll_tls.clone())?
                    .connect()
                    .await
                {
                    Ok(c) => break c,
                    Err(e) => {
                        eprintln!("grpc(enroll) retry: {e}");
                        sleep(Duration::from_secs(2)).await;
                    }
                }
            };
            let enr = OrchestratorClient::new(enroll_ch)
                .enroll(EnrollRequest {
                    enrollment_token: lr.access_token,
                    csr: csr_pem.into_bytes(),
                    device_label: "executor-m4".into(),
                })
                .await?
                .into_inner();
            println!("enroll ok (mTLS): device={}", enr.device_id);
            tlsid::save_identity(&enr.certificate, &key_pem);
            (enr.certificate, key_pem)
        }
    };

    // 4. canal mTLS p/ a stream — apresenta o cert de device (chave priva local)
    let id = Identity::from_pem(cert_pem, key_pem.into_bytes());
    let stream_tls = ClientTlsConfig::new()
        .ca_certificate(ca)
        .identity(id)
        .domain_name("cerebro");
    let stream_ch = match Endpoint::from_shared(grpc.clone())?
        .tls_config(stream_tls)?
        .connect()
        .await
    {
        Ok(c) => c,
        Err(e) => {
            tlsid::clear_identity();
            eprintln!("stream falhou; identidade limpa p/ re-enroll no próximo start: {e}");
            return Err(e.into());
        }
    };
    let mut client = OrchestratorClient::new(stream_ch);

    // 3. pré-enfileira heartbeat + lease, DEPOIS abre a stream
    let (tx, rx) = mpsc::channel::<Envelope>(16);
    tx.send(env_msg(
        MsgType::Heartbeat,
        Payload::Heartbeat(Heartbeat {
            active_leases: vec![],
            worker_hours_seconds: 0,
            workers: vec![],
        }),
    ))
    .await?;
    let lease_req = || {
        env_msg(
            MsgType::LeaseRequest,
            Payload::LeaseRequest(LeaseRequest {
                workspace_id: "wsp_demo".into(),
                source: WorkerSource::Pool as i32,
                pinned_worker_id: String::new(),
            }),
        )
    };
    tx.send(lease_req()).await?;
    // M3.1: leases extras p/ exercitar a trava max_workers (o cérebro nega os excedentes)
    let extra: usize = env::var("APIFOR_EXTRA_LEASES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    for _ in 0..extra {
        tx.send(lease_req()).await?;
    }

    let req = Request::new(ReceiverStream::new(rx));
    let mut inbound = client.stream(req).await?.into_inner();
    println!("stream aberto (mTLS), lease solicitado");

    // M4.2: reconciliação — reporta as tarefas que ainda têm workdir local, p/ o
    // cérebro retomar o próximo step pendente (ex.: merge perdido enquanto offline).
    for task_id in local_task_dirs() {
        tx.send(env_msg(
            MsgType::TaskStateSnapshot,
            Payload::TaskStateSnapshot(TaskStateSnapshot {
                task_id,
                steps: vec![],
                current_step_id: String::new(),
                status: "has_workdir".into(),
            }),
        ))
        .await?;
    }

    // 4. loop de entrada
    while let Some(env) = inbound.message().await? {
        match MsgType::try_from(env.r#type).unwrap_or(MsgType::MsgUnspecified) {
            MsgType::LeaseGranted => {
                if let Some(Payload::LeaseGranted(g)) = &env.payload {
                    let exp = if g.expires_at > 0 {
                        format!("expira_em={}ms", g.expires_at)
                    } else {
                        "sem expiração".into()
                    };
                    println!(
                        "lease concedido: worker={} lease={} {exp} auto_renew={}",
                        g.worker_id, g.lease_id, g.auto_renew
                    );
                }
            }
            MsgType::LeaseDenied => {
                if let Some(Payload::LeaseDenied(d)) = &env.payload {
                    println!(
                        "LEASE NEGADO pelo cérebro: motivo={} (não vou trabalhar)",
                        d.reason
                    );
                }
            }
            MsgType::LeaseRevoked => {
                if let Some(Payload::LeaseRevoked(g)) = &env.payload {
                    println!(
                        "LEASE REVOGADO: lease={} motivo={} — worker pausado/parado pelo cérebro",
                        g.lease_id, g.reason
                    );
                }
            }
            MsgType::StopWorker | MsgType::PauseWorker => {
                if let Some(Payload::WorkerControl(c)) = &env.payload {
                    let act = if c.stop { "STOP" } else { "PAUSE" };
                    println!("{act} WORKER {} (motivo={})", c.worker_id, c.reason);
                }
            }
            MsgType::DispatchTask => {
                if let Some(Payload::DispatchTask(d)) = &env.payload {
                    println!("tarefa recebida: {} — rodando step fake", d.task_id);
                    tx.send(env_msg(
                        MsgType::StepCompleted,
                        Payload::StepEvent(StepEvent {
                            step_id: "stp_1".into(),
                            task_id: d.task_id.clone(),
                            phase: StepPhase::Completed as i32,
                            output: "ok".into(),
                            error: String::new(),
                        }),
                    ))
                    .await?;
                    println!("step completed enviado");
                }
            }
            MsgType::DispatchStep => {
                if let Some(Payload::DispatchStep(ds)) = &env.payload {
                    println!(
                        "DispatchStep kind={} task={} (workdir LOCAL)",
                        ds.kind, ds.task_id
                    );
                    // kind: 2=exec 3=test 4=review 5=merge
                    let result: Result<serde_json::Value, String> = match ds.kind {
                        2 => exec::run(&ds.task_id, &ds.instructions, &vault)
                            .await
                            .map(|r| serde_json::json!({"kind":"exec","branch":r.branch,"url":r.url})),
                        3 => exec::run_test(&ds.task_id, &ds.instructions)
                            .map(|(p, s)| serde_json::json!({"kind":"test","passed":p,"summary":s})),
                        4 => exec::run_review(&ds.task_id, &ds.instructions, &vault)
                            .await
                            .map(|(a, c)| serde_json::json!({"kind":"review","approved":a,"comments":c})),
                        5 => exec::run_merge(&ds.task_id, &ds.instructions)
                            .map(|url| serde_json::json!({"kind":"merge","merged":true,"url":url})),
                        k => Err(format!("kind {k} não suportado")),
                    };
                    let (msg_type, phase, output, error) = match result {
                        Ok(out) => {
                            println!("step kind={} ok: {out}", ds.kind);
                            (
                                MsgType::StepCompleted,
                                StepPhase::Completed,
                                out.to_string(),
                                String::new(),
                            )
                        }
                        Err(e) => {
                            eprintln!("step kind={} falhou: {e}", ds.kind);
                            (MsgType::StepFailed, StepPhase::Failed, String::new(), e)
                        }
                    };
                    tx.send(env_msg(
                        msg_type,
                        Payload::StepEvent(StepEvent {
                            step_id: ds.step_id.clone(),
                            task_id: ds.task_id.clone(),
                            phase: phase as i32,
                            output,
                            error,
                        }),
                    ))
                    .await?;
                }
            }
            MsgType::RequestPlan => {
                if let Some(Payload::RequestPlan(rp)) = &env.payload {
                    println!(
                        "RequestPlan: task={} refs={:?} — planejando LOCAL",
                        rp.task_id, rp.context_refs
                    );
                    if rp.prompt_template.contains("MEMÓRIA DA ORG") {
                        println!("relay: memória da org presente no prompt");
                    }
                    let out =
                        relay::plan(&workdir, &rp.prompt_template, &rp.context_refs, &vault).await;
                    println!(
                        "plano pronto: {} passos, {} tokens, decisão={:?}",
                        out.steps.len(),
                        out.tokens,
                        out.decision
                    );
                    let steps = out
                        .steps
                        .iter()
                        .map(|s| PlanStep {
                            idx: s.idx,
                            kind: s.kind,
                            label: s.label.clone(),
                        })
                        .collect();
                    tx.send(env_msg(
                        MsgType::PlanResult,
                        Payload::PlanResult(PlanResult {
                            task_id: rp.task_id.clone(),
                            steps,
                            target_files: out.target_files,
                            decision: out.decision,
                            tokens_used: out.tokens,
                        }),
                    ))
                    .await?;
                    println!("PlanResult enviado (só plano estruturado)");
                }
            }
            _ => {}
        }
    }
    Ok(())
}
