package pptxcompiler

import (
	"fmt"
	"strings"
	"testing"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatepublish"
)

// deckEntries builds a template package with slideCount distinct slides, each
// carrying a marker so a clone can be traced back to its source.
func deckEntries(slideCount int) map[string]string {
	slideIDs := &strings.Builder{}
	slideRels := &strings.Builder{}
	overrides := &strings.Builder{}
	entries := map[string]string{
		rootRelsPart: `<?xml version="1.0"?><Relationships xmlns="` + packageRelationshipsNS +
			`"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
	}
	for index := 1; index <= slideCount; index++ {
		fmt.Fprintf(slideIDs, `<p:sldId id="%d" r:id="rId%d"/>`, 255+index, index)
		fmt.Fprintf(slideRels, `<Relationship Id="rId%d" Type="%s" Target="slides/slide%d.xml"/>`, index, slideRelationshipType, index)
		fmt.Fprintf(overrides, `<Override PartName="/ppt/slides/slide%d.xml" ContentType="%s"/>`, index, slideContentType)
		entries[fmt.Sprintf("ppt/slides/slide%d.xml", index)] =
			fmt.Sprintf(`<?xml version="1.0"?><p:sld xmlns:p="%s"><p:cSld><p:spTree><marker>source-%d</marker></p:spTree></p:cSld></p:sld>`,
				presentationNamespace, index)
		entries[fmt.Sprintf("ppt/slides/_rels/slide%d.xml.rels", index)] =
			`<?xml version="1.0"?><Relationships xmlns="` + packageRelationshipsNS +
				`"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`
	}
	// A non-slide relationship that must survive the rebuild.
	fmt.Fprintf(slideRels, `<Relationship Id="rId%d" Type="%s" Target="slideMasters/slideMaster1.xml"/>`,
		slideCount+1, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster")

	entries[presentationPart] = `<?xml version="1.0"?><p:presentation xmlns:p="` + presentationNamespace +
		`" xmlns:r="` + relationshipNamespace + `"><p:sldMasterIdLst/><p:sldIdLst>` + slideIDs.String() +
		`</p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`
	entries[presentationRelsPart] = `<?xml version="1.0"?><Relationships xmlns="` + packageRelationshipsNS + `">` + slideRels.String() + `</Relationships>`
	entries[contentTypesPart] = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
		`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
		`<Default Extension="xml" ContentType="application/xml"/>` +
		`<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
		overrides.String() + `</Types>`
	return entries
}

func assignmentsFrom(sources ...int) []Assignment {
	assignments := make([]Assignment, 0, len(sources))
	for index, source := range sources {
		assignments = append(assignments, Assignment{
			Position: index + 1,
			Archetype: templatepublish.Archetype{
				ID:       fmt.Sprintf("archetype-%d", source),
				PartName: fmt.Sprintf("ppt/slides/slide%d.xml", source),
			},
		})
	}
	return assignments
}

func TestCloneDeckProducesOneSlidePerAssignment(t *testing.T) {
	// Source slide 2 is used twice and slide 3 not at all, which is the case a
	// simple in-place edit could not handle.
	compiled, err := CloneDeck(zipEntries(t, deckEntries(3)), assignmentsFrom(1, 2, 2))
	if err != nil {
		t.Fatal(err)
	}
	result, err := openPackage(compiled)
	if err != nil {
		t.Fatal(err)
	}

	for _, name := range []string{"ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/slides/slide3.xml"} {
		if _, present := result.part(name); !present {
			t.Fatalf("compiled deck is missing %s", name)
		}
	}
	if _, present := result.part("ppt/slides/slide4.xml"); present {
		t.Fatal("compiled deck holds more slides than were assigned")
	}

	want := []string{"source-1", "source-2", "source-2"}
	for index, marker := range want {
		name := fmt.Sprintf("ppt/slides/slide%d.xml", index+1)
		body, _ := result.part(name)
		if !strings.Contains(string(body), marker) {
			t.Fatalf("%s does not come from %s: %s", name, marker, body)
		}
	}
}

func TestCloneDeckDropsUnusedSourceSlides(t *testing.T) {
	compiled, err := CloneDeck(zipEntries(t, deckEntries(4)), assignmentsFrom(1, 2))
	if err != nil {
		t.Fatal(err)
	}
	result, err := openPackage(compiled)
	if err != nil {
		t.Fatal(err)
	}
	types, err := parseContentTypes(mustPartBytes(t, result, contentTypesPart))
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"ppt/slides/slide3.xml", "ppt/slides/slide4.xml"} {
		if _, present := result.part(name); present {
			t.Fatalf("unused source slide %s survived", name)
		}
		if _, present := result.part(relsPartFor(name)); present {
			t.Fatalf("unused source slide relationships for %s survived", name)
		}
		if _, declared := types.overrideFor(name); declared {
			t.Fatalf("content types still declare the removed part %s", name)
		}
	}
}

