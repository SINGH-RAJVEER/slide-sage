package presentation

import (
	"encoding/json"
	"testing"
)

func TestNormalizeDocumentProducesRenderableSchema(t *testing.T) {
	input := map[string]any{
		"schemaVersion": json.Number("1"),
		"title":         " Example ",
		"theme":         "unknown",
		"slides": []any{
			map[string]any{"id": "duplicate", "title": "Opening", "content": "A concise opening"},
			map[string]any{"id": "duplicate", "title": "Details", "bullets": []any{"One", "Two"}},
		},
	}
	document, err := NormalizeDocument(input)
	if err != nil {
		t.Fatal(err)
	}
	if document["schemaVersion"] != PresentationSchemaVersion {
		t.Fatalf("schema: %#v", document["schemaVersion"])
	}
	if document["theme"] != "corporate-blue" {
		t.Fatalf("theme: %#v", document["theme"])
	}
	slides := document["slides"].([]any)
	if len(slides) != 2 {
		t.Fatalf("slides: %d", len(slides))
	}
	first := slides[0].(map[string]any)
	second := slides[1].(map[string]any)
	if first["type"] != "content" || first["layout"] != "cover" {
		t.Fatalf("first slide: %#v", first)
	}
	if first["id"] == second["id"] {
		t.Fatal("duplicate slide IDs were retained")
	}
	if len(first["blocks"].([]any)) == 0 {
		t.Fatal("slide has no renderable blocks")
	}
}

func TestParseResearchPayloadRejectsUnsafeURL(t *testing.T) {
	_, err := ParseResearchPayload(map[string]any{"sources": []any{map[string]any{"url": "javascript:alert(1)"}}})
	if err == nil {
		t.Fatal("unsafe URL accepted")
	}
}

func TestNormalizeDocumentPreservesSceneDocuments(t *testing.T) {
	document, err := NormalizeDocument(map[string]any{"slides": []any{map[string]any{"id": "scene-1", "type": "scene", "root": map[string]any{"id": "root", "type": "group", "layout": "stack", "children": []any{}}}}})
	if err != nil {
		t.Fatal(err)
	}
	if document["schemaVersion"] != 6 || document["engineVersion"] != "1.0.0" {
		t.Fatalf("document: %#v", document)
	}
	slide := document["slides"].([]any)[0].(map[string]any)
	if slide["type"] != "scene" {
		t.Fatalf("slide: %#v", slide)
	}
}

func TestNormalizeDocumentPreservesProviderBlockAliases(t *testing.T) {
	document, err := NormalizeDocument(map[string]any{
		"slides": []any{map[string]any{
			"title": "Provider content",
			"content": map[string]any{"blocks": []any{
				map[string]any{"type": "text", "content": "A generated paragraph"},
				map[string]any{"type": "bullets", "points": []any{"First", "Second"}},
			}},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	blocks := document["slides"].([]any)[0].(map[string]any)["blocks"].([]any)
	if len(blocks) != 2 {
		t.Fatalf("blocks: %#v", blocks)
	}
	paragraph := blocks[0].(map[string]any)
	if paragraph["type"] != "paragraph" || paragraph["text"] != "A generated paragraph" {
		t.Fatalf("paragraph: %#v", paragraph)
	}
	bullets := blocks[1].(map[string]any)
	if len(bullets["items"].([]any)) != 2 {
		t.Fatalf("bullets: %#v", bullets)
	}
}

func TestParseMutationsValidatesThemeAndDimensions(t *testing.T) {
	body := []byte(`{"mutations":[{"type":"update-presentation","theme":"corporate-blue","dimensions":{"width":99999,"height":1}}]}`)
	mutations, err := ParseMutations(body)
	if err != nil {
		t.Fatal(err)
	}
	if mutations[0].Dimensions["width"] != 4096 || mutations[0].Dimensions["height"] != 240 {
		t.Fatalf("dimensions: %#v", mutations[0].Dimensions)
	}
}
