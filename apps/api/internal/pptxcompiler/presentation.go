package pptxcompiler

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// firstSlideID is where PowerPoint starts numbering slide IDs. The format
// requires them to be at least 256.
const firstSlideID = 256

// slideListBounds locates the p:sldIdLst element in presentation.xml.
//
// The element is found by local name rather than by a literal "p:sldIdLst" so a
// package using a different namespace prefix still works. Offsets are used to
// splice the replacement in, which leaves the rest of the part byte-identical:
// re-marshalling the whole presentation through encoding/xml would drop
// namespace declarations and attribute order that Office depends on.
func slideListBounds(contents []byte) (start, end int, err error) {
	decoder := xml.NewDecoder(bytes.NewReader(contents))
	depth := 0
	for {
		offsetBefore := decoder.InputOffset()
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, 0, fmt.Errorf("scan presentation part: %w", err)
		}
		switch element := token.(type) {
		case xml.StartElement:
			if element.Name.Local == "sldIdLst" && depth == 1 {
				start = int(offsetBefore)
				if err := decoder.Skip(); err != nil {
					return 0, 0, fmt.Errorf("scan slide list: %w", err)
				}
				return start, int(decoder.InputOffset()), nil
			}
			depth++
		case xml.EndElement:
			depth--
		}
	}
	return 0, 0, fmt.Errorf("presentation part declares no slide list")
}

// slideListPrefix reports the namespace prefix presentation.xml uses for the
// presentationml namespace, so a rewritten slide list matches the document.
func slideListPrefix(contents []byte) string {
	decoder := xml.NewDecoder(bytes.NewReader(contents))
	for {
		token, err := decoder.Token()
		if err != nil {
			return "p"
		}
		if element, ok := token.(xml.StartElement); ok {
			for _, attribute := range element.Attr {
				if attribute.Name.Space == "xmlns" && attribute.Value == presentationNamespace {
					return attribute.Name.Local
				}
			}
			return "p"
		}
	}
}

// relationshipPrefix reports the prefix bound to the relationship namespace,
// which the r:id attribute on each slide entry needs.
func relationshipPrefix(contents []byte) string {
	decoder := xml.NewDecoder(bytes.NewReader(contents))
	for {
		token, err := decoder.Token()
		if err != nil {
			return "r"
		}
		if element, ok := token.(xml.StartElement); ok {
			for _, attribute := range element.Attr {
				if attribute.Name.Space == "xmlns" && attribute.Value == relationshipNamespace {
					return attribute.Name.Local
				}
			}
			return "r"
		}
	}
}

// rewriteSlideList replaces the slide list with one entry per relationship ID,
// in order. Slide order in the deck is the order of this list.
func rewriteSlideList(contents []byte, relationshipIDs []string) ([]byte, error) {
	start, end, err := slideListBounds(contents)
	if err != nil {
		return nil, err
	}
	prefix := slideListPrefix(contents)
	relPrefix := relationshipPrefix(contents)

	var replacement strings.Builder
	replacement.WriteString("<" + prefix + ":sldIdLst>")
	for index, id := range relationshipIDs {
		replacement.WriteString("<" + prefix + ":sldId id=\"" +
			strconv.Itoa(firstSlideID+index) + "\" " + relPrefix + ":id=\"" + escapeAttribute(id) + "\"/>")
	}
	replacement.WriteString("</" + prefix + ":sldIdLst>")

	rewritten := make([]byte, 0, len(contents)+replacement.Len())
	rewritten = append(rewritten, contents[:start]...)
	rewritten = append(rewritten, replacement.String()...)
	rewritten = append(rewritten, contents[end:]...)
	return rewritten, nil
}
