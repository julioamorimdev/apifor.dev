# apiforDEV — Protocolo Cérebro ↔ Executor

> Como o control plane (cérebro, cloud) e o data plane (executor local) conversam.
> Decisões: gRPC bidi streaming sobre HTTP/2 + mTLS · push pela stream · at-least-once + idempotência + ack · executor mantém estado e reconcilia no reconnect · identidade por cert de device · relay expõe só plano estruturado.

---

## 0. Convenções

- **Transporte:** gRPC **bidirectional streaming** sobre HTTP/2, sempre **outbound** do executor, **mTLS** nos dois lados.
- **Uma stream longeva** por executor carrega tudo: heartbeat, comandos (push), eventos, acks.
- **Envelope** comum a toda mensagem:

```proto
message Envelope {
  string id              = 1; // ULID único da mensagem (msg_…)
  string correlation_id  = 2; // liga resposta ao pedido (vazio se não é resposta)
  string idempotency_key = 3; // dedupe em reentrega (at-least-once)
  MsgType type           = 4;
  int64  ts              = 5; // epoch ms
  bytes  payload         = 6; // oneof por type
}
```

- **At-least-once:** receptor deduplica por `idempotency_key`. Toda ordem do cérebro espera **Ack** (ou Nack com motivo).
- **Direção:** `Command` = cérebro→executor; `Event` = executor→cérebro.

---

## 1. Enrollment & Identidade (segurança)

O executor precisa provar que é um install legítimo de um usuário logado e com plano válido.

**Fluxo de enrollment (uma vez por install):**
1. Usuário faz login na GUI (OAuth GitHub ou e-mail/senha) → backend valida → emite **enrollment token** curto (minutos).
2. Executor gera par de chaves local; envia CSR + enrollment token ao backend.
3. Backend valida o token e **emite um certificado de device (mTLS)** vinculado a `user_id` + `device_id` + `org_id`, validade média (ex.: 30 dias), renovável.
4. Chave privada **nunca sai** da máquina; fica no keystore do SO.

**Renovação & revogação:**
- Executor renova o cert antes de expirar, enquanto sessão/assinatura forem válidas.
- **Kill-switch real:** revogar o cert (ou negar renovação) bloqueia o device. Usado em logout, cancelamento, abuso.
- Cada install = identidade própria → dá pra revogar 1 device sem afetar os outros.

---

## 2. Conexão & Heartbeat

1. Executor abre a stream gRPC com o cert de device (mTLS).
2. Cérebro valida cert + sessão + plano. Aceita ou fecha com motivo.
3. **Heartbeat** (Event) a cada **60s**, carregando: status do executor, leases ativos, snapshot leve de progresso, worker-hours acumuladas no ciclo.
4. Cérebro responde cada heartbeat com `HeartbeatAck` { leases válidos, ações pendentes }.
5. **Graça de 5 min:** sem heartbeat válido além disso → cérebro marca o executor offline e considera os workers em **pausa graceful** (não perde estado). Ver §10.

---

## 3. Ciclo de vida do Lease

Worker só recebe trabalho com **lease ativo** (ver schema `lease`).

```
Executor → LeaseRequest { workspace_id, source(pool|pinned), pinned_worker_id? }
Cérebro valida:
   ├─ plano permite +1 worker?      (max_workers)
   ├─ (Free) worker_hours < 36h/sem? (worker_hours_counter)
   └─ sessão/cert válidos?
   ├─ OK  → Command LeaseGranted { lease_id, expires_at, auto_renew }
   └─ não → Command LeaseDenied  { reason: plan_limit|hours_cap|session }
```

- **Free:** `expires_at = now + 4h`, `auto_renew=false`. Expirou → `LeaseRevoked{reason:expired}` → worker pausa → exige religar manual.
- **Pro+:** `auto_renew=true`; cérebro renova via heartbeat enquanto válido.
- **Worker-hours:** cérebro acumula do par start/stop (usage_event). Free atingiu 36h → não emite novo lease até reset semanal.

---

## 4. Catálogo de mensagens

### Commands (cérebro → executor)
| Tipo | Payload | Efeito |
|---|---|---|
| `LeaseGranted` / `LeaseDenied` / `LeaseRevoked` | lease/motivo | controla habilitação do worker |
| `DispatchTask` | task_id, repo, agent_profile, params | atribui tarefa a um worker_instance |
| `RequestPlan` | task_id, **prompt_template**, context_refs | dispara relay de planejamento (§7) |
| `DispatchStep` | step_id, type, instruções | manda executar um passo |
| `AnswerIntervention` | intervention_id, decisão, salvar_memória? | responde pergunta do worker (§9) |
| `ConfigSync` | parametrizações não-secretas | empurra config atualizada do server |
| `PauseWorker` / `StopWorker` | worker_id, motivo | pausa graceful / encerra |
| `*Ack` | ref id | confirma recebimento de Event |

