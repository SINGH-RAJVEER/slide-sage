package presentationrevision

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/url"
	"path"
	"strings"
	"time"
)

const (
	DefaultMaxPPTXBytes    = int64(64 << 20)
	maxZipEntries          = 4096
	maxExpandedPPTXBytes   = uint64(512 << 20)
	maxCompressionRatio    = uint64(100)
	presentationPart       = "ppt/presentation.xml"
	presentationRelsPart   = "ppt/_rels/presentation.xml.rels"
	presentationMainType   = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"
	slideContentType       = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"
	presentationNamespace  = "http://schemas.openxmlformats.org/presentationml/2006/main"
	relationshipNamespace  = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
	slideRelationshipType  = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
	officeDocumentRelType  = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
	packageRelationshipsNS = "http://schemas.openxmlformats.org/package/2006/relationships"
	packageContentTypesNS  = "http://schemas.openxmlformats.org/package/2006/content-types"
)

type Service struct {
	repository RevisionRepository
	blobs      BlobStore
	maxBytes   int64
	now        func() time.Time
}

func NewService(repository RevisionRepository, blobs BlobStore, maxBytes int64) *Service {
	if maxBytes <= 0 {
		maxBytes = DefaultMaxPPTXBytes
	}
	return &Service{repository: repository, blobs: blobs, maxBytes: maxBytes, now: time.Now}
}

// Commit validates and stores one canonical PPTX, then asks the repository to
// allocate and commit its revision. ZIP and OPC mechanics stay internal.
func (s *Service) Commit(ctx context.Context, input CommitInput) (RepositoryCommit, error) {
	if err := validateLookupInput(input); err != nil {
		return RepositoryCommit{}, err
	}

	prior, found, err := s.repository.FindByOperation(ctx, input.PresentationID, input.Operation.ID)
	if err != nil {
		return RepositoryCommit{}, fmt.Errorf("find revision operation: %w", err)
	}
	if found {
		return RepositoryCommit{Revision: prior, Duplicate: true}, nil
	}
	if err := validateCommitInput(input); err != nil {
		return RepositoryCommit{}, err
	}

	current, err := s.repository.CurrentRevision(ctx, input.PresentationID)
	if err != nil {
		return RepositoryCommit{}, fmt.Errorf("read current presentation revision: %w", err)
	}
	if input.ExpectedRevision > current {
		return RepositoryCommit{}, ErrRevisionConflict
	}
	stale := current > input.ExpectedRevision
	if stale && input.Operation.Kind != SourceOperationEditorSave {
		return RepositoryCommit{}, ErrRevisionConflict
	}
	if input.BaseRevision != nil {
		base, found, err := s.repository.FindRevision(ctx, input.PresentationID, *input.BaseRevision)
		if err != nil {
			return RepositoryCommit{}, fmt.Errorf("read base presentation revision: %w", err)
		}
		if !found {
			return RepositoryCommit{}, fmt.Errorf("%w: base revision does not exist", ErrInvalidCommit)
		}
		input.TemplateID = base.TemplateID
		input.TemplateVersion = base.TemplateVersion
		input.TemplateSHA256 = base.TemplateSHA256
	}

	contents, err := readBounded(input.PPTX, s.maxBytes)
	if err != nil {
		return RepositoryCommit{}, err
	}
	slideCount, err := inspectPPTX(contents)
	if err != nil {
		return RepositoryCommit{}, err
	}
	if slideCount != input.ExpectedSlideCount {
		return RepositoryCommit{}, fmt.Errorf("%w: got %d, want %d", ErrSlideCountMismatch, slideCount, input.ExpectedSlideCount)
	}

	digest := sha256.Sum256(contents)
	digestString := hex.EncodeToString(digest[:])
	revision := Revision{
		PresentationID:  input.PresentationID,
		ObjectKey:       fmt.Sprintf("presentations/%s/objects/%s.pptx", input.PresentationID, digestString),
		SHA256:          digestString,
		ByteSize:        int64(len(contents)),
		SlideCount:      slideCount,
		MIMEType:        input.MIMEType,
		AuthorID:        input.AuthorID,
		SourceOperation: input.Operation,
		PreviewStatus:   PreviewPending,
		TemplateID:      input.TemplateID,
		TemplateVersion: input.TemplateVersion,
		TemplateSHA256:  input.TemplateSHA256,
		CompilerVersion: input.CompilerVersion,
		EditorProvider:  input.EditorProvider,
		BaseRevision:    input.BaseRevision,
		CreatedAt:       s.now().UTC(),
	}
	if err := s.blobs.PutImmutable(ctx, revision.ObjectKey, bytes.NewReader(contents), revision.ByteSize, revision.MIMEType, revision.SHA256); err != nil {
		return RepositoryCommit{}, fmt.Errorf("store presentation revision: %w", err)
	}

	committed, err := s.repository.CommitRevision(ctx, input.ExpectedRevision, revision)
	if err != nil {
		if errors.Is(err, ErrRevisionConflict) {
			return RepositoryCommit{}, ErrRevisionConflict
		}
		return RepositoryCommit{}, fmt.Errorf("commit presentation revision: %w", err)
	}
	return committed, nil
}

