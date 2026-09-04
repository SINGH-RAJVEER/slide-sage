package templatepublish

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"
)

// reproducibleModTime keeps published packages byte-identical across runs so a
// re-publication of unchanged input yields the same digest.
var reproducibleModTime = time.Date(1980, time.January, 1, 0, 0, 0, 0, time.UTC)

var authorElements = regexp.MustCompile(`(?s)<(dc:creator|cp:lastModifiedBy|cp:lastPrinted|cp:revision)>.*?</(dc:creator|cp:lastModifiedBy|cp:lastPrinted|cp:revision)>`)

// removablePart reports parts that carry authoring residue rather than design.
// Removing them cannot orphan a slide dependency.
func removablePart(name string) bool {
	lower := strings.ToLower(name)
	switch {
	case lower == "ppt/commentauthors.xml":
		return true
	case strings.HasPrefix(lower, "ppt/comments/"):
		return true
	case strings.HasPrefix(lower, "ppt/modifyverifier"):
		return true
	case strings.HasPrefix(lower, "_xmlsignatures/"):
		return true
	case strings.HasPrefix(lower, "customxml/"):
		return true
	case strings.HasPrefix(lower, "docprops/thumbnail"):
		return true
	case lower == "docprops/custom.xml":
		return true
	}
	return false
}

// rejectablePart reports parts that make a package unfit to publish at all.
func rejectablePart(name string) error {
	lower := strings.ToLower(name)
	switch {
	case strings.HasSuffix(lower, "vbaproject.bin"), strings.Contains(lower, "/macros/"):
		return ErrMacroEnabled
	case lower == "encryptioninfo", lower == "encryptedpackage":
		return ErrEncryptedPackage
	}
	return nil
}

// Sanitize rewrites a template package with authoring residue removed and
// deterministic archive metadata. It fails when the package carries macros,
// encryption, or an external relationship, rather than silently accepting them.
func Sanitize(source []byte) ([]byte, error) {
	reader, err := zip.NewReader(bytes.NewReader(source), int64(len(source)))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidPackage, err)
	}
	pack, err := openPackage(reader)
	if err != nil {
		return nil, err
	}

	dropped := map[string]bool{}
	for name := range pack.files {
		if err := rejectablePart(name); err != nil {
			return nil, fmt.Errorf("%w: %s", err, name)
		}
		if removablePart(name) {
			dropped[name] = true
		}
	}

	// A relationship to an outside host is an exfiltration and availability risk
	// once the package is compiled into user documents.
	for name := range pack.files {
		if !strings.Contains(name, "/_rels/") && name != "_rels/.rels" {
			continue
		}
		contents, readErr := pack.read(name)
		if readErr != nil {
			return nil, readErr
		}
		var rels relationshipsXML
		if xml.Unmarshal(contents, &rels) != nil {
			return nil, fmt.Errorf("%w: malformed %q", ErrInvalidPackage, name)
		}
		for _, rel := range rels.Relationships {
			if rel.TargetMode == "External" && !isHarmlessExternal(rel.Type) {
				return nil, fmt.Errorf("%w: %s -> %s", ErrExternalTarget, name, rel.Target)
			}
		}
	}

	names := make([]string, 0, len(pack.files))
	for name := range pack.files {
		if !dropped[name] {
			names = append(names, name)
		}
	}
	sort.Strings(names)

	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	for _, name := range names {
		contents, readErr := pack.read(name)
		if readErr != nil {
			return nil, readErr
		}
		switch {
		case name == "[Content_Types].xml":
			contents = pruneContentTypes(contents, dropped)
		case strings.Contains(name, "/_rels/") || name == "_rels/.rels":
			contents = pruneRelationships(contents, name, dropped)
		case strings.EqualFold(name, "docProps/core.xml"):
			contents = authorElements.ReplaceAll(contents, nil)
		}

		header := &zip.FileHeader{Name: name, Method: zip.Deflate, Modified: reproducibleModTime}
		entry, writeErr := writer.CreateHeader(header)
		if writeErr != nil {
			return nil, fmt.Errorf("write %q: %w", name, writeErr)
		}
		if _, writeErr = entry.Write(contents); writeErr != nil {
			return nil, fmt.Errorf("write %q: %w", name, writeErr)
		}
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("finalize package: %w", err)
	}
	return out.Bytes(), nil
}

// isHarmlessExternal allows the relationship types PowerPoint uses for ordinary
// hyperlinks, which do not fetch anything when a deck is opened.
func isHarmlessExternal(relType string) bool {
	return strings.HasSuffix(relType, "/hyperlink")
}

var (
	overridePattern     = regexp.MustCompile(`<Override[^>]*PartName="([^"]+)"[^>]*/>`)
	relationshipPattern = regexp.MustCompile(`<Relationship[^>]*/>`)
	targetPattern       = regexp.MustCompile(`Target="([^"]+)"`)
	targetModePattern   = regexp.MustCompile(`TargetMode="External"`)
)

func pruneContentTypes(contents []byte, dropped map[string]bool) []byte {
	return overridePattern.ReplaceAllFunc(contents, func(match []byte) []byte {
		found := overridePattern.FindSubmatch(match)
		if len(found) < 2 {
			return match
		}
		if dropped[strings.TrimPrefix(string(found[1]), "/")] {
			return nil
		}
		return match
	})
}

func pruneRelationships(contents []byte, relsName string, dropped map[string]bool) []byte {
	owner := path.Dir(path.Dir(relsName))
	if owner == "." {
		owner = ""
	}
	return relationshipPattern.ReplaceAllFunc(contents, func(match []byte) []byte {
		if targetModePattern.Match(match) {
			return match
		}
		found := targetPattern.FindSubmatch(match)
		if len(found) < 2 {
			return match
		}
		target := string(found[1])
		resolved := path.Clean(strings.TrimPrefix(target, "/"))
		if !strings.HasPrefix(target, "/") && owner != "" {
			resolved = path.Join(owner, target)
		}
		if dropped[resolved] {
			return nil
		}
		return match
	})
}

// readAll is a small helper so callers can hand Sanitize a stream.
func readAll(reader io.Reader, limit int64) ([]byte, error) {
	contents, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(contents)) > limit {
		return nil, ErrPackageTooLarge
	}
	return contents, nil
}
