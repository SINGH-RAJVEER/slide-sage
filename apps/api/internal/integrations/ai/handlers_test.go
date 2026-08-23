package ai

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestGenerationStateRespectsProviderSwitches(t *testing.T) {
	selection := &Selection{OpenAI, "gpt-5"}
	valid := map[Provider]bool{OpenAI: true}
	enabled := map[Provider]bool{OpenAI: true}
	generation, body := generationState(valid, enabled, selection, selection)
	if generation["mode"] != "byok" || generation["billing"] != "provider" || generation["model"] != "gpt-5" {
		t.Fatalf("enabled generation = %#v", generation)
	}
	want := map[string]string{"provider": "openai", "model": "gpt-5"}
	if !reflect.DeepEqual(body, want) {
		t.Fatalf("selection body = %#v", body)
	}

	generation, body = generationState(valid, map[Provider]bool{}, selection, selection)
	if generation["mode"] != "openrouter" || generation["billing"] != "points" || generation["model"] != nil {
		t.Fatalf("disabled generation = %#v", generation)
	}
	if !reflect.DeepEqual(body, want) {
		t.Fatalf("preserved selection = %#v", body)
	}
}

func TestConnectionEnabledEndpointRejectsInvalidRequests(t *testing.T) {
	router := aiRouter{identity: func(*http.Request) (string, error) { return "user-1", nil }}

	request := httptest.NewRequest(http.MethodPut, "/ai/connections/openai/enabled", strings.NewReader(`{"enabled":"yes"}`))
	request.SetPathValue("provider", "openai")
	recorder := httptest.NewRecorder()
	router.connectionEnabled(recorder, request)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("typed body status = %d", recorder.Code)
	}

	request = httptest.NewRequest(http.MethodPut, "/ai/connections/openai/enabled", strings.NewReader(`{"enabled":true}`))
	request.SetPathValue("provider", "unknown")
	recorder = httptest.NewRecorder()
	router.connectionEnabled(recorder, request)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("unknown provider status = %d", recorder.Code)
	}
}
