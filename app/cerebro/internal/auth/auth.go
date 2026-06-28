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
	Role  string `json:"role"` // permission_tier: owner|admin|member|billing|viewer
	jwt.RegisteredClaims
}

type Auth struct{ secret []byte }

func New(secret string) *Auth { return &Auth{secret: []byte(secret)} }

func (a *Auth) Issue(userID, orgID, role string, ttl time.Duration) (string, error) {
	c := Claims{
		OrgID: orgID,
		Role:  role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(a.secret)
}

func HashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	return string(b), err
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
