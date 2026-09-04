package templatepublish

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
)

// DefaultMaxPackageBytes bounds a single template package.
const DefaultMaxPackageBytes = int64(64 << 20)

// Uploader stores the published object. It must refuse to overwrite an existing
// key with different bytes. presentationrevision.GCSBlobStore satisfies it.
type Uploader interface {
	PutImmutable(ctx context.Context, key string, body io.Reader, size int64, contentType, sha256 string) error
}

// Input names one template to publish.
type Input struct {
	TemplateID string
	Version    int
	Source     io.Reader
	MaxBytes   int64
}

// Result is what publication produced for one template.
type Result struct {
	TemplateID string
	Version    int
	SHA256     string
	ByteSize   int64
	ObjectPath string
	Manifest   Manifest
	Package    []byte
}

// ObjectPath is the immutable, digest-pinned key a published package lives at.
func ObjectPath(templateID string, version int, sha256Hex string) string {
	return fmt.Sprintf("pptx-templates/%s/%d/%s/template.pptx", templateID, version, sha256Hex)
}

// Prepare sanitizes a package, hashes the sanitized bytes, and derives its
// manifest. It performs no I/O beyond reading the source.
func Prepare(input Input) (Result, error) {
	maxBytes := input.MaxBytes
	if maxBytes <= 0 {
		maxBytes = DefaultMaxPackageBytes
	}
	raw, err := readAll(input.Source, maxBytes)
	if err != nil {
		return Result{}, err
	}
	sanitized, err := Sanitize(raw)
	if err != nil {
		return Result{}, err
	}
	manifest, err := DeriveManifest(sanitized, input.TemplateID, input.Version)
	if err != nil {
		return Result{}, err
	}
	digest := sha256.Sum256(sanitized)
	sha := hex.EncodeToString(digest[:])
	manifest.SHA256 = sha

	return Result{
		TemplateID: input.TemplateID,
		Version:    input.Version,
		SHA256:     sha,
		ByteSize:   int64(len(sanitized)),
		ObjectPath: ObjectPath(input.TemplateID, input.Version, sha),
		Manifest:   manifest,
		Package:    sanitized,
	}, nil
}

// Publish prepares a package and uploads it to its digest-pinned key.
func Publish(ctx context.Context, input Input, uploader Uploader) (Result, error) {
	result, err := Prepare(input)
	if err != nil {
		return Result{}, err
	}
	if uploader == nil {
		return result, nil
	}
	err = uploader.PutImmutable(
		ctx,
		result.ObjectPath,
		bytes.NewReader(result.Package),
		result.ByteSize,
		PPTXContentType,
		result.SHA256,
	)
	if err != nil {
		return Result{}, fmt.Errorf("upload %s: %w", result.ObjectPath, err)
	}
	return result, nil
}

// DeriveManifest reads a sanitized package and describes its archetypes.
func DeriveManifest(contents []byte, templateID string, version int) (Manifest, error) {
	reader, err := zip.NewReader(bytes.NewReader(contents), int64(len(contents)))
	if err != nil {
		return Manifest{}, fmt.Errorf("%w: %v", ErrInvalidPackage, err)
	}
	pack, err := openPackage(reader)
	if err != nil {
		return Manifest{}, err
	}
	presentationPart, err := pack.presentationPart()
	if err != nil {
		return Manifest{}, err
	}
	slideParts, presentation, err := pack.slideParts(presentationPart)
	if err != nil {
		return Manifest{}, err
	}
	if len(slideParts) == 0 {
		return Manifest{}, fmt.Errorf("%w: package has no slides", ErrInvalidPackage)
	}

	archetypes := make([]Archetype, 0, len(slideParts))
	for index, partName := range slideParts {
		slideContents, readErr := pack.read(partName)
		if readErr != nil {
			return Manifest{}, readErr
		}
		var slide slideXML
		if xml.Unmarshal(slideContents, &slide) != nil {
			return Manifest{}, fmt.Errorf("%w: malformed slide %q", ErrInvalidPackage, partName)
		}
		archetype := deriveArchetype(index, partName, slide)
		if len(archetype.Slots) == 0 {
			continue
		}
		archetypes = append(archetypes, archetype)
	}
	if len(archetypes) == 0 {
		return Manifest{}, ErrNoArchetypes
	}
	// The last slide of a curated deck is conventionally a closing slide, and a
	// deck needs one that is not reused for body content.
	if last := &archetypes[len(archetypes)-1]; last.Role == RoleContent && len(archetypes) > 2 {
		last.Role = RoleClosing
		last.Repeatable = false
	}

	return Manifest{
		ManifestVersion: ManifestVersion,
		TemplateID:      templateID,
		TemplateVersion: version,
		WidthEMU:        presentation.SlideSize.CX,
		HeightEMU:       presentation.SlideSize.CY,
		SlideCount:      len(slideParts),
		CoverSlide:      1,
		Archetypes:      archetypes,
	}, nil
}
