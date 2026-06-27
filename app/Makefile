SHELL := /bin/bash
.PHONY: dev up down db migrate cerebro executor dashboard logs ps clean smoke \
        secret ipc-status task steps relay-demo git-remote repo prs pr-demo

dev: ; docker compose up --build

up: ; docker compose up -d --build

down: ; docker compose down

db: ; docker compose up -d postgres

migrate: ; docker compose up migrate

cerebro: ; docker compose up -d --build cerebro

executor: ; docker compose up -d --build executor

dashboard: ; pnpm -C dashboard install && pnpm -C dashboard dev

logs: ; docker compose logs -f

ps: ; docker compose ps

clean: ; docker compose down -v

# sobe a stack e checa o health do cérebro
smoke: ; docker compose up -d --build && sleep 5 && curl -sf http://localhost:8088/healthz && echo " <- cerebro OK"

# ── M2.1: vault local + IPC + relay ──

# grava a chave Anthropic no vault local cifrado (valor nunca vai ao cérebro).
# uso: make secret KEY=sk-ant-...   (sem KEY, o relay usa o stub)
secret: ; @docker compose exec -T -e VALUE="$(KEY)" executor executor secret-put anthropic anthropic_api_key

# estado do daemon (segredos no vault — só metadados)
ipc-status: ; @docker compose exec -T executor executor status

# cria uma tarefa real -> dispara o relay de planejamento
task: ; @curl -s -XPOST http://localhost:8088/v1/tasks -H 'content-type: application/json' \
	-d '{"title":"Adicionar endpoint /health","prompt":"Adicione um endpoint HTTP GET /health que retorna 200 com {\"status\":\"ok\"}.","refs":["README.md","main.go"]}'; echo

# plano estruturado de uma tarefa: make steps TASK=tsk_...
steps: ; @curl -s http://localhost:8088/v1/tasks/$(TASK)/steps; echo

# demo ponta-a-ponta do relay (cria tarefa, espera, mostra o plano)
relay-demo: ; @bash scripts/relay-demo.sh

# ── M2.2: execução real (clone -> coda -> PR) ──

# semeia um remote git LOCAL (bare) a partir de sample/, p/ demonstrar o pipeline
# sem precisar de GitHub. p/ usar GitHub real: registre o repo https + token no vault.
git-remote: ; @docker compose exec -T executor bash -c '\
	set -e; rm -rf /tmp/seed; git init -q -b main /tmp/seed; cp -r /workspace/. /tmp/seed/; \
	cd /tmp/seed; git -c user.email=seed@apifor.dev -c user.name=seed add -A; \
	git -c user.email=seed@apifor.dev -c user.name=seed commit -q -m seed; \
	rm -rf /remotes/sample.git; git clone -q --bare /tmp/seed /remotes/sample.git; \
	echo "bare remote: file:///remotes/sample.git"'

# registra um repositório no cérebro (default: o bare remote local)
repo: ; @curl -s -XPOST http://localhost:8088/v1/repos -H 'content-type: application/json' \
	-d '{"name":"sample","clone_url":"$(or $(URL),file:///remotes/sample.git)","default_branch":"main"}'; echo

# lista pull requests abertos pelo executor
prs: ; @curl -s http://localhost:8088/v1/prs; echo

# demo ponta-a-ponta do M2.2: clone -> coda -> commit -> push -> PR
pr-demo: ; @bash scripts/pr-demo.sh
