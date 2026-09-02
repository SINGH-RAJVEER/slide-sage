# Template marketplace

The authenticated `/marketplace` route lists curated binary PowerPoint templates. `BINARY_PPTX_TEMPLATE_CATALOG` in `libs/types/src/template-catalog.ts` is the catalog authority. The initial catalog contains six default templates and 25 marketplace templates.

## Catalog model

Each template has a stable kebab-case ID, version, availability, dimensions, object-storage path, and browser preview theme. Source files under the ignored root `templates/` directory use the same ID as their filename, for example `simple-business-proposal.pptx`.

The truncated agriculture deck is excluded from the catalog and retained as `quarantine-agriculture-business-plan.pptx`. The duplicate Textured Scrapbook file was removed.

Default templates appear in the presentation template selector without installation. Marketplace templates must first be installed from `/marketplace`. Installation stores versioned `{ id, version }` references in browser local storage. The store accepts old string entries only when the string matches a current binary catalog ID; synthetic legacy IDs are discarded.

## Browser preview

Browsers do not render PPTX packages directly. Marketplace cards and preview routes therefore use the production semantic React renderer as an approximate preview. `previewThemeId` selects a browser-only visual treatment from `libs/ui/lib/semantic-themes.ts`. It does not alter the PowerPoint package.

Marketplace metadata comes from the binary catalog. The UI does not invent creators, vote counts, usage totals, or popularity rankings. Search uses template names and deterministic tags. Sorting uses catalog order or name order.

Preview routes remain available at `/marketplace/:marketplaceId/preview`. They use the binary template ID in the URL and include its versioned template reference in the sample presentation.

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

Selecting a template updates both fields in one presentation mutation. Generation and research routes carry the template reference through job submission, retries, resumable streaming, and the final persisted document.

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
