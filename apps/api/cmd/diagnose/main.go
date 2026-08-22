// Command diagnose replays a Google provider planning request against the
// stored BYOK credential and dumps the raw response shape. Throwaway tool:
// delete after use. Never prints the API key.
package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/integrations/ai"
)

const planningSystemPrompt = `Return exactly one JSON object and no Markdown. Create a DeckPlan with title, audience, thesis, style, and slides. style must be minimal, visual, classic, or consultant. Return exactly the requested number of slides. Each slide requires id, purpose, title, message, evidence, and visualIntent. purpose must be cover, section, context, problem, insight, solution, evidence, comparison, process, recommendation, or closing. visualIntent must be one of these data-only shapes:
- {"kind":"none"}
- {"kind":"image-hero","imagePrompt":"Specific visual direction","focalPoint":"center"}
- {"kind":"timeline","events":[{"label":"2024","title":"Milestone","description":"What changed"},{"label":"2025","title":"Next milestone","description":"What changes next"}]}
- {"kind":"process","nodes":[{"label":"Step","description":"What happens"},{"label":"Next step","description":"What happens next"}]}
- {"kind":"comparison","left":{"title":"Option A","items":["Point"]},"right":{"title":"Option B","items":["Point"]}}
- {"kind":"metric-grid","metrics":[{"value":"42%","label":"Metric"},{"value":"3x","label":"Metric"}]}
- {"kind":"chart","chartType":"bar","dataSeries":[{"label":"Series","values":[1,2]}]}
Use visual intents only when they clarify the slide message. Evidence must contain short source references from the supplied research, never invented citations. Never return HTML, Markdown, CSS, code, coordinates, colors, URLs, styles, or class names.`

func main() {
	database, err := sql.Open("pgx", os.Getenv("DATABASE_URL"))
	if err != nil {
		fmt.Println("open db:", err)
		os.Exit(1)
	}
	defer database.Close()

	var userID, iv, ciphertext, lastFour string
	var version int
	err = database.QueryRow(`SELECT user_id, encryption_iv, encrypted_api_key, encryption_key_version, key_last_four FROM ai_provider_connections WHERE provider = 'google' ORDER BY updated_at DESC LIMIT 1`).Scan(&userID, &iv, &ciphertext, &version, &lastFour)
	if err != nil {
		fmt.Println("load connection:", err)
		os.Exit(1)
	}
	key, err := ai.DecryptAPIKey(userID, ai.Google, ai.EncryptedCredential{
		EncryptedAPIKey: ciphertext, EncryptionIV: iv, EncryptionKeyVersion: version, KeyLastFour: lastFour,
	})
	if err != nil {
		fmt.Println("decrypt credential:", err)
		os.Exit(1)
	}

	model := "gemini-2.5-flash"
	maxOutput := 1800
	system := planningSystemPrompt
	user := "Create a 5-slide balanced, professional presentation about: generation alpha slangs"

	payload := map[string]any{
		"systemInstruction": map[string]any{"parts": []map[string]string{{"text": system}}},
		"contents":          []map[string]any{{"role": "user", "parts": []map[string]string{{"text": user}}}},
		"generationConfig": map[string]any{
			"responseMimeType": "application/json",
			"maxOutputTokens":  maxOutput,
		},
	}
	run := func(label string, extra map[string]any) {
		for field, value := range extra {
			payload["generationConfig"].(map[string]any)[field] = value
		}
		encoded, _ := json.Marshal(payload)
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()
		req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
			"https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",
			bytes.NewReader(encoded))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-goog-api-key", key)
		started := time.Now()
		response, err := http.DefaultClient.Do(req)
		if err != nil {
			fmt.Println(label, "request error:", err)
			return
		}
		defer response.Body.Close()
		var body bytes.Buffer
		_, _ = body.ReadFrom(response.Body)
		var envelope struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
				FinishReason string `json:"finishReason"`
			} `json:"candidates"`
			PromptFeedback struct {
				BlockReason string `json:"blockReason"`
			} `json:"promptFeedback"`
			UsageMetadata struct {
				PromptTokenCount     int `json:"promptTokenCount"`
				CandidatesTokenCount int `json:"candidatesTokenCount"`
				ThoughtsTokenCount   int `json:"thoughtsTokenCount"`
				TotalTokenCount      int `json:"totalTokenCount"`
			} `json:"usageMetadata"`
		}
		_ = json.Unmarshal(body.Bytes(), &envelope)
		text := ""
		parts := 0
		if len(envelope.Candidates) > 0 {
			parts = len(envelope.Candidates[0].Content.Parts)
			if parts > 0 {
				text = envelope.Candidates[0].Content.Parts[0].Text
			}
		}
		fmt.Printf("[%s] status=%d finish=%q block=%q parts=%d textLen=%d usage={prompt:%d cand:%d thoughts:%d total:%d} took=%s\n",
			label, response.StatusCode, candidateFinish(envelope.Candidates), envelope.PromptFeedback.BlockReason,
			parts, len(text), envelope.UsageMetadata.PromptTokenCount, envelope.UsageMetadata.CandidatesTokenCount,
			envelope.UsageMetadata.ThoughtsTokenCount, envelope.UsageMetadata.TotalTokenCount, time.Since(started).Round(time.Millisecond))
		fmt.Printf("[%s] text head: %.200q\n", label, strings.TrimSpace(text))
	}

	run("as-shipped (maxOutputTokens=1800)", nil)
	run("thinkingBudget=0", map[string]any{"thinkingConfig": map[string]any{"thinkingBudget": 0}})
}

func candidateFinish(candidates []struct {
	FinishReason string `json:"finishReason"`
}) string {
	if len(candidates) == 0 {
		return "NO_CANDIDATES"
	}
	return candidates[0].FinishReason
}
