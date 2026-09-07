package officeeditor

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/golang-jwt/jwt/v5"
)

type Config struct {
	// DocumentServerURL is the ONLYOFFICE Docs origin. The browser loads its
	// API script from here and the document server fetches decks from us.
	DocumentServerURL string
	// JWTSecret is the shared secret configured on the document server. Both
	// the editor configuration and the callback are signed with it.
	JWTSecret string
	// JWTHeader is the header the document server signs callbacks with.
	JWTHeader string
	// PublicAPIURL is the base URL the document server uses to reach this API.
	PublicAPIURL string
	// SourceTokenSecret signs the short-lived deck download URLs handed to the
	// document server. It defaults to JWTSecret.
	SourceTokenSecret string
	SourceTokenTTL    time.Duration
	MaxSaveBytes      int64
	Presentations     PresentationLookup
	Revisions         RevisionReader
	Documents         DocumentCommitter
	Objects           presentationrevision.ObjectStore
	Previews          PreviewScheduler
	Client            *http.Client
	Now               func() time.Time
}

type Service struct {
	documentServer *url.URL
	jwtSecret      []byte
	jwtHeader      string
	publicAPI      *url.URL
	sourceSecret   []byte
	sourceTTL      time.Duration
	maxSaveBytes   int64
	presentations  PresentationLookup
	revisions      RevisionReader
	documents      DocumentCommitter
	objects        presentationrevision.ObjectStore
	previews       PreviewScheduler
	client         *http.Client
	now            func() time.Time
}

func NewService(config Config) (*Service, error) {
	if config.Presentations == nil || config.Revisions == nil || config.Documents == nil || config.Objects == nil {
		return nil, errors.New("editor service requires presentation, revision, document, and object dependencies")
	}
	documentServer, err := absoluteURL(config.DocumentServerURL)
	if err != nil {
		return nil, fmt.Errorf("document server URL: %w", err)
	}
	publicAPI, err := absoluteURL(config.PublicAPIURL)
	if err != nil {
		return nil, fmt.Errorf("public API URL: %w", err)
	}
	if strings.TrimSpace(config.JWTSecret) == "" {
		return nil, errors.New("editor JWT secret is required")
	}
	sourceSecret := config.SourceTokenSecret
	if strings.TrimSpace(sourceSecret) == "" {
		sourceSecret = config.JWTSecret
	}
	service := &Service{
		documentServer: documentServer,
		jwtSecret:      []byte(config.JWTSecret),
		jwtHeader:      config.JWTHeader,
		publicAPI:      publicAPI,
		sourceSecret:   []byte(sourceSecret),
		sourceTTL:      config.SourceTokenTTL,
		maxSaveBytes:   config.MaxSaveBytes,
		presentations:  config.Presentations,
		revisions:      config.Revisions,
		documents:      config.Documents,
		objects:        config.Objects,
		previews:       config.Previews,
		client:         config.Client,
		now:            config.Now,
	}
	if service.jwtHeader == "" {
		service.jwtHeader = "Authorization"
	}
	if service.sourceTTL <= 0 {
		service.sourceTTL = DefaultSourceTokenTTL
	}
	if service.maxSaveBytes <= 0 {
		service.maxSaveBytes = DefaultMaxSaveBytes
	}
	if service.client == nil {
		service.client = &http.Client{Timeout: 2 * time.Minute}
	} else {
		copied := *service.client
		service.client = &copied
	}
	// A redirect would move the download off the trusted document server, so
	// the origin check is enforced by refusing to follow one at all.
	service.client.CheckRedirect = func(*http.Request, []*http.Request) error {
		return errRedirectNotAllowed
	}
	if service.now == nil {
		service.now = time.Now
	}
	return service, nil
}

type SessionRequest struct {
	PresentationID string
	UserID         string
	UserName       string
	ReadOnly       bool
}

type Session struct {
	DocumentServerURL string                              `json:"documentServerUrl"`
	DocumentKey       string                              `json:"documentKey"`
	Revision          presentationrevision.RevisionNumber `json:"revision"`
	Config            map[string]any                      `json:"config"`
}

