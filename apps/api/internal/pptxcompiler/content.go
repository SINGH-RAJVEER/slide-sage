package pptxcompiler

import (
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatepublish"
)

const Version = "slots-v1"
const drawingNamespace = "http://schemas.openxmlformats.org/drawingml/2006/main"

type SlideContent struct {
	Position int            `json:"position"`
	Slots    map[string]any `json:"slots"`
}

func ValidateAssignments(assignments []Assignment) error {
	if len(assignments) == 0 {
		return fmt.Errorf("no assigned slides")
	}
	for i, a := range assignments {
		if a.Position != i+1 {
			return fmt.Errorf("assignments are not ordered")
		}
		ids, shapes := map[string]bool{}, map[int]bool{}
		for _, s := range a.Archetype.Slots {
			if s.ID == "" || s.ShapeID <= 0 || ids[s.ID] || shapes[s.ShapeID] {
				return fmt.Errorf("slide %d has ambiguous slots", i+1)
			}
			ids[s.ID], shapes[s.ShapeID] = true, true
			switch s.Kind {
			case templatepublish.SlotText, templatepublish.SlotList:
				if s.MaxCharacters <= 0 || (s.Kind == templatepublish.SlotList && s.MaxListItems <= 0) {
					return fmt.Errorf("slot %s has no content limit", s.ID)
				}
			case templatepublish.SlotImage:
			default:
				return fmt.Errorf("slide %d slot %s uses unsupported %s", i+1, s.ID, s.Kind)
			}
		}
	}
	return nil
}

func ValidateSlide(a Assignment, content SlideContent) error {
	if content.Position != a.Position {
		return fmt.Errorf("missing slide %d", a.Position)
	}
	known := map[string]bool{}
	// A slide whose text slots are all optional would otherwise compile empty,
	// so at least one of them has to carry content.
	textSlots, filled := 0, 0
	for _, s := range a.Archetype.Slots {
		known[s.ID] = true
		if s.Kind != templatepublish.SlotImage {
			textSlots++
		}
		value := content.Slots[s.ID]
		if value == nil {
			if s.Required {
				return fmt.Errorf("required slot %s is missing", s.ID)
			}
			continue
		}
		if s.Kind == templatepublish.SlotImage {
			if _, _, err := imageValue(value); err != nil {
				return fmt.Errorf("slot %s: %w", s.ID, err)
			}
			continue
		}
		lines, err := textValue(s, value)
		if err != nil {
			return err
		}
		if strings.TrimSpace(strings.Join(lines, "")) == "" {
			if s.Required {
				return fmt.Errorf("required slot %s is empty", s.ID)
			}
		} else {
			filled++
		}
		for _, line := range lines {
			if utf8.RuneCountInString(line) > s.MaxCharacters {
				return fmt.Errorf("slot %s exceeds %d characters per item", s.ID, s.MaxCharacters)
			}
		}
	}
	for id := range content.Slots {
		if !known[id] {
			return fmt.Errorf("unknown slot %s", id)
		}
	}
	if textSlots > 0 && filled == 0 {
		return fmt.Errorf("slide %d has no text content", a.Position)
	}
	return nil
}

func textValue(s templatepublish.Slot, value any) ([]string, error) {
	if value == nil {
		return []string{""}, nil
	}
	if s.Kind == templatepublish.SlotText {
		v, ok := value.(string)
		if !ok {
			return nil, fmt.Errorf("slot %s needs a string", s.ID)
		}
		return []string{v}, nil
	}
	var lines []string
	switch v := value.(type) {
	case []string:
		lines = v
	case []any:
		for _, x := range v {
			v, ok := x.(string)
			if !ok {
				return nil, fmt.Errorf("slot %s needs string items", s.ID)
			}
			lines = append(lines, v)
		}
	default:
		return nil, fmt.Errorf("slot %s needs a list", s.ID)
	}
	if len(lines) > s.MaxListItems {
		return nil, fmt.Errorf("slot %s exceeds %d items", s.ID, s.MaxListItems)
	}
	return lines, nil
}

