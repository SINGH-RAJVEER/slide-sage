// Package pptxcompiler builds a presentation by editing a published PowerPoint
// template package rather than synthesising slides from scratch.
//
// A template is opaque to the compiler except through its manifest, which names
// the source slide behind each archetype and the shapes inside it that may be
// written. Everything the manifest does not name is copied through untouched,
// which is what keeps a generated deck looking like the template it came from.
package pptxcompiler

import (
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
)

// ManifestVersion is the manifest shape this compiler understands. Publication
// stamps it so an older binary refuses a manifest it cannot read rather than
// misinterpreting one.
const ManifestVersion = 1

// SlotType is the kind of content a slot accepts.
type SlotType string

const (
	SlotText  SlotType = "text"
	SlotList  SlotType = "list"
	SlotImage SlotType = "image"
	SlotTable SlotType = "table"
	SlotChart SlotType = "chart"
)

// supportedSlotTypes is deliberately narrower than the set of types a manifest
// may name. Tables and charts need native OOXML writers before a manifest may
// expose them, so a manifest that declares one is rejected at load rather than
// producing a deck with empty shapes.
var supportedSlotTypes = map[SlotType]bool{
	SlotText:  true,
	SlotList:  true,
	SlotImage: true,
}

// Role is an archetype's narrative position in a deck.
type Role string

const (
	RoleCover   Role = "cover"
	RoleSection Role = "section"
	RoleContent Role = "content"
	RoleClosing Role = "closing"
)

var roles = map[Role]bool{
	RoleCover:   true,
	RoleSection: true,
	RoleContent: true,
	RoleClosing: true,
}

