SHELL := /bin/bash
.PHONY: dev up down db migrate cerebro executor dashboard logs ps clean smoke \
        secret ipc-status task steps relay-demo git-remote repo prs pr-demo \
        usage plan devices revoke enforce-demo \
        subscription invoices checkout billing-demo \
        interventions approve reject pipeline-demo ci qa telemetry

dev: ; docker compose up --build

up: ; docker compose up -d --build

down: ; docker compose down

db: ; docker compose up -d postgres

migrate: ; docker compose up migrate

cerebro: ; docker compose up -d --build cerebro

executor: ; docker compose up -d --build executor

dashboard: ; cd dashboard && npm install && npm run dev   # http://localhost:3000 (proxy /api -> :8088)

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

# ── M3.1: enforcement de plano (server-side) ──

usage: ; @curl -s http://localhost:8088/v1/usage; echo                       # uso vs limites
plan: ; @curl -s -XPOST http://localhost:8088/v1/billing/plan -H 'content-type: application/json' -d '{"plan":"$(or $(PLAN),pro)"}'; echo  # troca de plano
devices: ; @curl -s http://localhost:8088/v1/devices; echo                   # lista devices
revoke: ; @curl -s -XPOST http://localhost:8088/v1/devices/$(DEV)/revoke; echo  # kill-switch (DEV=dev_...)

# demo do enforcement (max_workers, lease TTL, kill-switch) com knobs de teste
enforce-demo: ; @bash scripts/enforce-demo.sh

# ── M3.2b: billing (Stripe) + dunning ──

subscription: ; @curl -s http://localhost:8088/v1/subscription; echo          # estado da assinatura
invoices: ; @curl -s http://localhost:8088/v1/invoices; echo                  # faturas
checkout: ; @curl -s -XPOST http://localhost:8088/v1/billing/checkout -H 'content-type: application/json' -d '{"plan":"$(or $(PLAN),pro)"}'; echo  # Stripe Checkout (stub sem chave)

# demo de billing + dunning com eventos sintéticos do Stripe ASSINADOS
billing-demo: ; @bash scripts/billing-demo.sh

# ── M4.1: pipeline (gates) + intervenção ──

interventions: ; @curl -s http://localhost:8088/v1/interventions; echo        # gates aguardando humano
approve: ; @curl -s -XPOST http://localhost:8088/v1/interventions/$(TASK)/answer -H 'content-type: application/json' -d '{"decision":"approve"}'; echo  # destrava o merge (TASK=tsk_...)
reject: ; @curl -s -XPOST http://localhost:8088/v1/interventions/$(TASK)/answer -H 'content-type: application/json' -d '{"decision":"reject"}'; echo

# demo do pipeline completo: plan->exec->test->review->gate humano->merge
pipeline-demo: ; @bash scripts/pipeline-demo.sh

# ── M4.3: telas read-only ──
ci: ; @curl -s http://localhost:8088/v1/ci; echo                 # execuções de CI
qa: ; @curl -s http://localhost:8088/v1/qa; echo                 # relatórios de QA
telemetry: ; @curl -s http://localhost:8088/v1/telemetry; echo   # agregado da org
