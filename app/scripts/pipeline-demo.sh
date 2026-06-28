#!/usr/bin/env bash
# Demo do pipeline completo (M4.1): plan -> exec -> test -> review -> [gate humano] -> merge.
# Os gates são server-side; o humano destrava via /v1/interventions.
set -euo pipefail
BASE="${BASE:-http://localhost:8088}"

echo "== sobe stack (gate humano on por padrão) =="
docker compose down -v >/dev/null 2>&1
docker compose up -d >/dev/null 2>&1
for i in $(seq 1 25); do curl -sf "$BASE/healthz" >/dev/null 2>&1 && break; sleep 2; done
sleep 4

echo "== seed do remote git local + registro do repo =="
docker compose exec -T executor bash -c '
  set -e; rm -rf /tmp/seed; git init -q -b main /tmp/seed; cp -r /workspace/. /tmp/seed/;
  cd /tmp/seed; git -c user.email=s@a.dev -c user.name=s add -A;
  git -c user.email=s@a.dev -c user.name=s commit -q -m seed;
  rm -rf /remotes/sample.git; git clone -q --bare /tmp/seed /remotes/sample.git' >/dev/null
REPO=$(curl -s -XPOST "$BASE/v1/repos" -H 'content-type: application/json' \
  -d '{"name":"sample","clone_url":"file:///remotes/sample.git","default_branch":"main"}' \
  | grep -oE '"id":"[^"]+"' | cut -d'"' -f4)

echo "== cria tarefa -> plan -> exec -> test -> review -> gate =="
TASK=$(curl -s -XPOST "$BASE/v1/tasks" -H 'content-type: application/json' \
  -d "{\"title\":\"Pipeline /health\",\"prompt\":\"Adicione /health no main.go\",\"refs\":[\"main.go\"],\"repo_id\":\"$REPO\"}" \
  | grep -oE '"id":"[^"]+"' | cut -d'"' -f4)
echo "  task=$TASK"

echo "== aguardando o gate de revisão humana... =="
for i in $(seq 1 30); do
  if curl -s "$BASE/v1/interventions" | grep -q "$TASK"; then break; fi
  sleep 1
done
echo "-- pipeline log --"; docker compose logs cerebro 2>&1 | grep -iE "pipeline:" | tail -5
echo "-- intervenções pendentes --"; curl -s "$BASE/v1/interventions"; echo
echo "-- PR (ci verde, review IA aprovado, humano pendente) --"
curl -s "$BASE/v1/prs" | grep -oE '"ci_status":"[^"]+"|"ai_review_status":"[^"]+"|"human_review_status":"[^"]+"'

echo
echo "== humano APROVA -> despacha merge =="
curl -s -XPOST "$BASE/v1/interventions/$TASK/answer" -H 'content-type: application/json' -d '{"decision":"approve"}'; echo
for i in $(seq 1 20); do
  ST=$(curl -s "$BASE/v1/prs" | grep -oE '"status":"[^"]+"' | head -1 | cut -d'"' -f4)
  [ "$ST" = "merged" ] && break; sleep 1
done
echo "-- pipeline log --"; docker compose logs cerebro 2>&1 | grep -iE "pipeline:|merge desp" | tail -4
echo "-- branch main no remote (deve ter o merge + APIFOR_CHANGE.md) --"
docker compose exec -T executor bash -c "git -C /remotes/sample.git log --oneline main | head -3; echo '---'; git -C /remotes/sample.git ls-tree --name-only main | grep -i apifor || echo '(sem arquivo)'"