func TestCloneDeckKeepsSlideRelationshipsAndNonSlideRelationships(t *testing.T) {
	compiled, err := CloneDeck(zipEntries(t, deckEntries(2)), assignmentsFrom(2, 1))
	if err != nil {
		t.Fatal(err)
	}
	result, err := openPackage(compiled)
	if err != nil {
		t.Fatal(err)
	}

	// Each clone keeps its layout relationship, which is what makes it render
	// like the slide it came from.
	for index := 1; index <= 2; index++ {
		rels := mustPartBytes(t, result, relsPartFor(fmt.Sprintf("ppt/slides/slide%d.xml", index)))
		if !strings.Contains(string(rels), "slideLayout1.xml") {
			t.Fatalf("slide %d lost its layout relationship", index)
		}
	}

	items, err := parseRelationships(mustPartBytes(t, result, presentationRelsPart))
	if err != nil {
		t.Fatal(err)
	}
	slides, masters := 0, 0
	seen := map[string]bool{}
	for _, item := range items {
		if seen[item.ID] {
			t.Fatalf("relationship ID %s is used twice", item.ID)
		}
		seen[item.ID] = true
		switch {
		case item.Type == slideRelationshipType:
			slides++
		case strings.HasSuffix(item.Type, "/slideMaster"):
			masters++
		}
	}
	if slides != 2 {
		t.Fatalf("presentation declares %d slide relationships, want 2", slides)
	}
	if masters != 1 {
		t.Fatal("the slide master relationship was dropped")
	}
}

func TestCloneDeckRewritesTheSlideListInOrder(t *testing.T) {
	compiled, err := CloneDeck(zipEntries(t, deckEntries(3)), assignmentsFrom(3, 1, 2, 1))
	if err != nil {
		t.Fatal(err)
	}
	result, err := openPackage(compiled)
	if err != nil {
		t.Fatal(err)
	}
	presentation := string(mustPartBytes(t, result, presentationPart))

	items, err := parseRelationships(mustPartBytes(t, result, presentationRelsPart))
	if err != nil {
		t.Fatal(err)
	}
	target := map[string]string{}
	for _, item := range items {
		target[item.ID] = item.Target
	}

	order := slideOrder(t, presentation)
	if len(order) != 4 {
		t.Fatalf("slide list holds %d entries, want 4", len(order))
	}
	for index, id := range order {
		want := fmt.Sprintf("slides/slide%d.xml", index+1)
		if target[id] != want {
			t.Fatalf("slide list position %d points at %q, want %q", index+1, target[id], want)
		}
	}
	// Attributes outside the slide list must survive untouched.
	if !strings.Contains(presentation, `<p:sldSz cx="9144000" cy="5143500"/>`) {
		t.Fatal("rewriting the slide list disturbed the rest of the presentation part")
	}
}

func TestCloneDeckRejectsAnArchetypeWithNoSourceSlide(t *testing.T) {
	assignments := assignmentsFrom(1)
	assignments[0].Archetype.PartName = "ppt/slides/slide9.xml"
	_, err := CloneDeck(zipEntries(t, deckEntries(2)), assignments)
	if err == nil {
		t.Fatal("an archetype naming a missing slide was accepted")
	}
	if !strings.Contains(err.Error(), "slide9.xml") {
		t.Fatalf("error = %v, want it to name the missing part", err)
	}
}

func TestCloneDeckIsReproducible(t *testing.T) {
	template := zipEntries(t, deckEntries(3))
	first, err := CloneDeck(template, assignmentsFrom(1, 2, 2))
	if err != nil {
		t.Fatal(err)
	}
	second, err := CloneDeck(template, assignmentsFrom(1, 2, 2))
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != string(second) {
		t.Fatal("compiling the same deck twice produced different bytes")
	}
}

func mustPartBytes(t *testing.T, source *pkg, name string) []byte {
	t.Helper()
	body, present := source.part(name)
	if !present {
		t.Fatalf("package is missing %s", name)
	}
	return body
}

// slideOrder returns the relationship IDs in the slide list, in document order.
func slideOrder(t *testing.T, presentation string) []string {
	t.Helper()
	start := strings.Index(presentation, "<p:sldIdLst>")
	end := strings.Index(presentation, "</p:sldIdLst>")
	if start < 0 || end < 0 {
		t.Fatalf("presentation has no slide list: %s", presentation)
	}
	var ids []string
	for _, chunk := range strings.Split(presentation[start:end], `r:id="`)[1:] {
		ids = append(ids, chunk[:strings.Index(chunk, `"`)])
	}
	return ids
}
