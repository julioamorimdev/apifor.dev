# Deploy de produção — apifor.dev

Guia para subir o **cérebro** (control plane) endurecido. A execução (executor) roda
na máquina/VM do usuário — veja [`app/deploy/`](app/deploy) (serviço de fundo) e
[`app/desktop/`](app/desktop) (app Tauri).

> Postura validada por [`app/scripts/prod-posture.sh`](app/scripts/prod-posture.sh)
> (`make prod-posture`): TLS no REST, auth obrigatória, sem usuário demo, fluxo real OK.

## Subir

```bash
cd app
export JWT_SECRET="$(head -c 48 /dev/urandom | base64)"   # segredo forte (obrigatório)
export STRIPE_WEBHOOK_SECRET="whsec_..."                  # opcional (billing)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

O override [`docker-compose.prod.yml`](app/docker-compose.prod.yml) liga:

| Flag | Efeito |
|---|---|
| `REQUIRE_AUTH=true` | rotas protegidas exigem JWT (fecha o fallback demo-owner) |
| `SEED_DEMO=false` | não cria o usuário/org demo |
| `REST_TLS=true` | REST/SSE sobre HTTPS (cert da CA interna; ou `REST_TLS_CERT/KEY`) |
| `MERGE_REQUIRE_HUMAN=true` | merge exige aprovação humana |
| `JWT_SECRET` | **obrigatório** — o compose falha se ausente |

## TLS

- **CA interna** (`REST_TLS=true`): bom p/ self-hosted; clientes confiam na CA
  (`GET /v1/ca`). Ajuste `REST_TLS_HOSTS` com os hostnames/IPs públicos.
- **Cert real** (recomendado p/ internet): `REST_TLS_CERT` + `REST_TLS_KEY` (Let's
  Encrypt) ou termine TLS num reverse proxy (Caddy/nginx) à frente do cérebro.

## Checklist (ver [SECURITY.md](SECURITY.md))

- [x] `REQUIRE_AUTH=true` · [x] `SEED_DEMO=false` · [x] TLS no REST
- [x] RLS completo (reads/creates/updates/deletes; runtime sem superuser)
- [x] IPC com token de processo (executor) · [x] webhook Stripe verificado por HMAC
- [ ] `JWT_SECRET` forte (gerado acima) · [ ] `STRIPE_WEBHOOK_SECRET` configurado
- [ ] `vault.key` / CA / chaves de assinatura em **KMS/secret store**
- [ ] backups do Postgres + rotação de credenciais (`apifor_app`/`apifor_worker`)

## Banco

O `migrate` aplica `001..005` (schema, RLS, seeds, roles `apifor_app`/`apifor_worker`).
Em produção, troque as senhas dessas roles (hoje `apppw`/`workerpw` p/ dev) e aponte
`APP_DATABASE_URL`/`WORKER_DATABASE_URL` para elas.
