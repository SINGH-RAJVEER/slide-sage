package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type oauthState struct {
	Provider    string `json:"provider"`
	CallbackURL string `json:"callbackURL"`
	ExpiresAt   int64  `json:"expiresAt"`
}

func (service *Service) socialSignInHandler(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Provider    string `json:"provider"`
		CallbackURL string `json:"callbackURL"`
	}
	if !decodeJSON(writer, request, &body) {
		return
	}
	if body.Provider != "google" && body.Provider != "github" {
		writeError(writer, http.StatusBadRequest, "Unsupported social provider")
		return
	}
	callbackURL, err := service.safeCallbackURL(body.CallbackURL)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	clientID, _ := oauthCredentials(body.Provider)
	if clientID == "" {
		writeError(writer, http.StatusServiceUnavailable, "Social sign-in is not configured")
		return
	}
	state, err := service.encodeOAuthState(oauthState{Provider: body.Provider, CallbackURL: callbackURL, ExpiresAt: service.config.Now().Add(10 * time.Minute).Unix()})
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to start social sign-in")
		return
	}
	redirectURI := service.config.BaseURL + "/auth/callback/" + body.Provider
	query := url.Values{"client_id": {clientID}, "redirect_uri": {redirectURI}, "state": {state}}
	endpoint := "https://github.com/login/oauth/authorize"
	query.Set("scope", "read:user user:email")
	if body.Provider == "google" {
		endpoint = "https://accounts.google.com/o/oauth2/v2/auth"
		query.Set("scope", "openid email profile")
		query.Set("response_type", "code")
		query.Set("access_type", "offline")
	}
	writeJSON(writer, http.StatusOK, map[string]any{"url": endpoint + "?" + query.Encode(), "redirect": true})
}

func (service *Service) socialCallbackHandler(writer http.ResponseWriter, request *http.Request) {
	provider := request.PathValue("provider")
	state, err := service.decodeOAuthState(request.URL.Query().Get("state"))
	if err != nil || state.Provider != provider || service.config.Now().Unix() > state.ExpiresAt {
		writeError(writer, http.StatusBadRequest, "Invalid or expired OAuth state")
		return
	}
	code := strings.TrimSpace(request.URL.Query().Get("code"))
	if code == "" {
		writeError(writer, http.StatusBadRequest, "OAuth provider did not return a code")
		return
	}
	profile, err := service.fetchOAuthProfile(request, provider, code)
	if err != nil {
		writeError(writer, http.StatusBadGateway, "Social sign-in could not be completed")
		return
	}
	user, err := service.repository.UpsertOAuthUser(request.Context(), provider, profile.AccountID, profile.Name, profile.Email, profile.Image, profile.AccessToken, profile.RefreshToken, service.config.Now().UTC())
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "Social sign-in could not be completed")
		return
	}
	session, err := service.issueJWT(request.Context(), user.ID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to create session")
		return
	}
	service.setJWTCookie(writer, session)
	http.Redirect(writer, request, state.CallbackURL, http.StatusFound)
}

type oauthProfile struct{ AccountID, Name, Email, Image, AccessToken, RefreshToken string }

