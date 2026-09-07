package templatemanifest

import (
	"errors"
	"testing"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatepublish"
)

func TestEveryEmbeddedManifestLoads(t *testing.T) {
	ids, err := IDs()
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) == 0 {
		t.Fatal("no manifests are embedded, so no template can be compiled")
	}
	for _, id := range ids {
		manifest, err := Lookup(id, 1)
		if err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		if manifest.TemplateID != id {
			t.Fatalf("%s loaded a manifest for %s", id, manifest.TemplateID)
		}
		if len(manifest.Archetypes) == 0 {
			t.Fatalf("%s has no archetypes", id)
		}
		for _, archetype := range manifest.Archetypes {
			if archetype.PartName == "" {
				t.Fatalf("%s archetype %s names no source part", id, archetype.ID)
			}
			// Slots are addressed by shape ID when the compiler writes into a
			// cloned slide, so an unset one would silently write nothing.
			for _, slot := range archetype.Slots {
				if slot.ShapeID == 0 {
					t.Fatalf("%s archetype %s slot %s has no shape ID", id, archetype.ID, slot.ID)
				}
			}
		}
	}
}

func TestLookupRejectsUnknownTemplatesAndVersions(t *testing.T) {
	if _, err := Lookup("no-such-template", 1); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Lookup() error = %v, want ErrNotFound", err)
	}
	ids, err := IDs()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Lookup(ids[0], 99); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an unpublished version resolved: %v", err)
	}
}

func TestEmbeddedManifestsUseTheCurrentSchema(t *testing.T) {
	ids, err := IDs()
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range ids {
		manifest, err := Lookup(id, 1)
		if err != nil {
			t.Fatal(err)
		}
		if manifest.ManifestVersion != templatepublish.ManifestVersion {
			t.Fatalf("%s has manifest version %d, want %d", id, manifest.ManifestVersion, templatepublish.ManifestVersion)
		}
	}
}
