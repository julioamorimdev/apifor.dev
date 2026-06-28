# apiforDEV — monorepo (app/)

Build **Docker-based** (não precisa Go/Rust no host; só Docker). Dashboard roda local via pnpm.

```
app/
  cerebro/     # control plane — Go (M0: health server)
  executor/    # data plane — Rust daemon (M0: heartbeat stub)
  dashboard/   # GUI — Next/React (porta os .dc.html)
  docker-compose.yml
  Makefile
../contracts/  # sql (migrations+RLS+seeds), proto, openapi — fonte da verdade
```

## Rodar

```bash
make dev        # sobe postgres + aplica migrations + cerebro + executor
make smoke      # sobe a stack e checa http://localhost:8088/healthz
make dashboard  # instala e roda a GUI em http://localhost:3000 (separado)
make clean      # derruba tudo + apaga volumes (postgres + vault)
```

- Postgres: `localhost:55432` (user `postgres` / senha `pg` / db `apifor`).
- Cérebro: `localhost:8088/healthz`.
- Migrations aplicadas de `../contracts/sql` pelo serviço `migrate`.

## Relay de planejamento (M2.1)

Fronteira de privacidade: o cérebro manda só a **estrutura** (template + refs);
o executor lê o código **local**, chama a Anthropic com a **chave do user** (vault
cifrado) e devolve só o **plano estruturado** — nunca código bruto nem a chave.

```bash
make secret KEY=sk-ant-...   # grava a chave no vault local cifrado (via IPC)
                             # sem KEY, o relay usa um stub determinístico
make ipc-status              # segredos no vault (só metadados: nome/tipo/fingerprint)
make relay-demo              # cria tarefa real -> RequestPlan -> PlanResult -> steps
make task                    # cria 1 tarefa (imprime o id)
make steps TASK=tsk_...      # plano estruturado gravado pelo cérebro
```

REST novo: `POST /v1/tasks` (dispara o relay), `GET /v1/tasks/{id}/steps`,
`GET|POST /v1/secrets` (só `secret_ref` — metadado, sem valor).

## Execução real → PR (M2.2)

Tarefa com repositório: depois do plano, o cérebro despacha um `DispatchStep(exec)`;
o executor faz tudo **local** em workdir isolado por tarefa — clone → o agente coda
(Anthropic com a chave do user, ou stub) → commit → push → abre PR. O cérebro só
recebe **branch + url do PR**.

```bash
make pr-demo                 # demo completa contra um remote git LOCAL (bare), sem GitHub
make git-remote              # (re)semeia o remote local file:///remotes/sample.git
make repo                    # registra o repositório no cérebro (imprime repo_id)
make prs                     # lista pull requests abertos
```

GitHub real: registre um repo `https://github.com/owner/repo.git` (`make repo URL=...`)
e ponha o token no vault (`make secret KEY=ghp_... ` adaptado p/ name=`github`); o
executor abre um PR de verdade via GitHub API. Sem token/https → push do branch e
registro local. REST: `GET|POST /v1/repos`, `GET /v1/prs`; `POST /v1/tasks` aceita `repo_id`.

> Isolamento: M2.2 usa **workdir isolado por tarefa**. Sandbox de container OS-level
> (DinD/runc) fica como hardening do M6.

## Enforcement de plano (M3.1)

Todas as travas vivem no **cérebro** (server-side; o cliente não burla). Um **reaper**
em background acumula worker-hours, expira lease, renova Pro+ e aplica o kill-switch.

```bash
make usage                 # uso vs limites do plano (max_workers, worker-hours, lease TTL)
make plan PLAN=pro         # troca de plano (stand-in do Stripe no M3.1) — libera 4 workers
make devices               # lista devices
make revoke DEV=dev_...    # kill-switch: revoga o device -> reaper corta os leases
make enforce-demo          # demo: max_workers + lease TTL Free + kill-switch (knobs de teste)
```

Travas: **max_workers** (Free 1, Pro 4, Team 20), **lease TTL** (Free 4h não-renovável;
Pro+ sem expiração), **worker-hours 36h/sem** no Free, **kill-switch** (device revogado →
`LEASE_REVOKED`+`STOP_WORKER`). Knobs de teste encolhem 4h/36h p/ segundos:
`LEASE_TTL_SEC`, `WORKER_HOURS_CAP_SEC`, `REAPER_TICK_SEC`, `GRACE_SEC`. REST:
`GET /v1/usage`, `GET /v1/devices`, `POST /v1/devices/{id}/revoke`, `POST /v1/billing/plan`.

## mTLS real / PKI (M3.2a)

O cérebro tem uma **CA própria** (persistida em volume). No Enroll o executor manda um
**CSR** (chave privada nunca sai da máquina) e recebe um **cert de device** assinado pela
CA; a **stream gRPC roda sobre mTLS** e é autenticada pelo **serial do cert** do peer.
**Revogar o device = kill-switch real** (o serial sai da query de auth → reconexão negada).

- Bootstrap: `GET /v1/ca` serve o cert público da CA; o executor confia nele.
- gRPC: TLS com `VerifyClientCertIfGiven` (Enroll sem cert; Stream com cert de device).
- Cert de device: ECDSA P-256, validade 30d. Renovação automática fica p/ depois.

Substitui o token-no-campo-cert do M1. Sem novos comandos: `make up` já sobe com mTLS.

## Billing & dunning (M3.2b)

Checkout/Portal chamam a API do Stripe quando há `STRIPE_SECRET_KEY` (senão devolvem
stub). O **webhook tem verificação de assinatura HMAC real** e aplica billing + dunning;
o reaper rebaixa p/ Free quando a graça do `past_due` expira.

