// Package ai contains BYOK credential storage and provider validation integrations.
package ai

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
)

type Provider string

const (
	OpenAI    Provider = "openai"
	Google    Provider = "google"
	Anthropic Provider = "anthropic"
)

type EncryptedCredential struct {
	EncryptedAPIKey, EncryptionIV string
	EncryptionKeyVersion          int
	KeyLastFour                   string
}

func EncryptAPIKey(userID string, provider Provider, apiKey string) (EncryptedCredential, error) {
	version, key, err := configuredKey(0)
	if err != nil {
		return EncryptedCredential{}, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return EncryptedCredential{}, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return EncryptedCredential{}, err
	}
	iv := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(iv); err != nil {
		return EncryptedCredential{}, err
	}
	ciphertext := gcm.Seal(nil, iv, []byte(apiKey), additionalData(userID, provider, version))
	lastFour := apiKey
	if len(lastFour) > 4 {
		lastFour = lastFour[len(lastFour)-4:]
	}
	return EncryptedCredential{base64.StdEncoding.EncodeToString(ciphertext), base64.StdEncoding.EncodeToString(iv), version, lastFour}, nil
}

func DecryptAPIKey(userID string, provider Provider, credential EncryptedCredential) (string, error) {
	_, key, err := configuredKey(credential.EncryptionKeyVersion)
	if err != nil {
		return "", err
	}
	iv, err := base64.StdEncoding.DecodeString(credential.EncryptionIV)
	if err != nil {
		return "", fmt.Errorf("decode credential IV: %w", err)
	}
	ciphertext, err := base64.StdEncoding.DecodeString(credential.EncryptedAPIKey)
	if err != nil {
		return "", fmt.Errorf("decode credential ciphertext: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(iv) != gcm.NonceSize() {
		return "", errors.New("invalid credential IV length")
	}
	plaintext, err := gcm.Open(nil, iv, ciphertext, additionalData(userID, provider, credential.EncryptionKeyVersion))
	if err != nil {
		return "", errors.New("credential decryption failed")
	}
	return string(plaintext), nil
}

func configuredKey(requestedVersion int) (int, []byte, error) {
	version := requestedVersion
	if version == 0 {
		var err error
		version, err = strconv.Atoi(envOr("BYOK_ENCRYPTION_KEY_CURRENT_VERSION", "1"))
		if err != nil || version < 1 {
			return 0, nil, errors.New("invalid BYOK encryption version")
		}
	}
	raw, err := base64.StdEncoding.DecodeString(os.Getenv("BYOK_ENCRYPTION_KEY_V" + strconv.Itoa(version)))
	if err != nil || len(raw) != 32 {
		return 0, nil, errors.New("BYOK encryption keys must contain exactly 32 base64-encoded bytes")
	}
	return version, raw, nil
}

func additionalData(userID string, provider Provider, version int) []byte {
	return []byte(fmt.Sprintf("slidesage-byok:%s:%s:v%d", userID, provider, version))
}
func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
