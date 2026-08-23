package presentation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
)

type UserIdentity func(context.Context, *http.Request) (string, error)

// RegisterRoutes registers direct presentation endpoints on mux. The identity
// callback must return the authenticated application user ID for each request.
func RegisterRoutes(mux *http.ServeMux, service *Service, identity UserIdentity, research *ExaResearchService, database *sql.DB) {
	if mux == nil || service == nil || identity == nil || research == nil || database == nil {
		panic("presentation routes require mux, service, identity callback, Exa service, and database")
	}
	handler := &presentationHandler{service: service, identity: identity, research: research, database: database}
	mux.HandleFunc("GET /presentations", handler.list)
	mux.HandleFunc("GET /presentations/{id}", handler.detail)
	mux.HandleFunc("DELETE /presentations/{id}", handler.delete)
	mux.HandleFunc("PATCH /presentations/{id}", handler.patch)
}

type presentationHandler struct {
	service  *Service
	identity UserIdentity
	research *ExaResearchService
	database *sql.DB
}

func (h *presentationHandler) list(writer http.ResponseWriter, request *http.Request) {
	userID, ok := h.userID(writer, request)
	if !ok {
		return
	}
	limit, err := pagination(request.URL.Query().Get("limit"), "limit", 20, 1, 100)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	offset, err := pagination(request.URL.Query().Get("offset"), "offset", 0, 0, int(^uint(0)>>1))
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	presentations, total, hasMore, err := h.service.List(request.Context(), userID, limit, offset)
	if err != nil {
		writeServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"presentations": presentations, "total": total, "limit": limit, "offset": offset, "has_more": hasMore})
}

func (h *presentationHandler) detail(writer http.ResponseWriter, request *http.Request) {
	userID, ok := h.userID(writer, request)
	if !ok {
		return
	}
	id := strings.TrimSpace(request.PathValue("id"))
	if id == "" {
		writeError(writer, http.StatusBadRequest, "Invalid presentation ID")
		return
	}
	presentation, err := h.service.Detail(request.Context(), id, userID)
	if err != nil {
		writeServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"presentation": presentation})
}

func (h *presentationHandler) delete(writer http.ResponseWriter, request *http.Request) {
	userID, ok := h.userID(writer, request)
	if !ok {
		return
	}
	id := strings.TrimSpace(request.PathValue("id"))
	if id == "" {
		writeError(writer, http.StatusBadRequest, "Invalid presentation ID")
		return
	}
	if h.hasActiveOperation(request.Context(), id, userID) {
		writeError(writer, http.StatusConflict, "Presentation generation is still active")
		return
	}
	if err := h.service.Delete(request.Context(), id, userID); err != nil {
		writeServiceError(writer, err)
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

func (h *presentationHandler) patch(writer http.ResponseWriter, request *http.Request) {
	userID, ok := h.userID(writer, request)
	if !ok {
		return
	}
	id := strings.TrimSpace(request.PathValue("id"))
	if id == "" {
		writeError(writer, http.StatusBadRequest, "Invalid presentation ID")
		return
	}
	if h.hasActiveOperation(request.Context(), id, userID) {
		writeError(writer, http.StatusConflict, "Presentation generation is still active")
		return
	}
	body, err := readRequestBody(request, 1024*1024)
	if err != nil {
		writeInputError(writer, err)
		return
	}
	mutations, err := ParseMutations(body)
	if err != nil {
		writeInputError(writer, err)
		return
	}
	presentation, err := h.service.Update(request.Context(), id, userID, mutations)
	if err != nil {
		writeServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"presentation": presentation})
}

func (h *presentationHandler) hasActiveOperation(ctx context.Context, presentationID, userID string) bool {
	var active bool
	err := h.database.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM generation_point_operations WHERE presentation_id = $1 AND user_id = $2 AND status = 'reserved')`, presentationID, userID).Scan(&active)
	return err == nil && active
}

func (h *presentationHandler) userID(writer http.ResponseWriter, request *http.Request) (string, bool) {
	userID, err := h.identity(request.Context(), request)
	if err != nil || strings.TrimSpace(userID) == "" {
		writeError(writer, http.StatusUnauthorized, "Authentication required")
		return "", false
	}
	return userID, true
}

func readRequestBody(request *http.Request, maximum int64) ([]byte, error) {
	if request.ContentLength > maximum {
		return nil, inputError("Request body is too large", http.StatusRequestEntityTooLarge)
	}
	body, err := io.ReadAll(io.LimitReader(request.Body, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > maximum {
		return nil, inputError("Request body is too large", http.StatusRequestEntityTooLarge)
	}
	return body, nil
}

func pagination(raw, field string, fallback, minimum, maximum int) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	if strings.TrimSpace(raw) != raw {
		return 0, errors.New(field + " must be an integer")
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum || value > maximum {
		return 0, errors.New(field + " must be between " + strconv.Itoa(minimum) + " and " + strconv.Itoa(maximum))
	}
	return value, nil
}

func writeServiceError(writer http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrPresentationNotFound):
		writeError(writer, http.StatusNotFound, err.Error())
	case errors.Is(err, ErrUnauthorized):
		writeError(writer, http.StatusForbidden, err.Error())
	case errors.Is(err, ErrPresentationConflict):
		writeError(writer, http.StatusConflict, err.Error())
	default:
		writeError(writer, http.StatusBadRequest, err.Error())
	}
}

func writeInputError(writer http.ResponseWriter, err error) {
	var input *InputError
	if errors.As(err, &input) {
		writeError(writer, input.Status, input.Message)
		return
	}
	writeError(writer, http.StatusBadRequest, "Invalid request body")
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]any{"error": map[string]string{"message": message}})
}
func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

func estimatePoints(slides int, detail, tonality string, researchTokens int) float64 {
	detailMultiplier := map[string]float64{"brief": .6, "concise": .8, "balanced": 1, "detailed": 2, "comprehensive": 2.5}[detail]
	if detailMultiplier == 0 {
		detailMultiplier = 1
	}
	toneMultiplier := map[string]float64{"casual": .9, "professional": 1, "enthusiastic": 1.05, "persuasive": 1.1}[tonality]
	if toneMultiplier == 0 {
		toneMultiplier = 1
	}
	return math.Round((float64(slides)*detailMultiplier*toneMultiplier+float64(researchTokens)/1000)*10) / 10
}
