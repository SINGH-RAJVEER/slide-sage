package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type JWTClaims struct {
	Email string `json:"email,omitempty"`
	jwt.RegisteredClaims
}

func (service *Service) GenerateJWT(userID, email string, ttl time.Duration) (string, error) {
	now := service.config.Now().UTC()
	claims := JWTClaims{
		Email: email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(service.config.AuthSecret))
}

func (service *Service) VerifyJWT(tokenString string) (string, error) {
	claims := &JWTClaims{}
	token, err := jwt.ParseWithClaims(
		tokenString,
		claims,
		func(token *jwt.Token) (any, error) {
			if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
				return nil, errors.New("unexpected signing method")
			}
			return []byte(service.config.AuthSecret), nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
	)
	if err != nil || !token.Valid {
		return "", errors.New("invalid token")
	}
	if claims.Subject == "" {
		return "", errors.New("token missing subject")
	}
	return claims.Subject, nil
}
