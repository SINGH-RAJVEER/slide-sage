package officeeditor

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/golang-jwt/jwt/v5"
)

// Callback is the subset of the ONLYOFFICE callback contract SlideSage acts on.
type Callback struct {
	Key    string   `json:"key"`
	Status int      `json:"status"`
	URL    string   `json:"url"`
	Users  []string `json:"users"`
	Token  string   `json:"token"`
}

// CallbackResult reports what the callback did. The document server only reads
// the acknowledgement, but the API logs and tests use this.
type CallbackResult struct {
	Committed bool
	Revision  presentationrevision.RevisionNumber
	Stale     bool
	Duplicate bool
}

// HandleCallback authenticates one document-server callback and, for a save,
// commits the assembled PPTX as a new immutable revision.
func (service *Service) HandleCallback(ctx context.Context, presentationID string, body []byte, authorization string) (CallbackResult, error) {
	callback, err := service.authenticateCallback(body, authorization)
	if err != nil {
		return CallbackResult{}, err
	}
	keyPresentationID, baseRevision, err := parseDocumentKey(callback.Key)
	if err != nil {
		return CallbackResult{}, err
	}
	if keyPresentationID != presentationID {
		return CallbackResult{}, fmt.Errorf("%w: document key names a different presentation", ErrInvalidCallback)
	}

	switch callback.Status {
	case statusEditing, statusClosedNoChange:
		return CallbackResult{}, nil
	case statusSaveFailed, statusForceSaveError:
		// The document server reports its own failure. There is nothing to
		// commit, and refusing the acknowledgement would only make it retry.
		log.Printf("editor reported a save failure for presentation %s revision %d", presentationID, baseRevision)
		return CallbackResult{}, nil
	case statusSaveReady, statusForceSave:
		return service.commitSave(ctx, presentationID, baseRevision, callback)
	default:
		return CallbackResult{}, fmt.Errorf("%w: unsupported status %d", ErrInvalidCallback, callback.Status)
	}
}

func (service *Service) commitSave(ctx context.Context, presentationID string, baseRevision presentationrevision.RevisionNumber, callback Callback) (CallbackResult, error) {
	presentation, found, err := service.presentations.Presentation(ctx, presentationID)
	if err != nil {
		return CallbackResult{}, fmt.Errorf("read presentation for editor save: %w", err)
	}
	if !found {
		return CallbackResult{}, ErrPresentationMissing
	}
	if err := service.verifyCallbackAuthor(callback, presentation); err != nil {
		return CallbackResult{}, err
	}
	base, found, err := service.revisions.FindRevision(ctx, presentationID, baseRevision)
	if err != nil {
		return CallbackResult{}, fmt.Errorf("read base revision for editor save: %w", err)
	}
	if !found {
		return CallbackResult{}, fmt.Errorf("%w: base revision does not exist", ErrInvalidCallback)
	}

	saved, err := service.downloadResult(ctx, callback.URL)
	if err != nil {
		return CallbackResult{}, err
	}
	digest := sha256.Sum256(saved)
	commit, err := service.documents.Commit(ctx, presentationrevision.CommitInput{
		PresentationID: presentationID,
		AuthorID:       presentation.OwnerID,
		Operation: presentationrevision.SourceOperation{
			// Two callbacks carrying the same bytes for the same base revision
			// are the same save, so a retried callback commits once.
			ID:   fmt.Sprintf("%s:%s:%s", Provider, callback.Key, hex.EncodeToString(digest[:])),
			Kind: presentationrevision.SourceOperationEditorSave,
		},
		ExpectedRevision: base.Number,
		PPTX:             bytes.NewReader(saved),
		MIMEType:         presentationrevision.PPTXContentType,
		EditorProvider:   Provider,
		BaseRevision:     &base.Number,
	})
	if err != nil {
		return CallbackResult{}, fmt.Errorf("commit editor save: %w", err)
	}
	result := CallbackResult{
		Committed: true,
		Revision:  commit.Revision.Number,
		Stale:     !commit.Advanced,
		Duplicate: commit.Duplicate,
	}
	if commit.Advanced && !commit.Duplicate {
		service.schedulePreviews(ctx, presentationID, commit.Revision.Number)
	}
	return result, nil
}

