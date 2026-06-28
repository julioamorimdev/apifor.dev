# apifor.dev — visão geral

Orquestrador de **workers de IA que escrevem código**: fila de tarefas → workers
isolados → Pull Request → CI/QA → merge. Modelo freemium (Free / Pro / Team / Enterprise).

## Arquitetura

**Control plane / data plane**, com a invariante central:
**chaves de IA, código e segredos nunca trafegam ao servidor.**

| Componente | Stack | Papel |
|---|---|---|
| **Cérebro** | Go (~6,5k linhas) | control plane (cloud): decisão, fila, lease, billing; gRPC bidi (mTLS) + REST/SSE |
| **Executor** | Rust (~1,7k linhas) | data plane (local): roda os workers, vault cifrado, IPC, identidade mTLS |
| **Dashboard** | Next/React (~2,1k linhas, 25 telas) | GUI |
| **Banco** | Postgres (30 tabelas, RLS) | estado, isolado por org |

## Roadmap M0→M7

- **M0–M1** — walking skeleton e2e (relay de planejamento, vault, IPC).
- **M2** — execução real → PR (clone → coda → push → PR) + dashboard.
- **M3** — enforcement de plano (lease/cap/kill-switch); **mTLS/PKI**; billing & dunning (Stripe, webhook HMAC).
- **M4** — pipeline com gates (CI · revisão IA · revisão humana) + intervenção + reconciliação; modelo por agente; telas CI/QA/Telemetria.
- **M5** — multi-tenant & RBAC; rotinas (schedule/manual); memória & KB; notificações (SSE).
- **M6** — hardening: auditoria, rate-limit, `/metrics`; **enforcement de RLS de ponta a ponta** (reads/creates/updates/deletes; runtime sem superuser); security review.
- **M7** — empacotamento: serviço de fundo (systemd/launchd), scaffold do app desktop (Tauri), onboarding & preços.

## Segurança (ver [SECURITY.md](SECURITY.md))

mTLS real (CA própria → CSR → cert de device; revogar = kill-switch) · vault
XChaCha20-Poly1305 + **IPC com token de processo** · **RLS** isolando reads e writes
por org (role `apifor_app`), runtime **sem superuser** (`apifor_worker` BYPASSRLS) ·
RBAC server-side · `REQUIRE_AUTH` · TLS no REST (opt-in) · seed demo gateável ·
webhook Stripe verificado por HMAC · rate-limit por plano.

## Qualidade

- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)): build dos 3 alvos +
  fmt/clippy/vet + **testes unitários** + **smoke e2e** (RLS/RBAC/privilégio).
- **Teste do sistema inteiro**: `make full-test` (25/25 ✓) — pipeline real
  plan → exec → PR → gates → aprovação humana → merge.
- **Produção**: `make prod-posture` valida o perfil endurecido.

## GUI

App shell (sidebar agrupada com ícones + topbar com ⌘K, workspace switcher, tema
dark/light, idioma PT/EN, pool ao vivo, notificações), Dashboard de overview com
sparklines, stat/meter cards, e as ~24 telas dos mockups. Dev: `make dev` (backend) +
`make dashboard` (GUI em :3000). Login demo: `demo@apifor.dev` / `demo`.

## Rodar

```bash
cd app
make dev          # backend (cérebro + executor + postgres) via Docker
make dashboard    # GUI em http://localhost:3000 (npm)
make full-test    # teste e2e do sistema inteiro
make prod-up      # perfil de produção endurecido
```

## Pendências p/ GA (dependem de infra/credenciais externas)

Installer Tauri buildado + auto-update (toolchain desktop + certs de assinatura) ·
cloud workers gerenciados (provedor + KMS) · SSO/SAML (IdP) · chave Anthropic + token
GitHub reais para IA/PRs de verdade (o encanamento já está pronto e provado).

## Docs

[README](README.md) · [SECURITY](SECURITY.md) · [PRODUCTION](PRODUCTION.md) · [ROADMAP](ROADMAP.md)
