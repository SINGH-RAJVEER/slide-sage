// Package presentationdocument exposes owner-checked canonical revision artifacts.
package presentationdocument

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/slidepreview"
	"github.com/riverqueue/river"
)

type Handler struct {
	DB            *sql.DB
	Objects       presentationrevision.ObjectStore
	Identity      func(*http.Request) (string, error)
	Queue         *river.Client[*sql.Tx]
	EditorEnabled bool
}

func RegisterRoutes(mux *http.ServeMux, h Handler) {
	mux.HandleFunc("GET /presentations/{id}/revision", h.download)
	mux.HandleFunc("GET /presentations/{id}/revision/status", h.status)
	mux.HandleFunc("GET /presentations/{id}/revisions", h.history)
	mux.HandleFunc("GET /presentations/{id}/revisions/{revision}/previews/{index}", h.preview)
	mux.HandleFunc("GET /presentations/{id}/revisions/{revision}/pdf", h.pdf)
	mux.HandleFunc("POST /presentations/{id}/revisions/{revision}/previews/retry", h.retry)
}
func fail(w http.ResponseWriter, status int, message string) { http.Error(w, message, status) }
func respond(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(value)
}
func (h Handler) owned(w http.ResponseWriter, r *http.Request) (int, bool) {
	user, err := h.Identity(r)
	if err != nil || user == "" {
		fail(w, 401, "authentication required")
		return 0, false
	}
	var number int
	err = h.DB.QueryRowContext(r.Context(), `SELECT COALESCE(current_pptx_revision,0) FROM presentations WHERE id=$1 AND user_id=$2`, r.PathValue("id"), user).Scan(&number)
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "presentation not found")
		return 0, false
	}
	if err != nil {
		fail(w, 500, "could not read presentation")
		return 0, false
	}
	return number, true
}
func (h Handler) revision(w http.ResponseWriter, r *http.Request) (presentationrevision.Revision, bool) {
	current, ok := h.owned(w, r)
	if !ok {
		return presentationrevision.Revision{}, false
	}
	value := r.PathValue("revision")
	if value == "" {
		value = r.URL.Query().Get("revision")
	}
	number := current
	if value != "" {
		var err error
		number, err = strconv.Atoi(value)
		if err != nil || number <= 0 {
			fail(w, 400, "invalid revision")
			return presentationrevision.Revision{}, false
		}
	}
	if number == 0 {
		fail(w, 409, "presentation has no PPTX revision; regenerate it")
		return presentationrevision.Revision{}, false
	}
	revision, found, err := presentationrevision.NewPostgresRepository(h.DB).FindRevision(r.Context(), r.PathValue("id"), presentationrevision.RevisionNumber(number))
	if err != nil {
		fail(w, 500, "could not read revision")
		return revision, false
	}
	if !found {
		fail(w, 404, "revision not found")
		return revision, false
	}
	return revision, true
}
func (h Handler) status(w http.ResponseWriter, r *http.Request) {
	revision, ok := h.revision(w, r)
	if !ok {
		return
	}
	snapshot := presentationrevision.Snapshot(revision)
	snapshot["editorEnabled"] = h.EditorEnabled
	respond(w, snapshot)
}
func (h Handler) stream(w http.ResponseWriter, r *http.Request, key, mime string) {
	if h.Objects == nil {
		fail(w, 503, "document storage unavailable")
		return
	}
	object, err := h.Objects.OpenObject(r.Context(), key)
	if errors.Is(err, presentationrevision.ErrObjectNotFound) {
		fail(w, 404, "artifact not found")
		return
	}
	if err != nil {
		fail(w, 500, "could not read artifact")
		return
	}
	defer object.Close()
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "private, max-age=0, must-revalidate")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = io.Copy(w, object)
}
func (h Handler) download(w http.ResponseWriter, r *http.Request) {
	revision, ok := h.revision(w, r)
	if !ok {
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="presentation.pptx"`)
	h.stream(w, r, revision.ObjectKey, revision.MIMEType)
}
func (h Handler) preview(w http.ResponseWriter, r *http.Request) {
	revision, ok := h.revision(w, r)
	if !ok {
		return
	}
	index, err := strconv.Atoi(r.PathValue("index"))
	if err != nil || index < 0 || index >= revision.SlideCount {
		fail(w, 404, "slide not found")
		return
	}
	if revision.PreviewStatus != presentationrevision.PreviewReady {
		fail(w, 409, "previews are not ready")
		return
	}
	h.stream(w, r, presentationrevision.PreviewObjectKey(revision.PresentationID, revision.Number, index), presentationrevision.PreviewContentType)
}
func (h Handler) pdf(w http.ResponseWriter, r *http.Request) {
	revision, ok := h.revision(w, r)
	if !ok {
		return
	}
	if revision.PreviewStatus != presentationrevision.PreviewReady {
		fail(w, 409, "PDF is still processing")
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="presentation.pdf"`)
	h.stream(w, r, presentationrevision.PDFObjectKey(revision.PresentationID, revision.Number), "application/pdf")
}
func (h Handler) retry(w http.ResponseWriter, r *http.Request) {
	revision, ok := h.revision(w, r)
	if !ok {
		return
	}
	if revision.PreviewStatus == presentationrevision.PreviewReady {
		respond(w, map[string]string{"status": "ready"})
		return
	}
	if err := slidepreview.EnqueueNow(r.Context(), h.Queue, revision.PresentationID, revision.Number); err != nil {
		fail(w, 503, "could not schedule previews")
		return
	}
	w.WriteHeader(http.StatusAccepted)
}
func (h Handler) history(w http.ResponseWriter, r *http.Request) {
	_, ok := h.owned(w, r)
	if !ok {
		return
	}
	rows, err := h.DB.QueryContext(r.Context(), `SELECT revision,source_operation_kind,created_at,preview_status FROM presentation_revisions WHERE presentation_id=$1 ORDER BY revision DESC LIMIT 100`, r.PathValue("id"))
	if err != nil {
		fail(w, 500, "could not read revisions")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var number int
		var source, status string
		var created any
		if err := rows.Scan(&number, &source, &created, &status); err != nil {
			fail(w, 500, "could not read revision")
			return
		}
		items = append(items, map[string]any{"revision": number, "source": source, "createdAt": created, "previewStatus": status})
	}
	if rows.Err() != nil {
		fail(w, 500, "could not read revisions")
		return
	}
	respond(w, items)
}
