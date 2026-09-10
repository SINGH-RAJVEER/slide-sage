package templateasset

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strconv"
)

// thumbnailRequestPattern accepts exactly the paths libs/types advertises. The
// handler signs whatever it is given, so anything looser would turn this route
// into a signing oracle for the rest of the bucket.
var thumbnailRequestPattern = regexp.MustCompile(`^pptx-templates/([a-z0-9][a-z0-9-]{0,127})/([1-9][0-9]{0,8})/thumbnails/cover\.webp$`)

// thumbnailCacheControl matches the CDN's own client TTL. Covers are immutable
// for the life of a template version, so a revalidation per view is waste.
const thumbnailCacheControl = "public, max-age=604800"

// Handler serves marketplace cover thumbnails from the signed template CDN.
//
// The browser cannot fetch them directly: unsigned CDN requests are refused,
// and handing a signing key to the client would let anyone mint URLs for the
// packages themselves. The API signs each request instead, which also keeps the
// marketplace from downloading a whole package to show one cover.
type Handler struct {
	Fetcher   *CDNFetcher
	Published func(id string, version int) bool
}

// RegisterRoutes installs public template cover and full-deck preview endpoints.
func RegisterRoutes(mux *http.ServeMux, handler Handler) {
	if mux == nil || handler.Fetcher == nil || handler.Published == nil {
		panic("template thumbnail routes require a mux, fetcher, and published lookup")
	}
	mux.HandleFunc("GET /template-thumbnails/{path...}", handler.cover)
	mux.HandleFunc("GET /template-previews/{id}/{version}", handler.previewManifest)
	mux.HandleFunc("GET /template-previews/{id}/{version}/{digest}/{index}", handler.previewSlide)
}

func (h Handler) cover(writer http.ResponseWriter, request *http.Request) {
	match := thumbnailRequestPattern.FindStringSubmatch(request.PathValue("path"))
	if match == nil {
		http.Error(writer, "thumbnail not found", http.StatusNotFound)
		return
	}
	version, err := strconv.Atoi(match[2])
	if err != nil || !h.Published(match[1], version) {
		http.Error(writer, "thumbnail not found", http.StatusNotFound)
		return
	}
	contents, err := h.Fetcher.FetchThumbnail(request.Context(), match[1], version)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		http.Error(writer, "thumbnail is unavailable", http.StatusBadGateway)
		return
	}
	writer.Header().Set("Content-Type", ThumbnailContentType)
	writer.Header().Set("Cache-Control", thumbnailCacheControl)
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.Header().Set("Content-Length", strconv.Itoa(len(contents)))
	_, _ = writer.Write(contents)
}
