package pptxcompiler

import (
	"strings"
	"testing"
)

const testDigest = "3b1f4c5d6e7a8b9c0d1e2f30415263748596a7b8c9dae0f1023456789abcdef0"

func validManifest() Manifest {
	return Manifest{
		ManifestVersion: ManifestVersion,
		TemplateID:      "simple-business-proposal",
		TemplateVersion: 1,
		TemplateSHA256:  testDigest,
		Dimensions:      Dimensions{WidthEMU: 9144000, HeightEMU: 5143500},
		Archetypes: []Archetype{
			{
				ID:          "cover",
				Role:        RoleCover,
				SourceSlide: "ppt/slides/slide1.xml",
				Slots: []Slot{
					{ID: "title", Type: SlotText, ShapeID: "2", Required: true, MaxCharacters: 90},
				},
			},
			{
				ID:          "content",
				Role:        RoleContent,
				SourceSlide: "ppt/slides/slide2.xml",
				Repeatable:  true,
				Slots: []Slot{
					{ID: "heading", Type: SlotText, ShapeID: "2", Required: true, MaxCharacters: 90},
					{ID: "points", Type: SlotList, ShapeID: "3", MaxItems: 5, MaxCharacters: 140},
				},
				ClearShapeIDs: []string{"9"},
			},
		},
	}
}

func TestValidateAcceptsAWellFormedManifest(t *testing.T) {
	if err := validManifest().Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestValidateRejectsUnsupportedSlotTypes(t *testing.T) {
	for _, slotType := range []SlotType{SlotTable, SlotChart} {
		t.Run(string(slotType), func(t *testing.T) {
			manifest := validManifest()
			manifest.Archetypes[0].Slots[0].Type = slotType
			err := manifest.Validate()
			if err == nil {
				t.Fatalf("%s slot was accepted without a native writer", slotType)
			}
			if !strings.Contains(err.Error(), "native OOXML writer") {
				t.Fatalf("error = %v, want it to explain the missing writer", err)
			}
		})
	}
}

func TestValidateRejectsStructuralMistakes(t *testing.T) {
	for _, test := range []struct {
		name    string
		mutate  func(*Manifest)
		message string
	}{
		{
			name:    "wrong manifest version",
			mutate:  func(m *Manifest) { m.ManifestVersion = ManifestVersion + 1 },
			message: "unsupported manifest version",
		},
		{
			name:    "malformed digest",
			mutate:  func(m *Manifest) { m.TemplateSHA256 = "abc" },
			message: "malformed SHA-256",
		},
		{
			name:    "no archetypes",
			mutate:  func(m *Manifest) { m.Archetypes = nil },
			message: "declares no archetypes",
		},
		{
			name:    "duplicate archetype",
			mutate:  func(m *Manifest) { m.Archetypes[1].ID = m.Archetypes[0].ID },
			message: "duplicate archetype",
		},
		{
			name:    "duplicate slot",
			mutate:  func(m *Manifest) { m.Archetypes[1].Slots[1].ID = m.Archetypes[1].Slots[0].ID },
			message: "duplicate slot",
		},
		{
			name:    "two slots on one shape",
			mutate:  func(m *Manifest) { m.Archetypes[1].Slots[1].ShapeID = m.Archetypes[1].Slots[0].ShapeID },
			message: "more than one slot",
		},
		{
			name:    "writes and clears one shape",
			mutate:  func(m *Manifest) { m.Archetypes[1].ClearShapeIDs = []string{"3"} },
			message: "both writes and clears",
		},
		{
			name:    "unstable source slide",
			mutate:  func(m *Manifest) { m.Archetypes[0].SourceSlide = "ppt/slides/cover.xml" },
			message: "invalid source slide",
		},
		{
			name:    "unbounded text slot",
			mutate:  func(m *Manifest) { m.Archetypes[0].Slots[0].MaxCharacters = 0 },
			message: "bound its character count",
		},
		{
			name:    "unbounded list slot",
			mutate:  func(m *Manifest) { m.Archetypes[1].Slots[1].MaxItems = 0 },
			message: "bound both its item count",
		},
		{
			name:    "no repeatable content archetype",
			mutate:  func(m *Manifest) { m.Archetypes[1].Repeatable = false },
			message: "no repeatable content archetype",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			manifest := validManifest()
			test.mutate(&manifest)
			err := manifest.Validate()
			if err == nil {
				t.Fatal("invalid manifest was accepted")
			}
			if !strings.Contains(err.Error(), test.message) {
				t.Fatalf("error = %v, want it to mention %q", err, test.message)
			}
		})
	}
}

func TestArchetypesForRoleKeepsManifestOrder(t *testing.T) {
	manifest := validManifest()
	content := manifest.ArchetypesForRole(RoleContent)
	if len(content) != 1 || content[0].ID != "content" {
		t.Fatalf("content archetypes = %#v", content)
	}
	if len(manifest.ArchetypesForRole(RoleClosing)) != 0 {
		t.Fatal("a role the manifest does not declare returned archetypes")
	}
}
