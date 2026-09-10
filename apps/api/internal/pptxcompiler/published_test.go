package pptxcompiler_test

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/pptxcompiler"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatemanifest"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatepublish"
)

type discardBlobs struct{}

func (discardBlobs) PutImmutable(context.Context, string, io.Reader, int64, string, string) error {
	return nil
}

// Opt in with local authoring packages; this validates real generated packages
// through the same validator and indexer used before revision commit.
func TestPublishedPackagesCompile(t *testing.T) {
	directory := os.Getenv("PPTX_TEMPLATE_TEST_DIR")
	if directory == "" {
		t.Skip("set PPTX_TEMPLATE_TEST_DIR to test published packages")
	}
	ids, err := templatemanifest.IDs()
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range ids {
		t.Run(id, func(t *testing.T) {
			manifest, err := templatemanifest.Lookup(id, 1)
			if err != nil {
				t.Fatal(err)
			}
			for count := 5; count <= 40; count++ {
				a, err := pptxcompiler.Assign(manifest, count)
				if err != nil {
					t.Fatal(err)
				}
				if err := pptxcompiler.ValidateAssignments(a); err != nil {
					t.Skipf("unsupported manifest: %v", err)
				}
			}
			raw, err := os.ReadFile(filepath.Join(directory, id+".pptx"))
			if err != nil {
				t.Fatal(err)
			}
			source, err := templatepublish.Prepare(templatepublish.Input{TemplateID: id, Version: 1, Source: bytes.NewReader(raw)})
			if err != nil {
				t.Fatal(err)
			}
			if source.SHA256 != manifest.SHA256 {
				t.Fatal("authoring package no longer matches published manifest")
			}
			for _, count := range []int{5, 40} {
				a, _ := pptxcompiler.Assign(manifest, count)
				content := make([]pptxcompiler.SlideContent, count)
				for i, assignment := range a {
					values := map[string]any{}
					for _, slot := range assignment.Archetype.Slots {
						switch slot.Kind {
						case templatepublish.SlotText:
							values[slot.ID] = "Test copy"
						case templatepublish.SlotList:
							values[slot.ID] = []string{"Test item"}
						}
					}
					content[i] = pptxcompiler.SlideContent{Position: i + 1, Slots: values}
				}
				compiled, err := pptxcompiler.Compile(source.Package, a, content)
				if err != nil {
					t.Fatal(err)
				}
				service := presentationrevision.NewService(nil, discardBlobs{}, 0)
				prepared, err := service.Prepare(context.Background(), presentationrevision.CommitInput{PresentationID: "fixture", AuthorID: "test", Operation: presentationrevision.SourceOperation{ID: "test", Kind: presentationrevision.SourceOperationGeneration}, ExpectedSlideCount: count, PPTX: bytes.NewReader(compiled), MIMEType: presentationrevision.PPTXContentType, TemplateID: id, TemplateVersion: 1, TemplateSHA256: manifest.SHA256, CompilerVersion: pptxcompiler.Version})
				if err != nil {
					t.Fatal(err)
				}
				if prepared.SlideCount != count {
					t.Fatal("count mismatch")
				}
				if id == "simple-business-proposal" && count == 5 {
					if output := os.Getenv("PPTX_SMOKE_OUTPUT"); output != "" {
						if err := os.WriteFile(output, compiled, 0600); err != nil {
							t.Fatal(err)
						}
					}
				}
			}
		})
	}
}
