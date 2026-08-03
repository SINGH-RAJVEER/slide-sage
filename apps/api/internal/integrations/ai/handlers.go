package ai

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

const aiBodyLimit int64 = 16 * 1024

// Identity resolves the current authenticated user for AI connection routes.
type Identity func(*http.Request) (string, error)

// RegisterRoutes adds the authenticated /ai configuration and BYOK routes.
func RegisterRoutes(mux *http.ServeMux, connections ConnectionService, identity Identity) {
	if mux == nil {
		panic("AI mux is required")
	}
	router := aiRouter{connections: connections, identity: identity}
	mux.HandleFunc("GET /ai/config", router.config)
	mux.HandleFunc("POST /ai/connections", router.createConnection)
	mux.HandleFunc("PUT /ai/connections/{provider}", router.updateConnection)
	mux.HandleFunc("DELETE /ai/connections/{provider}", router.deleteConnection)
	mux.HandleFunc("PUT /ai/selection", router.selection)
}

type aiRouter struct {
	connections ConnectionService
	identity    Identity
}

func (r aiRouter) config(w http.ResponseWriter, request *http.Request) {
	userID, ok := r.userID(w, request)
	if !ok {
		return
	}
	connections, err := r.connections.List(request.Context(), userID)
	if err != nil {
		r.errorResponse(w, err)
		return
	}
	models := []ModelDescriptor{}
	summaries := make([]map[string]any, 0, len(connections))
	validProviders := map[Provider]bool{}
	catalogErrors := map[string]string{}
	for _, connection := range connections {
		provider := Provider(connection.Provider)
		status := connection.Status
		if status == "valid" {
			validProviders[provider] = true
			credential := EncryptedCredential{connection.EncryptedAPIKey, connection.EncryptionIV, connection.EncryptionKeyVersion, connection.KeyLastFour}
			key, decryptErr := DecryptAPIKey(userID, provider, credential)
			if decryptErr != nil {
				catalogErrors[string(provider)] = "The provider model list is temporarily unavailable."
			} else {
				discovered, validationErr := ValidateProviderKey(request.Context(), provider, key, nil)
				if validationErr != nil {
					validation, known := validationErr.(*ValidationError)
					if known && (validation.Rejected || validation.Incompatible) {
						_ = r.connections.MarkInvalid(request.Context(), userID, provider)
						status = "invalid"
						if validation.Rejected {
							catalogErrors[string(provider)] = "The provider rejected this API key. Replace it to refresh models."
						} else {
							catalogErrors[string(provider)] = "The provider no longer lists a compatible generation model."
						}
					} else {
						catalogErrors[string(provider)] = "The provider model list is temporarily unavailable."
					}
				} else {
					models = append(models, discovered...)
				}
			}
		}
		summary := map[string]any{"provider": connection.Provider, "status": status, "keyHint": "...." + connection.KeyLastFour, "validatedAt": connection.ValidatedAt.UTC().Format("2006-01-02T15:04:05.000Z")}
		if connection.LastUsedAt != nil {
			summary["lastUsedAt"] = connection.LastUsedAt.UTC().Format("2006-01-02T15:04:05.000Z")
		}
		summaries = append(summaries, summary)
	}
	selection, err := r.connections.GetSelection(request.Context(), userID)
	if err != nil {
		r.errorResponse(w, err)
		return
	}
	validSelection := selection != nil && validProviders[selection.Provider] && modelAvailable(models, *selection)
	if !validSelection && selection == nil {
		selection = defaultSelection(models)
	}
	if r.connections.DB == nil {
		r.errorResponse(w, errors.New("database is required"))
		return
	}
	var balance float64
	err = r.connections.DB.QueryRowContext(request.Context(), `SELECT slide_tokens FROM users WHERE id = $1`, userID).Scan(&balance)
	if err != nil {
		r.errorResponse(w, err)
		return
	}
	generation := map[string]any{"mode": "openrouter", "model": envOr("OPEN_ROUTER_MODEL", "google/gemma-4-26b-a4b-it"), "billing": "points"}
	selectionBody := any(nil)
	if len(validProviders) > 0 {
		generation["mode"] = "byok"
		generation["billing"] = "provider"
		if selection != nil {
			generation["model"] = selection.Model
			selectionBody = map[string]string{"provider": string(selection.Provider), "model": selection.Model}
		} else {
			generation["model"] = nil
		}
	}
	response := map[string]any{"generation": generation, "eligibility": map[string]any{"eligible": balance > 50, "slideTokens": balance, "minimumPointsExclusive": 50}, "connections": summaries, "models": models, "selection": selectionBody}
	if len(catalogErrors) > 0 {
		response["modelCatalogErrors"] = catalogErrors
	}
	writeAIJSON(w, http.StatusOK, response)
}

func (r aiRouter) createConnection(w http.ResponseWriter, request *http.Request) {
	r.upsertConnection(w, request, true)
}
func (r aiRouter) updateConnection(w http.ResponseWriter, request *http.Request) {
	r.upsertConnection(w, request, false)
}

