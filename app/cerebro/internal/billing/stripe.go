// Package billing — integração Stripe (M3.2b). A verificação de assinatura do
// webhook é real (HMAC-SHA256, esquema do Stripe). Checkout/Portal chamam a API
// do Stripe quando há STRIPE_SECRET_KEY; senão devolvem um link-stub de dev.
package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// VerifyWebhook valida o header Stripe-Signature (t=ts,v1=hex) sobre "ts.payload".
func VerifyWebhook(payload []byte, sigHeader, secret string, tolerance time.Duration) error {
	if secret == "" {
		return errors.New("webhook secret não configurado")
	}
	var ts string
	var v1s []string
	for _, part := range strings.Split(sigHeader, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			ts = kv[1]
		case "v1":
			v1s = append(v1s, kv[1])
		}
	}
	if ts == "" || len(v1s) == 0 {
		return errors.New("assinatura malformada")
	}
	if tolerance > 0 {
		n, err := strconv.ParseInt(ts, 10, 64)
		if err != nil {
			return errors.New("timestamp inválido")
		}
		if d := time.Since(time.Unix(n, 0)); d > tolerance || d < -tolerance {
			return errors.New("timestamp fora da tolerância")
		}
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + "." + string(payload)))
	expected := mac.Sum(nil)
	for _, v := range v1s {
		got, err := hex.DecodeString(v)
		if err == nil && hmac.Equal(got, expected) {
			return nil
		}
	}
	return errors.New("assinatura inválida")
}

// Sign produz um header Stripe-Signature válido (usado em testes/CLI locais).
func Sign(payload []byte, secret string, ts int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("%d.%s", ts, payload)))
	return fmt.Sprintf("t=%d,v1=%s", ts, hex.EncodeToString(mac.Sum(nil)))
}

// Checkout cria uma sessão de Checkout no Stripe (assinatura). priceID por plano.
// org/plan vão em client_reference_id + metadata p/ o webhook mapear.
func Checkout(secretKey, priceID, successURL, cancelURL, org, plan string) (string, error) {
	if priceID == "" {
		return "", errors.New("price do plano não configurado (STRIPE_PRICE_*)")
	}
	form := url.Values{}
	form.Set("mode", "subscription")
	form.Set("line_items[0][price]", priceID)
	form.Set("line_items[0][quantity]", "1")
	form.Set("success_url", successURL)
	form.Set("cancel_url", cancelURL)
	form.Set("client_reference_id", org)
	form.Set("metadata[org_id]", org)
	form.Set("metadata[plan]", plan)
	form.Set("subscription_data[metadata][org_id]", org)
	form.Set("subscription_data[metadata][plan]", plan)
	return postStripe(secretKey, "https://api.stripe.com/v1/checkout/sessions", form, "url")
}

// Portal cria uma sessão do Customer Portal.
func Portal(secretKey, customerID, returnURL string) (string, error) {
	if customerID == "" {
		return "", errors.New("sem stripe_customer_id")
	}
	form := url.Values{}
	form.Set("customer", customerID)
	form.Set("return_url", returnURL)
	return postStripe(secretKey, "https://api.stripe.com/v1/billing_portal/sessions", form, "url")
}

// postStripe faz POST form-encoded e extrai o campo `field` do JSON de resposta.
func postStripe(secretKey, endpoint string, form url.Values, field string) (string, error) {
	req, _ := http.NewRequest("POST", endpoint, strings.NewReader(form.Encode()))
	req.Header.Set("Authorization", "Bearer "+secretKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("stripe HTTP %d: %s", resp.StatusCode, truncate(body, 200))
	}
	// extração simples do campo "url":"..."
	key := `"` + field + `":"`
	i := strings.Index(string(body), key)
	if i < 0 {
		return "", errors.New("resposta sem campo " + field)
	}
	rest := string(body)[i+len(key):]
	j := strings.IndexByte(rest, '"')
	if j < 0 {
		return "", errors.New("resposta malformada")
	}
	return strings.ReplaceAll(rest[:j], `\/`, `/`), nil
}

func truncate(b []byte, n int) string {
	if len(b) > n {
		return string(b[:n])
	}
	return string(b)
}