var (
	identifierPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	slidePartPattern  = regexp.MustCompile(`^ppt/slides/slide[0-9]+\.xml$`)
	digestPattern     = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

// Slot is one writable region of a source slide.
type Slot struct {
	ID   string   `json:"id"`
	Type SlotType `json:"type"`
	// ShapeID is the a:: shape identifier inside the source slide. Shape names
	// are not unique and slide numbers are not stable, so the manifest pins the
	// identifier that publication resolved.
	ShapeID  string `json:"shapeId"`
	Required bool   `json:"required"`
	// MaxCharacters bounds a text slot, or one item of a list slot.
	MaxCharacters int `json:"maxCharacters,omitempty"`
	// MaxItems bounds a list slot.
	MaxItems int `json:"maxItems,omitempty"`
}

// Archetype is one source slide the compiler may clone.
type Archetype struct {
	ID   string `json:"id"`
	Role Role   `json:"role"`
	// SourceSlide is the package part publication resolved for this archetype.
	SourceSlide string `json:"sourceSlide"`
	// Repeatable marks an archetype the assignment may use more than once.
	Repeatable bool   `json:"repeatable"`
	Slots      []Slot `json:"slots"`
	// ClearShapeIDs name sample objects to empty after cloning, so placeholder
	// copy from the template never reaches a generated deck.
	ClearShapeIDs []string `json:"clearShapeIds,omitempty"`
}

// Dimensions is the slide size declared by the template package.
type Dimensions struct {
	WidthEMU  int `json:"widthEmu"`
	HeightEMU int `json:"heightEmu"`
}

// Manifest describes how one published template version may be edited.
type Manifest struct {
	ManifestVersion int         `json:"manifestVersion"`
	TemplateID      string      `json:"templateId"`
	TemplateVersion int         `json:"templateVersion"`
	TemplateSHA256  string      `json:"templateSha256"`
	Dimensions      Dimensions  `json:"dimensions"`
	Archetypes      []Archetype `json:"archetypes"`
}

// Validate reports whether a manifest is internally consistent and within what
// this compiler supports. It does not open the template package; matching the
// manifest against real parts happens when the package is loaded.
func (manifest Manifest) Validate() error {
	if manifest.ManifestVersion != ManifestVersion {
		return fmt.Errorf("unsupported manifest version %d, want %d", manifest.ManifestVersion, ManifestVersion)
	}
	if !identifierPattern.MatchString(manifest.TemplateID) {
		return fmt.Errorf("invalid template ID %q", manifest.TemplateID)
	}
	if manifest.TemplateVersion <= 0 {
		return fmt.Errorf("template %s has a non-positive version", manifest.TemplateID)
	}
	if !digestPattern.MatchString(manifest.TemplateSHA256) {
		return fmt.Errorf("template %s has a malformed SHA-256", manifest.TemplateID)
	}
	if _, err := hex.DecodeString(manifest.TemplateSHA256); err != nil {
		return fmt.Errorf("template %s has a non-hexadecimal SHA-256", manifest.TemplateID)
	}
	if manifest.Dimensions.WidthEMU <= 0 || manifest.Dimensions.HeightEMU <= 0 {
		return fmt.Errorf("template %s has non-positive slide dimensions", manifest.TemplateID)
	}
	if len(manifest.Archetypes) == 0 {
		return fmt.Errorf("template %s declares no archetypes", manifest.TemplateID)
	}
	seenArchetypes := make(map[string]struct{}, len(manifest.Archetypes))
	for _, archetype := range manifest.Archetypes {
		if err := archetype.validate(); err != nil {
			return err
		}
		if _, duplicate := seenArchetypes[archetype.ID]; duplicate {
			return fmt.Errorf("duplicate archetype %q", archetype.ID)
		}
		seenArchetypes[archetype.ID] = struct{}{}
	}
	if !manifest.hasRepeatableContent() {
		return fmt.Errorf("template %s has no repeatable content archetype, so it can only ever produce a fixed deck", manifest.TemplateID)
	}
	return nil
}

func (manifest Manifest) hasRepeatableContent() bool {
	for _, archetype := range manifest.Archetypes {
		if archetype.Repeatable && archetype.Role == RoleContent {
			return true
		}
	}
	return false
}

// Archetypes returns the archetypes matching a role, in manifest order.
func (manifest Manifest) ArchetypesForRole(role Role) []Archetype {
	var matching []Archetype
	for _, archetype := range manifest.Archetypes {
		if archetype.Role == role {
			matching = append(matching, archetype)
		}
	}
	return matching
}

func (archetype Archetype) validate() error {
	if !identifierPattern.MatchString(archetype.ID) {
		return fmt.Errorf("invalid archetype ID %q", archetype.ID)
	}
	if !roles[archetype.Role] {
		return fmt.Errorf("archetype %s has an unknown role %q", archetype.ID, archetype.Role)
	}
	if !slidePartPattern.MatchString(archetype.SourceSlide) {
		return fmt.Errorf("archetype %s names an invalid source slide %q", archetype.ID, archetype.SourceSlide)
	}
	if len(archetype.Slots) == 0 {
		return fmt.Errorf("archetype %s declares no slots", archetype.ID)
	}
	seenSlots := make(map[string]struct{}, len(archetype.Slots))
	seenShapes := make(map[string]struct{}, len(archetype.Slots))
	for _, slot := range archetype.Slots {
		if err := slot.validate(archetype.ID); err != nil {
			return err
		}
		if _, duplicate := seenSlots[slot.ID]; duplicate {
			return fmt.Errorf("archetype %s declares duplicate slot %q", archetype.ID, slot.ID)
		}
		seenSlots[slot.ID] = struct{}{}
		// Two slots writing the same shape would make the result depend on slot
		// ordering, so the manifest has to keep them distinct.
		if _, duplicate := seenShapes[slot.ShapeID]; duplicate {
			return fmt.Errorf("archetype %s writes shape %q from more than one slot", archetype.ID, slot.ShapeID)
		}
		seenShapes[slot.ShapeID] = struct{}{}
	}
	for _, shapeID := range archetype.ClearShapeIDs {
		if strings.TrimSpace(shapeID) == "" {
			return fmt.Errorf("archetype %s has an empty shape ID to clear", archetype.ID)
		}
		if _, written := seenShapes[shapeID]; written {
			return fmt.Errorf("archetype %s both writes and clears shape %q", archetype.ID, shapeID)
		}
	}
	return nil
}

func (slot Slot) validate(archetypeID string) error {
	if !identifierPattern.MatchString(slot.ID) {
		return fmt.Errorf("archetype %s has an invalid slot ID %q", archetypeID, slot.ID)
	}
	if !supportedSlotTypes[slot.Type] {
		if slot.Type == SlotTable || slot.Type == SlotChart {
			return fmt.Errorf("archetype %s slot %s uses %q, which needs a native OOXML writer before a manifest may expose it", archetypeID, slot.ID, slot.Type)
		}
		return fmt.Errorf("archetype %s slot %s has an unknown type %q", archetypeID, slot.ID, slot.Type)
	}
	if strings.TrimSpace(slot.ShapeID) == "" {
		return fmt.Errorf("archetype %s slot %s names no shape", archetypeID, slot.ID)
	}
	switch slot.Type {
	case SlotText:
		if slot.MaxCharacters <= 0 {
			return fmt.Errorf("archetype %s slot %s must bound its character count", archetypeID, slot.ID)
		}
		if slot.MaxItems != 0 {
			return fmt.Errorf("archetype %s slot %s is text and cannot bound items", archetypeID, slot.ID)
		}
	case SlotList:
		if slot.MaxItems <= 0 || slot.MaxCharacters <= 0 {
			return fmt.Errorf("archetype %s slot %s must bound both its item count and item length", archetypeID, slot.ID)
		}
	case SlotImage:
		if slot.MaxCharacters != 0 || slot.MaxItems != 0 {
			return fmt.Errorf("archetype %s slot %s is an image and cannot bound text", archetypeID, slot.ID)
		}
	}
	return nil
}
