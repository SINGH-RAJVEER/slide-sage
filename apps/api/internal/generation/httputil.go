package generation

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
)

func writeError(writer http.ResponseWriter, status int, message string) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]any{"error": map[string]string{"message": message}})
}

func required(value any, field string) (string, error) {
	valueText, ok := value.(string)
	valueText = strings.TrimSpace(valueText)
	if !ok || len(valueText) == 0 || len(valueText) > 400 {
		return "", fmt.Errorf("%s must contain between 1 and 400 characters", field)
	}
	return valueText, nil
}

func parseResearch(value any) (any, error) {
	if value == nil {
		return nil, nil
	}
	options, err := presentation.ParseResearchOptions(value)
	if err != nil {
		return nil, err
	}
	if !options.Enabled {
		return nil, nil
	}
	return options, nil
}

func slideCount(body map[string]any, mandatory bool) (int, error) {
	value := body["slide_count"]
	if value == nil && !mandatory {
		return 0, nil
	}
	number, ok := value.(json.Number)
	parsed, err := number.Int64()
	if !ok || err != nil || parsed < 5 || parsed > 40 {
		return 0, errors.New("slide_count must be an integer between 5 and 40")
	}
	return int(parsed), nil
}

func text(value any, fallback string) string {
	result, ok := value.(string)
	result = strings.TrimSpace(result)
	if !ok || result == "" {
		return fallback
	}
	return result
}

func choice(value any, fallback string) string {
	if value == nil {
		return fallback
	}
	return text(value, "")
}

func validDetail(value string) bool {
	for _, candidate := range []string{"brief", "concise", "balanced", "detailed", "comprehensive"} {
		if value == candidate {
			return true
		}
	}
	return false
}

func validTonality(value string) bool {
	for _, candidate := range []string{"casual", "professional", "enthusiastic", "persuasive"} {
		if value == candidate {
			return true
		}
	}
	return false
}

func documentTheme(data []byte) string {
	var document map[string]any
	_ = json.Unmarshal(data, &document)
	return text(document["theme"], "corporate-blue")
}

func truncate(value string, maximum int) string {
	if len(value) > maximum {
		return value[:maximum]
	}
	return value
}

func uuid() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	bytes[6] = bytes[6]&0x0f | 0x40
	bytes[8] = bytes[8]&0x3f | 0x80
	encoded := hex.EncodeToString(bytes)
	return encoded[0:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:], nil
}
