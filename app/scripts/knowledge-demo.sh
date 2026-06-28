#!/usr/bin/env bash
# Demo de memória & KB (M5.3): a memória da org é injetada no plano; a KB é
# importada via IPC (arquivo local) e o agente a consulta no planejamento.
set -euo pipefail
BASE="${BASE:-http://localhost:8088}"

echo "== sobe stack =="
docker compose down -v >/dev/null 2>&1
docker compose up -d >/dev/null 2>&1
for i in $(seq 1 25); do curl -sf "$BASE/healthz" >/dev/null 2>&1 && break; sleep 2; done; sleep 5

echo "== cria memória (global) =="
curl -s -XPOST "$BASE/v1/memories" -H 'content-type: application/json' \
  -d '{"scope":"global","instruction":"Sempre adicione testes e atualize o README."}'; echo

echo "== importa KB via IPC (arquivo fica local, metadado no cérebro) =="
docker compose exec -T -e VALUE="Runbook: rode make smoke antes do deploy." executor executor kb-import runbook.md runbook
echo "  KB no cérebro: $(curl -s "$BASE/v1/kb-documents" | grep -oc '"id"') doc(s)"
echo "  KB local:      $(docker compose exec -T executor ls /var/lib/apifor/kb 2>/dev/null | tr '\n' ' ')"

echo "== cria tarefa -> memória injetada + KB anexada no planejamento =="
curl -s -XPOST "$BASE/v1/tasks" -H 'content-type: application/json' \
  -d '{"title":"demo","prompt":"Adicione /health","refs":["README.md"]}' >/dev/null
sleep 5
echo "  cerebro:  $(docker compose logs cerebro 2>&1 | grep -i 'memória:' | tail -1 | sed 's/.*memória/memória/')"
echo "  executor: $(docker compose logs executor 2>&1 | grep -iE 'memória da org|KB local anexada' | tr '\n' ' | ')"
