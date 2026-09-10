package pptxcompiler

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"
)

const (
	maxPartBytes    = int64(32 << 20)
	maxPackageParts = 4096
)

// reproducibleModTime is stamped on every emitted entry. Compiling the same
// template with the same content twice must produce identical bytes, because
// revisions are content-addressed: a timestamp would give every rebuild a new
// digest and a new stored object.
var reproducibleModTime = time.Date(1980, time.January, 1, 0, 0, 0, 0, time.UTC)

var (
	ErrPartMissing  = errors.New("template package is missing a required part")
	ErrPartTooLarge = errors.New("template package part exceeds the byte limit")
)

// pkg is a PPTX package held open for editing. Parts are kept as raw bytes so
// anything the compiler does not understand survives a round trip untouched.
type pkg struct {
	parts map[string][]byte
	// order preserves the reading order of parts so emitted archives stay
	// stable for callers that inspect them, independent of map iteration.
	order []string
}

func openPackage(contents []byte) (*pkg, error) {
	reader, err := zip.NewReader(bytes.NewReader(contents), int64(len(contents)))
	if err != nil {
		return nil, fmt.Errorf("read template package: %w", err)
	}
	if len(reader.File) > maxPackageParts {
		return nil, fmt.Errorf("template package holds %d parts, more than the %d allowed", len(reader.File), maxPackageParts)
	}
	loaded := &pkg{parts: make(map[string][]byte, len(reader.File))}
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		name, err := validatePartName(file.Name)
		if err != nil {
			return nil, err
		}
		if _, duplicate := loaded.parts[name]; duplicate {
			return nil, fmt.Errorf("template package declares part %q more than once", name)
		}
		body, err := readPart(file)
		if err != nil {
			return nil, err
		}
		loaded.parts[name] = body
		loaded.order = append(loaded.order, name)
	}
	if _, present := loaded.parts[contentTypesPart]; !present {
		return nil, fmt.Errorf("%w: %s", ErrPartMissing, contentTypesPart)
	}
	if _, present := loaded.parts[presentationPart]; !present {
		return nil, fmt.Errorf("%w: %s", ErrPartMissing, presentationPart)
	}
	return loaded, nil
}

func readPart(file *zip.File) ([]byte, error) {
	if file.UncompressedSize64 > uint64(maxPartBytes) {
		return nil, fmt.Errorf("%w: %s", ErrPartTooLarge, file.Name)
	}
	opened, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("open package part %s: %w", file.Name, err)
	}
	defer opened.Close()
	body, err := io.ReadAll(io.LimitReader(opened, maxPartBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read package part %s: %w", file.Name, err)
	}
	if int64(len(body)) > maxPartBytes {
		return nil, fmt.Errorf("%w: %s", ErrPartTooLarge, file.Name)
	}
	return body, nil
}

// validatePartName rejects the traversal and absolute paths a hostile package
// could use to make a part escape the archive when it is written out.
func validatePartName(name string) (string, error) {
	if name == "" || strings.HasPrefix(name, "/") || strings.Contains(name, `\`) {
		return "", fmt.Errorf("unsafe package part name %q", name)
	}
	for _, segment := range strings.Split(name, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return "", fmt.Errorf("unsafe package part name %q", name)
		}
	}
	return name, nil
}

func (p *pkg) part(name string) ([]byte, bool) {
	body, present := p.parts[name]
	return body, present
}

// mustPart returns a part or an error naming it, for the parts the compiler
// cannot proceed without.
func (p *pkg) mustPart(name string) ([]byte, error) {
	body, present := p.parts[name]
	if !present {
		return nil, fmt.Errorf("%w: %s", ErrPartMissing, name)
	}
	return body, nil
}

func (p *pkg) setPart(name string, body []byte) {
	if _, present := p.parts[name]; !present {
		p.order = append(p.order, name)
	}
	p.parts[name] = body
}

func (p *pkg) removePart(name string) {
	if _, present := p.parts[name]; !present {
		return
	}
	delete(p.parts, name)
	for index, existing := range p.order {
		if existing == name {
			p.order = append(p.order[:index], p.order[index+1:]...)
			break
		}
	}
}

// partNames lists the parts in a stable order.
func (p *pkg) partNames() []string {
	names := make([]string, len(p.order))
	copy(names, p.order)
	return names
}

// bytes serialises the package. Entries are sorted and carry a fixed timestamp
// so identical content always compiles to identical bytes.
func (p *pkg) bytes() ([]byte, error) {
	names := p.partNames()
	sort.Strings(names)

	var output bytes.Buffer
	archive := zip.NewWriter(&output)
	for _, name := range names {
		header := &zip.FileHeader{Name: name, Method: zip.Deflate, Modified: reproducibleModTime}
		entry, err := archive.CreateHeader(header)
		if err != nil {
			return nil, fmt.Errorf("create package part %s: %w", name, err)
		}
		if _, err := entry.Write(p.parts[name]); err != nil {
			return nil, fmt.Errorf("write package part %s: %w", name, err)
		}
	}
	if err := archive.Close(); err != nil {
		return nil, fmt.Errorf("close compiled package: %w", err)
	}
	return output.Bytes(), nil
}
