package slidepreview

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
)

type Config struct {
	Revisions       presentationrevision.PreviewRepository
	Objects         presentationrevision.ObjectStore
	Renderer        Renderer
	Limits          Limits
	StaleClaimAfter time.Duration
}

type Service struct {
	revisions       presentationrevision.PreviewRepository
	objects         presentationrevision.ObjectStore
	renderer        Renderer
	limits          Limits
	staleClaimAfter time.Duration
}

func NewService(config Config) (*Service, error) {
	if config.Revisions == nil || config.Objects == nil || config.Renderer == nil {
		return nil, errors.New("preview service requires a repository, object store, and renderer")
	}
	staleClaimAfter := config.StaleClaimAfter
	if staleClaimAfter <= 0 {
		staleClaimAfter = presentationrevision.DefaultStalePreviewClaim
	}
	return &Service{
		revisions:       config.Revisions,
		objects:         config.Objects,
		renderer:        config.Renderer,
		limits:          config.Limits.withDefaults(),
		staleClaimAfter: staleClaimAfter,
	}, nil
}

// Render produces the preview set for one committed revision. It is safe to
// call repeatedly: a revision whose previews are ready, or whose claim another
// worker holds, is left alone.
func (service *Service) Render(ctx context.Context, presentationID string, number presentationrevision.RevisionNumber) error {
	revision, claimed, err := service.revisions.ClaimPreviewRender(ctx, presentationID, number, service.staleClaimAfter)
	if err != nil {
		return fmt.Errorf("claim previews for %s revision %d: %w", presentationID, number, err)
	}
	if !claimed {
		return nil
	}
	if err := service.render(ctx, revision); err != nil {
		return errors.Join(err, service.markFailed(ctx, revision))
	}
	return nil
}

func (service *Service) render(ctx context.Context, revision presentationrevision.Revision) error {
	if revision.SlideCount > service.limits.MaxSlides {
		return fmt.Errorf("%w: %d slides", ErrTooManySlides, revision.SlideCount)
	}
	pptx, err := service.readRevision(ctx, revision)
	if err != nil {
		return err
	}
	var images [][]byte
	var pdf []byte
	if renderer, ok := service.renderer.(DocumentRenderer); ok {
		document, renderErr := renderer.RenderDocument(ctx, pptx, service.limits)
		images, pdf, err = document.Images, document.PDF, renderErr
		if err == nil && len(pdf) == 0 {
			err = errors.New("renderer produced no PDF")
		}
	} else {
		images, err = service.renderer.Render(ctx, pptx, service.limits)
	}
	if err != nil {
		return fmt.Errorf("%w: %v", ErrRenderFailed, err)
	}
	if len(images) != revision.SlideCount {
		return fmt.Errorf("%w: rendered %d, revision has %d", ErrSlideCountMismatch, len(images), revision.SlideCount)
	}
	for index, image := range images {
		if len(image) == 0 {
			return fmt.Errorf("%w: slide %d rendered no image", ErrRenderFailed, index)
		}
		key := presentationrevision.PreviewObjectKey(revision.PresentationID, revision.Number, index)
		digest := sha256.Sum256(image)
		err := service.objects.PutImmutable(ctx, key, bytes.NewReader(image), int64(len(image)),
			presentationrevision.PreviewContentType, hex.EncodeToString(digest[:]))
		if err != nil {
			return fmt.Errorf("store preview %s: %w", key, err)
		}
	}
	if len(pdf) > 0 {
		key := presentationrevision.PDFObjectKey(revision.PresentationID, revision.Number)
		digest := sha256.Sum256(pdf)
		if err := service.objects.PutImmutable(ctx, key, bytes.NewReader(pdf), int64(len(pdf)), "application/pdf", hex.EncodeToString(digest[:])); err != nil {
			return fmt.Errorf("store PDF: %w", err)
		}
	}
	// The revision is only marked ready once the complete set is stored, so a
	// reader never sees a partial deck.
	if err := service.revisions.MarkPreviewsReady(ctx, revision.PresentationID, revision.Number, len(images)); err != nil {
		return fmt.Errorf("mark previews ready for %s revision %d: %w", revision.PresentationID, revision.Number, err)
	}
	return nil
}

func (service *Service) readRevision(ctx context.Context, revision presentationrevision.Revision) ([]byte, error) {
	if revision.ByteSize > service.limits.MaxRevisionBytes {
		return nil, fmt.Errorf("%w: revision is %d bytes", presentationrevision.ErrPackageTooLarge, revision.ByteSize)
	}
	reader, err := service.objects.OpenObject(ctx, revision.ObjectKey)
	if err != nil {
		return nil, fmt.Errorf("open revision object %s: %w", revision.ObjectKey, err)
	}
	defer reader.Close()
	contents, err := io.ReadAll(io.LimitReader(reader, revision.ByteSize+1))
	if err != nil {
		return nil, fmt.Errorf("read revision object %s: %w", revision.ObjectKey, err)
	}
	digest := sha256.Sum256(contents)
	if int64(len(contents)) != revision.ByteSize || hex.EncodeToString(digest[:]) != revision.SHA256 {
		return nil, fmt.Errorf("%w: %s", ErrRevisionCorrupt, revision.ObjectKey)
	}
	return contents, nil
}

func (service *Service) markFailed(ctx context.Context, revision presentationrevision.Revision) error {
	// A cancelled render leaves the claim to expire rather than reporting a
	// failure the user would see as a permanently broken preview set.
	if ctx.Err() != nil {
		return nil
	}
	err := service.revisions.MarkPreviewsFailed(ctx, revision.PresentationID, revision.Number)
	if err == nil || errors.Is(err, presentationrevision.ErrPreviewStateConflict) {
		return nil
	}
	log.Printf("marking previews failed for %s revision %d: %v", revision.PresentationID, revision.Number, err)
	return err
}
