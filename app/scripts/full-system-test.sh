#!/usr/bin/env bash
# full-system-test.sh — teste e2e do SISTEMA INTEIRO: stack completa (cérebro +
# executor + postgres + git remote), uma tarefa real pelo pipeline (plan->exec->PR->
# test->review->merge) e os subsistemas. Reporta matriz ✓/✗ (não aborta no 1º erro).
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="http://localhost:8088"
PASS=0; FAIL=0
chk() { if eval "$2"; then echo "  ✓ $1"; PASS=$((PASS+1)); else echo "  ✗ $1"; FAIL=$((FAIL+1)); fi; }
J() { echo "$1" | grep -oE '"access_token":"[^"]+"' | cut -d'"' -f4; }
PSQL() { docker compose exec -T postgres psql -tA "$1" -c "$2" 2>&1; }

echo "======== 1. SOBE A STACK COMPLETA ========"
docker compose down -v >/dev/null 2>&1
docker compose up -d --build >/dev/null 2>&1
for i in $(seq 1 40); do curl -sf "$BASE/healthz" >/dev/null 2>&1 && break; sleep 2; done
sleep 8
chk "cérebro responde (healthz)" "curl -sf $BASE/healthz >/dev/null"
chk "executor enrolou por mTLS (device ativo)" "[ \"\$(PSQL postgresql://postgres:pg@localhost/apifor \"SELECT count(*) FROM device WHERE revoked_at IS NULL\")\" -ge 1 ]"
chk "lease concedido ao worker" "[ \"\$(PSQL postgresql://postgres:pg@localhost/apifor \"SELECT count(*) FROM lease WHERE ended_at IS NULL\")\" -ge 1 ]"

echo "======== 2. VAULT / SEGREDO via IPC (token de processo) ========"
docker compose exec -T -e VALUE="sk-ant-teste-local" executor executor secret-put anthropic_api_key >/dev/null 2>&1
chk "secret_ref registrado no cérebro (só metadado)" "curl -s $BASE/v1/secrets | grep -q anthropic_api_key"
chk "valor do segredo NÃO está no cérebro (vault local)" "! PSQL postgresql://postgres:pg@localhost/apifor 'SELECT * FROM secret_ref' | grep -q 'sk-ant-teste-local'"

echo "======== 3. PIPELINE REAL: plan -> exec -> PR -> test -> review -> merge ========"
docker compose exec -T executor bash -c '
  set -e; rm -rf /tmp/seed; git init -q -b main /tmp/seed; cp -r /workspace/. /tmp/seed/;
  cd /tmp/seed; git -c user.email=s@a.dev -c user.name=s add -A;
  git -c user.email=s@a.dev -c user.name=s commit -q -m seed;
  rm -rf /remotes/sample.git; git clone -q --bare /tmp/seed /remotes/sample.git' >/dev/null 2>&1
REPO=$(curl -s -XPOST "$BASE/v1/repos" -d '{"name":"sample","clone_url":"file:///remotes/sample.git","default_branch":"main"}' | grep -oE '"id":"[^"]+"' | cut -d'"' -f4)
chk "repositório registrado" "[ -n \"$REPO\" ]"
TASK=$(curl -s -XPOST "$BASE/v1/tasks" -d "{\"title\":\"e2e /health\",\"prompt\":\"Adicione /health no main.go\",\"refs\":[\"main.go\"],\"repo_id\":\"$REPO\"}" | grep -oE '"id":"[^"]+"' | cut -d'"' -f4)
chk "tarefa criada" "[ -n \"$TASK\" ]"
echo "  ... aguardando os gates (plan->exec->PR->test->review->gate humano) ..."
STATUS=""
for i in $(seq 1 60); do
  STATUS=$(PSQL postgresql://postgres:pg@localhost/apifor "SELECT status FROM task WHERE id='$TASK'")
  case "$STATUS" in blocked|merged|failed) break;; esac
  sleep 2
