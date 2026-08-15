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

func TestNormalizeDocumentPreservesSupportVisualsAndBackgrounds(t *testing.T) {
	document, err := NormalizeDocument(map[string]any{
		"slides": []any{map[string]any{
			"title": "Visual slide",
			"backgroundImage": map[string]any{
				"url": "https://images.example.com/background.jpg", "alt": "Background", "focalPoint": "top", "overlay": "strong",
			},
			"blocks": []any{
				map[string]any{"type": "image-placeholder", "region": "media", "alt": "Detailed support visual", "caption": "Direction", "focalPoint": "right"},
				map[string]any{"type": "image", "region": "media", "url": "https://images.example.com/image.jpg", "alt": "Resolved visual", "caption": "", "focalPoint": "left"},
			},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	slide := document["slides"].([]any)[0].(map[string]any)
	background := slide["backgroundImage"].(map[string]any)
	if background["focalPoint"] != "top" || background["overlay"] != "strong" {
		t.Fatalf("background: %#v", background)
	}
	blocks := slide["blocks"].([]any)
	placeholder := blocks[0].(map[string]any)
	if placeholder["alt"] != "Detailed support visual" || placeholder["focalPoint"] != "right" {
		t.Fatalf("placeholder: %#v", placeholder)
	}
	image := blocks[1].(map[string]any)
	if image["type"] != "image" || image["focalPoint"] != "left" {
		t.Fatalf("image: %#v", image)
	}
}

func TestNormalizeDocumentBoundsContentObjectsToCanonicalGrid(t *testing.T) {
	document, err := NormalizeDocument(map[string]any{
		"slides": []any{map[string]any{
			"title":          "Movable content",
			"titleBounds":    map[string]any{"x": json.Number("1277"), "y": json.Number("-9"), "width": json.Number("205"), "height": json.Number("119")},
			"subtitleBounds": map[string]any{"x": "invalid", "y": json.Number("8"), "width": json.Number("80"), "height": json.Number("40")},
			"blocks": []any{map[string]any{
				"type": "paragraph", "region": "main", "text": "Move me",
				"bounds": map[string]any{"x": json.Number("101"), "y": json.Number("83"), "width": json.Number("203"), "height": json.Number("119")},
			}},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	slide := document["slides"].([]any)[0].(map[string]any)
	if _, ok := slide["subtitleBounds"]; ok {
		t.Fatal("malformed subtitle bounds were retained")
	}
	if slide["titleBounds"].(map[string]any)["x"] != float64(1072) {
		t.Fatalf("title bounds: %#v", slide["titleBounds"])
	}
	block := slide["blocks"].([]any)[0].(map[string]any)
	if block["bounds"].(map[string]any)["x"] != float64(104) || block["bounds"].(map[string]any)["height"] != float64(120) {
		t.Fatalf("block bounds: %#v", block["bounds"])
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

func TestNormalizeDeckPlanCompilesSemanticLayouts(t *testing.T) {
	plan, err := NormalizeDeckPlan(map[string]any{
		"title": "Grid storage", "audience": "Operators", "thesis": "Storage makes grids resilient", "style": "consultant",
		"slides": []any{
			map[string]any{"id": "opening", "purpose": "cover", "title": "Grid storage", "message": "A resilient grid needs flexible storage", "evidence": []any{}, "visualIntent": map[string]any{"kind": "image-hero", "imagePrompt": "Grid battery", "focalPoint": "center"}},
			map[string]any{"id": "tradeoffs", "purpose": "comparison", "title": "Storage tradeoffs", "message": "Duration and response time drive selection", "evidence": []any{"IEA 2025"}, "visualIntent": map[string]any{"kind": "comparison", "left": map[string]any{"title": "Batteries", "items": []any{"Fast response"}}, "right": map[string]any{"title": "Pumped hydro", "items": []any{"Long duration"}}}},
		},
	}, 2)
	if err != nil {
		t.Fatal(err)
	}
	slides := plan["slides"].([]any)
	if slides[0].(map[string]any)["layout"] != "cover" || slides[1].(map[string]any)["layout"] != "comparison" {
		t.Fatalf("plan layouts: %#v", slides)
	}

	document, err := NormalizeDocument(map[string]any{
		"title": "Provider title", "slides": []any{
			map[string]any{"title": "Wrong title", "content": "Opening content"},
			map[string]any{"title": "Wrong comparison", "content": "Comparison content"},
		}, "deckPlan": plan,
	})
	if err != nil {
		t.Fatal(err)
	}
	compiled := document["slides"].([]any)
	if document["title"] != "Grid storage" {
		t.Fatalf("document title: %#v", document["title"])
	}
	if compiled[1].(map[string]any)["title"] != "Storage tradeoffs" || compiled[1].(map[string]any)["layout"] != "comparison" {
		t.Fatalf("compiled slide: %#v", compiled[1])
	}
	if _, ok := document["deckPlan"].(map[string]any); !ok {
		t.Fatal("normalized document does not retain deck plan")
	}
	openingBlocks := compiled[0].(map[string]any)["blocks"].([]any)
	background := openingBlocks[len(openingBlocks)-1].(map[string]any)
	if background["type"] != "image-placeholder" || background["alt"] != "Grid battery" || background["region"] != "media" {
		t.Fatalf("planned background: %#v", background)
	}
}

func TestNormalizeDeckPlanRejectsIncompleteSemanticData(t *testing.T) {
	_, err := NormalizeDeckPlan(map[string]any{
		"title": "Example", "style": "minimal", "slides": []any{
			map[string]any{"purpose": "insight", "title": "Insight", "message": "Message", "visualIntent": map[string]any{"kind": "chart", "chartType": "bar", "dataSeries": []any{}}},
		},
	}, 1)
	if err == nil {
		t.Fatal("plan with empty chart data was accepted")
	}
}
