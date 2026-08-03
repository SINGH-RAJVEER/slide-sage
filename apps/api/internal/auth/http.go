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
	"strings"
)

func RegisterAuthRoutes(mux *http.ServeMux, service *Service) {
	mux.HandleFunc("POST /auth/sign-up/email", service.signUpHandler)
	mux.HandleFunc("POST /auth/sign-in/email", service.signInHandler)
	mux.HandleFunc("POST /auth/sign-out", service.signOutHandler)
	mux.HandleFunc("GET /auth/get-session", service.getSessionHandler)
	mux.HandleFunc("POST /auth/email-otp/send-verification-otp", service.sendVerificationOTPHandler)
	mux.HandleFunc("POST /auth/email-otp/verify-email", service.verifyAccountEmailHandler)
	mux.HandleFunc("POST /auth/email-otp/request-password-reset", service.requestPasswordResetHandler)
	mux.HandleFunc("POST /auth/email-otp/reset-password", service.resetPasswordHandler)
	mux.HandleFunc("POST /auth/sign-in/social", service.socialSignInHandler)
	mux.HandleFunc("GET /auth/callback/{provider}", service.socialCallbackHandler)
}

func (service *Service) sendVerificationOTPHandler(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Email string `json:"email"`
		Type  string `json:"type"`
	}
	if !decodeJSON(writer, request, &body) {
		return
	}
	if body.Type != "" && body.Type != "email-verification" {
		writeError(writer, http.StatusBadRequest, "Unsupported verification type")
		return
	}
	if err := service.SendVerificationOTP(request.Context(), body.Email); err != nil {
		writeServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]bool{"success": true})
}

func (service *Service) verifyAccountEmailHandler(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Email string `json:"email"`
		OTP   string `json:"otp"`
	}
	if !decodeJSON(writer, request, &body) {
		return
	}
	user, err := service.VerifyAccountEmail(request.Context(), body.Email, body.OTP)
	if err != nil {
		writeServiceError(writer, err)
		return
	}
	session, err := service.createSession(request.Context(), user.ID, request.UserAgent(), requestIP(request))
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to create session")
		return
	}
	service.setSessionCookie(writer, session)
	writeJSON(writer, http.StatusOK, map[string]any{"status": true, "token": session.Token, "user": user})
}

func (service *Service) requestPasswordResetHandler(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if !decodeJSON(writer, request, &body) {
		return
	}
	if err := service.SendPasswordResetOTP(request.Context(), body.Email); err != nil {
		writeServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]bool{"success": true})
}

func (service *Service) resetPasswordHandler(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Email    string `json:"email"`
		OTP      string `json:"otp"`
		Password string `json:"password"`
	}
	if !decodeJSON(writer, request, &body) {
		return
	}
	if err := service.ResetPassword(request.Context(), body.Email, body.OTP, body.Password); err != nil {
		writeServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]bool{"success": true})
}

func RegisterProfileRoutes(mux *http.ServeMux, service *Service) {
	mux.HandleFunc("GET /profile", service.profileHandler)
	mux.HandleFunc("PUT /profile", service.updateProfileHandler)
	mux.HandleFunc("POST /profile/avatar", service.avatarHandler)
	mux.HandleFunc("POST /profile/email/verify", service.verifyEmailHandler)
}

func (service *Service) signUpHandler(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(writer, request, &body) {
		return
	}
	user, err := service.SignUp(request.Context(), body.Name, body.Email, body.Password)
	if errors.Is(err, ErrEmailInUse) {
		writeError(writer, http.StatusBadRequest, "Email already in use")
		return
	}
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"user": user})
}

