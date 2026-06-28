#!/usr/bin/env bash
# Demo de billing + dunning (M3.2b) com eventos sintéticos do Stripe ASSINADOS
# (HMAC-SHA256 — a verificação no cérebro é a real). Sem chamar o Stripe de verdade.
set -euo pipefail
BASE="${BASE:-http://localhost:8088}"
SECRET="${STRIPE_WEBHOOK_SECRET:-whsec_test123}"

echo "== sobe stack: webhook secret de teste + dunning 5s + tick 3s =="
docker compose down -v >/dev/null 2>&1
STRIPE_WEBHOOK_SECRET="$SECRET" DUNNING_GRACE_SEC=5 REAPER_TICK_SEC=3 docker compose up -d >/dev/null 2>&1
for i in $(seq 1 25); do curl -sf "$BASE/healthz" >/dev/null 2>&1 && break; sleep 2; done

send() { # $1 = json body — assina e POSTa no webhook
  local body="$1" ts sig
  ts=$(date +%s)
  sig=$(printf '%s' "$ts.$body" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)
  curl -s -XPOST "$BASE/v1/billing/webhook" -H "Stripe-Signature: t=$ts,v1=$sig" --data-binary "$body"
}

echo; echo "== assinatura inválida -> 400 =="
curl -s -o /dev/null -w "  http=%{http_code}\n" -XPOST "$BASE/v1/billing/webhook" -H "Stripe-Signature: t=1,v1=dead" --data-binary '{}'

echo; echo "== checkout.session.completed (assinado) -> Pro =="
send '{"type":"checkout.session.completed","data":{"object":{"customer":"cus_1","subscription":"sub_1","metadata":{"org_id":"org_demo","plan":"pro"}}}}'; echo
curl -s "$BASE/v1/usage" | grep -oE '"plan":"[^"]+"|"max_workers":[0-9]+'

echo; echo "== invoice.payment_succeeded -> fatura =="
send '{"type":"invoice.payment_succeeded","data":{"object":{"id":"in_1","customer":"cus_1","amount_paid":2000,"currency":"usd","metadata":{"org_id":"org_demo"}}}}'; echo
curl -s "$BASE/v1/invoices"; echo

echo; echo "== invoice.payment_failed -> past_due (graça 5s) -> dunning rebaixa p/ Free =="
send '{"type":"invoice.payment_failed","data":{"object":{"customer":"cus_1","metadata":{"org_id":"org_demo"}}}}' >/dev/null
curl -s "$BASE/v1/subscription"; echo
sleep 10
docker compose logs cerebro 2>&1 | grep -i "dunning:" | tail -1
echo "depois:"; curl -s "$BASE/v1/usage" | grep -oE '"plan":"[^"]+"|"max_workers":[0-9]+'

echo; echo "Stripe real: defina STRIPE_SECRET_KEY + STRIPE_PRICE_PRO -> POST /v1/billing/checkout abre o Checkout."
