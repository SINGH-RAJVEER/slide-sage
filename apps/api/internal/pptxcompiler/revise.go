package pptxcompiler

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatepublish"
)

type ObjectIndex struct {
	ShapeID int    `json:"shapeId"`
	Kind    string `json:"kind"`
	Text    string `json:"text"`
}
type SlideIndex struct {
	Position int           `json:"position"`
	Part     string        `json:"part"`
	Notes    string        `json:"notes"`
	Objects  []ObjectIndex `json:"objects"`
}
type RevisionIndex struct {
	Width  int64        `json:"widthEmu"`
	Height int64        `json:"heightEmu"`
	Slides []SlideIndex `json:"slides"`
}
type TextOperation struct {
	Position     int    `json:"position"`
	ShapeID      int    `json:"shapeId"`
	ExpectedText string `json:"expectedText"`
	Text         string `json:"text"`
}

func textIn(data []byte) string {
	d := xml.NewDecoder(bytes.NewReader(data))
	var lines []string
	var line strings.Builder
	for {
		tok, err := d.Token()
		if err != nil {
			break
		}
		switch e := tok.(type) {
		case xml.StartElement:
			if e.Name.Local == "t" {
				var v string
				if d.DecodeElement(&v, &e) == nil {
					line.WriteString(v)
				}
			}
		case xml.EndElement:
			if e.Name.Local == "p" {
				lines = append(lines, line.String())
				line.Reset()
			}
		}
	}
	return strings.Join(lines, "\n")
}

func Index(contents []byte) (RevisionIndex, error) {
	p, err := openPackage(contents)
	if err != nil {
		return RevisionIndex{}, err
	}
	raw, err := p.mustPart(presentationPart)
	if err != nil {
		return RevisionIndex{}, err
	}
	root, err := parseXML(raw)
	if err != nil {
		return RevisionIndex{}, err
	}
	result := RevisionIndex{}
	size := root.find(presentationNamespace, "sldSz")
	result.Width, _ = strconv.ParseInt(attr(size, "cx"), 10, 64)
	result.Height, _ = strconv.ParseInt(attr(size, "cy"), 10, 64)
	relData, err := p.mustPart(presentationRelsPart)
	if err != nil {
		return result, err
	}
	rels, err := parseRelationships(relData)
	if err != nil {
		return result, err
	}
	byID := map[string]string{}
	for _, r := range rels {
		if r.Type == slideRelationshipType {
			target, e := resolveTarget(presentationPart, r.Target)
			if e != nil {
				return result, e
			}
			byID[r.ID] = target
		}
	}
	list := root.find(presentationNamespace, "sldIdLst")
	if list == nil {
		return result, fmt.Errorf("slide list missing")
	}
	for _, n := range list.children {
		var id string
		for _, a := range n.attrs {
			if a.Name.Space == relationshipNamespace && a.Name.Local == "id" {
				id = a.Value
			}
		}
		part := byID[id]
		data, ok := p.part(part)
		if !ok {
			return result, fmt.Errorf("slide part missing")
		}
		tree, err := parseXML(data)
		if err != nil {
			return result, err
		}
		slide := SlideIndex{Position: len(result.Slides) + 1, Part: part, Objects: []ObjectIndex{}}
		var visit func(*xmlNode)
		visit = func(n *xmlNode) {
			if n.name.Space == presentationNamespace && (n.name.Local == "sp" || n.name.Local == "pic" || n.name.Local == "graphicFrame" || n.name.Local == "grpSp") {
				id, _ := strconv.Atoi(attr(n.find(presentationNamespace, "cNvPr"), "id"))
				value := ""
				if body := n.find(presentationNamespace, "txBody"); body != nil && n.name.Local == "sp" {
					value = textIn(data[body.start:body.end])
				}
				slide.Objects = append(slide.Objects, ObjectIndex{ShapeID: id, Kind: n.name.Local, Text: value})
			}
			for _, c := range n.children {
				visit(c)
			}
		}
		visit(tree)
		if raw, ok := p.part(relsPartFor(part)); ok {
			rels, e := parseRelationships(raw)
			if e != nil {
				return result, e
			}
			for _, r := range rels {
				if strings.HasSuffix(r.Type, "/notesSlide") {
					name, e := resolveTarget(part, r.Target)
					if e != nil {
						return result, e
					}
					notes, _ := p.part(name)
					slide.Notes = textIn(notes)
				}
			}
		}
		result.Slides = append(result.Slides, slide)
	}
	return result, nil
}

// ApplyTextOperations uses the current package and checks the exact old text.
// Unrelated objects and slide order survive manual editing unchanged.
func ApplyTextOperations(contents []byte, operations []TextOperation) ([]byte, error) {
	index, err := Index(contents)
	if err != nil {
		return nil, err
	}
	p, err := openPackage(contents)
	if err != nil {
		return nil, err
	}
	if len(operations) == 0 || len(operations) > 2000 {
		return nil, fmt.Errorf("one to 2000 text operations required")
	}
	seen := map[string]bool{}
	for _, op := range operations {
		key := fmt.Sprintf("%d:%d", op.Position, op.ShapeID)
		if seen[key] {
			return nil, fmt.Errorf("duplicate text operation")
		}
		seen[key] = true
		if op.Position < 1 || op.Position > len(index.Slides) || len([]rune(op.Text)) > 10000 {
			return nil, fmt.Errorf("invalid text operation")
		}
		slide := index.Slides[op.Position-1]
		found := false
		for _, object := range slide.Objects {
			if object.ShapeID == op.ShapeID && object.Kind == "sp" && object.Text == op.ExpectedText {
				found = true
			}
		}
		if !found {
			return nil, fmt.Errorf("revision conflict: slide %d shape %d changed", op.Position, op.ShapeID)
		}
		data, _ := p.part(slide.Part)
		data, err = writeText(data, templatepublish.Slot{ShapeID: op.ShapeID}, strings.Split(op.Text, "\n"))
		if err != nil {
			return nil, err
		}
		p.setPart(slide.Part, data)
	}
	return p.bytes()
}
