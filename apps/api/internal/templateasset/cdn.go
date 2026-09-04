// Package templateasset retrieves immutable, digest-pinned presentation templates.
package templateasset

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"
)

const (
	PPTXContentType       = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	DefaultMaxAssetBytes  = int64(64 << 20)
	DefaultSignedURLTTL   = 15 * time.Minute
	defaultRequestTimeout = 30 * time.Second
)

var (
	ErrAssetTooLarge  = errors.New("template asset exceeds the byte limit")
	ErrDigestMismatch = errors.New("template asset SHA-256 mismatch")
	ErrFetchFailed    = errors.New("template asset request failed")
	ErrUnexpectedType = errors.New("template asset has an unexpected content type")
	keyNamePattern    = regexp.MustCompile(`^[A-Za-z0-9_-]{1,63}$`)
	assetIDPattern    = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,127}$`)
)

type Asset struct {
	ID      string
	Version int
	SHA256  string
}

type CDNFetcherConfig struct {
	BaseURL           string
	KeyName           string
	KeySecret         string
	TTL               time.Duration
	MaxBytes          int64
	Client            *http.Client
	allowExplicitPort bool
}

type CDNFetcher struct {
	baseURL  *url.URL
	keyName  string
	key      []byte
	ttl      time.Duration
	maxBytes int64
	client   *http.Client
	now      func() time.Time
}

func NewCDNFetcher(config CDNFetcherConfig) (*CDNFetcher, error) {
	baseURL, err := url.Parse(config.BaseURL)
	if err != nil || baseURL.Scheme != "https" || baseURL.Host == "" || baseURL.User != nil || baseURL.RawQuery != "" || baseURL.ForceQuery || baseURL.Fragment != "" || (baseURL.Port() != "" && !config.allowExplicitPort) {
		return nil, errors.New("CDN base URL must be an HTTPS origin without credentials, query, or fragment")
	}
	if !keyNamePattern.MatchString(config.KeyName) {
		return nil, errors.New("invalid Cloud CDN signing key name")
	}
	key, err := decodeSigningKey(config.KeySecret)
	if err != nil {
		return nil, err
	}
	if config.TTL <= 0 {
		config.TTL = DefaultSignedURLTTL
	}
	if config.MaxBytes <= 0 {
		config.MaxBytes = DefaultMaxAssetBytes
	}
	client := config.Client
	if client == nil {
		client = &http.Client{Timeout: defaultRequestTimeout}
	} else {
		clientCopy := *client
		client = &clientCopy
	}
	if client.Timeout <= 0 {
		client.Timeout = defaultRequestTimeout
	}
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return errors.New("template CDN redirects are not allowed")
	}
	return &CDNFetcher{
		baseURL:  baseURL,
		keyName:  config.KeyName,
		key:      key,
		ttl:      config.TTL,
		maxBytes: config.MaxBytes,
		client:   client,
		now:      time.Now,
	}, nil
}

func (fetcher *CDNFetcher) Fetch(ctx context.Context, asset Asset) ([]byte, error) {
	if err := validateAsset(asset); err != nil {
		return nil, err
	}
	signedURL := fetcher.signedURL(assetPath(asset), fetcher.now().Add(fetcher.ttl))
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, signedURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create template request: %w", err)
	}
	response, err := fetcher.client.Do(request)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return nil, fmt.Errorf("fetch template asset: %w", context.Canceled)
		}
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, fmt.Errorf("fetch template asset: %w", context.DeadlineExceeded)
		}
		return nil, ErrFetchFailed
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch template asset: unexpected HTTP status %d", response.StatusCode)
	}
	if response.ContentLength > fetcher.maxBytes {
		return nil, ErrAssetTooLarge
	}
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil || mediaType != PPTXContentType {
		return nil, ErrUnexpectedType
	}
	contents, err := io.ReadAll(io.LimitReader(response.Body, fetcher.maxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read template asset: %w", err)
	}
	if int64(len(contents)) > fetcher.maxBytes {
		return nil, ErrAssetTooLarge
	}
	digest := sha256.Sum256(contents)
	want, _ := hex.DecodeString(asset.SHA256)
	if subtle.ConstantTimeCompare(digest[:], want) != 1 {
		return nil, ErrDigestMismatch
	}
	return contents, nil
}

func (fetcher *CDNFetcher) signedURL(assetPath string, expires time.Time) string {
	resource := *fetcher.baseURL
	resource.Path = path.Join(fetcher.baseURL.Path, assetPath)
	unsigned := resource.String() + "?Expires=" + fmt.Sprintf("%d", expires.UTC().Unix()) + "&KeyName=" + url.QueryEscape(fetcher.keyName)
	mac := hmac.New(sha1.New, fetcher.key)
	_, _ = io.WriteString(mac, unsigned)
	return unsigned + "&Signature=" + base64.URLEncoding.EncodeToString(mac.Sum(nil))
}

func decodeSigningKey(value string) ([]byte, error) {
	key, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		key, err = base64.URLEncoding.DecodeString(value)
	}
	if err != nil || len(key) != 16 {
		return nil, errors.New("Cloud CDN signing key must be a base64url-encoded 16-byte secret")
	}
	return key, nil
}

func validateAsset(asset Asset) error {
	if !assetIDPattern.MatchString(asset.ID) || asset.Version <= 0 {
		return errors.New("invalid template asset identity")
	}
	if len(asset.SHA256) != sha256.Size*2 || asset.SHA256 != strings.ToLower(asset.SHA256) {
		return errors.New("invalid template asset SHA-256")
	}
	if _, err := hex.DecodeString(asset.SHA256); err != nil {
		return errors.New("invalid template asset SHA-256")
	}
	return nil
}

func assetPath(asset Asset) string {
	return fmt.Sprintf("pptx-templates/%s/%d/%s/template.pptx", asset.ID, asset.Version, asset.SHA256)
}
