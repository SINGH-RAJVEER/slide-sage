package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"sync/atomic"
	"testing"
	"time"
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

func TestProviderCatalogDiscoveryRunsAtMostThreeRequestsAtOnce(t *testing.T) {
	t.Setenv("BYOK_ENCRYPTION_KEY_CURRENT_VERSION", "1")
	t.Setenv("BYOK_ENCRYPTION_KEY_V1", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	providers := []Provider{OpenAI, Google, Anthropic, OpenAI, Google}
	connections := make([]Connection, 0, len(providers))
	for _, provider := range providers {
		credential, err := EncryptAPIKey("user-1", provider, "provider-key")
		if err != nil {
			t.Fatal(err)
		}
		connections = append(connections, Connection{
			Provider:             string(provider),
			EncryptedAPIKey:      credential.EncryptedAPIKey,
			EncryptionIV:         credential.EncryptionIV,
			EncryptionKeyVersion: credential.EncryptionKeyVersion,
			KeyLastFour:          credential.KeyLastFour,
			Status:               "valid",
		})
	}
	started := make(chan struct{}, len(connections))
	release := make(chan struct{})
	var active atomic.Int32
	var maximum atomic.Int32
	router := aiRouter{validateProvider: func(_ context.Context, provider Provider, _ string) ([]ModelDescriptor, error) {
		current := active.Add(1)
		for {
			observed := maximum.Load()
			if current <= observed || maximum.CompareAndSwap(observed, current) {
				break
			}
		}
		started <- struct{}{}
		<-release
		active.Add(-1)
		return []ModelDescriptor{{Provider: provider, Model: "model"}}, nil
	}}
	done := make(chan []providerCatalogResult, 1)
	go func() {
		done <- router.discoverProviderCatalogs(context.Background(), "user-1", connections)
	}()

	for range 3 {
		select {
		case <-started:
		case <-time.After(time.Second):
			t.Fatal("provider discovery did not start")
		}
	}
	select {
	case <-started:
		t.Fatal("more than three provider requests started before capacity was released")
	case <-time.After(25 * time.Millisecond):
	}
	close(release)
	results := <-done
	if len(results) != len(connections) {
		t.Fatalf("catalog results = %d", len(results))
	}
	if maximum.Load() != 3 {
		t.Fatalf("maximum provider concurrency = %d", maximum.Load())
	}
}
