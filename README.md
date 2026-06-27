# apifor.dev

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
