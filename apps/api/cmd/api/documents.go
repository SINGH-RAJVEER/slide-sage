package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/auth"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationdocument"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/slidepreview"
)

// registerDocumentRoutes serves the canonical revision artifacts: the PPTX
// itself, the rendered preview images, the PDF, and the preview status the
// viewer polls. Object storage is optional so a local API still boots without a
// bucket; the routes then report that no artifact is available.
func registerDocumentRoutes(mux *http.ServeMux, database *sql.DB, authService *auth.Service) error {
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
	presentationdocument.RegisterRoutes(mux, presentationdocument.Handler{
		DB:       database,
		Objects:  objects,
		Identity: authService.AuthenticatedUserID,
		Queue:    previewClient,
	})
	return nil
}
