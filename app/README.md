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

## Rodar (M0)

```bash
make dev        # sobe postgres + aplica migrations + cerebro + executor
make smoke      # sobe a stack e checa http://localhost:8088/healthz
make dashboard  # instala e roda a GUI em http://localhost:3000 (separado)
make clean      # derruba tudo + apaga volume do postgres
```

- Postgres: `localhost:55432` (user `postgres` / senha `pg` / db `apifor`).
- Cérebro: `localhost:8088/healthz`.
- Migrations aplicadas de `../contracts/sql` pelo serviço `migrate`.

## Estado
M0 = walking skeleton: serviços compilam e sobem, banco migrado.
Próximo (M1): auth+JWT, Enroll mTLS, stream gRPC (do `../contracts/proto/apifor.proto`), lease, 1 tarefa fake e2e.
