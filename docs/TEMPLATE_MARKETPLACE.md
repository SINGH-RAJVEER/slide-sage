# Template marketplace

The authenticated `/marketplace` route lists curated binary PowerPoint templates. `BINARY_PPTX_TEMPLATE_CATALOG` in `libs/types/src/template-catalog.ts` is the catalog authority. The initial catalog contains six default templates and 24 marketplace templates.

## Catalog model

Each template has a stable kebab-case ID, version, availability, dimensions, object-storage path, and browser preview theme. Source files under the ignored root `templates/` directory use the same ID as their filename, for example `simple-business-proposal.pptx`.

The truncated agriculture deck is excluded from the catalog and retained as `quarantine-agriculture-business-plan.pptx`. The duplicate Textured Scrapbook file was removed.

Default templates appear in the presentation template selector without installation. Marketplace templates must first be installed from `/marketplace`. Installation stores versioned `{ id, version }` references in browser local storage. The store accepts old string entries only when the string matches a current binary catalog ID; synthetic legacy IDs are discarded.

## Browser preview

Opening a marketplace thumbnail loads the complete template deck at `/marketplace/:marketplaceId/preview`. It uses the same rendered-slide carousel, thumbnails, keyboard navigation, and fullscreen controls as generated presentations.

The browser requests `GET /template-previews/{id}/{version}` for the slide count and package digest, then loads each slide through `GET /template-previews/{id}/{version}/{digest}/{index}`. The API resolves the published catalog entry and signs CDN requests server-side. Slides come from `https://api.slidesage.app/pptx-templates/{id}/{version}/{digest}/previews/v1/`. Signing credentials never reach the browser.

These WebP slides are rendered from the actual CDN PPTX using the same LibreOffice renderer as generated decks. They are not semantic approximations or a cover-only fallback. Missing previews show an error with retry.

### Publishing full-deck previews

`cmd/publish-templates` renders previews as part of publication, from the same sanitized bytes it uploaded, so a published template cannot be missing the previews for its digest. Rendering needs LibreOffice on `PATH`, which the development shell provides. Pass `-skip-previews` where it is unavailable; the command then says so, and the previews must be backfilled before the template is usable.

`cmd/publish-template-previews` renders previews on their own. It is for backfilling a template published before previews existed, or for re-rendering after a renderer change. Stage a template locally for inspection:

```sh
devenv shell -- go -C apps/api run ./cmd/publish-template-previews \
  -id charli-xcx-brat-album-inspired -out /tmp/template-previews
```

After approval to write cloud objects, publish to the bucket backing the template CDN:

```sh
devenv shell -- go -C apps/api run ./cmd/publish-template-previews \
  -bucket YOUR_TEMPLATE_BUCKET
```

Omit `-id` to process all published templates. Both commands verify the rendered slide count against the compiler manifest, write immutable slide objects, and write `manifest.json` last so incomplete sets are not advertised. Existing objects with different bytes are rejected; changes to rendering output require a new preview format version rather than overwriting cached slides.

Uploading with `-bucket` needs application default credentials, which are separate from a `gcloud` login:

```sh
gcloud auth application-default login
```

Without them, stage with `-out` and upload with the CLI. `--no-clobber` preserves the create-only precondition the bucket path relies on, and the manifests go last for the same reason the publisher writes them last:

```sh
gcloud storage cp -r -n /tmp/template-previews/pptx-templates gs://YOUR_TEMPLATE_BUCKET/
```

Both commands print this guidance when the bucket cannot be opened.

## Cover thumbnails

Marketplace cards load covers from `GET /template-thumbnails/{path}` on the API, where the path is the URL-encoded object path `pptx-templates/{id}/{version}/thumbnails/cover.webp` that `libs/types/src/template-catalog.ts` advertises. `libs/ui/lib/template-thumbnails.ts` builds the URL.

The browser cannot address the CDN itself: unsigned requests to `/pptx-templates/*` are refused, and giving the client a signing key would let anyone mint URLs for the packages. The API signs each request with the deployment's Cloud CDN key and streams the image back. It also keeps the marketplace from downloading a package of tens of megabytes to show one cover.

The route refuses anything that is not exactly a cover path, and refuses templates absent from `apps/api/internal/templatecatalog/published.json`, so it cannot be used to sign arbitrary bucket objects. Responses carry `Cache-Control: public, max-age=604800`, matching the CDN's client TTL, because a cover is immutable for the life of a template version. An upstream failure answers `502`.

Covers are produced by `scripts/render-template-thumbnails.ts` and uploaded beside the package. A template with no uploaded cover answers `502` until one exists.

## Publication gating

Three artifacts must exist before a template can produce a presentation: the digest-pinned object in the bucket, a digest recorded in both `libs/types/src/template-digests.json` and `apps/api/internal/templatecatalog/published.json`, and a compiler manifest under `apps/api/internal/templatemanifest/manifests`. A template missing any of them is listed but not usable.

The browser derives `asset.status` from the digest map, so an unpublished template reads as `pending-upload` without anyone maintaining a second list. Selection is gated on it in three places: the template dropdown disables the entry, `GeneratePPTPage` disables generation while an unselectable template is chosen, and `installMarketplaceTheme` refuses to install one, because installing it would only add a permanently disabled entry to the selector. Marketplace cards show `Unpublished` in place of `Install`.

`go run ./cmd/publish-templates -verify` checks those artifacts for every published entry, plus the cover and the preview set, and exits non-zero on any mismatch. Each object check is a signed `HEAD`, so it costs one request per template rather than a download. The preview check reads `manifest.json`, which is uploaded after its images, so its presence means the whole set resolved.

The catalog files live in the repository while the objects live in the bucket, so the two drift apart silently. `.github/workflows/templates.yml` runs the verification daily and on demand to catch that drift. It needs the `CDN_URL` and `CDN_SIGNING_KEY_NAME` repository variables and the `CDN_SIGNING_KEY_SECRET` repository secret; signing is server-side, so a runner mints valid URLs with the same key the API uses. It is deliberately not part of the deploy workflow, whose service account has no Secret Manager access.

## Presentation selection

A presentation stores its PowerPoint template separately from its browser preview theme:

```json
{
	"theme": "corporate-blue",
	"template": {
		"id": "simple-business-proposal",
		"version": 1
	}
}
```

Selecting a template updates both fields in one presentation mutation. Generation and research routes submit the selected semantic preview theme alongside the binary template reference and carry both through retries, queued jobs, resumable streaming, and the final persisted document.

## Export readiness

Catalog visibility, installation, and export readiness are separate. A template can appear in the marketplace while its asset remains `pending-upload`. PowerPoint download requires all of the following:

- The presentation selects a binary template.
- The catalog asset status is `available`.
- The runtime package exists under `VITE_PPTX_TEMPLATE_BASE_URL`.
- The template has an OOXML manifest.
- Every presentation slide kind is supported by that manifest and renderer.

`Simple Business Proposal` is the first onboarded and available manifest. Unsupported rich content disables its PowerPoint export instead of producing a partial file. See [OOXML_TEMPLATE_EXPORT.md](OOXML_TEMPLATE_EXPORT.md) for package processing and validation.

## Future backend work

The current marketplace installation state remains browser-local. A persistent marketplace should add versioned publication records, creator ownership, license records, moderation, reporting, server-side installation records, search, and pagination.

The internal `slide_templates` table is AI generation memory and must not be reused as the marketplace catalog.
