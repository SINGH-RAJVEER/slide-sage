package templatepublish

import (
	"archive/zip"
	"bytes"
	"errors"
	"strconv"
	"strings"
	"testing"
)

type part struct {
	name     string
	contents string
}

const rootRels = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`

const presentation = `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>
<p:sldSz cx="9144000" cy="5143500"/>
</p:presentation>`

const presentationRels = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`

func slide(shapes string) string {
	return `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<p:cSld><p:spTree>` + shapes + `</p:spTree></p:cSld></p:sld>`
}

func textShape(id int, name, placeholder string, paragraphs ...string) string {
	ph := ""
	if placeholder != "" {
		ph = `<p:ph type="` + placeholder + `"/>`
	}
	body := ""
	for _, paragraph := range paragraphs {
		body += `<a:p><a:r><a:t>` + paragraph + `</a:t></a:r></a:p>`
	}
	return `<p:sp><p:nvSpPr><p:cNvPr id="` + strconv.Itoa(id) + `" name="` + name + `"/>` +
		`<p:nvPr>` + ph + `</p:nvPr></p:nvSpPr><p:txBody>` + body + `</p:txBody></p:sp>`
}

func buildPackage(t *testing.T, extra ...part) []byte {
	t.Helper()
	parts := []part{
		{"[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="app/x"/><Override PartName="/ppt/commentAuthors.xml" ContentType="app/y"/></Types>`},
		{"_rels/.rels", rootRels},
		{"ppt/presentation.xml", presentation},
		{"ppt/_rels/presentation.xml.rels", presentationRels},
		{"ppt/slides/slide1.xml", slide(textShape(5, "Title", "ctrTitle", "A Deck") + textShape(6, "Sub", "subTitle", "Subtitle here"))},
		{"ppt/slides/slide2.xml", slide(textShape(7, "Heading", "title", "Section") + textShape(8, "Body", "body", "One", "Two", "Three"))},
	}
	parts = append(parts, extra...)

	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for _, item := range parts {
		entry, err := writer.Create(item.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write([]byte(item.contents)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func TestPrepareDerivesArchetypesAndDigest(t *testing.T) {
	result, err := Prepare(Input{TemplateID: "sample", Version: 1, Source: bytes.NewReader(buildPackage(t))})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.SHA256) != 64 {
		t.Fatalf("sha256 = %q", result.SHA256)
	}
	if result.ObjectPath != "pptx-templates/sample/1/"+result.SHA256+"/template.pptx" {
		t.Fatalf("object path = %s", result.ObjectPath)
	}
	manifest := result.Manifest
	if manifest.WidthEMU != 9144000 || manifest.HeightEMU != 5143500 {
		t.Fatalf("dimensions = %d x %d", manifest.WidthEMU, manifest.HeightEMU)
	}
	if len(manifest.Archetypes) != 2 {
		t.Fatalf("archetypes = %d", len(manifest.Archetypes))
	}
	if manifest.Archetypes[0].Role != RoleCover {
		t.Fatalf("first role = %s", manifest.Archetypes[0].Role)
	}
	if manifest.Archetypes[0].PartName != "ppt/slides/slide1.xml" {
		t.Fatalf("part name = %s", manifest.Archetypes[0].PartName)
	}

	cover := manifest.Archetypes[0]
	if len(cover.Slots) != 2 {
		t.Fatalf("cover slots = %d", len(cover.Slots))
	}
	if cover.Slots[0].ShapeID != 5 || !cover.Slots[0].Required {
		t.Fatalf("title slot = %#v", cover.Slots[0])
	}
	if cover.Slots[0].SampleText != "A Deck" {
		t.Fatalf("sample = %q", cover.Slots[0].SampleText)
	}
	if cover.Slots[0].MaxCharacters <= len("A Deck") {
		t.Fatalf("limit %d does not exceed the sample", cover.Slots[0].MaxCharacters)
	}
}

func TestPrepareTreatsMultipleParagraphsAsAList(t *testing.T) {
	result, err := Prepare(Input{TemplateID: "sample", Version: 1, Source: bytes.NewReader(buildPackage(t))})
	if err != nil {
		t.Fatal(err)
	}
	body := result.Manifest.Archetypes[1].Slots[1]
	if body.Kind != SlotList || body.MaxListItems != 3 {
		t.Fatalf("body slot = %#v", body)
	}
}

func TestSanitizeRemovesCommentAuthorsAndItsContentType(t *testing.T) {
	source := buildPackage(t, part{"ppt/commentAuthors.xml", `<authors/>`})
	sanitized, err := Sanitize(source)
	if err != nil {
		t.Fatal(err)
	}
	reader, err := zip.NewReader(bytes.NewReader(sanitized), int64(len(sanitized)))
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range reader.File {
		if file.Name == "ppt/commentAuthors.xml" {
			t.Fatal("comment authors survived sanitization")
		}
	}
	pack, err := openPackage(reader)
	if err != nil {
		t.Fatal(err)
	}
	types, err := pack.read("[Content_Types].xml")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(types), "commentAuthors") {
		t.Fatal("content type override for a removed part survived")
	}
}

func TestSanitizeRejectsMacrosAndExternalTargets(t *testing.T) {
	macro := buildPackage(t, part{"ppt/vbaProject.bin", "MZ"})
	if _, err := Sanitize(macro); !errors.Is(err, ErrMacroEnabled) {
		t.Fatalf("macro error = %v", err)
	}

	external := buildPackage(t, part{"ppt/slides/_rels/slide1.xml.rels", `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="http://example.com/x" TargetMode="External"/>
</Relationships>`})
	if _, err := Sanitize(external); !errors.Is(err, ErrExternalTarget) {
		t.Fatalf("external error = %v", err)
	}
}

func TestSanitizeAllowsHyperlinksAndIsReproducible(t *testing.T) {
	source := buildPackage(t, part{"ppt/slides/_rels/slide1.xml.rels", `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
</Relationships>`})
	first, err := Sanitize(source)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Sanitize(source)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("sanitization is not reproducible")
	}
}

func TestPrepareRejectsOversizedPackages(t *testing.T) {
	_, err := Prepare(Input{TemplateID: "sample", Version: 1, Source: bytes.NewReader(buildPackage(t)), MaxBytes: 16})
	if !errors.Is(err, ErrPackageTooLarge) {
		t.Fatalf("error = %v", err)
	}
}

func TestSupportedCountsNeedCoverAndRepeatableContent(t *testing.T) {
	manifest := Manifest{Archetypes: []Archetype{
		{Role: RoleCover},
		{Role: RoleContent, Repeatable: true},
		{Role: RoleClosing},
	}}
	counts := manifest.SupportedCounts(5, 7)
	if len(counts) != 3 || counts[0] != 5 {
		t.Fatalf("counts = %v", counts)
	}

	coverOnly := Manifest{Archetypes: []Archetype{{Role: RoleCover}}}
	if got := coverOnly.SupportedCounts(5, 7); got != nil {
		t.Fatalf("counts without repeatable content = %v", got)
	}
}
