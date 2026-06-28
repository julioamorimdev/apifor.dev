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
mod vault;

use pb::envelope::Payload;
use pb::orchestrator_client::OrchestratorClient;
use pb::{
    Envelope, EnrollRequest, Heartbeat, LeaseRequest, MsgType, PlanResult, PlanStep, StepEvent,
    StepPhase, WorkerSource,
};
use std::env;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use tokio_stream::wrappers::ReceiverStream;
use tonic::metadata::MetadataValue;
use tonic::Request;

#[derive(serde::Deserialize)]
struct LoginResp {
    access_token: String,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
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
        Some("status") => return cli_status().await,
        _ => {}
    }
    run_daemon().await
}

// ───────────────────────── cliente IPC ─────────────────────────

async fn cli_secret_put(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let name = args.get(2).cloned().unwrap_or_else(|| "anthropic".into());
    let kind = args.get(3).cloned().unwrap_or_else(|| "anthropic_api_key".into());
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

    // 2. gRPC connect (retry) + Enroll (troca JWT por device token)
    let mut client = loop {
        match OrchestratorClient::connect(grpc.clone()).await {
            Ok(c) => break c,
            Err(e) => {
                eprintln!("grpc connect retry: {e}");
                sleep(Duration::from_secs(2)).await;
            }
        }
    };
    let enr = client
        .enroll(EnrollRequest {
            enrollment_token: lr.access_token,
            csr: vec![],
            device_label: "executor-m2".into(),
        })
        .await?
        .into_inner();
    let token = String::from_utf8(enr.certificate).unwrap_or_default();
    println!("enroll ok: device={}", enr.device_id);

    // 3. pré-enfileira heartbeat + lease, DEPOIS abre a stream
    let (tx, rx) = mpsc::channel::<Envelope>(16);
    tx.send(env_msg(
        MsgType::Heartbeat,
        Payload::Heartbeat(Heartbeat { active_leases: vec![], worker_hours_seconds: 0, workers: vec![] }),
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
    let extra: usize = env::var("APIFOR_EXTRA_LEASES").ok().and_then(|v| v.parse().ok()).unwrap_or(0);
    for _ in 0..extra {
        tx.send(lease_req()).await?;
    }

    let mut req = Request::new(ReceiverStream::new(rx));
    req.metadata_mut()
        .insert("authorization", MetadataValue::try_from(format!("Bearer {token}"))?);
    let mut inbound = client.stream(req).await?.into_inner();
    println!("stream aberto, lease solicitado");

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
                    println!("LEASE NEGADO pelo cérebro: motivo={} (não vou trabalhar)", d.reason);
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
                    println!("DispatchStep(exec): task={} — clonando/codando/PR LOCAL", ds.task_id);
                    match exec::run(&ds.task_id, &ds.instructions, &vault).await {
                        Ok(res) => {
                            let output = serde_json::json!({"branch": res.branch, "url": res.url}).to_string();
                            println!("exec ok: branch={} url={}", res.branch, res.url);
                            tx.send(env_msg(
                                MsgType::StepCompleted,
                                Payload::StepEvent(StepEvent {
                                    step_id: ds.step_id.clone(),
                                    task_id: ds.task_id.clone(),
                                    phase: StepPhase::Completed as i32,
                                    output,
                                    error: String::new(),
                                }),
                            ))
                            .await?;
                        }
                        Err(e) => {
                            eprintln!("exec falhou: {e}");
                            tx.send(env_msg(
                                MsgType::StepFailed,
                                Payload::StepEvent(StepEvent {
                                    step_id: ds.step_id.clone(),
                                    task_id: ds.task_id.clone(),
                                    phase: StepPhase::Failed as i32,
                                    output: String::new(),
                                    error: e,
                                }),
                            ))
                            .await?;
                        }
                    }
                }
            }
            MsgType::RequestPlan => {
                if let Some(Payload::RequestPlan(rp)) = &env.payload {
                    println!(
                        "RequestPlan: task={} refs={:?} — planejando LOCAL",
                        rp.task_id, rp.context_refs
                    );
                    let out = relay::plan(&workdir, &rp.prompt_template, &rp.context_refs, &vault).await;
                    println!(
                        "plano pronto: {} passos, {} tokens, decisão={:?}",
                        out.steps.len(),
                        out.tokens,
                        out.decision
                    );
                    let steps = out
                        .steps
                        .iter()
                        .map(|s| PlanStep { idx: s.idx, kind: s.kind, label: s.label.clone() })
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