func (service *Service) fetchOAuthProfile(request *http.Request, provider, code string) (oauthProfile, error) {
	clientID, clientSecret := oauthCredentials(provider)
	redirectURI := service.config.BaseURL + "/auth/callback/" + provider
	form := url.Values{"client_id": {clientID}, "client_secret": {clientSecret}, "code": {code}, "redirect_uri": {redirectURI}}
	if provider == "google" {
		form.Set("grant_type", "authorization_code")
	}
	endpoint := "https://github.com/login/oauth/access_token"
	if provider == "google" {
		endpoint = "https://oauth2.googleapis.com/token"
	}
	tokenRequest, err := http.NewRequestWithContext(request.Context(), http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return oauthProfile{}, err
	}
	tokenRequest.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenRequest.Header.Set("Accept", "application/json")
	response, err := service.config.HTTPClient.Do(tokenRequest)
	if err != nil {
		return oauthProfile{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return oauthProfile{}, errors.New("OAuth token exchange failed")
	}
	var token struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err = json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&token); err != nil || token.AccessToken == "" {
		return oauthProfile{}, errors.New("OAuth token response is invalid")
	}
	profile := oauthProfile{AccessToken: token.AccessToken, RefreshToken: token.RefreshToken}
	profileURL := "https://api.github.com/user"
	if provider == "google" {
		profileURL = "https://openidconnect.googleapis.com/v1/userinfo"
	}
	profileRequest, _ := http.NewRequestWithContext(request.Context(), http.MethodGet, profileURL, nil)
	profileRequest.Header.Set("Authorization", "Bearer "+token.AccessToken)
	profileRequest.Header.Set("Accept", "application/json")
	profileResponse, err := service.config.HTTPClient.Do(profileRequest)
	if err != nil {
		return oauthProfile{}, err
	}
	defer profileResponse.Body.Close()
	if profileResponse.StatusCode < 200 || profileResponse.StatusCode >= 300 {
		return oauthProfile{}, errors.New("OAuth profile request failed")
	}
	if provider == "google" {
		var value struct {
			Subject       string `json:"sub"`
			Name          string `json:"name"`
			Email         string `json:"email"`
			Picture       string `json:"picture"`
			EmailVerified bool   `json:"email_verified"`
		}
		if err = json.NewDecoder(io.LimitReader(profileResponse.Body, 1<<20)).Decode(&value); err != nil || !value.EmailVerified {
			return oauthProfile{}, errors.New("Google email is not verified")
		}
		profile.AccountID, profile.Name, profile.Email, profile.Image = value.Subject, value.Name, normalizeEmail(value.Email), value.Picture
	} else {
		var value struct {
			ID        json.Number `json:"id"`
			Name      string      `json:"name"`
			Login     string      `json:"login"`
			Email     string      `json:"email"`
			AvatarURL string      `json:"avatar_url"`
		}
		decoder := json.NewDecoder(io.LimitReader(profileResponse.Body, 1<<20))
		decoder.UseNumber()
		if err = decoder.Decode(&value); err != nil {
			return oauthProfile{}, err
		}
		profile.AccountID, profile.Name, profile.Email, profile.Image = value.ID.String(), value.Name, normalizeEmail(value.Email), value.AvatarURL
		if profile.Name == "" {
			profile.Name = value.Login
		}
		if profile.Email == "" {
			profile.Email, err = service.githubEmail(request, token.AccessToken)
			if err != nil {
				return oauthProfile{}, err
			}
		}
	}
	if profile.AccountID == "" || profile.Name == "" || profile.Email == "" {
		return oauthProfile{}, errors.New("OAuth profile is incomplete")
	}
	return profile, nil
}

func (service *Service) githubEmail(request *http.Request, accessToken string) (string, error) {
	emailRequest, _ := http.NewRequestWithContext(request.Context(), http.MethodGet, "https://api.github.com/user/emails", nil)
	emailRequest.Header.Set("Authorization", "Bearer "+accessToken)
	emailRequest.Header.Set("Accept", "application/vnd.github+json")
	response, err := service.config.HTTPClient.Do(emailRequest)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&emails) != nil {
		return "", errors.New("GitHub email request failed")
	}
	for _, email := range emails {
		if email.Primary && email.Verified {
			return normalizeEmail(email.Email), nil
		}
	}
	for _, email := range emails {
		if email.Verified {
			return normalizeEmail(email.Email), nil
		}
	}
	return "", errors.New("GitHub account has no verified email")
}

func oauthCredentials(provider string) (string, string) {
	prefix := strings.ToUpper(provider)
	return strings.TrimSpace(os.Getenv(prefix + "_CLIENT_ID")), strings.TrimSpace(os.Getenv(prefix + "_CLIENT_SECRET"))
}

func (service *Service) safeCallbackURL(value string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("callbackURL must be an allowed absolute URL")
	}
	origin := parsed.Scheme + "://" + parsed.Host
	for _, allowed := range service.config.TrustedOrigins {
		if strings.TrimRight(allowed, "/") == origin {
			return parsed.String(), nil
		}
	}
	return "", errors.New("callbackURL origin is not allowed")
}

func (service *Service) encodeOAuthState(state oauthState) (string, error) {
	payload, err := json.Marshal(state)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(service.config.AuthSecret))
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func (service *Service) decodeOAuthState(value string) (oauthState, error) {
	encoded, signature, found := strings.Cut(value, ".")
	if !found {
		return oauthState{}, errors.New("invalid OAuth state")
	}
	actual, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil {
		return oauthState{}, err
	}
	mac := hmac.New(sha256.New, []byte(service.config.AuthSecret))
	_, _ = mac.Write([]byte(encoded))
	if subtle.ConstantTimeCompare(actual, mac.Sum(nil)) != 1 {
		return oauthState{}, errors.New("invalid OAuth state")
	}
	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return oauthState{}, err
	}
	var state oauthState
	if err = json.Unmarshal(payload, &state); err != nil {
		return oauthState{}, err
	}
	return state, nil
}