func (service *Service) signInHandler(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Email      string `json:"email"`
		Password   string `json:"password"`
		RememberMe *bool  `json:"rememberMe"`
	}
	if !decodeJSON(writer, request, &body) {
		return
	}
	session, user, err := service.SignIn(request.Context(), body.Email, body.Password, request.UserAgent(), requestIP(request))
	if errors.Is(err, ErrInvalidCredentials) || errors.Is(err, ErrEmailUnverified) {
		code := "INVALID_EMAIL_OR_PASSWORD"
		if errors.Is(err, ErrEmailUnverified) {
			code = "EMAIL_NOT_VERIFIED"
		}
		writeErrorCode(writer, http.StatusUnauthorized, err.Error(), code)
		return
	}
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to sign in")
		return
	}
	persistent := body.RememberMe == nil || *body.RememberMe
	service.setSessionCookieWithPersistence(writer, session, persistent)
	writeJSON(writer, http.StatusOK, map[string]any{"redirect": false, "token": session.Token, "url": nil, "user": user})
}

func (service *Service) signOutHandler(writer http.ResponseWriter, request *http.Request) {
	_ = service.SignOut(request.Context(), service.sessionToken(request))
	http.SetCookie(writer, &http.Cookie{Name: service.config.CookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: service.config.SecureCookies, SameSite: service.config.SameSite})
	writeJSON(writer, http.StatusOK, map[string]bool{"success": true})
}

func (service *Service) getSessionHandler(writer http.ResponseWriter, request *http.Request) {
	session, user, err := service.Session(request.Context(), service.sessionToken(request))
	if err != nil {
		writeJSON(writer, http.StatusOK, nil)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"session": map[string]any{"id": session.ID, "token": session.Token, "userId": session.UserID, "expiresAt": session.ExpiresAt}, "user": user})
}

func (service *Service) profileHandler(writer http.ResponseWriter, request *http.Request) {
	_, user, ok := service.requireSession(writer, request)
	if !ok {
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"user": user})
}

func (service *Service) updateProfileHandler(writer http.ResponseWriter, request *http.Request) {
	session, user, ok := service.requireSession(writer, request)
	if !ok {
		return
	}
	var body struct {
		Name            *string `json:"name"`
		Email           *string `json:"email"`
		CurrentPassword string  `json:"currentPassword"`
		NewPassword     *string `json:"newPassword"`
	}
	if !decodeJSON(writer, request, &body) {
		return
	}
	if body.NewPassword != nil && (body.Name != nil || body.Email != nil) {
		writeError(writer, http.StatusBadRequest, "Password changes cannot be combined with profile updates")
		return
	}
	if body.NewPassword != nil {
		if body.CurrentPassword == "" || *body.NewPassword == "" {
			writeError(writer, http.StatusBadRequest, "Current password and new password are required")
			return
		}
		if err := service.ChangePassword(request.Context(), user.ID, session.Token, body.CurrentPassword, *body.NewPassword); err != nil {
			writeError(writer, http.StatusBadRequest, "Current password is incorrect")
			return
		}
		writeJSON(writer, http.StatusOK, map[string]bool{"success": true})
		return
	}
	if body.Email != nil {
		if body.Name != nil {
			writeError(writer, http.StatusBadRequest, "Email changes cannot be combined with name updates")
			return
		}
		pending, err := service.StartEmailChange(request.Context(), user.ID, body.CurrentPassword, *body.Email)
		if err != nil {
			writeServiceError(writer, err)
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"user": pending, "pending_email": normalizeEmail(*body.Email), "verification_required": true})
		return
	}
	if body.Name == nil {
		writeError(writer, http.StatusBadRequest, "Nothing to update")
		return
	}
	updated, err := service.UpdateName(request.Context(), user.ID, *body.Name)
	if err != nil {
		writeServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"user": updated})
}

func (service *Service) avatarHandler(writer http.ResponseWriter, request *http.Request) {
	_, user, ok := service.requireSession(writer, request)
	if !ok {
		return
	}
	var body struct {
		ImageURL string `json:"imageUrl"`
	}
	if !decodeJSON(writer, request, &body) {
		return
	}
	updated, err := service.UpdateAvatar(request.Context(), user.ID, body.ImageURL)
	if err != nil {
		writeServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"user": map[string]any{"id": updated.ID, "image": updated.Image}})
}

func (service *Service) verifyEmailHandler(writer http.ResponseWriter, request *http.Request) {
	_, user, ok := service.requireSession(writer, request)
	if !ok {
		return
	}
	var body struct {
		Email string `json:"email"`
		OTP   string `json:"otp"`
	}
	if !decodeJSON(writer, request, &body) {
		return
	}
	updated, err := service.VerifyEmailChange(request.Context(), user.ID, body.Email, body.OTP)
	if err != nil {
		writeServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"user": updated})
}

