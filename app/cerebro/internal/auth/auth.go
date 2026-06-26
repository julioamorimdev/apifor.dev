// Package auth — JWT (access curto) p/ a GUI e validação do enrollment token (M1).
package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type Claims struct {
	OrgID string `json:"org"`
	jwt.RegisteredClaims
}

type Auth struct{ secret []byte }

func New(secret string) *Auth { return &Auth{secret: []byte(secret)} }

func (a *Auth) Issue(userID, orgID string, ttl time.Duration) (string, error) {
	c := Claims{
		OrgID: orgID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(a.secret)
}

func (a *Auth) Parse(token string) (*Claims, error) {
	c := &Claims{}
	t, err := jwt.ParseWithClaims(token, c, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("alg inválido")
		}
		return a.secret, nil
	})
	if err != nil || !t.Valid {
		return nil, errors.New("token inválido")
	}
	return c, nil
}

func CheckPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
