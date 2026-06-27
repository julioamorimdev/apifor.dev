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

## Estado
- **M0** — fundação: serviços compilam e sobem, banco migrado.
- **M1** — espinha e2e: login JWT → Enroll → stream gRPC → lease → dispatch → task `merged`.
- **M2.1** — relay de planejamento: vault local cifrado (XChaCha20-Poly1305) + canal
  IPC (`secret.put`/`status`) + `RequestPlan`→lê refs local→chama Anthropic (chave do
  user)→`PlanResult`→cérebro grava `step`s e move a task p/ `in_review`.
- **M2.2** — execução real: `DispatchStep(exec)` → clone → agente coda (Anthropic/stub)
  → commit → push → PR. Repo/conexão + `pull_request` no Postgres. Validado e2e contra
  um remote git local; caminho GitHub API cabeado (ativa com token no vault).

Próximo (**M2.3**): canal IPC `kb.import`; telas Configuração/Tarefas/Fila no dashboard.