func (service *Service) requireSession(writer http.ResponseWriter, request *http.Request) (Session, User, bool) {
	session, user, err := service.Session(request.Context(), service.sessionToken(request))
	if err != nil {
		writeError(writer, http.StatusUnauthorized, "Unauthorized")
		return Session{}, User{}, false
	}
	return session, user, true
}

func (service *Service) AuthenticatedUserID(request *http.Request) (string, error) {
	_, user, err := service.Session(request.Context(), service.sessionToken(request))
	if err != nil {
		return "", err
	}
	return user.ID, nil
}

func (service *Service) sessionToken(request *http.Request) string {
	names := []string{service.config.CookieName, "better-auth.session_token", "__Secure-better-auth.session_token"}
	for _, name := range names {
		cookie, err := request.Cookie(name)
		if err != nil {
			continue
		}
		if token := service.verifyCookieValue(cookie.Value); token != "" {
			return token
		}
	}
	return ""
}

func (service *Service) setSessionCookie(writer http.ResponseWriter, session Session) {
	service.setSessionCookieWithPersistence(writer, session, true)
}

func (service *Service) setSessionCookieWithPersistence(writer http.ResponseWriter, session Session, persistent bool) {
	cookie := &http.Cookie{Name: service.config.CookieName, Value: service.signCookieValue(session.Token), Path: "/", HttpOnly: true, Secure: service.config.SecureCookies, SameSite: service.config.SameSite}
	if persistent {
		cookie.Expires = session.ExpiresAt
	}
	http.SetCookie(writer, cookie)
}

func (service *Service) signCookieValue(value string) string {
	mac := hmac.New(sha256.New, []byte(service.config.AuthSecret))
	_, _ = mac.Write([]byte(value))
	return url.QueryEscape(value + "." + base64.StdEncoding.EncodeToString(mac.Sum(nil)))
}

func (service *Service) verifyCookieValue(value string) string {
	if decoded, err := url.QueryUnescape(value); err == nil {
		value = decoded
	}
	separator := strings.LastIndexByte(value, '.')
	if separator < 1 {
		return value
	}
	token := value[:separator]
	signature, err := base64.StdEncoding.DecodeString(value[separator+1:])
	if err != nil {
		signature, err = base64.RawURLEncoding.DecodeString(value[separator+1:])
	}
	if err != nil {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(service.config.AuthSecret))
	_, _ = mac.Write([]byte(token))
	if subtle.ConstantTimeCompare(signature, mac.Sum(nil)) != 1 {
		return ""
	}
	return token
}

func decodeJSON(writer http.ResponseWriter, request *http.Request, target any) bool {
	request.Body = http.MaxBytesReader(writer, request.Body, 32<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var maximum *http.MaxBytesError
		if errors.As(err, &maximum) {
			writeError(writer, http.StatusRequestEntityTooLarge, "Request body is too large")
		} else {
			writeError(writer, http.StatusBadRequest, "Invalid request body")
		}
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeError(writer, http.StatusBadRequest, "Invalid request body")
		return false
	}
	return true
}

func writeServiceError(writer http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrEmailInUse):
		writeError(writer, http.StatusBadRequest, "Email already in use")
	case errors.Is(err, ErrInvalidCredentials):
		writeError(writer, http.StatusBadRequest, "Current password is incorrect")
	case errors.Is(err, ErrInvalidOTP):
		writeError(writer, http.StatusBadRequest, "Verification code is invalid or expired")
	case errors.Is(err, ErrNotFound):
		writeError(writer, http.StatusNotFound, "User not found")
	default:
		writeError(writer, http.StatusBadRequest, strings.TrimSpace(err.Error()))
	}
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]any{"error": map[string]string{"message": message}})
}

func writeErrorCode(writer http.ResponseWriter, status int, message, code string) {
	writeJSON(writer, status, map[string]any{"error": map[string]string{"message": message, "code": code}})
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}
