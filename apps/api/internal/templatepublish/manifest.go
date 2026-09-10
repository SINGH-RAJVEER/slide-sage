package templatepublish

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
)

const (
	presentationNS  = "http://schemas.openxmlformats.org/presentationml/2006/main"
	drawingNS       = "http://schemas.openxmlformats.org/drawingml/2006/main"
	relationshipsNS = "http://schemas.openxmlformats.org/package/2006/relationships"
)

type relationshipsXML struct {
	Relationships []struct {
		ID         string `xml:"Id,attr"`
		Type       string `xml:"Type,attr"`
		Target     string `xml:"Target,attr"`
		TargetMode string `xml:"TargetMode,attr"`
	} `xml:"Relationship"`
}

type presentationXML struct {
	SlideSize struct {
		CX int64 `xml:"cx,attr"`
		CY int64 `xml:"cy,attr"`
	} `xml:"sldSz"`
	SlideIDList struct {
		SlideIDs []struct {
			RelID string `xml:"http://schemas.openxmlformats.org/officeDocument/2006/relationships id,attr"`
		} `xml:"sldId"`
	} `xml:"sldIdLst"`
}

type textBodyXML struct {
	Paragraphs []struct {
		Runs []struct {
			Text string `xml:"t"`
		} `xml:"r"`
	} `xml:"p"`
}

type shapeTreeXML struct {
	Shapes []struct {
		NvSpPr struct {
			CNvPr struct {
				ID   int    `xml:"id,attr"`
				Name string `xml:"name,attr"`
			} `xml:"cNvPr"`
			NvPr struct {
				Placeholder *struct {
					Type string `xml:"type,attr"`
					Idx  string `xml:"idx,attr"`
				} `xml:"ph"`
			} `xml:"nvPr"`
		} `xml:"nvSpPr"`
		TxBody *textBodyXML `xml:"txBody"`
	} `xml:"sp"`
	Pictures []struct {
		NvPicPr struct {
			CNvPr struct {
				ID   int    `xml:"id,attr"`
				Name string `xml:"name,attr"`
			} `xml:"cNvPr"`
		} `xml:"nvPicPr"`
	} `xml:"pic"`
	Frames []struct {
		NvGraphicFramePr struct {
			CNvPr struct {
				ID   int    `xml:"id,attr"`
				Name string `xml:"name,attr"`
			} `xml:"cNvPr"`
		} `xml:"nvGraphicFramePr"`
		Graphic struct {
			GraphicData struct {
				URI string `xml:"uri,attr"`
			} `xml:"graphicData"`
		} `xml:"graphic"`
	} `xml:"graphicFrame"`
	Groups []shapeTreeXML `xml:"grpSp"`
}

type slideXML struct {
	CSld struct {
		SpTree shapeTreeXML `xml:"spTree"`
	} `xml:"cSld"`
}

// pkg is an opened template package with its parts indexed by name.
type pkg struct {
	files map[string]*zip.File
}

func openPackage(reader *zip.Reader) (*pkg, error) {
	files := make(map[string]*zip.File, len(reader.File))
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		name := path.Clean(file.Name)
		if strings.HasPrefix(name, "..") || path.IsAbs(name) {
			return nil, fmt.Errorf("%w: part escapes the package: %q", ErrInvalidPackage, file.Name)
		}
		files[name] = file
	}
	if _, ok := files["[Content_Types].xml"]; !ok {
		return nil, fmt.Errorf("%w: missing [Content_Types].xml", ErrInvalidPackage)
	}
	// An OOXML package encrypted by PowerPoint is an OLE container, not a ZIP
	// with a content-types part, so reaching here already rules that out. A
	// package that still carries an encryption part is rejected outright.
	for name := range files {
		if strings.EqualFold(name, "EncryptionInfo") || strings.EqualFold(name, "EncryptedPackage") {
			return nil, ErrEncryptedPackage
		}
	}
	return &pkg{files: files}, nil
}

func (p *pkg) read(name string) ([]byte, error) {
	file, ok := p.files[name]
	if !ok {
		return nil, fmt.Errorf("%w: missing part %q", ErrInvalidPackage, name)
	}
	handle, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("open %q: %w", name, err)
	}
	defer handle.Close()
	return io.ReadAll(handle)
}

func (p *pkg) relationships(partName string) (relationshipsXML, error) {
	var parsed relationshipsXML
	relsName := path.Join(path.Dir(partName), "_rels", path.Base(partName)+".rels")
	if partName == "" {
		relsName = "_rels/.rels"
	}
	contents, err := p.read(relsName)
	if err != nil {
		return parsed, err
	}
	if err := xml.Unmarshal(contents, &parsed); err != nil {
		return parsed, fmt.Errorf("%w: malformed %q", ErrInvalidPackage, relsName)
	}
	return parsed, nil
}

// presentationPart resolves the office-document relationship from the package root.
func (p *pkg) presentationPart() (string, error) {
	rels, err := p.relationships("")
	if err != nil {
		return "", err
	}
	for _, rel := range rels.Relationships {
		if strings.HasSuffix(rel.Type, "/officeDocument") {
			return path.Clean(strings.TrimPrefix(rel.Target, "/")), nil
		}
	}
	return "", fmt.Errorf("%w: package has no office document", ErrInvalidPackage)
}

