#!/usr/bin/env bash
# Demo ponta-a-ponta do relay de planejamento (M2.1).
# Cria uma tarefa real -> cérebro empurra RequestPlan -> executor planeja LOCAL
# (chave do user, se houver no vault) -> devolve só o plano estruturado.
set -euo pipefail

BASE="${BASE:-http://localhost:8088}"

echo "== estado do vault (metadados) =="
docker compose exec -T executor executor status || true
echo

echo "== criando tarefa real =="
RESP=$(curl -s -XPOST "$BASE/v1/tasks" -H 'content-type: application/json' \
  -d '{"title":"Adicionar endpoint /health","prompt":"Adicione um endpoint HTTP GET /health que retorna 200 com {\"status\":\"ok\"}.","refs":["README.md","main.go"]}')
echo "$RESP"
TASK=$(echo "$RESP" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
if [ -z "$TASK" ]; then echo "falha ao criar tarefa"; exit 1; fi
echo "task=$TASK"
echo

echo "== aguardando o relay planejar... =="
for i in $(seq 1 20); do
  STEPS=$(curl -s "$BASE/v1/tasks/$TASK/steps")
  if [ "$STEPS" != '{"data":null}' ] && echo "$STEPS" | grep -q '"idx"'; then break; fi
  sleep 1
done

echo "== plano estruturado (steps gravados pelo cérebro) =="
echo "$STEPS"
echo

echo "== tarefa (status deve estar 'in_review' = plano pronto) =="
curl -s "$BASE/v1/tasks" | grep -o "\"id\":\"$TASK\"[^}]*" || true
echo
