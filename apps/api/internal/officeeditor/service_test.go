package officeeditor

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "editor-secret"

func TestSessionBuildsSignedConfiguration(t *testing.T) {
	fixture := newFixture(t, nil)

	session, err := fixture.service.Session(context.Background(), SessionRequest{
		PresentationID: "presentation-1", UserID: "user-1", UserName: "Rajveer",
	})
	if err != nil {
		t.Fatalf("Session() error = %v", err)
	}
	if session.DocumentKey != "presentation-1-7" || session.Revision != 7 {
		t.Fatalf("session key = %q revision = %d", session.DocumentKey, session.Revision)
	}
	document := session.Config["document"].(map[string]any)
	if document["fileType"] != fileType || document["title"] != "Quarterly review.pptx" {
		t.Fatalf("document = %+v", document)
	}
	if session.Config["documentType"] != documentType {
		t.Fatalf("documentType = %v", session.Config["documentType"])
	}
	editorConfig := session.Config["editorConfig"].(map[string]any)
	if editorConfig["mode"] != "edit" || editorConfig["callbackUrl"] != "https://api.example.test/presentations/presentation-1/editor/callback" {
		t.Fatalf("editorConfig = %+v", editorConfig)
	}

	token, ok := session.Config["token"].(string)
	if !ok || token == "" {
		t.Fatal("session configuration is unsigned")
	}
	claims := jwt.MapClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) { return []byte(testSecret), nil })
	if err != nil || !parsed.Valid {
		t.Fatalf("token parse error = %v", err)
	}
	if claims["documentType"] != documentType {
		t.Fatalf("signed claims = %+v", claims)
	}
}

func TestSessionRejectsPresentationWithoutRevision(t *testing.T) {
	fixture := newFixture(t, nil)
	fixture.presentations.presentation.Revision = 0

	_, err := fixture.service.Session(context.Background(), SessionRequest{PresentationID: "presentation-1", UserID: "user-1"})
	if !errors.Is(err, ErrNotEditable) {
		t.Fatalf("Session() error = %v, want ErrNotEditable", err)
	}
}

func TestSessionRejectsPresentationOwnedByAnotherUser(t *testing.T) {
	fixture := newFixture(t, nil)

	_, err := fixture.service.Session(context.Background(), SessionRequest{PresentationID: "presentation-1", UserID: "someone-else"})
	if !errors.Is(err, ErrPresentationMissing) {
		t.Fatalf("Session() error = %v, want ErrPresentationMissing", err)
	}
}

func TestSourceURLIsScopedAndExpires(t *testing.T) {
	fixture := newFixture(t, nil)
	session, err := fixture.service.Session(context.Background(), SessionRequest{PresentationID: "presentation-1", UserID: "user-1"})
	if err != nil {
		t.Fatalf("Session() error = %v", err)
	}
	document := session.Config["document"].(map[string]any)
	target, err := url.Parse(document["url"].(string))
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	query := target.Query()

	if _, err := fixture.service.verifySourceToken("presentation-1", query.Get("revision"), query.Get("expires"), query.Get("signature")); err != nil {
		t.Fatalf("verifySourceToken() error = %v", err)
	}
	if _, err := fixture.service.verifySourceToken("presentation-2", query.Get("revision"), query.Get("expires"), query.Get("signature")); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("token accepted for another presentation: %v", err)
	}
	if _, err := fixture.service.verifySourceToken("presentation-1", "6", query.Get("expires"), query.Get("signature")); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("token accepted for another revision: %v", err)
	}
	fixture.clock = fixture.clock.Add(DefaultSourceTokenTTL + time.Second)
	if _, err := fixture.service.verifySourceToken("presentation-1", query.Get("revision"), query.Get("expires"), query.Get("signature")); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expired token accepted: %v", err)
	}
}