func validateLookupInput(input CommitInput) error {
	if strings.TrimSpace(input.PresentationID) == "" || strings.ContainsAny(input.PresentationID, "/\\") ||
		strings.TrimSpace(input.Operation.ID) == "" {
		return fmt.Errorf("%w: presentation ID and source operation ID are required", ErrInvalidCommit)
	}
	return nil
}

func validateCommitInput(input CommitInput) error {
	if strings.TrimSpace(input.AuthorID) == "" || !input.Operation.Kind.valid() {
		return fmt.Errorf("%w: author ID and a valid source operation are required", ErrInvalidCommit)
	}
	if input.ExpectedRevision < 0 {
		return fmt.Errorf("%w: expected revision cannot be negative", ErrInvalidCommit)
	}
	if input.ExpectedSlideCount <= 0 {
		return fmt.Errorf("%w: expected slide count must be positive", ErrInvalidCommit)
	}
	if input.PPTX == nil {
		return fmt.Errorf("%w: PPTX stream is required", ErrInvalidCommit)
	}
	if input.MIMEType != PPTXContentType {
		return fmt.Errorf("%w: PPTX content type is required", ErrInvalidCommit)
	}
	hasTemplateMetadata := input.TemplateID != "" || input.TemplateVersion != 0 || input.TemplateSHA256 != ""
	if hasTemplateMetadata && (input.TemplateID == "" || input.TemplateVersion <= 0 || !validSHA256(input.TemplateSHA256)) {
		return fmt.Errorf("%w: template ID, version, and SHA-256 must be supplied together", ErrInvalidCommit)
	}
	switch input.Operation.Kind {
	case SourceOperationGeneration:
		if !hasTemplateMetadata || input.CompilerVersion == "" || input.BaseRevision != nil || input.EditorProvider != "" {
			return fmt.Errorf("%w: generation requires template provenance and compiler version", ErrInvalidCommit)
		}
	case SourceOperationAIRevision:
		if hasTemplateMetadata || input.CompilerVersion == "" || input.BaseRevision == nil || *input.BaseRevision <= 0 || *input.BaseRevision != input.ExpectedRevision || input.EditorProvider != "" {
			return fmt.Errorf("%w: AI revisions require compiler version and a positive base revision", ErrInvalidCommit)
		}
	case SourceOperationEditorSave:
		if hasTemplateMetadata || input.EditorProvider == "" || input.BaseRevision == nil || *input.BaseRevision <= 0 || *input.BaseRevision != input.ExpectedRevision || input.CompilerVersion != "" {
			return fmt.Errorf("%w: editor saves require an editor provider and positive base revision", ErrInvalidCommit)
		}
	case SourceOperationImport:
		if input.EditorProvider != "" || input.BaseRevision != nil {
			return fmt.Errorf("%w: imports cannot have editor or base-revision provenance", ErrInvalidCommit)
		}
	}
	return nil
}

