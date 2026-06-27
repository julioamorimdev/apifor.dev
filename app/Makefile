SHELL := /bin/bash
.PHONY: dev up down db migrate cerebro executor dashboard logs ps clean smoke \
        secret ipc-status task steps relay-demo

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
