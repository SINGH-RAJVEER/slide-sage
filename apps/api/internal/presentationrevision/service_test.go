package presentationrevision

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
)

func TestServiceCommit(t *testing.T) {
	repository := newMemoryRepository(2)
	blobs := newMemoryBlobStore()
	service := NewService(repository, blobs, 1<<20)
	pptx := testPPTX(t, 3)
	input := generationInput(bytes.NewReader(pptx), 2, 3)

	result, err := service.Commit(context.Background(), input)
	if err != nil {
		t.Fatalf("Commit() error = %v", err)
	}
	revision := result.Revision
	if !result.Advanced || result.Duplicate || revision.Number != 3 || revision.SlideCount != 3 || revision.ByteSize != int64(len(pptx)) {
		t.Fatalf("Commit() result = %+v", result)
	}
	wantKey := fmt.Sprintf("presentations/presentation-1/objects/%s.pptx", revision.SHA256)
	if revision.ObjectKey != wantKey {
		t.Fatalf("ObjectKey = %q, want %q", revision.ObjectKey, wantKey)
	}
	if revision.MIMEType != PPTXContentType || revision.PreviewStatus != PreviewPending {
		t.Fatalf("Commit() metadata = %+v", revision)
	}
	if !bytes.Equal(blobs.objects[wantKey], pptx) {
		t.Fatal("stored PPTX differs from committed input")
	}
}

func TestServiceCommitDuplicateOperationSkipsStorage(t *testing.T) {
	repository := newMemoryRepository(1)
	prior := Revision{PresentationID: "presentation-1", Number: 1, SourceOperation: SourceOperation{ID: "operation-1", Kind: SourceOperationImport}}
	repository.operations[operationKey(prior.PresentationID, prior.SourceOperation.ID)] = prior
	blobs := newMemoryBlobStore()
	service := NewService(repository, blobs, 1024)

	result, err := service.Commit(context.Background(), importInput(nil, 1, 1))
	if err != nil {
		t.Fatalf("Commit() error = %v", err)
	}
	if !result.Duplicate || result.Revision.Number != prior.Number {
		t.Fatalf("Commit() result = %+v", result)
	}
	assertNoWrites(t, blobs, repository)
}

func TestServiceCommitRetriesAfterRepositoryFailure(t *testing.T) {
	repository := newMemoryRepository(0)
	repository.commitErrors = []error{errors.New("database unavailable")}
	blobs := newMemoryBlobStore()
	service := NewService(repository, blobs, 1<<20)
	pptx := testPPTX(t, 1)

	_, firstErr := service.Commit(context.Background(), importInput(bytes.NewReader(pptx), 0, 1))
	if firstErr == nil || !strings.Contains(firstErr.Error(), "database unavailable") {
		t.Fatalf("first Commit() error = %v", firstErr)
	}
	result, err := service.Commit(context.Background(), importInput(bytes.NewReader(pptx), 0, 1))
	if err != nil {
		t.Fatalf("second Commit() error = %v", err)
	}
	if !result.Advanced || result.Revision.Number != 1 {
		t.Fatalf("second Commit() result = %+v", result)
	}
	if blobs.putCalls != 2 || len(blobs.objects) != 1 {
		t.Fatalf("blob calls = %d, objects = %d; want two idempotent calls and one object", blobs.putCalls, len(blobs.objects))
	}
}

func TestServiceCommitDifferentContentUsesDifferentKeys(t *testing.T) {
	blobs := newMemoryBlobStore()
	firstService := NewService(newMemoryRepository(0), blobs, 1<<20)
	secondService := NewService(newMemoryRepository(0), blobs, 1<<20)
	first, err := firstService.Commit(context.Background(), importInput(bytes.NewReader(testPPTX(t, 1)), 0, 1))
	if err != nil {
		t.Fatalf("first Commit() error = %v", err)
	}
	secondInput := importInput(bytes.NewReader(testPPTX(t, 2)), 0, 2)
	secondInput.Operation.ID = "operation-2"
	second, err := secondService.Commit(context.Background(), secondInput)
	if err != nil {
		t.Fatalf("second Commit() error = %v", err)
	}
	if first.Revision.ObjectKey == second.Revision.ObjectKey || len(blobs.objects) != 2 {
		t.Fatalf("different packages used keys %q and %q", first.Revision.ObjectKey, second.Revision.ObjectKey)
	}
}

