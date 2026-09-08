package generation

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/integrations/ai"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/pptxcompiler"
)

// Exercise the provider response through the actual PPTX text revision writer.
func TestRevisePPTXChangesOnlyTheRequestedText(t *testing.T) {
	const p = "http://schemas.openxmlformats.org/presentationml/2006/main"
	const a = "http://schemas.openxmlformats.org/drawingml/2006/main"
	const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
	entries := map[string]string{
		"[Content_Types].xml":             `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
		"ppt/presentation.xml":            `<p:presentation xmlns:p="` + p + `" xmlns:r="` + r + `"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`,
		"ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="` + r + `/slide" Target="slides/slide1.xml"/></Relationships>`,
		"ppt/slides/slide1.xml":           `<p:sld xmlns:p="` + p + `" xmlns:a="` + a + `"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Original title</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Keep this body</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
	}
	var source bytes.Buffer
	archive := zip.NewWriter(&source)
	for name, data := range entries {
		file, err := archive.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := io.WriteString(file, data); err != nil {
			t.Fatal(err)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	calls := 0
	client := &http.Client{Transport: roundTripperFunc(func(request *http.Request) (*http.Response, error) {
		calls++
		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Fatal(err)
		}
		for _, expected := range []string{"Original title", "detailed", "casual", "Rewrite the title"} {
			if !bytes.Contains(body, []byte(expected)) {
				t.Errorf("provider request is missing %q", expected)
			}
		}
		content := `{"title":"Updated deck","operations":[{"position":1,"shapeId":2,"expectedText":"Original title","text":"Revised title"}]}`
		response, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": content}, "finish_reason": "stop"}}, "usage": map[string]int{"total_tokens": 42}})
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(response))}, nil
	})}
	h := &handler{client: client}
	job := streamJob{kind: "iteration", prompt: "Rewrite the title", slideCount: 1, detailLevel: "detailed", tonality: "casual", selection: &ai.Selection{Provider: ai.OpenAI, Model: "test-model"}, credential: "test-key"}
	output, title, tokens, err := h.revisePPTX(context.Background(), job, source.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if title != "Updated deck" || tokens != 42 || calls != 1 {
		t.Fatalf("unexpected revision result: title=%q tokens=%d calls=%d", title, tokens, calls)
	}
	index, err := pptxcompiler.Index(output)
	if err != nil {
		t.Fatal(err)
	}
	if len(index.Slides) != 1 {
		t.Fatal("slide count changed")
	}
	objects := index.Slides[0].Objects
	if len(objects) != 2 || strings.TrimSpace(objects[0].Text) != "Revised title" || strings.TrimSpace(objects[1].Text) != "Keep this body" {
		t.Fatalf("unexpected revised objects: %+v", objects)
	}
}