// slideParts returns slide part names in presentation order.
func (p *pkg) slideParts(presentationPart string) ([]string, presentationXML, error) {
	var presentation presentationXML
	contents, err := p.read(presentationPart)
	if err != nil {
		return nil, presentation, err
	}
	if err := xml.Unmarshal(contents, &presentation); err != nil {
		return nil, presentation, fmt.Errorf("%w: malformed presentation part", ErrInvalidPackage)
	}
	rels, err := p.relationships(presentationPart)
	if err != nil {
		return nil, presentation, err
	}
	byID := make(map[string]string, len(rels.Relationships))
	for _, rel := range rels.Relationships {
		if rel.TargetMode == "External" {
			continue
		}
		byID[rel.ID] = path.Join(path.Dir(presentationPart), rel.Target)
	}
	parts := make([]string, 0, len(presentation.SlideIDList.SlideIDs))
	for index, slideID := range presentation.SlideIDList.SlideIDs {
		target, ok := byID[slideID.RelID]
		if !ok {
			return nil, presentation, fmt.Errorf("%w: slide %d has no relationship", ErrInvalidPackage, index+1)
		}
		parts = append(parts, path.Clean(target))
	}
	return parts, presentation, nil
}

// flatten walks a shape tree, descending into groups.
func flatten(tree shapeTreeXML) shapeTreeXML {
	result := tree
	for _, group := range tree.Groups {
		nested := flatten(group)
		result.Shapes = append(result.Shapes, nested.Shapes...)
		result.Pictures = append(result.Pictures, nested.Pictures...)
		result.Frames = append(result.Frames, nested.Frames...)
	}
	result.Groups = nil
	return result
}

func paragraphTexts(body *textBodyXML) []string {
	if body == nil {
		return nil
	}
	texts := make([]string, 0, len(body.Paragraphs))
	for _, paragraph := range body.Paragraphs {
		var builder strings.Builder
		for _, run := range paragraph.Runs {
			builder.WriteString(run.Text)
		}
		texts = append(texts, builder.String())
	}
	return texts
}

// deriveArchetype inspects one source slide and produces its writable slots.
func deriveArchetype(index int, partName string, slide slideXML) Archetype {
	tree := flatten(slide.CSld.SpTree)

	slots := make([]Slot, 0, len(tree.Shapes))
	placeholders := map[string]bool{}
	for _, shape := range tree.Shapes {
		texts := paragraphTexts(shape.TxBody)
		if shape.TxBody == nil {
			continue
		}
		placeholder := ""
		if shape.NvSpPr.NvPr.Placeholder != nil {
			placeholder = shape.NvSpPr.NvPr.Placeholder.Type
			if placeholder == "" {
				placeholder = "body"
			}
			placeholders[placeholder] = true
		}

		sample := strings.TrimSpace(strings.Join(texts, "\n"))
		kind := SlotText
		listItems := 0
		if len(texts) > 1 {
			kind = SlotList
			listItems = len(texts)
		}

		longest := 0
		for _, text := range texts {
			if length := len([]rune(text)); length > longest {
				longest = length
			}
		}
		// Sample copy is a design budget, not a hard truth: allow generated copy
		// a little more room than the placeholder shipped with, but never
		// unbounded.
		limit := longest + longest/4 + 24

		slots = append(slots, Slot{
			ID:            slotID(shape.NvSpPr.CNvPr.Name, shape.NvSpPr.CNvPr.ID, placeholder),
			ShapeID:       shape.NvSpPr.CNvPr.ID,
			Placeholder:   placeholder,
			Kind:          kind,
			Required:      placeholder == "title" || placeholder == "ctrTitle",
			MaxCharacters: limit,
			MaxListItems:  listItems,
			SampleText:    sample,
		})
	}

	for _, picture := range tree.Pictures {
		slots = append(slots, Slot{
			ID:      slotID(picture.NvPicPr.CNvPr.Name, picture.NvPicPr.CNvPr.ID, ""),
			ShapeID: picture.NvPicPr.CNvPr.ID,
			Kind:    SlotImage,
		})
	}
	for _, frame := range tree.Frames {
		slots = append(slots, Slot{
			ID:      slotID(frame.NvGraphicFramePr.CNvPr.Name, frame.NvGraphicFramePr.CNvPr.ID, ""),
			ShapeID: frame.NvGraphicFramePr.CNvPr.ID,
			Kind:    frameKind(frame.Graphic.GraphicData.URI),
		})
	}

	sort.SliceStable(slots, func(i, j int) bool { return slots[i].ShapeID < slots[j].ShapeID })

	role := classify(index, placeholders, slots)
	return Archetype{
		ID:          fmt.Sprintf("slide-%d", index+1),
		Role:        role,
		SourceSlide: index + 1,
		PartName:    partName,
		Repeatable:  role == RoleContent,
		Slots:       slots,
	}
}

func frameKind(uri string) SlotKind {
	switch {
	case strings.HasSuffix(uri, "/table"):
		return SlotTable
	case strings.HasSuffix(uri, "/chart"):
		return SlotChart
	default:
		return SlotUnknown
	}
}

func slotID(name string, shapeID int, placeholder string) string {
	candidate := strings.ToLower(strings.TrimSpace(name))
	candidate = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			return r
		case r == ' ' || r == '_' || r == '-':
			return '-'
		default:
			return -1
		}
	}, candidate)
	candidate = strings.Trim(strings.ReplaceAll(candidate, "--", "-"), "-")
	if candidate == "" {
		candidate = placeholder
	}
	if candidate == "" {
		return fmt.Sprintf("shape-%d", shapeID)
	}
	return fmt.Sprintf("%s-%d", candidate, shapeID)
}

// classify assigns a narrative role from the placeholder mix and slide position.
func classify(index int, placeholders map[string]bool, slots []Slot) NarrativeRole {
	textSlots := 0
	for _, slot := range slots {
		if slot.Kind == SlotText || slot.Kind == SlotList {
			textSlots++
		}
	}
	switch {
	case index == 0, placeholders["ctrTitle"]:
		return RoleCover
	case textSlots <= 2 && !placeholders["body"]:
		return RoleSection
	default:
		return RoleContent
	}
}
