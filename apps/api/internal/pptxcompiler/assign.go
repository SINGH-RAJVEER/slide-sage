// Package pptxcompiler builds a presentation by editing a published PowerPoint
// template package rather than synthesising slides from scratch.
//
// A template is opaque to the compiler except through the manifest publication
// emitted for it, which names the source slide behind each archetype and the
// shapes inside it that may be written. Everything the manifest does not name is
// copied through untouched, which is what keeps a generated deck looking like
// the template it came from.
package pptxcompiler

import (
	"errors"
	"fmt"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatepublish"
)

// ErrUnsupportedSlideCount reports a deck size the template cannot produce.
var ErrUnsupportedSlideCount = errors.New("template cannot produce the requested slide count")

// Assignment is one position in the deck, bound to the archetype that will be
// cloned for it. Assignments are allocated before any content is requested, so
// the deck's length is settled before points are charged and a provider that
// returns too few slides is a repairable error rather than a short deck.
type Assignment struct {
	// Position is the 1-based slide number in the compiled deck.
	Position  int
	Archetype templatepublish.Archetype
}

// Assign allocates exactly count archetypes: a cover, a closing when the
// template has one, and repeatable content archetypes in between.
//
// Content archetypes rotate so a long deck alternates through the layouts the
// template provides instead of repeating one slide design. Rotation is by
// position, which keeps the assignment deterministic: the same template and
// count always produce the same plan.
func Assign(manifest templatepublish.Manifest, count int) ([]Assignment, error) {
	cover, err := singleArchetype(manifest, templatepublish.RoleCover)
	if err != nil {
		return nil, err
	}
	content := repeatableContent(manifest)
	if len(content) == 0 {
		return nil, fmt.Errorf("%w: %s has no repeatable content archetype", ErrUnsupportedSlideCount, manifest.TemplateID)
	}
	closing, hasClosing := lastArchetype(manifest, templatepublish.RoleClosing)

	minimum := 2 // a cover and at least one content slide
	if hasClosing {
		minimum++
	}
	if count < minimum {
		return nil, fmt.Errorf("%w: %s needs at least %d slides, requested %d", ErrUnsupportedSlideCount, manifest.TemplateID, minimum, count)
	}

	assignments := make([]Assignment, 0, count)
	assignments = append(assignments, Assignment{Position: 1, Archetype: cover})

	contentSlides := count - 1
	if hasClosing {
		contentSlides--
	}
	for index := 0; index < contentSlides; index++ {
		assignments = append(assignments, Assignment{
			Position:  len(assignments) + 1,
			Archetype: content[index%len(content)],
		})
	}
	if hasClosing {
		assignments = append(assignments, Assignment{Position: len(assignments) + 1, Archetype: closing})
	}
	if len(assignments) != count {
		return nil, fmt.Errorf("assigned %d slides for a %d-slide deck", len(assignments), count)
	}
	return assignments, nil
}

func singleArchetype(manifest templatepublish.Manifest, role templatepublish.NarrativeRole) (templatepublish.Archetype, error) {
	for _, archetype := range manifest.Archetypes {
		if archetype.Role == role {
			return archetype, nil
		}
	}
	return templatepublish.Archetype{}, fmt.Errorf("%w: %s has no %s archetype", ErrUnsupportedSlideCount, manifest.TemplateID, role)
}

func lastArchetype(manifest templatepublish.Manifest, role templatepublish.NarrativeRole) (templatepublish.Archetype, bool) {
	var found templatepublish.Archetype
	present := false
	for _, archetype := range manifest.Archetypes {
		if archetype.Role == role {
			found, present = archetype, true
		}
	}
	return found, present
}

func repeatableContent(manifest templatepublish.Manifest) []templatepublish.Archetype {
	var content []templatepublish.Archetype
	for _, archetype := range manifest.Archetypes {
		if archetype.Role == templatepublish.RoleContent && archetype.Repeatable {
			content = append(content, archetype)
		}
	}
	return content
}
