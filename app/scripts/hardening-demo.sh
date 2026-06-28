#!/usr/bin/env bash
# Demo do hardening (M6.1): auditoria + rate limit por plano + métricas.
set -euo pipefail
BASE="${BASE:-http://localhost:8088}"

echo "== sobe cérebro =="
docker compose down -v >/dev/null 2>&1
docker compose up -d cerebro postgres >/dev/null 2>&1
for i in $(seq 1 25); do curl -sf "$BASE/healthz" >/dev/null 2>&1 && break; sleep 2; done; sleep 2

echo "== ações auditadas =="
curl -s -XPOST "$BASE/v1/repos" -d '{"name":"r1","clone_url":"file:///x"}' >/dev/null
curl -s -XPOST "$BASE/v1/members" -d '{"email":"m@x.com","password":"p","role":"member"}' >/dev/null
curl -s "$BASE/v1/audit" | grep -oE '"action":"[^"]+"'
echo "  export CSV:"; curl -s "$BASE/v1/audit/export" | head -3

echo "== rate limit (Free=60/min): 70 requisições =="
codes=$(for i in $(seq 1 70); do curl -s -o /dev/null -w "%{http_code}\n" "$BASE/v1/tasks"; done)
echo "  200: $(echo "$codes" | grep -c 200)  |  429: $(echo "$codes" | grep -c 429)"

echo "== /metrics (Prometheus) =="
curl -s "$BASE/metrics" | grep -E "requests_total|rate_limited|orgs|responses_total"