func TestHandleCallbackCommitsSave(t *testing.T) {
	saved := []byte("edited pptx bytes")
	server := documentServer(t, saved)
	fixture := newFixture(t, server)

	result, err := fixture.service.HandleCallback(context.Background(), "presentation-1",
		callbackBody(t, "presentation-1-7", statusSaveReady, server.URL+"/cache/deck.pptx", "user-1"), "")
	if err != nil {
		t.Fatalf("HandleCallback() error = %v", err)
	}
	if !result.Committed || result.Revision != 8 || result.Stale {
		t.Fatalf("callback result = %+v", result)
	}
	commit := fixture.documents.input
	if commit.Operation.Kind != presentationrevision.SourceOperationEditorSave || commit.EditorProvider != Provider {
		t.Fatalf("commit input = %+v", commit)
	}
	if commit.ExpectedRevision != 7 || commit.BaseRevision == nil || *commit.BaseRevision != 7 {
		t.Fatalf("commit revisions = %d base = %v", commit.ExpectedRevision, commit.BaseRevision)
	}
	if commit.ExpectedSlideCount != 0 {
		t.Fatalf("editor save asserted %d slides; the editor may change the count", commit.ExpectedSlideCount)
	}
	digest := sha256.Sum256(saved)
	wantOperation := "onlyoffice:presentation-1-7:" + hex.EncodeToString(digest[:])
	if commit.Operation.ID != wantOperation {
		t.Fatalf("operation ID = %q, want %q", commit.Operation.ID, wantOperation)
	}
	if !bytes.Equal(fixture.documents.body, saved) {
		t.Fatalf("committed bytes = %q", fixture.documents.body)
	}
	if fixture.previews.scheduled != 8 {
		t.Fatalf("scheduled previews for revision %d, want 8", fixture.previews.scheduled)
	}
}

func TestHandleCallbackAcceptsHeaderToken(t *testing.T) {
	saved := []byte("edited pptx bytes")
	server := documentServer(t, saved)
	fixture := newFixture(t, server)
	payload := map[string]any{
		"key": "presentation-1-7", "status": statusForceSave,
		"url": server.URL + "/cache/deck.pptx", "users": []string{"user-1"},
	}
	token := signClaims(t, jwt.MapClaims{"payload": payload})

	result, err := fixture.service.HandleCallback(context.Background(), "presentation-1",
		mustJSON(t, payload), "Bearer "+token)
	if err != nil {
		t.Fatalf("HandleCallback() error = %v", err)
	}
	if !result.Committed {
		t.Fatalf("callback result = %+v", result)
	}
}

func TestHandleCallbackRejectsUnsignedBody(t *testing.T) {
	server := documentServer(t, []byte("edited"))
	fixture := newFixture(t, server)
	body := mustJSON(t, map[string]any{
		"key": "presentation-1-7", "status": statusSaveReady, "url": server.URL + "/cache/deck.pptx",
	})

	_, err := fixture.service.HandleCallback(context.Background(), "presentation-1", body, "")
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("HandleCallback() error = %v, want ErrInvalidToken", err)
	}
	if fixture.documents.calls != 0 {
		t.Fatal("an unsigned callback reached the document committer")
	}
}

func TestHandleCallbackTrustsSignedClaimsOverBody(t *testing.T) {
	server := documentServer(t, []byte("edited pptx bytes"))
	fixture := newFixture(t, server)
	signed := map[string]any{
		"key": "presentation-1-7", "status": statusSaveReady, "url": server.URL + "/cache/deck.pptx",
	}
	tampered := map[string]any{
		"key": "presentation-1-7", "status": statusSaveReady,
		"url": "https://attacker.test/deck.pptx", "token": signClaims(t, jwt.MapClaims(signed)),
	}

	if _, err := fixture.service.HandleCallback(context.Background(), "presentation-1", mustJSON(t, tampered), ""); err != nil {
		t.Fatalf("HandleCallback() error = %v", err)
	}
	if fixture.documents.calls != 1 {
		t.Fatalf("committer calls = %d, want the signed URL to be used", fixture.documents.calls)
	}
}

func TestHandleCallbackRejectsUntrustedResultURL(t *testing.T) {
	server := documentServer(t, []byte("edited"))
	fixture := newFixture(t, server)

	_, err := fixture.service.HandleCallback(context.Background(), "presentation-1",
		callbackBody(t, "presentation-1-7", statusSaveReady, "https://attacker.test/deck.pptx", "user-1"), "")
	if !errors.Is(err, ErrUntrustedResult) {
		t.Fatalf("HandleCallback() error = %v, want ErrUntrustedResult", err)
	}
}