func imageValue(value any) ([]byte, string, error) {
	v, ok := value.(map[string]any)
	if !ok {
		return nil, "", fmt.Errorf("image needs base64 and mimeType")
	}
	encoded, _ := v["base64"].(string)
	mime, _ := v["mimeType"].(string)
	if len(encoded) > 12<<20 {
		return nil, "", fmt.Errorf("image exceeds limit")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, "", err
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, "", err
	}
	if config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 40_000_000 {
		return nil, "", fmt.Errorf("image dimensions exceed limit")
	}
	if format != "png" && format != "jpeg" || mime != "image/"+format {
		return nil, "", fmt.Errorf("image MIME type does not match PNG or JPEG")
	}
	return data, mime, nil
}

// xmlNode stores byte offsets, preserving all untouched XML and namespace bindings.
type xmlNode struct {
	name                            xml.Name
	attrs                           []xml.Attr
	start, openEnd, closeStart, end int
	children                        []*xmlNode
}

func parseXML(data []byte) (*xmlNode, error) {
	d := xml.NewDecoder(bytes.NewReader(data))
	var root *xmlNode
	var stack []*xmlNode
	for {
		before := int(d.InputOffset())
		tok, err := d.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		switch e := tok.(type) {
		case xml.Directive:
			return nil, fmt.Errorf("XML directives forbidden")
		case xml.StartElement:
			n := &xmlNode{name: e.Name, attrs: e.Attr, start: before, openEnd: int(d.InputOffset())}
			if len(stack) > 0 {
				p := stack[len(stack)-1]
				p.children = append(p.children, n)
			} else {
				root = n
			}
			stack = append(stack, n)
		case xml.EndElement:
			if len(stack) == 0 {
				return nil, fmt.Errorf("unbalanced XML")
			}
			n := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			n.closeStart = before
			n.end = int(d.InputOffset())
		}
	}
	if root == nil {
		return nil, fmt.Errorf("empty XML")
	}
	return root, nil
}
func (n *xmlNode) find(ns, local string) *xmlNode {
	if n.name.Space == ns && n.name.Local == local {
		return n
	}
	for _, c := range n.children {
		if f := c.find(ns, local); f != nil {
			return f
		}
	}
	return nil
}
func attr(n *xmlNode, local string) string {
	if n != nil {
		for _, a := range n.attrs {
			if a.Name.Local == local {
				return a.Value
			}
		}
	}
	return ""
}
func shape(root *xmlNode, id int) *xmlNode {
	if root.name.Space == presentationNamespace && (root.name.Local == "sp" || root.name.Local == "pic" || root.name.Local == "graphicFrame") {
		if attr(root.find(presentationNamespace, "cNvPr"), "id") == strconv.Itoa(id) {
			return root
		}
	}
	for _, c := range root.children {
		if s := shape(c, id); s != nil {
			return s
		}
	}
	return nil
}
func splice(data []byte, start, end int, replacement []byte) []byte {
	out := append([]byte{}, data[:start]...)
	out = append(out, replacement...)
	return append(out, data[end:]...)
}
func raw(data []byte, n *xmlNode) string {
	if n == nil {
		return ""
	}
	return string(data[n.start:n.end])
}
func xmlText(v string) string {
	var b bytes.Buffer
	_ = xml.EscapeText(&b, []byte(v))
	return b.String()
}

func writeText(data []byte, s templatepublish.Slot, lines []string) ([]byte, error) {
	root, err := parseXML(data)
	if err != nil {
		return nil, err
	}
	target := shape(root, s.ShapeID)
	if target == nil {
		return nil, fmt.Errorf("shape %d is missing", s.ShapeID)
	}
	body := target.find(presentationNamespace, "txBody")
	if body == nil {
		return nil, fmt.Errorf("shape %d has no text body", s.ShapeID)
	}
	var paragraphs []*xmlNode
	for _, c := range body.children {
		if c.name.Space == drawingNamespace && c.name.Local == "p" {
			paragraphs = append(paragraphs, c)
		}
	}
	if len(paragraphs) == 0 {
		return nil, fmt.Errorf("shape %d has no paragraph", s.ShapeID)
	}
	if len(lines) == 0 {
		lines = []string{""}
	}
	var out strings.Builder
	for i, line := range lines {
		p := paragraphs[min(i, len(paragraphs)-1)]
		out.WriteString(`<a:p xmlns:a="` + drawingNamespace + `">`)
		out.WriteString(raw(data, p.find(drawingNamespace, "pPr")))
		out.WriteString(`<a:r>` + raw(data, p.find(drawingNamespace, "rPr")) + `<a:t xml:space="preserve">` + xmlText(line) + `</a:t></a:r>`)
		out.WriteString(raw(data, p.find(drawingNamespace, "endParaRPr")))
		out.WriteString(`</a:p>`)
	}
	return splice(data, paragraphs[0].start, paragraphs[len(paragraphs)-1].end, []byte(out.String())), nil
}

