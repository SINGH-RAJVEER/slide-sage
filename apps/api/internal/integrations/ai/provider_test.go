package ai

import (
	"encoding/json"
	"testing"
)

func TestSelectionUsesTransportFieldNames(t *testing.T) {
	encoded, err := json.Marshal(Selection{Provider: OpenAI, Model: "gpt-5"})
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"provider":"openai","model":"gpt-5"}` {
		t.Fatalf("selection JSON: %s", encoded)
	}
}

func TestUniqueModelsIncludesProviderInIdentity(t *testing.T) {
	models := uniqueModels([]ModelDescriptor{{Provider: OpenAI, Model: "shared"}, {Provider: Google, Model: "shared"}})
	if len(models) != 2 {
		t.Fatalf("got %d models", len(models))
	}
}