func TestHandleCallbackRejectsKeyForAnotherPresentation(t *testing.T) {
	server := documentServer(t, []byte("edited"))
	fixture := newFixture(t, server)

	_, err := fixture.service.HandleCallback(context.Background(), "presentation-1",
		callbackBody(t, "presentation-2-7", statusSaveReady, server.URL+"/cache/deck.pptx", "user-1"), "")
	if !errors.Is(err, ErrInvalidCallback) {
		t.Fatalf("HandleCallback() error = %v, want ErrInvalidCallback", err)
	}
}

func TestHandleCallbackRejectsSaveFromAnotherUser(t *testing.T) {
	server := documentServer(t, []byte("edited"))
	fixture := newFixture(t, server)

	_, err := fixture.service.HandleCallback(context.Background(), "presentation-1",
		callbackBody(t, "presentation-1-7", statusSaveReady, server.URL+"/cache/deck.pptx", "intruder"), "")
	if !errors.Is(err, ErrInvalidCallback) {
		t.Fatalf("HandleCallback() error = %v, want ErrInvalidCallback", err)
	}
}

func TestHandleCallbackIgnoresNonSaveStatuses(t *testing.T) {
	server := documentServer(t, []byte("edited"))
	fixture := newFixture(t, server)

	for _, status := range []int{statusEditing, statusClosedNoChange, statusSaveFailed, statusForceSaveError} {
		result, err := fixture.service.HandleCallback(context.Background(), "presentation-1",
			callbackBody(t, "presentation-1-7", status, "", "user-1"), "")
		if err != nil || result.Committed {
			t.Fatalf("status %d: error = %v result = %+v", status, err, result)
		}
	}
	if fixture.documents.calls != 0 {
		t.Fatalf("committer calls = %d, want 0", fixture.documents.calls)
	}
}

func TestHandleCallbackRejectsOversizedSave(t *testing.T) {
	server := documentServer(t, bytes.Repeat([]byte("x"), 4096))
	fixture := newFixture(t, server)
	fixture.service.maxSaveBytes = 1024

	_, err := fixture.service.HandleCallback(context.Background(), "presentation-1",
		callbackBody(t, "presentation-1-7", statusSaveReady, server.URL+"/cache/deck.pptx", "user-1"), "")
	if !errors.Is(err, ErrSaveTooLarge) {
		t.Fatalf("HandleCallback() error = %v, want ErrSaveTooLarge", err)
	}
}

func TestHandleCallbackDoesNotFollowRedirects(t *testing.T) {
	attacker := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write([]byte("attacker deck"))
	}))
	t.Cleanup(attacker.Close)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		http.Redirect(writer, request, attacker.URL, http.StatusFound)
	}))
	t.Cleanup(server.Close)
	fixture := newFixture(t, server)

	_, err := fixture.service.HandleCallback(context.Background(), "presentation-1",
		callbackBody(t, "presentation-1-7", statusSaveReady, server.URL+"/cache/deck.pptx", "user-1"), "")
	if err == nil || !strings.Contains(err.Error(), "fetch editor result") {
		t.Fatalf("HandleCallback() error = %v, want a refused redirect", err)
	}
	if fixture.documents.calls != 0 {
		t.Fatal("a redirected download reached the document committer")
	}
}

func TestHandleCallbackReportsStaleSave(t *testing.T) {
	server := documentServer(t, []byte("edited pptx bytes"))
	fixture := newFixture(t, server)
	fixture.documents.advanced = false

	result, err := fixture.service.HandleCallback(context.Background(), "presentation-1",
		callbackBody(t, "presentation-1-7", statusSaveReady, server.URL+"/cache/deck.pptx", "user-1"), "")
	if err != nil {
		t.Fatalf("HandleCallback() error = %v", err)
	}
	if !result.Committed || !result.Stale {
		t.Fatalf("callback result = %+v, want a retained conflict revision", result)
	}
	if fixture.previews.scheduled != 0 {
		t.Fatal("a stale save scheduled previews it does not own")
	}
}

type fixture struct {
	service       *Service
	presentations *fakePresentations
	revisions     *fakeRevisions
	documents     *fakeDocuments
	previews      *fakePreviews
	clock         time.Time
}