### Events (executor → cérebro)
| Tipo | Payload | Efeito |
|---|---|---|
| `Heartbeat` | status, leases, worker-hours | mantém sessão viva (§2) |
| `LeaseRequest` | workspace, source | pede para ligar worker (§3) |
| `WorkerStarted` / `WorkerStopped` | worker_id, ts | alimenta usage_event/worker-hours |
| `WorkerStatus` | worker_id, status, current_step | tela Live em tempo real |
| `StepStarted` / `StepProgress` / `StepCompleted` / `StepFailed` | step_id, output curto | timeline da task |
| `PlanResult` | **plano estruturado** (sem código bruto) | resposta do relay (§7) |
| `InterventionRequest` | task_id, pergunta, opções | worker pede decisão humana (§9) |
| `TaskStateSnapshot` | task_id, steps, estado | reconciliação no reconnect (§10) |
| `*Ack` / `*Nack` | ref id, motivo | confirma/recusa Command |

---

## 5. Fluxo: ligar worker

```
Usuário clica "ligar" na GUI
→ Executor: LeaseRequest
→ Cérebro: valida plano/horas/sessão → LeaseGranted
→ Executor: cria worker_instance local (status idle) → WorkerStarted
→ Cérebro: registra usage_event(worker_started), worker pronto p/ fila
```

---

## 6. Fluxo: despacho de tarefa

```
Cérebro prioriza a fila (server-side) → escolhe worker_instance com lease ativo
→ Command DispatchTask { task_id, repo_id, agent_profile_id, params }
→ Executor: Ack → marca task assigned → prepara container isolado (workdir, creds locais)
→ Executor: WorkerStatus(running)
```

Decisão de **o que** rodar e **qual agente** é sempre do cérebro. Executor só prepara e roda.

---

## 7. Fluxo: relay de planejamento (fronteira de privacidade)

```
Cérebro precisa planejar → Command RequestPlan { task_id, prompt_template, context_refs }
        (manda só a ESTRUTURA: template + referências de contexto, sem código)
→ Executor: resolve context_refs LOCALMENTE (lê o código, preenche o template)
→ Executor: chama Anthropic COM A CHAVE LOCAL do usuário (vault local)
→ Executor: Event PlanResult { passos[], arquivos_alvo[], decisão, custo_tokens }
        (devolve só PLANO ESTRUTURADO — nunca o código bruto nem o prompt preenchido)
→ Cérebro: consome o plano → emite DispatchStep por passo → aplica gates de merge
```

**Fronteira:** código-fonte, prompt preenchido e chave **ficam locais**. Cérebro só enxerga decisões/metadados. Custo de inferência = do usuário.

---

## 8. Fluxo: execução de step + status

```
Cérebro → DispatchStep { step_id, type(plan|exec|test|review|merge), instruções }
→ Executor: StepStarted → roda no container → StepProgress* (telas Live/Logs)
→ Executor: StepCompleted { output } | StepFailed { erro }
→ Cérebro: atualiza task/step; se falhou e retries < limite → re-despacha; senão → InterventionRequest pendente
```

PR/CI/QA são reportados como steps especiais + atualizam `pull_request`/`ci_run`/`qa_report`.

---

## 9. Fluxo: intervenção (humano decide)

```
Worker trava/pergunta → Event InterventionRequest { task_id, pergunta, opções, contexto }
→ Cérebro: cria item de Intervenção, roteia ao humano certo (functional_profile) + notifica
→ Humano responde na GUI → Command AnswerIntervention { decisão, salvar_memória? }
→ Executor: aplica decisão, retoma a task
→ Se salvar_memória=true → cria `memory` (reaproveita decisão em casos similares)
```

---

## 10. Reconexão & reconciliação

Queda de rede dentro da graça (5 min) **não** mata trabalho.

```
Executor reconecta (mesmo cert) → reabre stream
→ Event TaskStateSnapshot { por task: steps feitos, step atual, estado }
→ Cérebro reconcilia com seu registro:
     ├─ step já ackado lá e cá → nada a fazer
     ├─ progresso local não reportado → cérebro adota o snapshot
     └─ command não-ackado pendente → reentrega (idempotency_key evita efeito duplo)
→ Retoma de onde parou
```

Fonte de verdade do **estado em execução** = executor (quem roda). Fonte de verdade de **decisão/política/lease** = cérebro.

---

## 11. Segurança (resumo)

- mTLS mútuo; cert de device revogável = kill-switch.
- Chave de IA, tokens e código **nunca** trafegam ao cérebro (relay devolve só plano).
- Toda ordem idempotente + ackada; reentrega segura.
- Heartbeat valida sessão/plano continuamente; revogação corta em ≤ graça.
- Segredos sempre referenciados por `secret_ref`; valor resolvido local (exceto managed vault opt-in).

---

## 12. A confirmar (operacional)
- Validade exata do cert de device (sugestão 30d) e janela de renovação.
- Formato do `prompt_template` e do schema de `PlanResult` (contrato do relay).
- Política de retry/backoff da reconexão da stream.
- Tamanho máx de `StepProgress`/logs inline antes de truncar/ref externa.
- Compressão da stream (gzip/zstd) p/ telemetria volumosa.
