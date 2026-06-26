// executor — data plane do apifor.dev (M1: espinha e2e real).
// Fluxo: login HTTP -> Enroll gRPC -> Stream -> LeaseRequest -> recebe DispatchTask -> StepCompleted.
pub mod pb {
    tonic::include_proto!("apifor.v1");
}

use pb::envelope::Payload;
use pb::orchestrator_client::OrchestratorClient;
use pb::{Envelope, EnrollRequest, Heartbeat, LeaseRequest, MsgType, StepEvent, StepPhase, WorkerSource};
use std::env;
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
    let http = env::var("CEREBRO_HTTP").unwrap_or_else(|_| "http://cerebro:8080".into());
    let grpc = env::var("CEREBRO_GRPC").unwrap_or_else(|_| "http://cerebro:9090".into());
    println!("executor M1: http={http} grpc={grpc}");

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
            device_label: "executor-m1".into(),
        })
        .await?
        .into_inner();
    let token = String::from_utf8(enr.certificate).unwrap_or_default();
    println!("enroll ok: device={}", enr.device_id);

    // 3. pré-enfileira heartbeat + lease, DEPOIS abre a stream
    // (evita deadlock bidi: servidor espera 1ª msg p/ enviar headers de resposta)
    let (tx, rx) = mpsc::channel::<Envelope>(16);
    tx.send(env_msg(
        MsgType::Heartbeat,
        Payload::Heartbeat(Heartbeat { active_leases: vec![], worker_hours_seconds: 0, workers: vec![] }),
    ))
    .await?;
    tx.send(env_msg(
        MsgType::LeaseRequest,
        Payload::LeaseRequest(LeaseRequest {
            workspace_id: "wsp_demo".into(),
            source: WorkerSource::Pool as i32,
            pinned_worker_id: String::new(),
        }),
    ))
    .await?;

    let mut req = Request::new(ReceiverStream::new(rx));
    req.metadata_mut()
        .insert("authorization", MetadataValue::try_from(format!("Bearer {token}"))?);
    let mut inbound = client.stream(req).await?.into_inner();
    println!("stream aberto, lease solicitado");

    // 5. loop de entrada
    while let Some(env) = inbound.message().await? {
        match MsgType::try_from(env.r#type).unwrap_or(MsgType::MsgUnspecified) {
            MsgType::LeaseGranted => {
                if let Some(Payload::LeaseGranted(g)) = &env.payload {
                    println!("lease concedido: worker={} lease={}", g.worker_id, g.lease_id);
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
            _ => {}
        }
    }
    Ok(())
}
