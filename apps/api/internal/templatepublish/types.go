// Package templatepublish turns a curated PPTX file into an immutable,
// digest-pinned template package plus the manifest the compiler needs to write
// content into it.
package templatepublish

import "errors"

// ManifestVersion is the schema version of the emitted manifest. Bump it when
// the compiler can no longer read an older manifest.
const ManifestVersion = 1

const PPTXContentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

var (
	ErrEncryptedPackage = errors.New("template package is encrypted")
	ErrMacroEnabled     = errors.New("template package contains macros")
	ErrExternalTarget   = errors.New("template package references an external relationship")
	ErrNoArchetypes     = errors.New("template package yielded no usable archetypes")
	ErrPackageTooLarge  = errors.New("template package exceeds the byte limit")
	ErrInvalidPackage   = errors.New("template package is not a valid PPTX")
)

// NarrativeRole is what a source slide is for. The compiler allocates roles
// before it asks for content, so these names are part of the contract.
type NarrativeRole string

const (
	RoleCover   NarrativeRole = "cover"
	RoleSection NarrativeRole = "section"
	RoleContent NarrativeRole = "content"
	RoleClosing NarrativeRole = "closing"
)

// SlotKind is the object type a slot writes into. Only text is supported by the
// first compiler; other kinds are recorded so a manifest can describe a slide
// fully without the compiler pretending it can fill them.
type SlotKind string

const (
	SlotText    SlotKind = "text"
	SlotList    SlotKind = "list"
	SlotImage   SlotKind = "image"
	SlotTable   SlotKind = "table"
	SlotChart   SlotKind = "chart"
	SlotUnknown SlotKind = "unknown"
)

// Slot is one writable object on a source slide, addressed by its shape ID.
type Slot struct {
	// ID is stable within an archetype and is what generated content is keyed by.
	ID string `json:"id"`
	// ShapeID is the p:cNvPr id attribute on the source slide.
	ShapeID int `json:"shapeId"`
	// Placeholder is the p:ph type when the shape is a placeholder.
	Placeholder string   `json:"placeholder,omitempty"`
	Kind        SlotKind `json:"kind"`
	Required    bool     `json:"required"`
	// MaxCharacters is derived from the sample copy the template ships with, so
	// generated content stays inside the design the slide was drawn for.
	MaxCharacters int `json:"maxCharacters"`
	// MaxListItems is zero for slots that are not lists.
	MaxListItems int `json:"maxListItems,omitempty"`
	// SampleText is the template's own copy. The compiler clears it.
	SampleText string `json:"sampleText,omitempty"`
}

// Archetype is a source slide the compiler may clone.
type Archetype struct {
	ID   string        `json:"id"`
	Role NarrativeRole `json:"role"`
	// SourceSlide is the 1-based position in the presentation slide list. It is
	// recorded for humans; PartName is the identity the compiler resolves.
	SourceSlide int `json:"sourceSlide"`
	// PartName is the package part path of the source slide, which is stable
	// across edits that reorder slides.
	PartName string `json:"partName"`
	// Repeatable says whether the compiler may use this archetype more than once.
	Repeatable bool   `json:"repeatable"`
	Slots      []Slot `json:"slots"`
}

// Manifest describes one immutable template package version.
type Manifest struct {
	ManifestVersion int    `json:"manifestVersion"`
	TemplateID      string `json:"templateId"`
	TemplateVersion int    `json:"templateVersion"`
	SHA256          string `json:"sha256"`
	WidthEMU        int64  `json:"widthEmu"`
	HeightEMU       int64  `json:"heightEmu"`
	SlideCount      int    `json:"slideCount"`
	// CoverSlide is the 1-based slide rendered as the marketplace thumbnail.
	CoverSlide int         `json:"coverSlide"`
	Archetypes []Archetype `json:"archetypes"`
}

// SupportedCounts reports the deck sizes this manifest can satisfy: one cover,
// one closing when available, and repeatable content archetypes in between.
func (m Manifest) SupportedCounts(minimum, maximum int) []int {
	if !m.hasRole(RoleCover) || !m.hasRepeatableContent() {
		return nil
	}
	counts := make([]int, 0, maximum-minimum+1)
	for count := minimum; count <= maximum; count++ {
		if count >= m.minimumSlides() {
			counts = append(counts, count)
		}
	}
	return counts
}

func (m Manifest) minimumSlides() int {
	minimum := 1
	if m.hasRole(RoleClosing) {
		minimum++
	}
	return minimum + 1
}

func (m Manifest) hasRole(role NarrativeRole) bool {
	for _, archetype := range m.Archetypes {
		if archetype.Role == role {
			return true
		}
	}
	return false
}

func (m Manifest) hasRepeatableContent() bool {
	for _, archetype := range m.Archetypes {
		if archetype.Role == RoleContent && archetype.Repeatable {
			return true
		}
	}
	return false
}
