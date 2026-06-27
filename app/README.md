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

## Estado
- **M0** — fundação: serviços compilam e sobem, banco migrado.
- **M1** — espinha e2e: login JWT → Enroll → stream gRPC → lease → dispatch → task `merged`.
- **M2.1** — relay de planejamento: vault local cifrado (XChaCha20-Poly1305) + canal
  IPC (`secret.put`/`status`) + `RequestPlan`→lê refs local→chama Anthropic (chave do
  user)→`PlanResult`→cérebro grava `step`s e move a task p/ `in_review`.

Próximo (**M2.2**): isolamento por container, git clone real, abre PR de verdade.