done
echo "  status após os gates automáticos: $STATUS"
chk "PR criado" "[ \"\$(PSQL postgresql://postgres:pg@localhost/apifor \"SELECT count(*) FROM pull_request WHERE task_id='$TASK'\")\" -ge 1 ]"
chk "branch do worker no remote git (push real)" "docker compose exec -T executor git --git-dir=/remotes/sample.git branch | grep -q apifor/"
chk "gate de CI passou no PR (ci_status=passed)" "curl -s $BASE/v1/prs | grep -q '\"ci_status\":\"passed\"'"
chk "revisão IA aprovou (ai_review_status=approved)" "curl -s $BASE/v1/prs | grep -q '\"ai_review_status\":\"approved\"'"
chk "tarefa parou no gate de revisão HUMANA (intervenção)" "[ \"$STATUS\" = blocked ] && curl -s $BASE/v1/interventions | grep -q $TASK"
echo "  ... humano APROVA a intervenção -> despacha merge ..."
curl -s -XPOST "$BASE/v1/interventions/$TASK/answer" -d '{"decision":"approve"}' >/dev/null
for i in $(seq 1 30); do
  STATUS=$(PSQL postgresql://postgres:pg@localhost/apifor "SELECT status FROM task WHERE id='$TASK'")
  [ "$STATUS" = merged ] && break; sleep 2
done
echo "  status final da tarefa: $STATUS"
chk "tarefa chegou a MERGED após aprovação humana" "[ \"$STATUS\" = merged ]"
chk "steps do pipeline registrados (exec/test/review/merge)" "[ \"\$(PSQL postgresql://postgres:pg@localhost/apifor \"SELECT count(DISTINCT type) FROM step WHERE task_id='$TASK'\")\" -ge 3 ]"

echo "======== 4. RLS (multi-tenant) ========"
A=$(J "$(curl -s -XPOST $BASE/v1/auth/register -d '{"email":"a@a.com","password":"p","org":"A"}')")
B=$(J "$(curl -s -XPOST $BASE/v1/auth/register -d '{"email":"b@b.com","password":"p","org":"B"}')")
curl -s -XPOST $BASE/v1/repos -H "Authorization: Bearer $A" -d '{"name":"ra","clone_url":"file:///a"}' >/dev/null
curl -s -XPOST $BASE/v1/repos -H "Authorization: Bearer $B" -d '{"name":"rb","clone_url":"file:///b"}' >/dev/null
chk "org A vê só o próprio repo" "curl -s $BASE/v1/repos -H 'Authorization: Bearer $A' | grep -q ra && ! curl -s $BASE/v1/repos -H 'Authorization: Bearer $A' | grep -q rb"
chk "apifor_app sem org -> 0 linhas (RLS)" "[ \"\$(PSQL postgresql://apifor_app:apppw@localhost/apifor 'SELECT count(*) FROM repository')\" = 0 ]"
chk "runtime sem superuser (apifor_worker)" "[ \"\$(PSQL postgresql://postgres:pg@localhost/apifor \"SELECT rolsuper FROM pg_roles WHERE rolname='apifor_worker'\")\" = f ]"

echo "======== 5. RBAC ========"
curl -s -XPOST $BASE/v1/members -H "Authorization: Bearer $A" -d '{"email":"v@a.com","password":"pw","role":"viewer"}' >/dev/null
V=$(J "$(curl -s -XPOST $BASE/v1/auth/login -d '{"email":"v@a.com","password":"pw"}')")
chk "viewer NÃO cria tarefa (403)" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -XPOST $BASE/v1/tasks -H 'Authorization: Bearer $V' -d '{\"title\":\"x\",\"prompt\":\"x\"}')\" = 403 ]"

echo "======== 6. ROTINAS / MEMÓRIA+KB / NOTIFICAÇÕES ========"
RID=$(curl -s -XPOST $BASE/v1/routines -d '{"name":"r","trigger":"manual","prompt":"x"}' | grep -oE '"id":"[^"]+"' | cut -d'"' -f4)
chk "rotina criada" "[ -n \"$RID\" ]"
chk "rotina dispara manualmente" "curl -s -XPOST $BASE/v1/routines/$RID/run | grep -q task_id"
curl -s -XPOST $BASE/v1/memories -d '{"scope":"global","instruction":"Sempre adicione testes."}' >/dev/null
chk "memória da org criada" "curl -s $BASE/v1/memories | grep -q 'adicione testes'"
chk "notificações geradas por eventos (PR/merge)" "[ \"\$(curl -s $BASE/v1/notifications | grep -oc '\"id\"')\" -ge 1 ]"

echo "======== 7. BILLING (webhook HMAC) / OBSERVABILIDADE / AUDITORIA ========"
chk "/metrics expõe Prometheus" "curl -s $BASE/metrics | grep -q apifor_http_requests_total"
chk "auditoria registra escritas" "curl -s $BASE/v1/audit | grep -qE 'repo.create|task.create|member.add'"
chk "uso/telemetria acessível" "curl -s $BASE/v1/usage >/dev/null"

echo
echo "================== RESULTADO: $PASS ✓  /  $FAIL ✗ =================="
docker compose down -v >/dev/null 2>&1
[ "$FAIL" -eq 0 ]
