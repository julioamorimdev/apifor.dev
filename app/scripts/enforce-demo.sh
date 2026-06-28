#!/usr/bin/env bash
# Demo do enforcement de plano (M3.1) — tudo server-side, o cliente não burla.
# Usa knobs de teste p/ encolher 4h/36h em segundos. NÃO é produção.
set -euo pipefail
BASE="${BASE:-http://localhost:8088}"

echo "== sobe stack: Free, lease=8s, tick=3s, +2 leases extras =="
docker compose down -v >/dev/null 2>&1
LEASE_TTL_SEC=8 REAPER_TICK_SEC=3 APIFOR_EXTRA_LEASES=2 docker compose up -d >/dev/null 2>&1
for i in $(seq 1 25); do curl -sf "$BASE/healthz" >/dev/null 2>&1 && break; sleep 2; done
sleep 6

echo
echo "== max_workers (Free=1): 1 concedido + 2 NEGADOS (plan_limit) =="
docker compose logs executor 2>&1 | grep -iE "lease concedido|LEASE NEGADO" | head
echo "-- /v1/usage --"; curl -s "$BASE/v1/usage"; echo

echo
echo "== lease Free expira em 8s e NÃO renova =="
sleep 8
docker compose logs cerebro 2>&1 | grep -i "revogado" | tail -1
docker compose logs executor 2>&1 | grep -iE "REVOGADO|STOP WORKER" | tail -2
echo "-- /v1/usage (active_workers -> 0) --"; curl -s "$BASE/v1/usage"; echo

echo
echo "== kill-switch: revoga o device =="
DEV=$(curl -s "$BASE/v1/devices" | grep -oE '"id":"dev_[^"]+"' | head -1 | cut -d'"' -f4)
curl -s -XPOST "$BASE/v1/devices/$DEV/revoke"; echo
echo "(o reaper corta os leases ativos da org no próximo tick)"

echo
echo "Outros cenários:"
echo "  Pro:    curl -XPOST $BASE/v1/billing/plan -d '{\"plan\":\"pro\"}' (lease sem expiração)"
echo "  36h/sem: suba com WORKER_HOURS_CAP_SEC=12 -> revoga 'hours_cap' e nega novos leases"
