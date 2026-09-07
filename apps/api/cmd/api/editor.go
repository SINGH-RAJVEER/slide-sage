package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/auth"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/officeeditor"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationdocument"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/slidepreview"
)

// registerEditorRoutes wires ONLYOFFICE in when it is configured. The editor is
// optional: a deployment without a document server still generates, previews,
// and downloads decks, so a missing configuration is skipped rather than fatal.
func registerEditorRoutes(mux *http.ServeMux, database *sql.DB, authService *auth.Service, baseURL string) error {
	documentServer := strings.TrimSpace(os.Getenv("ONLYOFFICE_DOCUMENT_SERVER_URL"))
	secret := strings.TrimSpace(os.Getenv("ONLYOFFICE_JWT_SECRET"))
	bucket := strings.TrimSpace(os.Getenv("PRESENTATION_GCS_BUCKET"))
	var objects presentationrevision.ObjectStore
	var err error
	if bucket != "" {
		objects, err = presentationrevision.NewGCSBlobStore(context.Background(), bucket)
		if err != nil {
			return fmt.Errorf("open presentation object store: %w", err)
		}
	}
	previewClient, err := slidepreview.NewInsertClient(database)
	if err != nil {
		return err
	}
	enabled := documentServer != "" && secret != "" && objects != nil
	presentationdocument.RegisterRoutes(mux, presentationdocument.Handler{DB: database, Objects: objects, Identity: authService.AuthenticatedUserID, Queue: previewClient, EditorEnabled: enabled})
	if documentServer == "" && secret == "" {
		log.Print("ONLYOFFICE is not configured; the browser editor is disabled")
		return nil
	}
	if !enabled {
		return fmt.Errorf("the editor needs ONLYOFFICE_DOCUMENT_SERVER_URL, ONLYOFFICE_JWT_SECRET, and PRESENTATION_GCS_BUCKET")
	}
	repository := presentationrevision.NewPostgresRepository(database)
	editor, err := officeeditor.NewService(officeeditor.Config{
		DocumentServerURL: documentServer,
		JWTSecret:         secret,
		JWTHeader:         os.Getenv("ONLYOFFICE_JWT_HEADER"),
		PublicAPIURL:      env("PUBLIC_API_URL", baseURL),
		SourceTokenSecret: os.Getenv("EDITOR_SOURCE_TOKEN_SECRET"),
		SourceTokenTTL:    time.Duration(envInt("EDITOR_SOURCE_TOKEN_TTL_SECONDS", 0)) * time.Second,
		MaxSaveBytes:      int64(envInt("EDITOR_MAX_SAVE_BYTES", 0)),
		Presentations:     officeeditor.NewPostgresPresentations(database),
		Revisions:         repository,
		Documents:         presentationrevision.NewService(repository, objects, 0),
		Objects:           objects,
		Previews:          officeeditor.NewQueuePreviews(previewClient),
	})
	if err != nil {
		return fmt.Errorf("configure the presentation editor: %w", err)
	}
	officeeditor.RegisterRoutes(mux, editor, authService.AuthenticatedUserID, func(request *http.Request, userID string) string {
		profile, err := authService.Profile(request.Context(), userID)
		if err != nil {
			return ""
		}
		return profile.Name
	})
	return nil
}
