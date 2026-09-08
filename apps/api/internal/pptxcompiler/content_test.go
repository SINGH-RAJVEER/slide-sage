package pptxcompiler

import (
	"bytes"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatepublish"
	"strings"
	"testing"
)

func TestCompileWritesMappedShapesAndClearsSamples(t *testing.T) {
	entries := deckEntries(1)
	entries["ppt/slideMasters/slideMaster1.xml"] = `<p:sldMaster xmlns:p="` + presentationNamespace + `"/>`
	entries["ppt/slideLayouts/slideLayout1.xml"] = `<p:sldLayout xmlns:p="` + presentationNamespace + `"/>`
	entries["ppt/slides/slide1.xml"] = `<p:sld xmlns:p="` + presentationNamespace + `" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="2400" b="1"/><a:t>Sample</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3"/></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Clear me</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
	assignments := assignmentsFrom(1, 1)
	for i := range assignments {
		assignments[i].Archetype.Slots = []templatepublish.Slot{{ID: "title", ShapeID: 2, Kind: templatepublish.SlotText, Required: true, MaxCharacters: 40}, {ID: "optional", ShapeID: 3, Kind: templatepublish.SlotText, MaxCharacters: 40}}
	}
	content := []SlideContent{{Position: 1, Slots: map[string]any{"title": "A & B < C"}}, {Position: 2, Slots: map[string]any{"title": "Second"}}}
	source := zipEntries(t, entries)
	result, err := Compile(source, assignments, content)
	if err != nil {
		t.Fatal(err)
	}
	loaded, _ := openPackage(result)
	slide, _ := loaded.part("ppt/slides/slide1.xml")
	for _, want := range []string{"A &amp; B &lt; C", `sz="2400"`, `algn="ctr"`} {
		if !strings.Contains(string(slide), want) {
			t.Fatalf("missing %s: %s", want, slide)
		}
	}
	if strings.Contains(string(slide), "Sample") || strings.Contains(string(slide), "Clear me") {
		t.Fatal("sample copy survived")
	}
	again, err := Compile(source, assignments, content)
	if err != nil || !bytes.Equal(result, again) {
		t.Fatal("compilation is not reproducible", err)
	}
	content[1].Slots["title"] = strings.Repeat("x", 41)
	if _, err := Compile(source, assignments, content); err == nil {
		t.Fatal("oversized slot accepted")
	}
	if _, err := Compile(source, assignments, content[:1]); err == nil {
		t.Fatal("short deck accepted")
	}
}

func TestValidateSlideRejectsSlidesWithNoText(t *testing.T) {
	a := assignmentsFrom(1, 1)[0]
	a.Archetype.Slots = []templatepublish.Slot{
		{ID: "title", ShapeID: 2, Kind: templatepublish.SlotText, MaxCharacters: 40},
		{ID: "points", ShapeID: 3, Kind: templatepublish.SlotList, MaxCharacters: 40, MaxListItems: 4},
	}
	for _, slots := range []map[string]any{nil, {}, {"title": "   "}, {"points": []any{"", " "}}} {
		if err := ValidateSlide(a, SlideContent{Position: 1, Slots: slots}); err == nil {
			t.Fatalf("empty slide accepted: %v", slots)
		}
	}
	if err := ValidateSlide(a, SlideContent{Position: 1, Slots: map[string]any{"points": []any{"One"}}}); err != nil {
		t.Fatal(err)
	}
}

func TestValidateSlideAllowsImageOnlySlides(t *testing.T) {
	a := assignmentsFrom(1, 1)[0]
	a.Archetype.Slots = []templatepublish.Slot{{ID: "art", ShapeID: 2, Kind: templatepublish.SlotImage}}
	if err := ValidateSlide(a, SlideContent{Position: 1, Slots: map[string]any{}}); err != nil {
		t.Fatal(err)
	}
}
