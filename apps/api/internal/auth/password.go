package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"strconv"
	"strings"

	"golang.org/x/crypto/scrypt"
	"golang.org/x/text/unicode/norm"
)

const passwordIterations = 210000

func isLegacySHA256(hash string) bool {
	if len(hash) != 64 {
		return false
	}
	_, err := hex.DecodeString(hash)
	return err == nil
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	saltText := hex.EncodeToString(salt)
	derived, err := scrypt.Key([]byte(norm.NFKC.String(password)), []byte(saltText), 16384, 16, 1, 64)
	if err != nil {
		return "", err
	}
	return saltText + ":" + hex.EncodeToString(derived), nil
}

func verifyPassword(hash, password string) bool {
	if isLegacySHA256(hash) {
		digest := sha256.Sum256([]byte(password))
		expected, err := hex.DecodeString(strings.ToLower(hash))
		return err == nil && subtle.ConstantTimeCompare(digest[:], expected) == 1
	}
	if parts := strings.Split(hash, ":"); len(parts) == 2 && len(parts[0]) == 32 && len(parts[1]) == 128 {
		expected, err := hex.DecodeString(parts[1])
		if err != nil {
			return false
		}
		actual, err := scrypt.Key([]byte(norm.NFKC.String(password)), []byte(parts[0]), 16384, 16, 1, 64)
		return err == nil && subtle.ConstantTimeCompare(actual, expected) == 1
	}
	parts := strings.Split(hash, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations < 100000 || iterations > 1000000 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil || len(salt) < 16 {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil || len(expected) != 32 {
		return false
	}
	actual := pbkdf2SHA256([]byte(password), salt, iterations, len(expected))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func needsPasswordUpgrade(hash string) bool {
	return isLegacySHA256(hash) || strings.HasPrefix(hash, "pbkdf2-sha256$")
}

func pbkdf2SHA256(password, salt []byte, iterations, length int) []byte {
	result := make([]byte, 0, length)
	for block := uint32(1); len(result) < length; block++ {
		mac := hmac.New(sha256.New, password)
		_, _ = mac.Write(salt)
		_, _ = mac.Write([]byte{byte(block >> 24), byte(block >> 16), byte(block >> 8), byte(block)})
		value := mac.Sum(nil)
		output := append([]byte(nil), value...)
		for index := 1; index < iterations; index++ {
			mac = hmac.New(sha256.New, password)
			_, _ = mac.Write(value)
			value = mac.Sum(nil)
			for offset := range output {
				output[offset] ^= value[offset]
			}
		}
		result = append(result, output...)
	}
	return result[:length]
}
