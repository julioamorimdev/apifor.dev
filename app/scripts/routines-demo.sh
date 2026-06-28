#!/usr/bin/env bash
# Demo de rotinas (M5.2): manual (run) + schedule (o cérebro dispara sozinho).
set -euo pipefail
BASE="${BASE:-http://localhost:8088}"

echo "== sobe stack (scheduler tick 3s) =="
docker compose down -v >/dev/null 2>&1
REAPER_TICK_SEC=3 docker compose up -d >/dev/null 2>&1
for i in $(seq 1 25); do curl -sf "$BASE/healthz" >/dev/null 2>&1 && break; sleep 2; done; sleep 4

echo "== rotina MANUAL -> run cria a tarefa =="
RID=$(curl -s -XPOST "$BASE/v1/routines" -H 'content-type: application/json' \
  -d '{"name":"deploy-check","trigger":"manual","prompt":"Verifique o healthcheck"}' | grep -oE '"id":"[^"]+"' | cut -d'"' -f4)
curl -s -XPOST "$BASE/v1/routines/$RID/run"; echo

echo "== rotina SCHEDULE (5s) -> dispara sozinha =="
SID=$(curl -s -XPOST "$BASE/v1/routines" -H 'content-type: application/json' \
  -d '{"name":"nightly","trigger":"schedule","interval_sec":5,"prompt":"Rotina agendada"}' | grep -oE '"id":"[^"]+"' | cut -d'"' -f4)
echo "  tarefas antes: $(curl -s "$BASE/v1/tasks" | grep -oc '"id"')"
echo "  aguardando ~12s..."; sleep 12
echo "  disparos automáticos: $(docker compose logs cerebro 2>&1 | grep -ic 'rotina disparada')"
echo "  tarefas depois: $(curl -s "$BASE/v1/tasks" | grep -oc '"id"')"

echo "== disable -> para =="
curl -s -XPOST "$BASE/v1/routines/$SID/disable"; echo
echo "== rotinas =="; curl -s "$BASE/v1/routines"; echo
