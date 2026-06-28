#!/usr/bin/env bash
# prod-posture.sh — sobe o perfil de PRODUÇÃO e confirma que a postura endurecida
# está ativa: auth obrigatória, sem usuário demo, REST sobre TLS. Sai != 0 se falhar.
set -euo pipefail
cd "$(dirname "$0")/.."
export JWT_SECRET="${JWT_SECRET:-$(head -c 48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 48)}"
PC="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
fail() { echo "FAIL: $*" >&2; $PC logs cerebro 2>&1 | tail -25 >&2; $PC down -v >/dev/null 2>&1; exit 1; }
ok() { echo "  ok: $*"; }

echo "== valida o override de produção =="
$PC config >/dev/null || fail "compose config inválido"
ok "docker compose config válido"

echo "== sobe o perfil de produção (cérebro+postgres) =="
$PC down -v >/dev/null 2>&1 || true
$PC up -d --build cerebro postgres >/dev/null 2>&1 || fail "up"
for i in $(seq 1 40); do curl -sk https://localhost:8088/healthz >/dev/null 2>&1 && break; sleep 2; done

echo "== TLS no REST ativo =="
curl -sk https://localhost:8088/healthz >/dev/null 2>&1 || fail "HTTPS não respondeu"
ok "HTTPS responde"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:8088/healthz 2>/dev/null || echo "000")
[ "$code" != "200" ] || fail "HTTP em claro deveria ser rejeitado (got $code)"
ok "HTTP em claro rejeitado (got $code)"

echo "== auth obrigatória (REQUIRE_AUTH) =="
code=$(curl -sk -o /dev/null -w '%{http_code}' https://localhost:8088/v1/tasks)
[ "$code" = "401" ] || fail "rota protegida sem token deveria dar 401 (got $code)"
ok "sem token -> 401"

echo "== sem usuário demo (SEED_DEMO=false) =="
code=$(curl -sk -o /dev/null -w '%{http_code}' -XPOST https://localhost:8088/v1/auth/login -d '{"email":"demo@apifor.dev","password":"demo"}')
[ "$code" = "401" ] || fail "login demo deveria falhar em produção (got $code)"
ok "login demo -> 401"

echo "== fluxo real ainda funciona (register + login) =="
TOK=$(curl -sk -XPOST https://localhost:8088/v1/auth/register -d '{"email":"op@x.com","password":"p","org":"Op"}' | grep -oE '"access_token":"[^"]+"' | cut -d'"' -f4)
[ -n "$TOK" ] || fail "register em produção falhou"
code=$(curl -sk -o /dev/null -w '%{http_code}' https://localhost:8088/v1/tasks -H "Authorization: Bearer $TOK")
[ "$code" = "200" ] || fail "usuário real autenticado deveria acessar (got $code)"
ok "register + acesso autenticado OK"

$PC down -v >/dev/null 2>&1
echo "== POSTURA DE PRODUÇÃO: TUDO ATIVO =="