func (r aiRouter) upsertConnection(w http.ResponseWriter, request *http.Request, create bool) {
	userID, ok := r.userID(w, request)
	if !ok {
		return
	}
	var input struct {
		Provider Provider `json:"provider"`
		APIKey   string   `json:"apiKey"`
	}
	if err := decodeAIJSON(request, &input); err != nil {
		aiJSONError(w, err)
		return
	}
	provider := input.Provider
	if !create {
		provider = Provider(request.PathValue("provider"))
	}
	if !validProvider(provider) || input.APIKey == "" {
		aiError(w, http.StatusBadRequest, "Provider and API key are required", "")
		return
	}
	connection, models, err := r.connections.Connect(request.Context(), userID, provider, input.APIKey)
	if err != nil {
		r.errorResponse(w, err)
		return
	}
	status := http.StatusOK
	if create {
		status = http.StatusCreated
	}
	writeAIJSON(w, status, map[string]any{"connection": connectionSummary(connection), "availableModels": models})
}

func (r aiRouter) deleteConnection(w http.ResponseWriter, request *http.Request) {
	userID, ok := r.userID(w, request)
	if !ok {
		return
	}
	provider := Provider(request.PathValue("provider"))
	if !validProvider(provider) {
		aiError(w, http.StatusBadRequest, "Invalid provider", "")
		return
	}
	if err := r.connections.Delete(request.Context(), userID, provider); err != nil {
		r.errorResponse(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r aiRouter) selection(w http.ResponseWriter, request *http.Request) {
	userID, ok := r.userID(w, request)
	if !ok {
		return
	}
	var input Selection
	if err := decodeAIJSON(request, &input); err != nil {
		aiJSONError(w, err)
		return
	}
	if !validProvider(input.Provider) || strings.TrimSpace(input.Model) == "" {
		aiError(w, http.StatusBadRequest, "Provider and model are required", "")
		return
	}
	if err := r.connections.Select(request.Context(), userID, input); err != nil {
		r.errorResponse(w, err)
		return
	}
	writeAIJSON(w, http.StatusOK, map[string]any{"selection": input})
}

func (r aiRouter) userID(w http.ResponseWriter, request *http.Request) (string, bool) {
	if r.identity == nil {
		aiError(w, http.StatusUnauthorized, "Unauthorized", "")
		return "", false
	}
	userID, err := r.identity(request)
	if err != nil || strings.TrimSpace(userID) == "" {
		aiError(w, http.StatusUnauthorized, "Unauthorized", "")
		return "", false
	}
	return userID, true
}
func (r aiRouter) errorResponse(w http.ResponseWriter, err error) {
	if validation, ok := err.(*ValidationError); ok {
		if validation.Rejected {
			aiError(w, http.StatusForbidden, validation.Message, "PROVIDER_KEY_REJECTED")
		} else if validation.Incompatible {
			aiError(w, http.StatusUnprocessableEntity, validation.Message, "PROVIDER_NO_COMPATIBLE_MODELS")
		} else {
			aiError(w, http.StatusBadGateway, validation.Message, "PROVIDER_VALIDATION_UNAVAILABLE")
		}
		return
	}
	if strings.Contains(err.Error(), "more than 50 points") {
		writeAIJSON(w, http.StatusForbidden, map[string]any{"error": map[string]string{"message": err.Error(), "code": "BYOK_POINTS_REQUIRED"}, "minimum_points_exclusive": 50})
		return
	}
	aiError(w, http.StatusBadRequest, "AI provider request failed", "")
}
func defaultSelection(models []ModelDescriptor) *Selection {
	for _, model := range models {
		if model.Recommended {
			return &Selection{model.Provider, model.Model}
		}
	}
	if len(models) > 0 {
		return &Selection{models[0].Provider, models[0].Model}
	}
	return nil
}
func modelAvailable(models []ModelDescriptor, selection Selection) bool {
	for _, model := range models {
		if model.Provider == selection.Provider && model.Model == selection.Model {
			return true
		}
	}
	return len(models) == 0
}
func connectionSummary(connection Connection) map[string]any {
	result := map[string]any{"provider": connection.Provider, "status": connection.Status, "keyHint": "...." + connection.KeyLastFour, "validatedAt": connection.ValidatedAt.UTC().Format("2006-01-02T15:04:05.000Z")}
	if connection.LastUsedAt != nil {
		result["lastUsedAt"] = connection.LastUsedAt.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	return result
}
func validProvider(provider Provider) bool {
	return provider == OpenAI || provider == Google || provider == Anthropic
}
func decodeAIJSON(request *http.Request, output any) error {
	body := http.MaxBytesReader(nil, request.Body, aiBodyLimit)
	defer body.Close()
	decoder := json.NewDecoder(body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(output); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("request body must contain one JSON value")
	}
	return nil
}
func aiJSONError(w http.ResponseWriter, err error) {
	var maxBytes *http.MaxBytesError
	if errors.As(err, &maxBytes) {
		aiError(w, http.StatusRequestEntityTooLarge, "Request body is too large", "")
	} else {
		aiError(w, http.StatusBadRequest, "Invalid request body", "")
	}
}
func aiError(w http.ResponseWriter, status int, message, code string) {
	errorBody := map[string]string{"message": message}
	if code != "" {
		errorBody["code"] = code
	}
	writeAIJSON(w, status, map[string]any{"error": errorBody})
}
func writeAIJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