func TestServiceCommitRejectsStaleNonEditorRevision(t *testing.T) {
	repository := newMemoryRepository(3)
	blobs := newMemoryBlobStore()
	service := NewService(repository, blobs, 1024)

	_, err := service.Commit(context.Background(), importInput(bytes.NewReader([]byte("not read")), 2, 1))
	if !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("Commit() error = %v, want ErrRevisionConflict", err)
	}
	assertNoWrites(t, blobs, repository)
}

func TestServiceCommitRejectsFutureEditorRevision(t *testing.T) {
	repository := newMemoryRepository(2)
	blobs := newMemoryBlobStore()
	service := NewService(repository, blobs, 1024)
	base := RevisionNumber(3)
	input := importInput(bytes.NewReader([]byte("not read")), 3, 1)
	input.Operation.Kind = SourceOperationEditorSave
	input.EditorProvider = "onlyoffice"
	input.BaseRevision = &base

	_, err := service.Commit(context.Background(), input)
	if !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("Commit() error = %v, want ErrRevisionConflict", err)
	}
	assertNoWrites(t, blobs, repository)
}

func TestServiceCommitRetainsStaleEditorSaveWithoutAdvancing(t *testing.T) {
	repository := newMemoryRepository(3)
	repository.revisions[2] = Revision{PresentationID: "presentation-1", Number: 2, TemplateID: "template-1", TemplateVersion: 4, TemplateSHA256: strings.Repeat("a", 64)}
	blobs := newMemoryBlobStore()
	service := NewService(repository, blobs, 1<<20)
	base := RevisionNumber(2)
	input := importInput(bytes.NewReader(testPPTX(t, 1)), 2, 1)
	input.Operation.Kind = SourceOperationEditorSave
	input.EditorProvider = "onlyoffice"
	input.BaseRevision = &base

	result, err := service.Commit(context.Background(), input)
	if err != nil {
		t.Fatalf("Commit() error = %v", err)
	}
	if result.Advanced || result.Revision.Number != 4 || repository.current != 3 {
		t.Fatalf("Commit() result = %+v, current = %d", result, repository.current)
	}
	if repository.revisions[4].ObjectKey == "" || result.Revision.TemplateID != "template-1" || result.Revision.TemplateVersion != 4 || blobs.putCalls != 1 {
		t.Fatal("stale editor revision was not retained")
	}
}

func TestServiceCommitRejectsWrongContentType(t *testing.T) {
	repository := newMemoryRepository(0)
	blobs := newMemoryBlobStore()
	service := NewService(repository, blobs, 1024)
	input := importInput(bytes.NewReader([]byte("not read")), 0, 1)
	input.MIMEType = "application/octet-stream"

	_, err := service.Commit(context.Background(), input)
	if !errors.Is(err, ErrInvalidCommit) {
		t.Fatalf("Commit() error = %v, want ErrInvalidCommit", err)
	}
	assertNoWrites(t, blobs, repository)
}

func TestServiceCommitRejectsMalformedPackage(t *testing.T) {
	assertInvalidPackage(t, []byte("not a zip"))
}