func validSHA256(value string) bool {
	if len(value) != sha256.Size*2 || value != strings.ToLower(value) {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func readBounded(reader io.Reader, maxBytes int64) ([]byte, error) {
	contents, err := io.ReadAll(io.LimitReader(reader, maxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read PPTX stream: %w", err)
	}
	if int64(len(contents)) > maxBytes {
		return nil, ErrPackageTooLarge
	}
	return contents, nil
}

type packageIndex struct {
	files         map[string]*zip.File
	contentTypes  map[string]string
	relationships map[string]map[string]packageRelationship
}

type packageRelationship struct {
	target  string
	typeURI string
}

func inspectPPTX(contents []byte) (int, error) {
	reader, err := zip.NewReader(bytes.NewReader(contents), int64(len(contents)))
	if err != nil {
		return 0, invalidPPTX(err)
	}
	index, err := indexPackage(reader)
	if err != nil {
		return 0, invalidPPTX(err)
	}
	if index.contentTypes[presentationPart] != presentationMainType {
		return 0, invalidPPTX(errors.New("presentation content type is missing"))
	}
	if !hasRelationship(index.relationships["_rels/.rels"], officeDocumentRelType, presentationPart) {
		return 0, invalidPPTX(errors.New("package root does not identify the presentation part"))
	}
	presentation := index.files[presentationPart]
	if presentation == nil || index.files[presentationRelsPart] == nil {
		return 0, invalidPPTX(errors.New("required presentation parts are missing"))
	}

	activeIDs, err := activeSlideRelationshipIDs(presentation)
	if err != nil {
		return 0, invalidPPTX(err)
	}
	if len(activeIDs) == 0 {
		return 0, invalidPPTX(errors.New("presentation contains no active slides"))
	}
	rels := index.relationships[presentationRelsPart]
	resolved := make(map[string]struct{}, len(activeIDs))
	for _, relationshipID := range activeIDs {
		relationship, ok := rels[relationshipID]
		if !ok || relationship.typeURI != slideRelationshipType {
			return 0, invalidPPTX(fmt.Errorf("active slide relationship %q is missing", relationshipID))
		}
		if _, duplicate := resolved[relationship.target]; duplicate {
			return 0, invalidPPTX(errors.New("active slides resolve to the same part"))
		}
		slide := index.files[relationship.target]
		if slide == nil || index.contentTypes[relationship.target] != slideContentType {
			return 0, invalidPPTX(fmt.Errorf("active slide part %q is missing or has the wrong content type", relationship.target))
		}
		if err := validateXMLRoot(slide, presentationNamespace, "sld"); err != nil {
			return 0, invalidPPTX(fmt.Errorf("active slide part %q: %w", relationship.target, err))
		}
		resolved[relationship.target] = struct{}{}
	}
	return len(resolved), nil
}

func indexPackage(reader *zip.Reader) (packageIndex, error) {
	if len(reader.File) == 0 || len(reader.File) > maxZipEntries {
		return packageIndex{}, errors.New("package has an invalid entry count")
	}
	index := packageIndex{
		files:         make(map[string]*zip.File, len(reader.File)),
		contentTypes:  make(map[string]string),
		relationships: make(map[string]map[string]packageRelationship),
	}
	seenNames := make(map[string]struct{}, len(reader.File))
	var expanded uint64
	for _, file := range reader.File {
		name, err := validatedPackageName(file.Name, file.FileInfo().IsDir())
		if err != nil {
			return packageIndex{}, err
		}
		foldedName := strings.ToLower(name)
		if _, duplicate := seenNames[foldedName]; duplicate {
			return packageIndex{}, fmt.Errorf("duplicate package part %q", name)
		}
		seenNames[foldedName] = struct{}{}
		if file.FileInfo().IsDir() {
			continue
		}
		if forbiddenPart(name) {
			return packageIndex{}, fmt.Errorf("forbidden package part %q", name)
		}
		if file.UncompressedSize64 > maxExpandedPPTXBytes-expanded {
			return packageIndex{}, errors.New("expanded package exceeds the byte limit")
		}
		expanded += file.UncompressedSize64
		if suspiciousCompression(file) {
			return packageIndex{}, fmt.Errorf("package part %q has a suspicious compression ratio", name)
		}
		if err := verifyPackagePart(file); err != nil {
			return packageIndex{}, fmt.Errorf("read package part %q: %w", name, err)
		}
		index.files[name] = file
	}

	contentTypesFile := index.files["[Content_Types].xml"]
	if contentTypesFile == nil {
		return packageIndex{}, errors.New("content types part is missing")
	}
	contentTypes, err := parseContentTypes(contentTypesFile, index.files)
	if err != nil {
		return packageIndex{}, err
	}
	index.contentTypes = contentTypes

	for name, file := range index.files {
		if strings.HasSuffix(strings.ToLower(name), ".xml") || strings.HasSuffix(strings.ToLower(name), ".rels") {
			if err := rejectDirectives(file); err != nil {
				return packageIndex{}, fmt.Errorf("inspect %q: %w", name, err)
			}
		}
		if strings.HasSuffix(strings.ToLower(name), ".rels") {
			relationships, err := parseRelationships(name, file)
			if err != nil {
				return packageIndex{}, fmt.Errorf("inspect %q: %w", name, err)
			}
			index.relationships[name] = relationships
		}
	}
	for relationshipPart, relationships := range index.relationships {
		for _, relationship := range relationships {
			if index.files[relationship.target] == nil {
				return packageIndex{}, fmt.Errorf("relationship in %q targets missing part %q", relationshipPart, relationship.target)
			}
		}
	}
	return index, nil
}

func verifyPackagePart(file *zip.File) error {
	opened, err := file.Open()
	if err != nil {
		return err
	}
	defer opened.Close()
	_, err = io.Copy(io.Discard, opened)
	return err
}

func hasRelationship(relationships map[string]packageRelationship, typeURI, target string) bool {
	for _, relationship := range relationships {
		if relationship.typeURI == typeURI && relationship.target == target {
			return true
		}
	}
	return false
}

func validatedPackageName(name string, directory bool) (string, error) {
	if name == "" || strings.Contains(name, "\\") || strings.HasPrefix(name, "/") {
		return "", errors.New("unsafe package path")
	}
	trimmed := strings.TrimSuffix(name, "/")
	decoded, err := url.PathUnescape(trimmed)
	if err != nil || decoded == "" || path.Clean(decoded) != decoded || hasParentSegment(decoded) {
		return "", errors.New("unsafe package path")
	}
	if directory && !strings.HasSuffix(name, "/") {
		return "", errors.New("invalid package directory")
	}
	return decoded, nil
}

func forbiddenPart(name string) bool {
	lower := strings.ToLower(name)
	return strings.HasSuffix(lower, "vbaproject.bin") || strings.Contains(lower, "/activex/") ||
		strings.Contains(lower, "/embeddings/") || strings.Contains(lower, "/oleobjects/") ||
		strings.HasPrefix(lower, "_xmlsignatures/") || strings.Contains(lower, "/_xmlsignatures/")
}

func suspiciousCompression(file *zip.File) bool {
	if file.UncompressedSize64 == 0 {
		return false
	}
	if file.CompressedSize64 == 0 {
		return true
	}
	return file.UncompressedSize64/file.CompressedSize64 > maxCompressionRatio
}

func parseContentTypes(file *zip.File, files map[string]*zip.File) (map[string]string, error) {
	type override struct {
		PartName    string `xml:"PartName,attr"`
		ContentType string `xml:"ContentType,attr"`
	}
	type defaultType struct {
		Extension   string `xml:"Extension,attr"`
		ContentType string `xml:"ContentType,attr"`
	}
	var document struct {
		XMLName   xml.Name      `xml:"Types"`
		Overrides []override    `xml:"Override"`
		Defaults  []defaultType `xml:"Default"`
	}
	if err := decodeXML(file, &document); err != nil {
		return nil, err
	}
	if document.XMLName.Space != packageContentTypesNS {
		return nil, errors.New("unexpected content types root")
	}
	overrides := make(map[string]string, len(document.Overrides))
	for _, item := range document.Overrides {
		name, err := validatedPackageName(strings.TrimPrefix(item.PartName, "/"), false)
		if err != nil || item.PartName == "" || item.ContentType == "" {
			return nil, errors.New("invalid content type override")
		}
		if _, duplicate := overrides[name]; duplicate {
			return nil, errors.New("duplicate content type override")
		}
		if forbiddenContentType(item.ContentType) {
			return nil, fmt.Errorf("forbidden content type %q", item.ContentType)
		}
		overrides[name] = item.ContentType
	}
	defaults := make(map[string]string, len(document.Defaults))
	for _, item := range document.Defaults {
		extension := strings.ToLower(strings.TrimPrefix(item.Extension, "."))
		if extension == "" || strings.ContainsAny(extension, "/\\") || item.ContentType == "" {
			return nil, errors.New("invalid default content type")
		}
		if _, duplicate := defaults[extension]; duplicate {
			return nil, errors.New("duplicate default content type")
		}
		if forbiddenContentType(item.ContentType) {
			return nil, fmt.Errorf("forbidden content type %q", item.ContentType)
		}
		defaults[extension] = item.ContentType
	}
	result := make(map[string]string, len(overrides))
	for name, contentType := range overrides {
		if files[name] == nil {
			return nil, fmt.Errorf("content type override names missing part %q", name)
		}
		result[name] = contentType
	}
	for part := range files {
		if part == "[Content_Types].xml" {
			continue
		}
		if _, ok := result[part]; ok {
			continue
		}
		contentType := defaults[strings.ToLower(strings.TrimPrefix(path.Ext(part), "."))]
		if contentType == "" {
			return nil, fmt.Errorf("package part %q has no content type", part)
		}
		result[part] = contentType
	}
	return result, nil
}

func forbiddenContentType(contentType string) bool {
	lower := strings.ToLower(contentType)
	return strings.Contains(lower, "macroenabled") || strings.Contains(lower, "vbaproject") ||
		strings.Contains(lower, "activex") || strings.Contains(lower, "oleobject") ||
		strings.Contains(lower, "digital-signature") || lower == "application/vnd.openxmlformats-officedocument.package"
}

func parseRelationships(relsName string, file *zip.File) (map[string]packageRelationship, error) {
	var document struct {
		XMLName       xml.Name `xml:"Relationships"`
		Relationships []struct {
			ID         string `xml:"Id,attr"`
			Type       string `xml:"Type,attr"`
			Target     string `xml:"Target,attr"`
			TargetMode string `xml:"TargetMode,attr"`
		} `xml:"Relationship"`
	}
	if err := decodeXML(file, &document); err != nil {
		return nil, err
	}
	if document.XMLName.Space != packageRelationshipsNS {
		return nil, errors.New("unexpected relationships root")
	}
	source, err := relationshipSourcePart(relsName)
	if err != nil {
		return nil, err
	}
	result := make(map[string]packageRelationship, len(document.Relationships))
	for _, relationship := range document.Relationships {
		if relationship.ID == "" || relationship.Type == "" || relationship.Target == "" {
			return nil, errors.New("relationship is missing required attributes")
		}
		if _, duplicate := result[relationship.ID]; duplicate {
			return nil, errors.New("duplicate relationship ID")
		}
		if relationship.TargetMode != "" && relationship.TargetMode != "Internal" {
			return nil, errors.New("external relationships are not allowed")
		}
		target, err := resolveRelationshipTarget(source, relationship.Target)
		if err != nil {
			return nil, err
		}
		result[relationship.ID] = packageRelationship{target: target, typeURI: relationship.Type}
	}
	return result, nil
}

func relationshipSourcePart(relsName string) (string, error) {
	directory := path.Dir(relsName)
	if path.Base(directory) != "_rels" || !strings.HasSuffix(relsName, ".rels") {
		return "", errors.New("invalid relationship part name")
	}
	base := strings.TrimSuffix(path.Base(relsName), ".rels")
	parent := path.Dir(directory)
	if parent == "." {
		parent = ""
	}
	return path.Join(parent, base), nil
}

func resolveRelationshipTarget(source, target string) (string, error) {
	parsed, err := url.Parse(target)
	if err != nil || parsed.Scheme != "" || parsed.Host != "" || parsed.Opaque != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("unsafe internal relationship target")
	}
	decoded, err := url.PathUnescape(parsed.Path)
	if err != nil || decoded == "" || strings.Contains(decoded, "\\") {
		return "", errors.New("unsafe internal relationship target")
	}
	if strings.HasPrefix(decoded, "/") {
		decoded = strings.TrimPrefix(decoded, "/")
	} else {
		decoded = path.Clean(path.Join(path.Dir(source), decoded))
	}
	if decoded == "" || decoded == "." || decoded == ".." || strings.HasPrefix(decoded, "../") {
		return "", errors.New("unsafe internal relationship target")
	}
	return path.Clean(decoded), nil
}

func hasParentSegment(value string) bool {
	for _, segment := range strings.Split(value, "/") {
		if segment == ".." || segment == "." || segment == "" {
			return true
		}
	}
	return false
}

func activeSlideRelationshipIDs(file *zip.File) ([]string, error) {
	decoder, closeFile, err := xmlDecoder(file)
	if err != nil {
		return nil, err
	}
	defer closeFile()
	var ids []string
	rootSeen := false
	listDepth := 0
	seen := make(map[string]struct{})
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			if !rootSeen {
				return nil, errors.New("presentation root is missing")
			}
			return ids, nil
		}
		if err != nil {
			return nil, err
		}
		switch element := token.(type) {
		case xml.Directive:
			return nil, errors.New("DTD directives are not allowed")
		case xml.StartElement:
			if !rootSeen {
				if element.Name.Space != presentationNamespace || element.Name.Local != "presentation" {
					return nil, errors.New("unexpected presentation root")
				}
				rootSeen = true
			}
			if element.Name.Space == presentationNamespace && element.Name.Local == "sldIdLst" {
				listDepth++
			} else if listDepth > 0 && element.Name.Space == presentationNamespace && element.Name.Local == "sldId" {
				var relationshipID string
				for _, attribute := range element.Attr {
					if attribute.Name.Space == relationshipNamespace && attribute.Name.Local == "id" {
						relationshipID = attribute.Value
					}
				}
				if relationshipID == "" {
					return nil, errors.New("active slide has no relationship ID")
				}
				if _, duplicate := seen[relationshipID]; duplicate {
					return nil, errors.New("duplicate active slide relationship ID")
				}
				seen[relationshipID] = struct{}{}
				ids = append(ids, relationshipID)
			}
		case xml.EndElement:
			if element.Name.Space == presentationNamespace && element.Name.Local == "sldIdLst" {
				listDepth--
			}
		}
	}
}

