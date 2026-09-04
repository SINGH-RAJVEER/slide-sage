# OOXML template export

SlideSage can render a presentation into a curated PowerPoint template by cloning and editing the template's OOXML package. The semantic React renderer remains the browser preview. The exported PPTX uses the source deck's slide geometry, masters, layouts, themes, media, notes, and embedded fonts.

## Current status

The binary catalog contains six default templates and 25 marketplace templates. Source presentations stay in the root `templates/` directory and are ignored by version control because the current collection is larger than 800 MiB. Production deployments must publish prepared runtime packages to object storage.

`Simple Business Proposal` is the first onboarded and available template. Its manifest covers all 11 semantic content layouts. OOXML template rendering is the only PPTX export path. Export requires a selected template with an available asset, an OOXML manifest, configured template storage, and supported content slides. Scene slides, standalone chart slides, native chart blocks, dynamic tables, generated diagrams, stats, and resolved images are rejected until native OOXML support exists. Content in a region without a mapped template slot is also rejected rather than silently omitted.

The agriculture business-plan source is truncated, excluded from the catalog, and retained as `quarantine-agriculture-business-plan.pptx`. The duplicate Textured Scrapbook source has been removed.

## Catalog and references

Catalog metadata lives in `libs/types/src/template-catalog.ts`. Each entry records a stable ID, version, availability, semantic preview theme, dimensions, and object-storage path. The source filename is derived as `${id}.pptx`, matching the files in the root `templates/` directory. `simple-business-proposal` is marked `available`; all other assets remain `pending-upload` until their prepared packages pass validation and exist at the configured paths.

Persisted presentations select a binary template independently of their semantic preview theme:

```json
{
	"theme": "corporate-blue",
	"template": {
		"id": "simple-business-proposal",
		"version": 1
	}
}
```

The browser resolves `pptx-templates/v1/simple-business-proposal.pptx` relative to `VITE_PPTX_TEMPLATE_BASE_URL`. Object names are immutable within a version. Publish changed packages under a new version rather than replacing bytes at an existing path.

## Template manifests

Manifests live in `libs/ui/lib/ooxml-template-manifests.ts`. A manifest maps each SlideSage layout to a source slide number and maps semantic values to numeric `p:cNvPr` shape IDs. Numeric IDs are used because the initial source decks contain generic exported shape names and almost no native placeholders.

Manifest onboarding requires inspecting every selected source slide. Confirm title, subtitle, content-region, media-caption, and decorative shapes. Clear template sample copy explicitly so generated files do not retain placeholder text.

## Package rendering

`renderOoxmlTemplate` in `libs/ui/lib/ooxml-template-renderer.ts` owns the OOXML implementation. It resolves presentation order through `presentation.xml.rels`, allocates new slide and relationship IDs, clones slide relationship parts, replaces mapped text through parsed XML nodes, and preserves unknown package parts.

Speaker notes are cloned per generated slide. Notes relationships may point back to their owning slide, so the renderer rewrites that relationship when present. Sharing one notes part across generated slides is not allowed.

The renderer leaves original source slides as unreachable package parts for now. This avoids deleting shared dependencies before package reachability cleanup exists. They are removed from the presentation slide list and cannot appear during playback.

## CDN requirements

The legacy browser exporter used paths such as:

```text
pptx-templates/v1/simple-business-proposal.pptx
```

The canonical server-side flow supersedes that layout with digest-pinned paths:

```text
pptx-templates/simple-business-proposal/1/{sha256}/template.pptx
```

Existing objects under `templates/v1/` or `pptx-templates/v1/` must be validated and republished before the canonical Go fetcher can use them. Do not mark an asset available in the canonical catalog until its digest-pinned object exists.

The storage origin must return the PPTX bytes without content transformation and allow cross-origin browser downloads. Use the PowerPoint MIME type `application/vnd.openxmlformats-officedocument.presentationml.presentation`. Versioned objects may use immutable caching.

Do not expose the root source files as runtime URLs. Runtime packages should contain only reviewed source slides and required dependencies once reachability cleanup is implemented.

## Validation

Tests build minimal OOXML packages in memory and verify relationship-based ordering, unique IDs, text replacement across runs, notes cloning, content-type registration, dependency preservation, and missing-manifest errors.

Before changing an asset from `pending-upload` to `available`, also validate the prepared package with Microsoft OpenXmlValidator and open, edit, save, and reopen a generated fixture in desktop PowerPoint. ZIP and XML validity alone do not prove that PowerPoint will render a file without repair.