func TestServiceCommitRejectsDanglingActiveSlide(t *testing.T) {
	entries := minimalPPTXEntries(1)
	delete(entries, "ppt/slides/slide1.xml")
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitRejectsInvalidActiveSlideRoot(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["ppt/slides/slide1.xml"] = `<?xml version="1.0"?><foo/>`
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitRejectsExternalRelationship(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["_rels/.rels"] = relationshipsXML(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="https://example.com/deck.pptx" TargetMode="External"/>`)
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitRejectsMissingRelationshipTarget(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["ppt/slides/_rels/slide1.xml.rels"] = relationshipsXML(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/missing.png"/>`)
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitRejectsMissingRootPresentationRelationship(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["_rels/.rels"] = relationshipsXML("")
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitAcceptsExplicitInternalRelationship(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["_rels/.rels"] = relationshipsXML(`<Relationship Id="rId1" Type="` + officeDocumentRelType + `" Target="ppt/presentation.xml" TargetMode="Internal"/>`)
	repository := newMemoryRepository(0)
	service := NewService(repository, newMemoryBlobStore(), 1<<20)

	if _, err := service.Commit(context.Background(), importInput(bytes.NewReader(zipEntries(t, entries)), 0, 1)); err != nil {
		t.Fatalf("Commit() error = %v", err)
	}
}

func TestServiceCommitRejectsUndeclaredPartContentType(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["ppt/media/image.png"] = "image"
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitRejectsContentTypeForMissingPart(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["[Content_Types].xml"] = strings.Replace(entries["[Content_Types].xml"], "</Types>", `<Override PartName="/ppt/missing.xml" ContentType="application/xml"/></Types>`, 1)
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitRejectsUnsafePackagePath(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["../unsafe.xml"] = `<unsafe/>`
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitRejectsEncodedEmbeddedObjectPath(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["ppt/%65mbeddings/object.bin"] = "embedded"
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitRejectsDTDDirective(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["ppt/slides/slide1.xml"] = `<?xml version="1.0"?><!DOCTYPE foo><p:sld xmlns:p="` + presentationNamespace + `"><p:cSld><p:spTree/></p:cSld></p:sld>`
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitRejectsMacroPart(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["ppt/vbaProject.bin"] = "macro"
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitRejectsSuspiciousZIPExpansion(t *testing.T) {
	entries := minimalPPTXEntries(1)
	entries["ppt/media/repetitive.bin"] = strings.Repeat("0", 1<<20)
	assertInvalidPackage(t, zipEntries(t, entries))
}

func TestServiceCommitRejectsDuplicateParts(t *testing.T) {
	entries := minimalPPTXEntries(1)
	var output bytes.Buffer
	archive := zip.NewWriter(&output)
	for name, contents := range entries {
		writeZipFile(t, archive, name, contents)
	}
	writeZipFile(t, archive, "ppt/slides/slide1.xml", entries["ppt/slides/slide1.xml"])
	if err := archive.Close(); err != nil {
		t.Fatalf("close test PPTX: %v", err)
	}
	assertInvalidPackage(t, output.Bytes())
}

func TestServiceCommitRejectsOversizeInput(t *testing.T) {
	repository := newMemoryRepository(0)
	blobs := newMemoryBlobStore()
	service := NewService(repository, blobs, 8)

	_, err := service.Commit(context.Background(), importInput(bytes.NewReader(make([]byte, 9)), 0, 1))
	if !errors.Is(err, ErrPackageTooLarge) {
		t.Fatalf("Commit() error = %v, want ErrPackageTooLarge", err)
	}
	assertNoWrites(t, blobs, repository)
}

func TestServiceCommitRejectsSlideCountMismatch(t *testing.T) {
	repository := newMemoryRepository(0)
	blobs := newMemoryBlobStore()
	service := NewService(repository, blobs, 1<<20)

	_, err := service.Commit(context.Background(), importInput(bytes.NewReader(testPPTX(t, 2)), 0, 3))
	if !errors.Is(err, ErrSlideCountMismatch) {
		t.Fatalf("Commit() error = %v, want ErrSlideCountMismatch", err)
	}
	assertNoWrites(t, blobs, repository)
}

func TestServiceCommitStorageFailureDoesNotCommitRepository(t *testing.T) {
	repository := newMemoryRepository(0)
	blobs := newMemoryBlobStore()
	blobs.putError = errors.New("storage unavailable")
	service := NewService(repository, blobs, 1<<20)

	_, err := service.Commit(context.Background(), importInput(bytes.NewReader(testPPTX(t, 1)), 0, 1))
	if err == nil || !errors.Is(err, blobs.putError) {
		t.Fatalf("Commit() error = %v, want storage error", err)
	}
	if repository.commitCalls != 0 {
		t.Fatalf("repository commits = %d, want 0", repository.commitCalls)
	}
}

func generationInput(pptx io.Reader, expected RevisionNumber, slides int) CommitInput {
	return CommitInput{
		PresentationID:     "presentation-1",
		AuthorID:           "user-1",
		Operation:          SourceOperation{ID: "operation-1", Kind: SourceOperationGeneration},
		ExpectedRevision:   expected,
		ExpectedSlideCount: slides,
		PPTX:               pptx,
		MIMEType:           PPTXContentType,
		TemplateID:         "template-1",
		TemplateVersion:    4,
		TemplateSHA256:     strings.Repeat("a", 64),
		CompilerVersion:    "compiler-1",
	}
}

func importInput(pptx io.Reader, expected RevisionNumber, slides int) CommitInput {
	return CommitInput{
		PresentationID:     "presentation-1",
		AuthorID:           "user-1",
		Operation:          SourceOperation{ID: "operation-1", Kind: SourceOperationImport},
		ExpectedRevision:   expected,
		ExpectedSlideCount: slides,
		PPTX:               pptx,
		MIMEType:           PPTXContentType,
	}
}

func assertInvalidPackage(t *testing.T, contents []byte) {
	t.Helper()
	repository := newMemoryRepository(0)
	blobs := newMemoryBlobStore()
	service := NewService(repository, blobs, int64(len(contents)+1024))
	_, err := service.Commit(context.Background(), importInput(bytes.NewReader(contents), 0, 1))
	if !errors.Is(err, ErrInvalidPPTX) {
		t.Fatalf("Commit() error = %v, want ErrInvalidPPTX", err)
	}
	assertNoWrites(t, blobs, repository)
}

func testPPTX(t *testing.T, slideCount int) []byte {
	t.Helper()
	return zipEntries(t, minimalPPTXEntries(slideCount))
}

func minimalPPTXEntries(slideCount int) map[string]string {
	entries := map[string]string{
		"[Content_Types].xml": contentTypesXML(slideCount),
		"_rels/.rels":         relationshipsXML(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>`),
	}
	var slideIDs, slideRelationships strings.Builder
	for index := 1; index <= slideCount; index++ {
		fmt.Fprintf(&slideIDs, `<p:sldId id="%d" r:id="rId%d"/>`, 255+index, index)
		fmt.Fprintf(&slideRelationships, `<Relationship Id="rId%d" Type="%s" Target="slides/slide%d.xml"/>`, index, slideRelationshipType, index)
		entries[fmt.Sprintf("ppt/slides/slide%d.xml", index)] = `<?xml version="1.0"?><p:sld xmlns:p="` + presentationNamespace + `"><p:cSld><p:spTree/></p:cSld></p:sld>`
	}
	entries[presentationPart] = `<?xml version="1.0"?><p:presentation xmlns:p="` + presentationNamespace + `" xmlns:r="` + relationshipNamespace + `"><p:sldIdLst>` + slideIDs.String() + `</p:sldIdLst></p:presentation>`
	entries[presentationRelsPart] = relationshipsXML(slideRelationships.String())
	return entries
}

func contentTypesXML(slideCount int) string {
	var overrides strings.Builder
	overrides.WriteString(`<Override PartName="/ppt/presentation.xml" ContentType="` + presentationMainType + `"/>`)
	for index := 1; index <= slideCount; index++ {
		fmt.Fprintf(&overrides, `<Override PartName="/ppt/slides/slide%d.xml" ContentType="%s"/>`, index, slideContentType)
	}
	return `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` + overrides.String() + `</Types>`
}

func relationshipsXML(contents string) string {
	return `<?xml version="1.0"?><Relationships xmlns="` + packageRelationshipsNS + `">` + contents + `</Relationships>`
}

func zipEntries(t *testing.T, entries map[string]string) []byte {
	t.Helper()
	var output bytes.Buffer
	archive := zip.NewWriter(&output)
	for name, contents := range entries {
		writeZipFile(t, archive, name, contents)
	}
	if err := archive.Close(); err != nil {
		t.Fatalf("close test PPTX: %v", err)
	}
	return output.Bytes()
}

func writeZipFile(t *testing.T, archive *zip.Writer, name, contents string) {
	t.Helper()
	file, err := archive.Create(name)
	if err != nil {
		t.Fatalf("create ZIP entry: %v", err)
	}
	if _, err := io.WriteString(file, contents); err != nil {
		t.Fatalf("write ZIP entry: %v", err)
	}
}

type memoryBlobStore struct {
	objects  map[string][]byte
	putError error
	putCalls int
}

func newMemoryBlobStore() *memoryBlobStore {
	return &memoryBlobStore{objects: make(map[string][]byte)}
}

func (store *memoryBlobStore) PutImmutable(_ context.Context, key string, body io.Reader, size int64, _, _ string) error {
	store.putCalls++
	if store.putError != nil {
		return store.putError
	}
	contents, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	if int64(len(contents)) != size {
		return errors.New("blob size mismatch")
	}
	if existing, found := store.objects[key]; found {
		if bytes.Equal(existing, contents) {
			return nil
		}
		return errors.New("immutable object contains different bytes")
	}
	store.objects[key] = contents
	return nil
}

type memoryRepository struct {
	current      RevisionNumber
	next         RevisionNumber
	revisions    map[RevisionNumber]Revision
	operations   map[string]Revision
	commitErrors []error
	commitCalls  int
}

func newMemoryRepository(current RevisionNumber) *memoryRepository {
	return &memoryRepository{
		current:    current,
		next:       current,
		revisions:  make(map[RevisionNumber]Revision),
		operations: make(map[string]Revision),
	}
}

func (repository *memoryRepository) FindByOperation(_ context.Context, presentationID, operationID string) (Revision, bool, error) {
	revision, found := repository.operations[operationKey(presentationID, operationID)]
	return revision, found, nil
}

func (repository *memoryRepository) FindRevision(_ context.Context, _ string, number RevisionNumber) (Revision, bool, error) {
	revision, found := repository.revisions[number]
	return revision, found, nil
}

func (repository *memoryRepository) CurrentRevision(_ context.Context, _ string) (RevisionNumber, error) {
	return repository.current, nil
}

func (repository *memoryRepository) CommitRevision(_ context.Context, expected RevisionNumber, revision Revision) (RepositoryCommit, error) {
	repository.commitCalls++
	key := operationKey(revision.PresentationID, revision.SourceOperation.ID)
	if prior, found := repository.operations[key]; found {
		return RepositoryCommit{Revision: prior, Duplicate: true}, nil
	}
	if len(repository.commitErrors) > 0 {
		err := repository.commitErrors[0]
		repository.commitErrors = repository.commitErrors[1:]
		return RepositoryCommit{}, err
	}
	if expected > repository.current {
		return RepositoryCommit{}, ErrRevisionConflict
	}
	stale := repository.current > expected
	if stale && revision.SourceOperation.Kind != SourceOperationEditorSave {
		return RepositoryCommit{}, ErrRevisionConflict
	}
	repository.next++
	revision.Number = repository.next
	repository.revisions[revision.Number] = revision
	repository.operations[key] = revision
	if stale {
		return RepositoryCommit{Revision: revision}, nil
	}
	repository.current = revision.Number
	return RepositoryCommit{Revision: revision, Advanced: true}, nil
}

func operationKey(presentationID, operationID string) string {
	return presentationID + "/" + operationID
}

func assertNoWrites(t *testing.T, blobs *memoryBlobStore, repository *memoryRepository) {
	t.Helper()
	if blobs.putCalls != 0 {
		t.Fatalf("blob writes = %d, want 0", blobs.putCalls)
	}
	if repository.commitCalls != 0 {
		t.Fatalf("repository commits = %d, want 0", repository.commitCalls)
	}
}
