package pptxcompiler

import (
	"fmt"
	"path"
	"strings"
)

// Retain only parts reachable from the package root, including their relationships.
func prunePackage(p *pkg) error {
	reached := map[string]bool{contentTypesPart: true}
	var visit func(string) error
	visit = func(part string) error {
		if reached[part] {
			return nil
		}
		reached[part] = true
		relName := relsPartFor(part)
		if part == "" {
			relName = rootRelsPart
		}
		data, ok := p.part(relName)
		if !ok {
			return nil
		}
		reached[relName] = true
		rels, err := parseRelationships(data)
		if err != nil {
			return err
		}
		for _, rel := range rels {
			if rel.TargetMode == "External" {
				return fmt.Errorf("external relationship in %s", relName)
			}
			target, err := resolveTarget(part, rel.Target)
			if err != nil {
				return err
			}
			if _, ok := p.part(target); !ok {
				return fmt.Errorf("missing relationship target %s", target)
			}
			if err := visit(target); err != nil {
				return err
			}
		}
		return nil
	}
	if err := visit(""); err != nil {
		return err
	}
	rawTypes, _ := p.part(contentTypesPart)
	types, err := parseContentTypes(rawTypes)
	if err != nil {
		return err
	}
	for _, name := range p.partNames() {
		if !reached[name] {
			p.removePart(name)
			types.removeOverride(name)
		}
	}
	p.setPart(contentTypesPart, types.marshal())
	return nil
}

// Notes, charts and diagrams belong to a slide. Clone their relationship graph
// while sharing design resources such as layouts, masters, themes and media.
func cloneOwnedParts(p *pkg, original map[string][]byte, sourcePart, targetPart string, number int, types *contentTypes) ([]byte, error) {
	mapping := map[string]string{sourcePart: targetPart}
	var cloneRels func(string, string) ([]byte, error)
	cloneRels = func(source, target string) ([]byte, error) {
		data, ok := original[relsPartFor(source)]
		if !ok {
			return nil, nil
		}
		rels, err := parseRelationships(data)
		if err != nil {
			return nil, err
		}
		for i, rel := range rels {
			resolved, err := resolveTarget(source, rel.Target)
			if err != nil {
				return nil, err
			}
			mapped, exists := mapping[resolved]
			owned := strings.Contains(resolved, "/notesSlides/") || strings.Contains(resolved, "/charts/") || strings.Contains(resolved, "/diagrams/") || strings.Contains(resolved, "/tags/")
			if owned && !exists {
				mapped = path.Join(path.Dir(resolved), fmt.Sprintf("clone%d-%s", number, path.Base(resolved)))
				mapping[resolved] = mapped
				body, ok := original[resolved]
				if !ok {
					return nil, fmt.Errorf("missing owned part %s", resolved)
				}
				p.setPart(mapped, body)
				if ct, ok := types.overrideFor(resolved); ok {
					types.setOverride(mapped, ct)
				}
				nested, err := cloneRels(resolved, mapped)
				if err != nil {
					return nil, err
				}
				if len(nested) > 0 {
					p.setPart(relsPartFor(mapped), nested)
				}
			}
			if mapped != "" {
				rels[i].Target = "/" + mapped
			} else {
				rels[i].Target = "/" + resolved
			}
		}
		return marshalRelationships(rels), nil
	}
	return cloneRels(sourcePart, targetPart)
}
