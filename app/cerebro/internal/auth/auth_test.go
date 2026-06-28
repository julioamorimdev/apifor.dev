package auth

import (
	"testing"
	"time"
)

func TestIssueParseRoundTrip(t *testing.T) {
	a := New("segredo-de-teste-bem-grande-1234")
	tok, err := a.Issue("usr_1", "org_1", "admin", time.Hour)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	c, err := a.Parse(tok)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if c.Subject != "usr_1" || c.OrgID != "org_1" || c.Role != "admin" {
		t.Fatalf("claims errados: sub=%q org=%q role=%q", c.Subject, c.OrgID, c.Role)
	}
}

func TestParseWrongSecretRejected(t *testing.T) {
	tok, _ := New("secret-A-aaaaaaaaaaaaaaaaaaaaaa").Issue("u", "o", "owner", time.Hour)
	if _, err := New("secret-B-bbbbbbbbbbbbbbbbbbbbbb").Parse(tok); err == nil {
		t.Fatal("token assinado com outro segredo deveria ser rejeitado")
	}
}

func TestParseExpiredRejected(t *testing.T) {
	a := New("segredo-de-teste-bem-grande-1234")
	tok, _ := a.Issue("u", "o", "member", -time.Minute) // já expirado
	if _, err := a.Parse(tok); err == nil {
		t.Fatal("token expirado deveria ser rejeitado")
	}
}

func TestParseGarbageRejected(t *testing.T) {
	if _, err := New("x").Parse("não.é.um.jwt"); err == nil {
		t.Fatal("lixo deveria ser rejeitado")
	}
}

func TestHashCheckPassword(t *testing.T) {
	h, err := HashPassword("s3nha-correta")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !CheckPassword(h, "s3nha-correta") {
		t.Fatal("senha correta deveria validar")
	}
	if CheckPassword(h, "senha-errada") {
		t.Fatal("senha errada não deveria validar")
	}
}
