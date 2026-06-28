#!/usr/bin/env bash
# Demo de multi-tenant + RBAC (M5.1): registro, papéis e isolamento por org.
set -euo pipefail
BASE="${BASE:-http://localhost:8088}"
J() { echo "$1" | grep -oE '"access_token":"[^"]+"' | cut -d'"' -f4; }

echo "== registra Org A (owner) =="
OWNER=$(J "$(curl -s -XPOST "$BASE/v1/auth/register" -d '{"email":"owner@a.com","password":"p","org":"OrgA"}')")
curl -s "$BASE/v1/me" -H "Authorization: Bearer $OWNER"; echo

echo "== owner: cria repo + adiciona viewer =="
curl -s -o /dev/null -w "  repo(owner):  %{http_code}\n" -XPOST "$BASE/v1/repos" -H "Authorization: Bearer $OWNER" -d '{"name":"r","clone_url":"file:///x"}'
curl -s -o /dev/null -w "  add viewer:   %{http_code}\n" -XPOST "$BASE/v1/members" -H "Authorization: Bearer $OWNER" -d '{"email":"viewer@a.com","password":"p","role":"viewer"}'

echo "== viewer: RBAC (read ok; write/manage/billing 403) =="
VIEWER=$(J "$(curl -s -XPOST "$BASE/v1/auth/login" -d '{"email":"viewer@a.com","password":"p"}')")
curl -s -o /dev/null -w "  GET tasks   (read):    %{http_code}\n" "$BASE/v1/tasks" -H "Authorization: Bearer $VIEWER"
curl -s -o /dev/null -w "  POST task   (write):   %{http_code}\n" -XPOST "$BASE/v1/tasks" -H "Authorization: Bearer $VIEWER" -d '{"title":"x","prompt":"y"}'
curl -s -o /dev/null -w "  POST repo   (manage):  %{http_code}\n" -XPOST "$BASE/v1/repos" -H "Authorization: Bearer $VIEWER" -d '{"name":"r","clone_url":"file:///x"}'
curl -s -o /dev/null -w "  POST plan   (billing): %{http_code}\n" -XPOST "$BASE/v1/billing/plan" -H "Authorization: Bearer $VIEWER" -d '{"plan":"pro"}'

echo "== isolamento: Org B não enxerga dados da Org A =="
OWNERB=$(J "$(curl -s -XPOST "$BASE/v1/auth/register" -d '{"email":"owner@b.com","password":"p","org":"OrgB"}')")
echo "  OrgA repos: $(curl -s "$BASE/v1/repos" -H "Authorization: Bearer $OWNER" | grep -oc '"id"')"
echo "  OrgB repos: $(curl -s "$BASE/v1/repos" -H "Authorization: Bearer $OWNERB" | grep -oc '"id"')"

echo "== membros da Org A =="
curl -s "$BASE/v1/members" -H "Authorization: Bearer $OWNER"; echo
