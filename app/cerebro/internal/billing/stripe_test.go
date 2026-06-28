package billing

import "testing"

func TestVerifyWebhookRoundTrip(t *testing.T) {
	payload := []byte(`{"type":"invoice.paid"}`)
	secret := "whsec_teste"
	sig := Sign(payload, secret, 1700000000)
	if err := VerifyWebhook(payload, sig, secret, 0); err != nil {
		t.Fatalf("assinatura válida deveria passar: %v", err)
	}
}

func TestVerifyWebhookWrongSecret(t *testing.T) {
	payload := []byte(`{"x":1}`)
	sig := Sign(payload, "secret-certo", 1700000000)
	if err := VerifyWebhook(payload, sig, "secret-errado", 0); err == nil {
		t.Fatal("segredo errado deveria falhar")
	}
}

func TestVerifyWebhookTamperedPayload(t *testing.T) {
	secret := "whsec"
	sig := Sign([]byte(`{"amount":100}`), secret, 1700000000)
	if err := VerifyWebhook([]byte(`{"amount":999}`), sig, secret, 0); err == nil {
		t.Fatal("payload adulterado deveria falhar")
	}
}

func TestVerifyWebhookNoSecret(t *testing.T) {
	if err := VerifyWebhook([]byte(`{}`), "t=1,v1=ab", "", 0); err == nil {
		t.Fatal("sem segredo configurado deveria falhar")
	}
}

func TestVerifyWebhookMalformed(t *testing.T) {
	if err := VerifyWebhook([]byte(`{}`), "lixo", "whsec", 0); err == nil {
		t.Fatal("header malformado deveria falhar")
	}
}
