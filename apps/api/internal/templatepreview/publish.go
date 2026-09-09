// Package templatepreview renders a published template package into the
// full-slide previews the marketplace viewer reads. It is separate from
// templatepublish because rendering needs LibreOffice, which the API and
// generation workers deliberately do not carry.
package templatepreview

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/slidepreview"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templateasset"
)

// Uploader stores preview objects. It must refuse to overwrite an existing key
// with different bytes; templatepublish.Uploader satisfies it.
type Uploader interface {
	PutImmutable(ctx context.Context, key string, body io.Reader, size int64, contentType, sha256 string) error
}

// Publish renders pptx and uploads one image per slide, then the manifest.
// Readers treat the manifest as the readiness marker, so it is written last: a
// failed image upload leaves the set invisible rather than half-readable.
func Publish(ctx context.Context, store Uploader, renderer slidepreview.Renderer, asset templateasset.Asset, pptx []byte, slideCount int) error {
	images, err := renderer.Render(ctx, pptx, slidepreview.Limits{MaxSlides: templateasset.MaxPreviewSlides})
	if err != nil {
		return err
	}
	if len(images) != slideCount || slideCount < 1 || slideCount > templateasset.MaxPreviewSlides {
		return slidepreview.ErrSlideCountMismatch
	}
	prefix := templateasset.PreviewPrefix(asset)
	for index, image := range images {
		if len(image) == 0 {
			return fmt.Errorf("slide %d rendered empty", index)
		}
		if err := put(ctx, store, fmt.Sprintf("%s/%d.webp", prefix, index), image, templateasset.ThumbnailContentType); err != nil {
			return err
		}
	}
	manifest, err := json.Marshal(templateasset.PreviewManifest{SlideCount: slideCount})
	if err != nil {
		return err
	}
	return put(ctx, store, prefix+"/manifest.json", manifest, templateasset.PreviewManifestContentType)
}

func put(ctx context.Context, store Uploader, key string, body []byte, mime string) error {
	digest := sha256.Sum256(body)
	return store.PutImmutable(ctx, key, bytes.NewReader(body), int64(len(body)), mime, hex.EncodeToString(digest[:]))
}