func Compile(template []byte, assignments []Assignment, content []SlideContent) ([]byte, error) {
	if err := ValidateAssignments(assignments); err != nil {
		return nil, err
	}
	if len(content) != len(assignments) {
		return nil, fmt.Errorf("content has %d slides, need %d", len(content), len(assignments))
	}
	for i, a := range assignments {
		if err := ValidateSlide(a, content[i]); err != nil {
			return nil, fmt.Errorf("slide %d: %w", i+1, err)
		}
	}
	p, err := openPackage(template)
	if err != nil {
		return nil, err
	}
	if err := cloneAssignedSlides(p, assignments); err != nil {
		return nil, err
	}
	for i, a := range assignments {
		part := fmt.Sprintf("ppt/slides/slide%d.xml", i+1)
		data, _ := p.part(part)
		for _, s := range a.Archetype.Slots {
			if s.Kind == templatepublish.SlotImage {
				data, err = writeImage(p, part, data, s, content[i].Slots[s.ID])
			} else {
				var lines []string
				lines, err = textValue(s, content[i].Slots[s.ID])
				if err == nil {
					data, err = writeText(data, s, lines)
				}
			}
			if err != nil {
				return nil, fmt.Errorf("slide %d slot %s: %w", i+1, s.ID, err)
			}
		}
		p.setPart(part, data)
	}
	if err := prunePackage(p); err != nil {
		return nil, err
	}
	return p.bytes()
}

func writeImage(p *pkg, part string, data []byte, s templatepublish.Slot, value any) ([]byte, error) {
	root, err := parseXML(data)
	if err != nil {
		return nil, err
	}
	target := shape(root, s.ShapeID)
	if target == nil || target.name.Local != "pic" {
		return nil, fmt.Errorf("image shape %d missing", s.ShapeID)
	}
	if value == nil {
		return splice(data, target.start, target.end, nil), nil
	}
	image, mime, err := imageValue(value)
	if err != nil {
		return nil, err
	}
	blip := target.find(drawingNamespace, "blip")
	if blip == nil {
		return nil, fmt.Errorf("image shape has no blip")
	}
	relData, _ := p.part(relsPartFor(part))
	rels, err := parseRelationships(relData)
	if err != nil {
		return nil, err
	}
	id := nextRelationshipID(rels)
	extension := "png"
	if mime == "image/jpeg" {
		extension = "jpeg"
	}
	name := fmt.Sprintf("ppt/media/generated-%s-%d.%s", strings.TrimSuffix(strings.TrimPrefix(part, "ppt/slides/"), ".xml"), s.ShapeID, extension)
	p.setPart(name, image)
	rels = append(rels, relationship{ID: id, Type: relationshipNamespace + "/image", Target: "../media/" + strings.TrimPrefix(name, "ppt/media/")})
	p.setPart(relsPartFor(part), marshalRelationships(rels))
	typesRaw, _ := p.part(contentTypesPart)
	types, err := parseContentTypes(typesRaw)
	if err != nil {
		return nil, err
	}
	types.setOverride(name, mime)
	p.setPart(contentTypesPart, types.marshal())
	replacement := `<a:blip xmlns:a="` + drawingNamespace + `" xmlns:r="` + relationshipNamespace + `" r:embed="` + id + `"/>`
	return splice(data, blip.start, blip.end, []byte(replacement)), nil
}
