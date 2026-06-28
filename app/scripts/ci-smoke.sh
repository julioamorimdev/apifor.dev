#!/usr/bin/env bash
# ci-smoke.sh — checagens determinísticas p/ o CI: e2e do cérebro + isolamento e
# enforcement de RLS + RBAC + privilégio (runtime sem superuser). Sai != 0 se falhar.
# Sobe só cérebro+postgres (rápido/determinístico); o pipeline com executor é coberto
# pelos jobs de build. Uso: bash scripts/ci-smoke.sh
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="http://localhost:8088"
fail() { echo "FAIL: $*" >&2; docker compose logs cerebro 2>&1 | tail -30 >&2; docker compose down -v >/dev/null 2>&1; exit 1; }
ok() { echo "  ok: $*"; }
J() { echo "$1" | grep -oE '"access_token":"[^"]+"' | cut -d'"' -f4; }
PSQL() { docker compose exec -T postgres psql -tA "$1" -c "$2" 2>&1; }

echo "== sobe cérebro + postgres (estado limpo) =="
docker compose down -v >/dev/null 2>&1 || true
docker compose up -d --build cerebro postgres >/dev/null 2>&1 || fail "up"
for i in $(seq 1 40); do curl -sf "$BASE/healthz" >/dev/null 2>&1 && break; sleep 2; done
curl -sf "$BASE/healthz" >/dev/null 2>&1 || fail "healthz não respondeu"
ok "healthz"

echo "== multi-tenant + isolamento de leitura (RLS) =="
A=$(J "$(curl -s -XPOST "$BASE/v1/auth/register" -d '{"email":"a@a.com","password":"p","org":"A"}')")
B=$(J "$(curl -s -XPOST "$BASE/v1/auth/register" -d '{"email":"b@b.com","password":"p","org":"B"}')")
[ -n "$A" ] && [ -n "$B" ] || fail "register não retornou token"
curl -s -XPOST "$BASE/v1/repos" -H "Authorization: Bearer $A" -d '{"name":"repo-A","clone_url":"file:///a"}' >/dev/null
curl -s -XPOST "$BASE/v1/repos" -H "Authorization: Bearer $B" -d '{"name":"repo-B","clone_url":"file:///b"}' >/dev/null
RA=$(curl -s "$BASE/v1/repos" -H "Authorization: Bearer $A")
echo "$RA" | grep -q "repo-A" || fail "org A não vê o próprio repo"
echo "$RA" | grep -q "repo-B" && fail "VAZAMENTO: org A vê repo da org B"
ok "cada org só vê o seu repo"

echo "== enforcement de RLS no banco (role apifor_app) =="
N=$(PSQL "postgresql://apifor_app:apppw@localhost/apifor" "SELECT count(*) FROM repository")
[ "$N" = "0" ] || fail "RLS read: apifor_app SEM org deveria ver 0 linhas, viu $N"
ok "apifor_app sem org -> 0 linhas"
OA=$(curl -s "$BASE/v1/me" -H "Authorization: Bearer $A" | grep -oE '"org_id":"[^"]+"' | cut -d'"' -f4)
OB=$(curl -s "$BASE/v1/me" -H "Authorization: Bearer $B" | grep -oE '"org_id":"[^"]+"' | cut -d'"' -f4)
# o INSERT cross-tenant deve falhar (RLS) -> psql sai != 0; || true p/ não disparar set -e
W=$(PSQL "postgresql://apifor_app:apppw@localhost/apifor" "SET app.current_org TO '$OA'; INSERT INTO secret_ref(id,org_id,name) VALUES('sec_x','$OB','hack');" || true)
echo "$W" | grep -qi "row-level security" || fail "RLS write: insert cross-tenant deveria ser bloqueado (got: $W)"
ok "write cross-tenant bloqueado (WITH CHECK)"

echo "== runtime sem superuser =="
S=$(PSQL "postgresql://postgres:pg@localhost/apifor" "SELECT rolsuper FROM pg_roles WHERE rolname='apifor_worker'")
[ "$S" = "f" ] || fail "apifor_worker deveria ser NOSUPERUSER (got rolsuper=$S)"
ok "apifor_worker é NOSUPERUSER (BYPASSRLS)"

echo "== RBAC: viewer não escreve =="
curl -s -XPOST "$BASE/v1/members" -H "Authorization: Bearer $A" -d '{"email":"v@a.com","password":"pw","role":"viewer"}' >/dev/null
V=$(J "$(curl -s -XPOST "$BASE/v1/auth/login" -d '{"email":"v@a.com","password":"pw"}')")
[ -n "$V" ] || fail "login do viewer falhou"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -XPOST "$BASE/v1/tasks" -H "Authorization: Bearer $V" -d '{"title":"x","prompt":"x"}')
[ "$CODE" = "403" ] || fail "RBAC: viewer POST /v1/tasks deveria dar 403, deu $CODE"
ok "viewer bloqueado (403)"

echo "== task create (owner) =="
TC=$(curl -s -o /dev/null -w '%{http_code}' -XPOST "$BASE/v1/tasks" -H "Authorization: Bearer $A" -d '{"title":"ci","prompt":"x"}')
[ "$TC" = "201" ] || fail "owner POST /v1/tasks deveria dar 201, deu $TC"
ok "owner cria tarefa (201)"

docker compose down -v >/dev/null 2>&1
echo "== CI SMOKE: TODOS OS CHECKS PASSARAM =="
