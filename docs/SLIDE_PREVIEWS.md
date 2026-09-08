# Slide previews

Previews are the images the viewer, thumbnails, and fullscreen playback display for a committed PPTX revision. They are a derived view: the canonical package is never rewritten by rendering, so a preview failure leaves the deck downloadable and editable.

## Pipeline

`cmd/previewworker` consumes the `previews` River queue. For one revision the worker:

1. claims the revision, moving `preview_status` from `pending` or `failed` to `rendering`;
2. downloads the canonical object and verifies its byte size and SHA-256 against the revision row;
3. converts the deck to PDF with headless LibreOffice in a private user profile;
4. rasterizes each page with `pdftoppm` at the configured width;
5. encodes each page to WebP with `cwebp`;
6. uploads every image, then marks the revision `ready`.

The revision is only marked ready once the complete set is stored, so a reader never sees a partial deck. Preview objects use immutable keys:

```text
presentations/{presentation-id}/revisions/{revision}/previews/{slide-index}.webp
```

Slide indexes are zero-based and follow package slide order.

## Claims and recovery

`preview_started_at` records when a worker took a claim. Another worker may take over a claim older than `presentationrevision.DefaultStalePreviewClaim` (15 minutes), which is how a crashed renderer recovers. A cancelled render deliberately leaves its claim in place to expire rather than recording a failure the user would read as permanently broken.

A worker that cannot take the claim does not report success. When the revision is already `ready` there is nothing to do, but a claim another worker holds, or a revision row that is not visible yet, snoozes the job for a minute instead of completing it. Completing it would mark a revision rendered when no images were ever written.

Preview jobs are unique by arguments across the live states only, not across completed ones, so a revision whose earlier job finished without previews can be enqueued again by `POST /presentations/{id}/revisions/{revision}/previews/retry`.

A render that cannot succeed on a later attempt cancels its job instead of retrying: a corrupt package, a missing object, an oversized package, or a deck over the slide limit. Everything else retries under River's normal backoff.

## Limits

Every render is bounded so one hostile or pathological deck cannot exhaust the worker.

| Limit | Default | Environment variable |
| ----- | ------- | -------------------- |
| Revision bytes | 64 MiB | None; matches the commit limit |
| Slides | 200 | `PREVIEW_MAX_SLIDES` |
| Raster width | 1600 px | `PREVIEW_WIDTH` |
| Render timeout | 4 minutes | `PREVIEW_TIMEOUT_SECONDS` |
| WebP quality | 82 | `PREVIEW_WEBP_QUALITY` |

The rendered page count must equal the revision slide count. A mismatch fails the render rather than publishing a deck with missing or extra slides.

## Deployment

The renderer is the one image that cannot be built `from scratch`, because it shells out to LibreOffice, poppler, and `cwebp`. It is built from the `preview` target in `apps/api/Dockerfile` and deployed as the private Cloud Run service `preview-worker`, scaling from zero to four instances with two CPUs and 4 GiB of memory. It needs `DATABASE_URL` and `PRESENTATION_GCS_BUCKET`, and reads revisions with the runtime service account through Application Default Credentials.

Converters run with a minimal environment (`HOME` and `TMPDIR` inside the per-render working directory) so they cannot pick up ambient LibreOffice or user configuration. The working directory is removed after every render.

## Related

- [ADR 0001: Make PPTX revisions canonical](adr/0001-canonical-pptx-office-editor.md)
- [Canonical PPTX presentation flow](PPTX_CANONICAL_FLOW.md)