// Session builds the signed editor configuration for one user, presentation,
// permission set, and base revision.
func (service *Service) Session(ctx context.Context, request SessionRequest) (Session, error) {
	presentation, found, err := service.presentations.OwnedPresentation(ctx, request.PresentationID, request.UserID)
	if err != nil {
		return Session{}, fmt.Errorf("read presentation for editor: %w", err)
	}
	if !found {
		return Session{}, ErrPresentationMissing
	}
	if presentation.Revision <= 0 {
		return Session{}, ErrNotEditable
	}
	revision, found, err := service.revisions.FindRevision(ctx, presentation.ID, presentation.Revision)
	if err != nil {
		return Session{}, fmt.Errorf("read revision for editor: %w", err)
	}
	if !found {
		return Session{}, ErrNotEditable
	}
	key := documentKey(presentation.ID, revision.Number)
	if !documentKeyPattern.MatchString(key) {
		return Session{}, fmt.Errorf("%w: unusable document key", ErrNotEditable)
	}
	mode := "edit"
	if request.ReadOnly {
		mode = "view"
	}
	configuration := map[string]any{
		"documentType": documentType,
		"type":         "desktop",
		"document": map[string]any{
			"fileType": fileType,
			"key":      key,
			"title":    documentTitle(presentation.Title),
			"url":      service.sourceURL(presentation.ID, revision.Number),
			"permissions": map[string]any{
				"edit":                 !request.ReadOnly,
				"download":             true,
				"print":                true,
				"comment":              false,
				"chat":                 false,
				"protect":              false,
				"fillForms":            false,
				"modifyContentControl": !request.ReadOnly,
			},
		},
		"editorConfig": map[string]any{
			"callbackUrl": service.callbackURL(presentation.ID),
			"lang":        "en",
			"mode":        mode,
			"user": map[string]any{
				"id":   request.UserID,
				"name": editorUserName(request.UserName),
			},
			"customization": map[string]any{
				"autosave":  true,
				"forcesave": true,
				"chat":      false,
				"comments":  false,
				"feedback":  false,
				"help":      false,
			},
		},
	}
	token, err := service.signConfig(configuration)
	if err != nil {
		return Session{}, err
	}
	configuration["token"] = token
	return Session{
		DocumentServerURL: service.documentServer.String(),
		DocumentKey:       key,
		Revision:          revision.Number,
		Config:            configuration,
	}, nil
}

func (service *Service) signConfig(configuration map[string]any) (string, error) {
	claims := jwt.MapClaims{}
	for key, value := range configuration {
		claims[key] = value
	}
	claims["exp"] = service.now().Add(service.sourceTTL).Unix()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(service.jwtSecret)
	if err != nil {
		return "", fmt.Errorf("sign editor configuration: %w", err)
	}
	return token, nil
}

// documentKey changes with every revision, which is how ONLYOFFICE knows a
// document has been replaced rather than reopened.
func documentKey(presentationID string, number presentationrevision.RevisionNumber) string {
	return fmt.Sprintf("%s-%d", presentationID, number)
}

func parseDocumentKey(key string) (string, presentationrevision.RevisionNumber, error) {
	separator := strings.LastIndex(key, "-")
	if !documentKeyPattern.MatchString(key) || separator <= 0 || separator == len(key)-1 {
		return "", 0, fmt.Errorf("%w: malformed document key", ErrInvalidCallback)
	}
	number, err := strconv.Atoi(key[separator+1:])
	if err != nil || number <= 0 {
		return "", 0, fmt.Errorf("%w: malformed document key revision", ErrInvalidCallback)
	}
	return key[:separator], presentationrevision.RevisionNumber(number), nil
}

func (service *Service) callbackURL(presentationID string) string {
	return service.publicAPI.JoinPath("presentations", presentationID, "editor", "callback").String()
}

// sourceURL is read-only, scoped to one revision, and short-lived. The document
// server fetches it once when the editor opens.
func (service *Service) sourceURL(presentationID string, number presentationrevision.RevisionNumber) string {
	expires := service.now().Add(service.sourceTTL).Unix()
	target := service.publicAPI.JoinPath("presentations", presentationID, "editor", "document")
	query := url.Values{}
	query.Set("revision", strconv.Itoa(int(number)))
	query.Set("expires", strconv.FormatInt(expires, 10))
	query.Set("signature", service.sourceSignature(presentationID, number, expires))
	target.RawQuery = query.Encode()
	return target.String()
}

func (service *Service) sourceSignature(presentationID string, number presentationrevision.RevisionNumber, expires int64) string {
	mac := hmac.New(sha256.New, service.sourceSecret)
	fmt.Fprintf(mac, "source|%s|%d|%d", presentationID, number, expires)
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (service *Service) verifySourceToken(presentationID, revision, expires, signature string) (presentationrevision.RevisionNumber, error) {
	number, err := strconv.Atoi(revision)
	if err != nil || number <= 0 {
		return 0, ErrInvalidToken
	}
	deadline, err := strconv.ParseInt(expires, 10, 64)
	if err != nil {
		return 0, ErrInvalidToken
	}
	if service.now().Unix() > deadline {
		return 0, fmt.Errorf("%w: expired", ErrInvalidToken)
	}
	expected := service.sourceSignature(presentationID, presentationrevision.RevisionNumber(number), deadline)
	if subtle.ConstantTimeCompare([]byte(expected), []byte(signature)) != 1 {
		return 0, ErrInvalidToken
	}
	return presentationrevision.RevisionNumber(number), nil
}

func absoluteURL(value string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSuffix(strings.TrimSpace(value), "/"))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return nil, errors.New("an absolute http or https URL is required")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("URL must not carry credentials, a query, or a fragment")
	}
	return parsed, nil
}

func documentTitle(title string) string {
	trimmed := strings.TrimSpace(title)
	if trimmed == "" {
		trimmed = "Untitled Presentation"
	}
	if len([]rune(trimmed)) > 120 {
		trimmed = string([]rune(trimmed)[:120])
	}
	return trimmed + ".pptx"
}

func editorUserName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "SlideSage user"
	}
	if len([]rune(trimmed)) > 60 {
		trimmed = string([]rune(trimmed)[:60])
	}
	return trimmed
}
