#!/usr/bin/env bash
# Demo ponta-a-ponta do M2.2: tarefa real -> plano -> exec (clone -> coda ->
# commit -> push -> PR). Usa um remote git LOCAL (bare) p/ provar o pipeline
# sem GitHub. Para GitHub real: registre um repo https + `make secret` name=github.
set -euo pipefail
BASE="${BASE:-http://localhost:8088}"

echo "== 1) semeando remote git local (bare) =="
docker compose exec -T executor bash -c '
  set -e; rm -rf /tmp/seed; git init -q -b main /tmp/seed; cp -r /workspace/. /tmp/seed/;
  cd /tmp/seed; git -c user.email=seed@apifor.dev -c user.name=seed add -A;
  git -c user.email=seed@apifor.dev -c user.name=seed commit -q -m seed;
  rm -rf /remotes/sample.git; git clone -q --bare /tmp/seed /remotes/sample.git;
  echo "  bare: file:///remotes/sample.git (branches: $(git -C /remotes/sample.git branch | tr -d "\n"))"'
echo

echo "== 2) registrando o repositório no cérebro =="
REPO=$(curl -s -XPOST "$BASE/v1/repos" -H 'content-type: application/json' \
  -d '{"name":"sample","clone_url":"file:///remotes/sample.git","default_branch":"main"}' \
  | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
echo "  repo_id=$REPO"
echo

echo "== 3) criando tarefa real (com repo) -> plano -> exec =="
TASK=$(curl -s -XPOST "$BASE/v1/tasks" -H 'content-type: application/json' \
  -d "{\"title\":\"Adicionar /health\",\"prompt\":\"Adicione um endpoint HTTP GET /health que retorna 200 ok no main.go.\",\"refs\":[\"main.go\"],\"repo_id\":\"$REPO\"}" \
  | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
echo "  task=$TASK"
echo

echo "== 4) aguardando o PR... =="
PRS='{"data":null}'
for i in $(seq 1 30); do
  PRS=$(curl -s "$BASE/v1/prs")
  if echo "$PRS" | grep -q "$TASK"; then break; fi
  sleep 1
done

echo "== 5) pull request registrado pelo cérebro =="
echo "$PRS"
echo
echo "== 6) branch no remote (prova do push) =="
docker compose exec -T executor git -C /remotes/sample.git branch
echo
echo "== 7) diff do branch vs main (prova de que o agente codou) =="
docker compose exec -T executor bash -c "git -C /remotes/sample.git diff --stat main apifor/$TASK || true"
