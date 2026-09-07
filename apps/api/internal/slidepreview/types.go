// Package slidepreview renders committed PPTX revisions into slide images.
//
// Previews are a derived view of a revision. Rendering never rewrites the
// canonical package, so a preview failure leaves the deck downloadable.
package slidepreview

import (
	"context"
	"errors"
	"time"
)

const (
	DefaultMaxRevisionBytes = int64(64 << 20)
	DefaultMaxSlides        = 200
	DefaultWidth            = 1600
	DefaultTimeout          = 4 * time.Minute
)

var (
	ErrRenderFailed       = errors.New("slide preview rendering failed")
	ErrSlideCountMismatch = errors.New("rendered preview count does not match the revision slide count")
	ErrRevisionCorrupt    = errors.New("stored revision does not match its recorded digest")
	ErrTooManySlides      = errors.New("revision exceeds the preview slide limit")
)

// Limits bound one render so a hostile or pathological deck cannot exhaust the
// worker. They apply to the converter process, not to the stored revision.
type Limits struct {
	MaxRevisionBytes int64
	MaxSlides        int
	Width            int
	Timeout          time.Duration
}

func (limits Limits) withDefaults() Limits {
	if limits.MaxRevisionBytes <= 0 {
		limits.MaxRevisionBytes = DefaultMaxRevisionBytes
	}
	if limits.MaxSlides <= 0 {
		limits.MaxSlides = DefaultMaxSlides
	}
	if limits.Width <= 0 {
		limits.Width = DefaultWidth
	}
	if limits.Timeout <= 0 {
		limits.Timeout = DefaultTimeout
	}
	return limits
}

// Renderer converts one PPTX package into one WebP image per slide, in slide
// order. Implementations must not write outside their own temporary directory.
type Renderer interface {
	Render(ctx context.Context, pptx []byte, limits Limits) ([][]byte, error)
}