// verifyCallbackAuthor keeps a save scoped to the owner. Shared editing would
// need a per-session identity check here before it could be allowed.
func (service *Service) verifyCallbackAuthor(callback Callback, presentation Presentation) error {
	for _, user := range callback.Users {
		if user != "" && user != presentation.OwnerID {
			return fmt.Errorf("%w: save reported by a user who does not own the presentation", ErrInvalidCallback)
		}
	}
	return nil
}

func (service *Service) schedulePreviews(ctx context.Context, presentationID string, number presentationrevision.RevisionNumber) {
	if service.previews == nil {
		return
	}
	if err := service.previews.SchedulePreviews(ctx, presentationID, number); err != nil {
		// The revision is committed and downloadable; only the viewer images
		// are delayed, and the preview claim is retried from its pending state.
		log.Printf("scheduling previews for %s revision %d: %v", presentationID, number, err)
	}
}

func (service *Service) authenticateCallback(body []byte, authorization string) (Callback, error) {
	var callback Callback
	if err := json.Unmarshal(body, &callback); err != nil {
		return Callback{}, fmt.Errorf("%w: unreadable body", ErrInvalidCallback)
	}
	token := strings.TrimSpace(strings.TrimPrefix(authorization, "Bearer "))
	if token == "" {
		token = callback.Token
	}
	if token == "" {
		return Callback{}, fmt.Errorf("%w: callback is unsigned", ErrInvalidToken)
	}
	claims, err := service.parseToken(token)
	if err != nil {
		return Callback{}, err
	}
	// The signed claims, not the plain body, are the authoritative request. A
	// header token wraps them in "payload"; a body token carries them directly.
	if payload, ok := claims["payload"].(map[string]any); ok {
		claims = payload
	}
	signed, err := callbackFromClaims(claims)
	if err != nil {
		return Callback{}, err
	}
	return signed, nil
}

func (service *Service) parseToken(token string) (jwt.MapClaims, error) {
	claims := jwt.MapClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) {
		return service.jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil || !parsed.Valid {
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}
	return claims, nil
}

func callbackFromClaims(claims map[string]any) (Callback, error) {
	encoded, err := json.Marshal(claims)
	if err != nil {
		return Callback{}, fmt.Errorf("%w: unreadable claims", ErrInvalidToken)
	}
	var callback Callback
	if err := json.Unmarshal(encoded, &callback); err != nil {
		return Callback{}, fmt.Errorf("%w: unreadable claims", ErrInvalidToken)
	}
	if callback.Key == "" || callback.Status == 0 {
		return Callback{}, fmt.Errorf("%w: signed claims are incomplete", ErrInvalidToken)
	}
	return callback, nil
}

// downloadResult fetches the assembled document from the document server. Only
// that origin is trusted: the URL arrives inside the callback, so an attacker
// who could redirect it would otherwise choose the bytes SlideSage commits.
func (service *Service) downloadResult(ctx context.Context, rawURL string) ([]byte, error) {
	target, err := url.Parse(rawURL)
	if err != nil || target.Scheme == "" || target.Host == "" {
		return nil, fmt.Errorf("%w: unreadable result URL", ErrInvalidCallback)
	}
	if !sameOrigin(target, service.documentServer) {
		return nil, fmt.Errorf("%w: %s", ErrUntrustedResult, target.Host)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("build result request: %w", err)
	}
	response, err := service.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch editor result: %w", err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<20))
		_ = response.Body.Close()
	}()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch editor result: unexpected status %d", response.StatusCode)
	}
	contents, err := io.ReadAll(io.LimitReader(response.Body, service.maxSaveBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read editor result: %w", err)
	}
	if int64(len(contents)) > service.maxSaveBytes {
		return nil, ErrSaveTooLarge
	}
	if len(contents) == 0 {
		return nil, fmt.Errorf("%w: editor result is empty", ErrInvalidCallback)
	}
	return contents, nil
}

// sameOrigin compares scheme, host, and port. A redirect off the document
// server is rejected by the client's redirect policy, not here.
func sameOrigin(target, trusted *url.URL) bool {
	return strings.EqualFold(target.Scheme, trusted.Scheme) && strings.EqualFold(target.Host, trusted.Host)
}

var errRedirectNotAllowed = errors.New("editor result requests do not follow redirects")