func rejectDirectives(file *zip.File) error {
	decoder, closeFile, err := xmlDecoder(file)
	if err != nil {
		return err
	}
	defer closeFile()
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		if _, directive := token.(xml.Directive); directive {
			return errors.New("DTD directives are not allowed")
		}
	}
}

func validateXMLRoot(file *zip.File, namespace, localName string) error {
	decoder, closeFile, err := xmlDecoder(file)
	if err != nil {
		return err
	}
	defer closeFile()
	for {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		switch element := token.(type) {
		case xml.Directive:
			return errors.New("DTD directives are not allowed")
		case xml.StartElement:
			if element.Name.Space != namespace || element.Name.Local != localName {
				return errors.New("unexpected XML root")
			}
			return nil
		}
	}
}

func decodeXML(file *zip.File, destination any) error {
	decoder, closeFile, err := xmlDecoder(file)
	if err != nil {
		return err
	}
	defer closeFile()
	return decoder.Decode(destination)
}

func xmlDecoder(file *zip.File) (*xml.Decoder, func(), error) {
	opened, err := file.Open()
	if err != nil {
		return nil, nil, err
	}
	return xml.NewDecoder(opened), func() { _ = opened.Close() }, nil
}

func invalidPPTX(err error) error {
	return fmt.Errorf("%w: %v", ErrInvalidPPTX, err)
}
