package pptxcompiler

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
)

func templateEntries(slideCount int) map[string]string {
	entries := map[string]string{
		contentTypesPart: `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
		rootRelsPart:     `<?xml version="1.0"?><Relationships xmlns="` + packageRelationshipsNS + `"/>`,
		presentationPart: `<?xml version="1.0"?><p:presentation xmlns:p="` + presentationNamespace + `"/>`,
	}
	for index := 1; index <= slideCount; index++ {
		entries[fmt.Sprintf("ppt/slides/slide%d.xml", index)] =
			`<?xml version="1.0"?><p:sld xmlns:p="` + presentationNamespace + `"><p:cSld><p:spTree/></p:cSld></p:sld>`
	}
	return entries
}

func zipEntries(t *testing.T, entries map[string]string) []byte {
	t.Helper()
	var output bytes.Buffer
	archive := zip.NewWriter(&output)
	for name, contents := range entries {
		file, err := archive.Create(name)
		if err != nil {
			t.Fatalf("create ZIP entry %s: %v", name, err)
		}
		if _, err := io.WriteString(file, contents); err != nil {
			t.Fatalf("write ZIP entry %s: %v", name, err)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatalf("close test package: %v", err)
	}
	return output.Bytes()
}

func TestOpenPackageReadsEveryPart(t *testing.T) {
	opened, err := openPackage(zipEntries(t, templateEntries(2)))
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{contentTypesPart, presentationPart, "ppt/slides/slide1.xml", "ppt/slides/slide2.xml"} {
		if _, present := opened.part(name); !present {
			t.Fatalf("package is missing %s", name)
		}
	}
	if _, present := opened.part("ppt/slides/slide3.xml"); present {
		t.Fatal("package reported a part it does not hold")
	}
}

func TestOpenPackageRequiresTheStructuralParts(t *testing.T) {
	for _, missing := range []string{contentTypesPart, presentationPart} {
		t.Run(missing, func(t *testing.T) {
			entries := templateEntries(1)
			delete(entries, missing)
			_, err := openPackage(zipEntries(t, entries))
			if !errors.Is(err, ErrPartMissing) {
				t.Fatalf("openPackage() error = %v, want ErrPartMissing", err)
			}
			if !strings.Contains(err.Error(), missing) {
				t.Fatalf("error = %v, want it to name %s", err, missing)
			}
		})
	}
}

func TestOpenPackageRejectsUnsafePartNames(t *testing.T) {
	for _, name := range []string{"../escape.xml", "/absolute.xml", "ppt/../../escape.xml", `ppt\slides\slide1.xml`} {
		t.Run(name, func(t *testing.T) {
			entries := templateEntries(1)
			entries[name] = "<x/>"
			if _, err := openPackage(zipEntries(t, entries)); err == nil {
				t.Fatalf("unsafe part name %q was accepted", name)
			}
		})
	}
}

func TestOpenPackageRejectsMalformedArchives(t *testing.T) {
	if _, err := openPackage([]byte("not a zip archive")); err == nil {
		t.Fatal("a non-ZIP payload was accepted")
	}
}

func TestPackageRoundTripPreservesUntouchedParts(t *testing.T) {
	original := templateEntries(2)
	opened, err := openPackage(zipEntries(t, original))
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := opened.bytes()
	if err != nil {
		t.Fatal(err)
	}
	reopened, err := openPackage(encoded)
	if err != nil {
		t.Fatal(err)
	}
	for name, contents := range original {
		body, present := reopened.part(name)
		if !present {
			t.Fatalf("round trip dropped %s", name)
		}
		if string(body) != contents {
			t.Fatalf("round trip altered %s", name)
		}
	}
	if len(reopened.partNames()) != len(original) {
		t.Fatalf("round trip produced %d parts, want %d", len(reopened.partNames()), len(original))
	}
}

func TestPackageBytesAreReproducible(t *testing.T) {
	// Revisions are content-addressed, so compiling identical content twice has
	// to yield identical bytes or every rebuild would store a new object.
	source := zipEntries(t, templateEntries(3))

	first, err := compileOnce(source)
	if err != nil {
		t.Fatal(err)
	}
	second, err := compileOnce(source)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("compiling the same package twice produced different bytes")
	}
}

func compileOnce(source []byte) ([]byte, error) {
	opened, err := openPackage(source)
	if err != nil {
		return nil, err
	}
	opened.setPart("ppt/slides/slide4.xml", []byte("<p:sld/>"))
	return opened.bytes()
}

func TestSetPartReplacesWithoutDuplicating(t *testing.T) {
	opened, err := openPackage(zipEntries(t, templateEntries(1)))
	if err != nil {
		t.Fatal(err)
	}
	before := len(opened.partNames())
	opened.setPart(presentationPart, []byte("<p:presentation/>"))
	if len(opened.partNames()) != before {
		t.Fatalf("replacing a part changed the part count from %d to %d", before, len(opened.partNames()))
	}
	body, _ := opened.part(presentationPart)
	if string(body) != "<p:presentation/>" {
		t.Fatalf("part was not replaced: %s", body)
	}
}

func TestRemovePartDropsItFromTheArchive(t *testing.T) {
	opened, err := openPackage(zipEntries(t, templateEntries(2)))
	if err != nil {
		t.Fatal(err)
	}
	opened.removePart("ppt/slides/slide2.xml")
	if _, present := opened.part("ppt/slides/slide2.xml"); present {
		t.Fatal("removed part is still readable")
	}
	for _, name := range opened.partNames() {
		if name == "ppt/slides/slide2.xml" {
			t.Fatal("removed part is still listed")
		}
	}
	opened.removePart("ppt/slides/slide2.xml") // idempotent

	encoded, err := opened.bytes()
	if err != nil {
		t.Fatal(err)
	}
	reopened, err := openPackage(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if _, present := reopened.part("ppt/slides/slide2.xml"); present {
		t.Fatal("removed part survived serialisation")
	}
}

func TestMustPartNamesTheMissingPart(t *testing.T) {
	opened, err := openPackage(zipEntries(t, templateEntries(1)))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := opened.mustPart(presentationRelsPart); !errors.Is(err, ErrPartMissing) {
		t.Fatalf("mustPart() error = %v, want ErrPartMissing", err)
	}
}
