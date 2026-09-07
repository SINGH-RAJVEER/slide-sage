package pptxcompiler

import (
	"encoding/xml"
	"fmt"
	"path"
	"sort"
	"strconv"
	"strings"
)

// relationship is one entry of a .rels part.
type relationship struct {
	ID     string `xml:"Id,attr"`
	Type   string `xml:"Type,attr"`
	Target string `xml:"Target,attr"`
	// TargetMode is "External" for relationships that leave the package.
	// Publication rejects those, so a template should never carry one.
	TargetMode string `xml:"TargetMode,attr,omitempty"`
}

type relationships struct {
	XMLName xml.Name       `xml:"Relationships"`
	Items   []relationship `xml:"Relationship"`
}

func parseRelationships(contents []byte) ([]relationship, error) {
	var parsed relationships
	if err := xml.Unmarshal(contents, &parsed); err != nil {
		return nil, fmt.Errorf("parse relationships: %w", err)
	}
	return parsed.Items, nil
}

// marshalRelationships writes a .rels part. The namespace is written literally
// because encoding/xml would otherwise emit an xmlns prefix that Office rejects
// on package relationships.
func marshalRelationships(items []relationship) []byte {
	var builder strings.Builder
	builder.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	builder.WriteString(`<Relationships xmlns="` + packageRelationshipsNS + `">`)
	for _, item := range items {
		builder.WriteString(`<Relationship Id="` + escapeAttribute(item.ID) +
			`" Type="` + escapeAttribute(item.Type) +
			`" Target="` + escapeAttribute(item.Target) + `"`)
		if item.TargetMode != "" {
			builder.WriteString(` TargetMode="` + escapeAttribute(item.TargetMode) + `"`)
		}
		builder.WriteString(`/>`)
	}
	builder.WriteString(`</Relationships>`)
	return []byte(builder.String())
}

func escapeAttribute(value string) string {
	var escaped strings.Builder
	_ = xml.EscapeText(&escaped, []byte(value))
	return escaped.String()
}

// relsPartFor returns the .rels part name holding a part's relationships.
func relsPartFor(partName string) string {
	return path.Join(path.Dir(partName), "_rels", path.Base(partName)+".rels")
}

// resolveTarget turns a relationship target into a package part name, relative
// to the part that declared it.
func resolveTarget(sourcePart, target string) (string, error) {
	if strings.Contains(target, "://") {
		return "", fmt.Errorf("relationship target %q leaves the package", target)
	}
	if strings.HasPrefix(target, "/") {
		return validatePartName(strings.TrimPrefix(target, "/"))
	}
	resolved := path.Join(path.Dir(sourcePart), target)
	if strings.HasPrefix(resolved, "..") {
		return "", fmt.Errorf("relationship target %q escapes the package", target)
	}
	return validatePartName(resolved)
}

// nextRelationshipID returns an ID that no existing relationship uses.
func nextRelationshipID(items []relationship) string {
	highest := 0
	for _, item := range items {
		if !strings.HasPrefix(item.ID, "rId") {
			continue
		}
		if number, err := strconv.Atoi(strings.TrimPrefix(item.ID, "rId")); err == nil && number > highest {
			highest = number
		}
	}
	return "rId" + strconv.Itoa(highest+1)
}

// contentTypes is the [Content_Types].xml part, which declares a type for every
// part in the package. A part with no declared type makes the package invalid,
// so cloned slides have to be registered here.
type contentTypes struct {
	defaults  []contentTypeDefault
	overrides map[string]string
}

type contentTypeDefault struct {
	Extension   string `xml:"Extension,attr"`
	ContentType string `xml:"ContentType,attr"`
}

type contentTypeOverride struct {
	PartName    string `xml:"PartName,attr"`
	ContentType string `xml:"ContentType,attr"`
}

type contentTypesXML struct {
	XMLName   xml.Name              `xml:"Types"`
	Defaults  []contentTypeDefault  `xml:"Default"`
	Overrides []contentTypeOverride `xml:"Override"`
}

func parseContentTypes(contents []byte) (*contentTypes, error) {
	var parsed contentTypesXML
	if err := xml.Unmarshal(contents, &parsed); err != nil {
		return nil, fmt.Errorf("parse content types: %w", err)
	}
	types := &contentTypes{defaults: parsed.Defaults, overrides: map[string]string{}}
	for _, override := range parsed.Overrides {
		types.overrides[strings.TrimPrefix(override.PartName, "/")] = override.ContentType
	}
	return types, nil
}

func (types *contentTypes) setOverride(partName, contentType string) {
	types.overrides[partName] = contentType
}

func (types *contentTypes) removeOverride(partName string) {
	delete(types.overrides, partName)
}

func (types *contentTypes) overrideFor(partName string) (string, bool) {
	contentType, present := types.overrides[partName]
	return contentType, present
}

func (types *contentTypes) marshal() []byte {
	var builder strings.Builder
	builder.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	builder.WriteString(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`)
	for _, entry := range types.defaults {
		builder.WriteString(`<Default Extension="` + escapeAttribute(entry.Extension) +
			`" ContentType="` + escapeAttribute(entry.ContentType) + `"/>`)
	}
	names := make([]string, 0, len(types.overrides))
	for name := range types.overrides {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		builder.WriteString(`<Override PartName="/` + escapeAttribute(name) +
			`" ContentType="` + escapeAttribute(types.overrides[name]) + `"/>`)
	}
	builder.WriteString(`</Types>`)
	return []byte(builder.String())
}
