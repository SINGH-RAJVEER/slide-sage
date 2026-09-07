package pptxcompiler

import (
	"fmt"
	"strconv"
)

// cloneAssignedSlides rebuilds the package so its slides are exactly the
// assigned archetypes, in order.
//
// A source slide may be cloned many times or not at all, so the whole slide set
// is replaced rather than edited in place. Everything a slide points at —
// layouts, masters, media, themes — is left where it is and shared between
// clones: relationship targets in a slide's .rels are relative to ppt/slides/,
// so they resolve identically from any slide number, and copying the media for
// each clone would multiply an already large package.
func cloneAssignedSlides(source *pkg, assignments []Assignment) error {
	if len(assignments) == 0 {
		return fmt.Errorf("cannot build a deck with no slides")
	}
	presentation, err := source.mustPart(presentationPart)
	if err != nil {
		return err
	}
	presentationRels, err := source.mustPart(presentationRelsPart)
	if err != nil {
		return err
	}
	existingRels, err := parseRelationships(presentationRels)
	if err != nil {
		return err
	}
	rawTypes, err := source.mustPart(contentTypesPart)
	if err != nil {
		return err
	}
	types, err := parseContentTypes(rawTypes)
	if err != nil {
		return err
	}

	// Capture every source slide before anything is removed, since a later
	// clone may name a part an earlier removal would have deleted.
	original := make(map[string][]byte, len(source.parts))
	for name, body := range source.parts {
		original[name] = body
	}
	captured, err := captureSlides(source, assignments)
	if err != nil {
		return err
	}
	// Targets resolve against the part the relationships describe, not against
	// the .rels file that holds them.
	oldSlideParts, keptRels := partitionSlideRelationships(existingRels, presentationPart)
	for _, part := range oldSlideParts {
		source.removePart(part)
		source.removePart(relsPartFor(part))
		types.removeOverride(part)
	}

	slideRels := make([]relationship, 0, len(assignments))
	relationshipIDs := make([]string, 0, len(assignments))
	for index, assignment := range assignments {
		slideNumber := index + 1
		partName := "ppt/slides/slide" + strconv.Itoa(slideNumber) + ".xml"
		clone := captured[assignment.Archetype.PartName]

		ownedRels, err := cloneOwnedParts(source, original, assignment.Archetype.PartName, partName, slideNumber, types)
		if err != nil {
			return err
		}
		clone.rels = ownedRels
		source.setPart(partName, clone.body)
		if len(clone.rels) > 0 {
			source.setPart(relsPartFor(partName), clone.rels)
		}
		contentType := clone.contentType
		if contentType == "" {
			contentType = slideContentType
		}
		types.setOverride(partName, contentType)

		all := append(append([]relationship{}, keptRels...), slideRels...)
		id := nextRelationshipID(all)
		slideRels = append(slideRels, relationship{
			ID:     id,
			Type:   slideRelationshipType,
			Target: "slides/slide" + strconv.Itoa(slideNumber) + ".xml",
		})
		relationshipIDs = append(relationshipIDs, id)
	}

	rewritten, err := rewriteSlideList(presentation, relationshipIDs)
	if err != nil {
		return err
	}
	source.setPart(presentationPart, rewritten)
	source.setPart(presentationRelsPart, marshalRelationships(append(keptRels, slideRels...)))
	source.setPart(contentTypesPart, types.marshal())
	return nil
}

// capturedSlide is a source slide held aside before the slide set is replaced.
type capturedSlide struct {
	body        []byte
	rels        []byte
	contentType string
}

func captureSlides(source *pkg, assignments []Assignment) (map[string]capturedSlide, error) {
	rawTypes, err := source.mustPart(contentTypesPart)
	if err != nil {
		return nil, err
	}
	types, err := parseContentTypes(rawTypes)
	if err != nil {
		return nil, err
	}
	captured := map[string]capturedSlide{}
	for _, assignment := range assignments {
		partName := assignment.Archetype.PartName
		if _, done := captured[partName]; done {
			continue
		}
		body, present := source.part(partName)
		if !present {
			return nil, fmt.Errorf("archetype %s names source slide %s, which the package does not hold",
				assignment.Archetype.ID, partName)
		}
		slide := capturedSlide{body: append([]byte{}, body...)}
		if rels, hasRels := source.part(relsPartFor(partName)); hasRels {
			slide.rels = append([]byte{}, rels...)
		}
		if contentType, declared := types.overrideFor(partName); declared {
			slide.contentType = contentType
		}
		captured[partName] = slide
	}
	return captured, nil
}

// partitionSlideRelationships splits presentation relationships into the slide
// parts they point at and the relationships to keep, which are everything that
// is not a slide: masters, the theme, presentation properties.
func partitionSlideRelationships(items []relationship, sourcePart string) (slideParts []string, kept []relationship) {
	for _, item := range items {
		if item.Type != slideRelationshipType {
			kept = append(kept, item)
			continue
		}
		if resolved, err := resolveTarget(sourcePart, item.Target); err == nil {
			slideParts = append(slideParts, resolved)
		}
	}
	return slideParts, kept
}

// CloneDeck returns a package whose slides are the assigned archetypes, ready
// for slot content to be written into.
func CloneDeck(template []byte, assignments []Assignment) ([]byte, error) {
	loaded, err := openPackage(template)
	if err != nil {
		return nil, err
	}
	if err := cloneAssignedSlides(loaded, assignments); err != nil {
		return nil, err
	}
	return loaded.bytes()
}
