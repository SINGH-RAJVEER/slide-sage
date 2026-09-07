package officeeditor

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
)

// UserIdentity resolves the signed-in user for browser requests. Document
// server requests are authenticated by signature instead.
type UserIdentity func(*http.Request) (string, error)

// UserProfile supplies the display name shown on the editor cursor.
type UserProfile func(request *http.Request, userID string) string

type handler struct {
	service  *Service
	identity UserIdentity
	profile  UserProfile
}

// RegisterRoutes mounts the three editor endpoints: the browser asks for a
// session, the document server downloads the deck, and the document server
// posts back saves.
func RegisterRoutes(mux *http.ServeMux, service *Service, identity UserIdentity, profile UserProfile) {
	editor := &handler{service: service, identity: identity, profile: profile}
	mux.HandleFunc("POST /presentations/{id}/editor/session", editor.session)
	mux.HandleFunc("GET /presentations/{id}/editor/document", editor.document)
	mux.HandleFunc("POST /presentations/{id}/editor/callback", editor.callback)
}

func (h *handler) session(writer http.ResponseWriter, request *http.Request) {
	userID, err := h.identity(request)
	if err != nil || userID == "" {
		writeError(writer, http.StatusUnauthorized, "authentication required")
		return
	}
	name := ""
	if h.profile != nil {
		name = h.profile(request, userID)
	}
	session, err := h.service.Session(request.Context(), SessionRequest{
		PresentationID: request.PathValue("id"),
		UserID:         userID,
		UserName:       name,
		ReadOnly:       request.URL.Query().Get("mode") == "view",
	})
	switch {
	case errors.Is(err, ErrPresentationMissing):
		writeError(writer, http.StatusNotFound, "presentation not found")
		return
	case errors.Is(err, ErrNotEditable):
		writeError(writer, http.StatusConflict, "this presentation has no PPTX revision to edit")
		return
	case err != nil:
		log.Printf("editor session for %s: %v", request.PathValue("id"), err)
		writeError(writer, http.StatusInternalServerError, "could not open the editor")
		return
	}
	writeJSON(writer, http.StatusOK, session)
}

// document streams one revision to the document server. It is authenticated by
// the signed URL handed out with the session, never by a user cookie.
func (h *handler) document(writer http.ResponseWriter, request *http.Request) {
	presentationID := request.PathValue("id")
	query := request.URL.Query()
	number, err := h.service.verifySourceToken(presentationID, query.Get("revision"), query.Get("expires"), query.Get("signature"))
	if err != nil {
		writeError(writer, http.StatusForbidden, "invalid or expired document token")
		return
	}
	revision, found, err := h.service.revisions.FindRevision(request.Context(), presentationID, number)
	if err != nil {
		log.Printf("editor document lookup for %s revision %d: %v", presentationID, number, err)
		writeError(writer, http.StatusInternalServerError, "could not read the presentation")
		return
	}
	if !found {
		writeError(writer, http.StatusNotFound, "revision not found")
		return
	}
	object, err := h.service.objects.OpenObject(request.Context(), revision.ObjectKey)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, presentationrevision.ErrObjectNotFound) {
			status = http.StatusNotFound
		}
		log.Printf("editor document object %s: %v", revision.ObjectKey, err)
		writeError(writer, status, "could not read the presentation")
		return
	}
	defer object.Close()
	writer.Header().Set("Content-Type", revision.MIMEType)
	writer.Header().Set("Content-Length", strconv.FormatInt(revision.ByteSize, 10))
	writer.Header().Set("Cache-Control", "private, no-store")
	writer.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", documentTitle("presentation")))
	if _, err := io.Copy(writer, io.LimitReader(object, revision.ByteSize)); err != nil {
		log.Printf("streaming editor document %s: %v", revision.ObjectKey, err)
	}
}

func (h *handler) callback(writer http.ResponseWriter, request *http.Request) {
	body, err := io.ReadAll(io.LimitReader(request.Body, maxCallbackBodyBytes+1))
	if err != nil || int64(len(body)) > maxCallbackBodyBytes {
		writeCallbackError(writer, "callback body is unreadable")
		return
	}
	result, err := h.service.HandleCallback(request.Context(), request.PathValue("id"),
		body, request.Header.Get(h.service.jwtHeader))
	if err != nil {
		// The document server retries on a non-zero acknowledgement, which is
		// what a transient failure needs and a rejected callback does not
		// benefit from. Both cases are logged with the reason.
		log.Printf("editor callback for %s: %v", request.PathValue("id"), err)
		writeCallbackError(writer, "callback rejected")
		return
	}
	if result.Committed {
		log.Printf("editor save for %s committed revision %d (stale=%t duplicate=%t)",
			request.PathValue("id"), result.Revision, result.Stale, result.Duplicate)
	}
	writeJSON(writer, http.StatusOK, map[string]int{"error": 0})
}

func writeCallbackError(writer http.ResponseWriter, message string) {
	writeJSON(writer, http.StatusOK, map[string]any{"error": 1, "message": message})
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]string{"error": message})
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(value); err != nil {
		log.Printf("writing editor response: %v", err)
	}
}