func newFixture(t *testing.T, documentServer *httptest.Server) *fixture {
	t.Helper()
	serverURL := "https://documents.example.test"
	if documentServer != nil {
		serverURL = documentServer.URL
	}
	instance := &fixture{
		presentations: &fakePresentations{presentation: Presentation{
			ID: "presentation-1", OwnerID: "user-1", Title: "Quarterly review", Revision: 7,
		}},
		revisions: &fakeRevisions{revision: presentationrevision.Revision{
			PresentationID: "presentation-1", Number: 7, ObjectKey: "presentations/presentation-1/objects/deck.pptx",
			ByteSize: 17, SlideCount: 5, MIMEType: presentationrevision.PPTXContentType,
		}},
		documents: &fakeDocuments{advanced: true},
		previews:  &fakePreviews{},
		clock:     time.Now().UTC(),
	}
	service, err := NewService(Config{
		DocumentServerURL: serverURL,
		JWTSecret:         testSecret,
		PublicAPIURL:      "https://api.example.test",
		Presentations:     instance.presentations,
		Revisions:         instance.revisions,
		Documents:         instance.documents,
		Objects:           &fakeObjects{},
		Previews:          instance.previews,
		Now:               func() time.Time { return instance.clock },
	})
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	instance.service = service
	return instance
}

func documentServer(t *testing.T, contents []byte) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write(contents)
	}))
	t.Cleanup(server.Close)
	return server
}

func callbackBody(t *testing.T, key string, status int, resultURL, user string) []byte {
	t.Helper()
	claims := jwt.MapClaims{"key": key, "status": status, "url": resultURL, "users": []string{user}}
	payload := map[string]any{
		"key": key, "status": status, "url": resultURL, "users": []string{user},
		"token": signClaims(t, claims),
	}
	return mustJSON(t, payload)
}

func signClaims(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}
	return token
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	return encoded
}

type fakePresentations struct {
	presentation Presentation
}

func (fake *fakePresentations) OwnedPresentation(_ context.Context, presentationID, userID string) (Presentation, bool, error) {
	if presentationID != fake.presentation.ID || userID != fake.presentation.OwnerID {
		return Presentation{}, false, nil
	}
	return fake.presentation, true, nil
}

func (fake *fakePresentations) Presentation(_ context.Context, presentationID string) (Presentation, bool, error) {
	if presentationID != fake.presentation.ID {
		return Presentation{}, false, nil
	}
	return fake.presentation, true, nil
}

type fakeRevisions struct {
	revision presentationrevision.Revision
}

func (fake *fakeRevisions) FindRevision(_ context.Context, presentationID string, number presentationrevision.RevisionNumber) (presentationrevision.Revision, bool, error) {
	if presentationID != fake.revision.PresentationID || number != fake.revision.Number {
		return presentationrevision.Revision{}, false, nil
	}
	return fake.revision, true, nil
}

type fakeDocuments struct {
	input    presentationrevision.CommitInput
	body     []byte
	calls    int
	advanced bool
	err      error
}

func (fake *fakeDocuments) Commit(_ context.Context, input presentationrevision.CommitInput) (presentationrevision.RepositoryCommit, error) {
	fake.calls++
	if fake.err != nil {
		return presentationrevision.RepositoryCommit{}, fake.err
	}
	body, err := io.ReadAll(input.PPTX)
	if err != nil {
		return presentationrevision.RepositoryCommit{}, err
	}
	fake.body = body
	input.PPTX = nil
	fake.input = input
	return presentationrevision.RepositoryCommit{
		Revision: presentationrevision.Revision{PresentationID: input.PresentationID, Number: 8},
		Advanced: fake.advanced,
	}, nil
}

type fakePreviews struct {
	scheduled presentationrevision.RevisionNumber
}

func (fake *fakePreviews) SchedulePreviews(_ context.Context, _ string, number presentationrevision.RevisionNumber) error {
	fake.scheduled = number
	return nil
}

type fakeObjects struct{}

func (*fakeObjects) OpenObject(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("canonical pptx")), nil
}

func (*fakeObjects) PutImmutable(context.Context, string, io.Reader, int64, string, string) error {
	return nil
}
