# apifor.dev

[![ci](https://github.com/julioamorimdev/apifor.dev/actions/workflows/ci.yml/badge.svg)](https://github.com/julioamorimdev/apifor.dev/actions/workflows/ci.yml)

Orquestrador de **workers de IA que escrevem código**: fila de tarefas → workers isolados → Pull Request → CI/QA → merge. Modelo comercial freemium (Free / Pro / Team / Enterprise).

Arquitetura **control plane / data plane**: o "cérebro" (decisão, fila, lease, billing) roda na cloud; a execução (workers, chaves de IA, código) roda **local** na máquina/VM do usuário via app desktop. Chaves e código **nunca** trafegam ao servidor.

```
┌── CLOUD (cérebro / control plane) ──┐        ┌── MÁQUINA DO USUÁRIO (data plane) ──┐
│ decide o que fazer, prioriza fila,  │  gRPC  │ app desktop (Tauri): GUI + daemon    │
│ emite lease, billing, multi-tenant  │◄──────►│ executor roda workers em containers, │
│ NÃO guarda chave/segredo/código     │ mTLS   │ chama IA com a chave LOCAL do user   │
└─────────────────────────────────────┘        └──────────────────────────────────────┘
```

## Planos

| | Free | Pro | Team | Enterprise |
|---|---|---|---|---|
| Preço | US$ 0 | US$ 20/mês | US$ 30/assento | sob consulta |
| Workers | 1 | 4 | 20 | ∞ |
| Lease | 4h (religar manual) | ∞ | ∞ | ∞ |
| Worker-hours/sem | 36h | ∞ | ∞ | ∞ |
| Membros | 1 | 1 | 10 | ∞ |

Travas (lease, limite de workers, 36h/sem, kill-switch) são **server-side** — não dá pra burlar pelo cliente. IA é BYO-key (chave do usuário) → custo de inferência não é da empresa.

## Documentação (raiz)

| Doc | Conteúdo |
|---|---|
| [ARQUITETURA.md](ARQUITETURA.md) | split control/data plane, Tauri+daemon, stack |
| [LOGICA-DE-NEGOCIO.md](LOGICA-DE-NEGOCIO.md) | planos, limites, lease, billing, estados |
| [SCHEMA-DADOS.md](SCHEMA-DADOS.md) | modelo de dados (server + local) |
| [PROTOCOLO.md](PROTOCOLO.md) | protocolo cérebro↔executor (gRPC) |
| [API.md](API.md) | REST `/v1` + IPC local |
| [ROADMAP.md](ROADMAP.md) | marcos de construção M0→M7 |
| [SECURITY.md](SECURITY.md) | review de segurança (mTLS, vault, kill-switch, RBAC, RLS) |
| [PRODUCTION.md](PRODUCTION.md) | deploy de produção (perfil endurecido + checklist) |

## Contratos (`contracts/`)

- `sql/` — schema Postgres (30 tabelas), políticas RLS, seeds. Validado em Postgres real.
- `proto/apifor.proto` — protocolo gRPC (proto3).
- `openapi/openapi.yaml` — API REST (OpenAPI 3.1, 69 paths).

## Código (`app/`)

Monorepo, build **Docker-based** (não precisa Go/Rust no host):

```
app/
  cerebro/    # control plane — Go (gRPC + REST + Postgres)
  executor/   # data plane — Rust/tonic (daemon)
  dashboard/  # GUI — Next/React
```

```bash
cd app
make dev        # sobe postgres + migrations + cerebro + executor
make smoke      # checa http://localhost:8088/healthz
make dashboard  # instala e roda a GUI em http://localhost:3000
make clean      # derruba tudo
```

Login demo: `demo@apifor.dev` / `demo`.

## Status

- ✅ **M0** — fundação: monorepo, docker-compose, migrations, serviços sobem.
- ✅ **M1** — espinha e2e (token-first): login JWT → Enroll → stream gRPC (Go↔Rust) → lease → dispatch → step → task `merged` no Postgres. REST + SSE. Tela Live na GUI (código).
- 🚧 **M2.1** — relay de planejamento (fronteira de privacidade): **vault local cifrado** (XChaCha20-Poly1305) + canal **IPC** (`secret.put`/`status`) + `RequestPlan` → executor lê refs locais → chama **Anthropic com a chave do user** → `PlanResult` (só plano estruturado) → cérebro grava `step`s e move a task p/ `in_review`. Validado e2e (caminho real bate na Anthropic; sem chave usa stub determinístico).
- 🚧 **M2.2** — execução real → PR: `DispatchStep(exec)` → workdir isolado por tarefa → **clone → agente coda (Anthropic/stub) → commit → push → abre PR**. Repo/conexão + `pull_request` no Postgres; cérebro só recebe branch+url. Validado e2e contra remote git local; **GitHub API cabeado** (ativa com token `github` no vault). Sandbox de container OS-level fica p/ M6.
- 🚧 **M2.3** — dashboard Next/React: telas **Live** (SSE), **Fila**, **Tarefas** (cria → plano/exec, vê o plano), **Configuração** (repos + segredos só-metadado) e **PRs**. Proxy `/api` → cérebro. Build limpo; rotas e pipeline completo validados pela API do dashboard.
- 🚧 **M3.1** — enforcement de plano (trust-critical, 100% server-side): **reaper** no cérebro aplica **max_workers** (Free 1/Pro 4/Team 20), **lease TTL** (Free 4h não-renovável; Pro+ ∞), **worker-hours 36h/sem** (ledger `usage_event` + `worker_hours_counter`) e **kill-switch** (device revogado → `LEASE_REVOKED`+`STOP_WORKER`). REST `/v1/usage` `/v1/devices` `/v1/billing/plan` + tela **Uso**. 4 cenários validados e2e.
- 🚧 **M3.2a** — **mTLS real (PKI)**: CA própria no cérebro → Enroll assina o **CSR** do executor (chave privada nunca sai) → **cert de device** → **stream gRPC sobre mTLS** autenticada pelo serial do cert. **Revogar o cert = kill-switch real**. `GET /v1/ca` p/ bootstrap. Substitui o token-no-campo-cert do M1. Validado e2e (TLS handshake, enroll, relay sobre mTLS, revogação exclui o serial da auth).
- ✅ **M3.2b** — **billing & dunning**: webhook do Stripe com **verificação de assinatura HMAC real** (`checkout.session.completed`→plano, `invoice.payment_failed`→`past_due`+graça 7d, `invoice.payment_succeeded`→`active`+fatura, `subscription.deleted`→Free); **dunning** no reaper (graça expira → rebaixa Free); Checkout/Portal reais com `STRIPE_SECRET_KEY` (senão stub). Telas **Uso** (assinatura) + **Faturas**. Validado e2e com eventos sintéticos assinados. **M3 completo.**
- 🚧 **M4.1** — **pipeline com gates**: tarefa percorre **plan→exec→test→review→merge** dirigida pelo cérebro, com **gates server-side** (CI verde / revisão IA / **revisão humana**). Intervenção humana destrava o merge (task `blocked` → `/v1/interventions` → cérebro despacha o merge). Telas **Intervenção** + **PRs** (gates `ci`/`ai_review`/`human_review`). Validado e2e: gate humano→merge real no remote, auto-merge (gate off), teste falhando barra o merge.
- 🚧 **M4.2** — **agente por modelo + reconciliação**: `agent_profile` (coder=opus, qa=haiku, reviewer=sonnet) — o cérebro injeta o modelo da etapa nas instruções; **identidade de device estável** (executor reconecta como o mesmo device); **reconciliação** via `TaskStateSnapshot` no reconnect (retoma o step pendente — ex.: merge aprovado offline é concluído ao religar); timeline de steps (Logs). Validado e2e.
- ✅ **M4.3** — telas **CI / QA / Telemetria**: o step de teste alimenta `ci_run` e `qa_report`; REST `GET /v1/ci` `/v1/qa` `/v1/telemetry` + telas no dashboard. Validado e2e (CI passed, QA 1/1, telemetria agregada). **M4 completo.**
- 🚧 **M5.1** — **multi-tenant & RBAC**: registro self-service (user+org+owner), **papéis** owner/admin/member/billing/viewer aplicados **server-side** por capacidade (read/write/manage/billing), **isolamento por org**, membros e workspaces. JWT carrega `org`+`role`; tela **Organização**. Validado e2e: viewer barrado em write/manage/billing (403), Org B não vê dados da Org A.
- 🚧 **M5.2** — **rotinas**: trigger **schedule** (scheduler no cérebro dispara a cada N segundos) + **manual** (run via REST); a ação cria uma tarefa e roda o relay. enable/disable/delete; tela **Rotinas**. Validado e2e (schedule redispara, manual cria, disable para). `event` fica p/ depois.
- 🚧 **M5.3** — **memória & KB**: memória da org (escopo **global/repo**) **injetada no prompt de planejamento**; KB importada via **IPC `kb.import`** (arquivo fica local, só o metadado vai ao cérebro) e **consultada pelo agente** no relay; `save_memory` na intervenção salva a decisão. Tela **Conhecimento**. Validado e2e (cérebro injeta a memória; executor confirma memória+KB no prompt).
- 🚧 **M5.4** — **notificações (SSE)**: eventos do cérebro (PR aberto, revisão humana pendente, merge, falha, lease revogado, rotina disparada) viram `notification`; `GET /v1/notifications/stream` (SSE) empurra lista + não-lidas; tela **Notif** com badge no nav. Validado e2e. **M5 completo.**
- 🚧 **M6.1** — **hardening**: **auditoria** (`audit_log` + export CSV), **rate limit por plano** (Free 60/min · Pro 300 · Team 1000 · ∞; 429 ao exceder), **observabilidade** (`/metrics` Prometheus: requests, 429, classes, gauges DB). Tela **Auditoria**. Validado e2e (16×429 em 70 req Free; CSV; métricas).
- 🚧 **M6.2** — **security review** ([SECURITY.md](SECURITY.md)) + correções: **`REQUIRE_AUTH`** fecha o fallback dev "demo owner" (401 sem JWT; públicos liberados), **CSV injection** neutralizada no export, **aviso de `JWT_SECRET` fraco** no boot. Validado e2e.
- 🚧 **M6.3** — **enforcement de RLS (reads)**: role `apifor_app` (não-superuser) + pool dedicado; reads do REST com `app.current_org` por transação (`SET LOCAL`) → as policies do `002_rls.sql` isolam de fato (queries **sem** `WHERE org_id`). Validado no DB (`apifor_app` sem org → **0 linhas**; com org → só a sua; superuser → tudo) e na API (Org A não vê Org B). Defense-in-depth real.
- 🚧 **M6.4** — **enforcement de RLS (creates do REST)**: os creates (task/repo/secret/memory/kb/routine/workspace/membro/`RegisterOrg`) gravam via `apifor_app` com contexto de org; o `WITH CHECK` das policies **bloqueia gravação cross-tenant**. Validado: contexto=A, `INSERT org_id=B` → *RLS policy violation*; creates normais funcionam. Creates normais funcionam.
- 🚧 **M6.5** — **RLS completo + runtime sem superuser**: updates/deletes do REST (`SetPlan`/`RevokeDevice`/`RemoveMember`/`DeleteMemory`/`DeleteRoutine`/`Approve`+`Reject`) via `apifor_app` (o `USING` bloqueia update/delete cross-tenant); o cérebro deixa de usar `postgres` — pool primário vira **`apifor_worker`** (NOSUPERUSER, BYPASSRLS), só o migrate (DDL) usa postgres. Validado: contexto=B `DELETE` da org A → *DELETE 0*; `super=false` nos dois roles. **RLS fechado de ponta a ponta.**
- 🚧 **M7** — **empacotamento & launch**: **serviço de fundo** do executor (`app/deploy/install.sh` — systemd/launchd), **app desktop Tauri v2** build-ready (`app/desktop/`: conf/Cargo/main.rs/capabilities + sidecar), GUI **export-estático** (`NEXT_EXPORT=1`, API base configurável), **workflow de release** (`.github/workflows/release.yml`: tauri-action → instaladores 3 OS + auto-update), telas **Início**/**Planos**. Validado: build normal + export (`out/`), JSON/YAML bem-formados. **Build do installer roda no host/CI com toolchain Tauri + chaves de assinatura.** Falta p/ GA: ícones/certs de assinatura, cloud workers / SSO-SAML (infra externa).

## Próximos passos

### M2 — Worker real + relay de planejamento
- Isolamento por container; **vault local** cifrado; chamada Anthropic com a **chave local** do usuário.
- Relay: `RequestPlan` (template + refs) → executor preenche local + chama LLM → `PlanResult` (só plano estruturado, sem código bruto).
- Tarefa real: clona repo (conexão GitHub), agente coda, **abre PR de verdade**.
- Canal **IPC** GUI↔daemon (`secret.put`, `kb.import`).
- Telas: Configuração, Tarefas, Fila.

### M3 — Plano & enforcement (monetização) · trust-critical
- `plan_catalog` enforce: max_workers, lease TTL 4h Free, auto_renew Pro+.
- Worker-hours: ledger `usage_event` + contador semanal; bloqueio 36h/sem no Free.
- **Kill-switch:** validação de sessão no heartbeat, graça 5min, **mTLS** (PKI: CA própria, cert de device, revogação).
- **Billing:** Stripe Checkout + Portal + webhooks; dunning (past_due→grace 7d→rebaixa Free).
- Telas: Assinatura, Uso, Faturas.

### M4 — Pipeline completo (gates)
- Steps plan/exec/test/review/merge; `agent_profile` (coder/qa/reviewer).
- Merge rules: exigir CI / revisão IA / revisão humana; estratégia; auto-merge.
- Intervenção (worker pergunta → humano decide → retoma); reconciliação no reconnect.
- Telas: PRs, CI, QA, Intervenção, Logs, Telemetria.

### M5 — Multi-tenant & Team
- Orgs/Workspaces/Membership: RBAC (owner/admin/member/billing/viewer) + perfil funcional.
- Rotinas (schedule/event/manual); Memória & KB; Notificações.
- Telas: Organização, Rotinas, Ajuda.

### M6 — Enterprise & hardening
- Cloud workers gerenciados (metered vCPU, `managed_vault_secret` KMS); SSO/SAML; auditoria aprofundada + export.
- Rate limits por plano; observabilidade; verificação de RLS; load test; security review.

### M7 — Empacotamento & launch
- Installer Tauri (Linux/Win/Mac) que registra serviço de fundo (systemd/Service/launchd).
- Onboarding, preços, docs, auto-update. Beta → GA.

### Pendências menores
- Definir escopo da tela **Web** do nav.
- Âncora do reset semanal de worker-hours; conversão US$→R$ no checkout; trial pago.
- Instalar/rodar o dashboard Next (até aqui só o data layer REST/SSE foi verificado).

---

> Decisões e marcos detalhados em [ROADMAP.md](ROADMAP.md). PRs e issues bem-vindos.