```bash
make billing-demo          # webhook assinado: checkout->Pro, fatura, past_due->dunning->Free
make subscription          # estado da assinatura (plan/status/grace_until)
make invoices              # faturas (vindas dos webhooks)
make checkout PLAN=pro     # Stripe Checkout (stub sem STRIPE_SECRET_KEY)
```

Eventos tratados: `checkout.session.completed` (→ plano), `invoice.payment_failed`
(→ `past_due` + graça 7d), `invoice.payment_succeeded` (→ `active` + fatura),
`customer.subscription.deleted` (→ Free). REST: `POST /v1/billing/{checkout,portal,webhook}`,
`GET /v1/subscription` `/v1/invoices`. Telas **Uso** (status da assinatura + Checkout) e
**Faturas**. Knob `DUNNING_GRACE_SEC` encolhe os 7d p/ segundos.

Env do Stripe (compose passthrough): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_PRO/TEAM`, `PUBLIC_URL`.

> Parciais do M3: graça de 5min (offline) e renovação automática de cert.

## Pipeline com gates (M4.1)

A tarefa com repositório percorre **plan → exec → test → review → merge**; o cérebro
aplica os **gates server-side** entre as etapas: CI verde, revisão IA aprovada e
(opcional) **revisão humana**. Se o gate humano está ligado, a tarefa fica `blocked`
até alguém aprovar via `/v1/interventions` — aí o cérebro despacha o merge.

```bash
make pipeline-demo                 # plan->exec->test->review->gate humano->merge (remote local)
make interventions                 # gates aguardando revisão humana
make approve TASK=tsk_...          # destrava: aprova e despacha o merge
make reject  TASK=tsk_...          # reprova: falha a tarefa
```

Steps: **test** roda `APIFOR_TEST_CMD` (default passa; `APIFOR_TEST_FAIL=1` força falha
→ gate barra o merge), **review** chama a Anthropic (modelo reviewer) ou stub, **merge**
integra o branch na base e dá push. Gate humano: `MERGE_REQUIRE_HUMAN=false` = auto-merge.
REST: `GET /v1/interventions`, `POST /v1/interventions/{task}/answer`; PRs expõem
`ci_status`/`ai_review_status`/`human_review_status`. Telas **Intervenção** + **PRs** (gates).

> Parciais do M4 (→ **M4.2**): `agent_profile` (modelo por agente), reconciliação
> (`TaskStateSnapshot` no reconnect), telas CI/QA/Logs/Telemetria.

## Estado
- **M0** — fundação: serviços compilam e sobem, banco migrado.
- **M1** — espinha e2e: login JWT → Enroll → stream gRPC → lease → dispatch → task `merged`.
- **M2.1** — relay de planejamento: vault local cifrado (XChaCha20-Poly1305) + canal
  IPC (`secret.put`/`status`) + `RequestPlan`→lê refs local→chama Anthropic (chave do
  user)→`PlanResult`→cérebro grava `step`s e move a task p/ `in_review`.
- **M2.2** — execução real: `DispatchStep(exec)` → clone → agente coda (Anthropic/stub)
  → commit → push → PR. Repo/conexão + `pull_request` no Postgres. Validado e2e contra
  um remote git local; caminho GitHub API cabeado (ativa com token no vault).
- **M2.3** — dashboard (Next/React): telas **Live** (SSE), **Fila**, **Tarefas** (cria
  tarefa → plano/exec, vê o plano), **Configuração** (repos + segredos só-metadado),
  **PRs**. `make dashboard` em http://localhost:3000 (proxy `/api` → cérebro :8088).
  Build limpo; rotas e fluxo completo validados pela API proxy.
- **M3.1** — enforcement de plano (server-side): reaper que aplica **max_workers**,
  **lease TTL** (Free 4h não-renovável; Pro+ ∞), **worker-hours 36h/sem** (ledger
  `usage_event` + `worker_hours_counter`) e **kill-switch** (revoga device →
  `LEASE_REVOKED`+`STOP_WORKER`). REST `/v1/usage` `/v1/devices` `/v1/billing/plan` +
  tela **Uso**. 4 cenários validados e2e (knobs encolhem 4h/36h p/ segundos).
- **M3.2a** — mTLS real (PKI): CA própria → Enroll assina CSR → cert de device →
  **stream gRPC sobre mTLS** autenticada pelo serial do cert; **revogar cert = kill-switch**.
  `GET /v1/ca` p/ bootstrap. Validado e2e (handshake, enroll, relay sobre mTLS, revogação).
- **M3.2b** — billing & dunning: webhook do Stripe com **verificação de assinatura HMAC real**
  (`checkout`/`invoice.*`/`subscription.deleted`); **dunning** (`past_due` → graça 7d →
  reaper rebaixa p/ Free); Checkout/Portal (real com chave, senão stub). Telas **Uso**
  (assinatura) + **Faturas**. Validado e2e com eventos sintéticos assinados.

- **M4.1** — pipeline com gates: **plan→exec→test→review→merge** dirigido pelo cérebro;
  gates server-side (CI verde / revisão IA / **revisão humana**); intervenção humana
  destrava o merge (task `blocked` → `/v1/interventions` → merge). Telas **Intervenção**
  + **PRs** (gates). Validado e2e (gate humano, auto-merge, teste falhando barra o merge).

**M3 completo; M4 em curso.** Próximo: **M4.2** (agent_profile, reconciliação, telas
CI/QA/Logs) ou **M5** (multi-tenant/Team) ou hardening (M6).
