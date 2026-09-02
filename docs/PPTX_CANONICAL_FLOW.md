# Canonical PPTX presentation flow

## Scope

This document specifies the replacement for semantic slide generation, React slide rendering, custom canvas editing, and client-side PPTX export. Breaking compatibility with existing presentations is intentional. The CDN template catalog remains.

## Product invariants

1. Every non-legacy presentation has a current immutable PPTX revision.
2. Download returns the exact bytes of that revision.
3. Browser previews come from that same revision.
4. The selected template package and manifest are immutable inputs identified by version and SHA-256 digest.
5. A generated presentation has exactly the requested number of slides when generation completes.
6. AI output contains content, not presentation styling or geometry.
7. A successful Office editor save creates a new revision. It never overwrites an existing object.
8. A preview set belongs to one revision and has the same slide count as that revision.

## Deep module

Callers use one presentation-document module:

```ts
interface PresentationDocument {
	create(request: CreatePresentationRequest): Promise<PresentationSnapshot>;
	revise(request: RevisePresentationRequest): Promise<PresentationSnapshot>;
	openEditor(request: OpenEditorRequest): Promise<EditorSession>;
	acceptEditorSave(request: AcceptEditorSaveRequest): Promise<PresentationSnapshot>;
	get(request: GetPresentationRequest): Promise<PresentationSnapshot>;
}
```

The interface guarantees revision checks, idempotency, exact slide counts, package validation, immutable storage, and preview scheduling. Callers do not manipulate ZIP files, object keys, editor callbacks, or LibreOffice processes.

## Template publication

The ignored root `templates/` directory remains the local authoring source. A publication command performs these steps:

1. Reject corrupt, encrypted, macro-enabled, oversized, or policy-violating packages.
2. Remove comments, author metadata, unused slides, external relationships, signatures, and unapproved embedded objects.
3. Validate relationships, content types, slide dimensions, and manifest shape references.
4. Calculate the package SHA-256 digest.
5. Render source-slide previews for review.
6. Upload with the PowerPoint MIME type to an immutable CDN object key.
7. Publish catalog metadata only after the object and manifest pass validation.

Object keys use this form:

```text
pptx-templates/{template-id}/{version}/{sha256}/template.pptx
```

## Manifest contract

Each template version has a manifest containing:

- template ID, version, digest, dimensions, and manifest version;
- source slide identity and narrative role;
- whether each archetype may repeat;
- writable shape IDs and object types;
- required and optional slots;
- text, list-item, table, chart, and image limits;
- sample objects to clear or remove;
- expected relationship and content-type constraints;
- whether Office editing may alter decorative objects.

Source slide numbers alone are not stable identifiers. Publication resolves each archetype to a source slide relationship and verifies its expected shape inventory.

## Generation

### Assignment

The compiler allocates exactly the requested number of archetypes before requesting slide copy. The assignment normally includes one cover and one closing slide, then fills the remaining positions with repeatable content archetypes. Template rules may define other sequences.

If a template cannot produce the requested count, the request fails before points are charged. The UI must only offer counts supported by the selected template.

### Content request

The AI receives the ordered assignments and slot limits. A slide response contains values keyed by manifest slot ID. It does not contain layout names, regions, coordinates, themes, effects, CSS, or browser component names.

The worker validates every slot. It performs targeted repair for missing slides, malformed values, or content that exceeds a slot limit. It does not accept a shorter deck and does not silently discard invalid slides.

### Compilation

The compiler downloads and verifies the immutable template package, clones the assigned source slides and ownership-sensitive relationships, writes native content, rebuilds presentation-level references, removes unreachable source parts, updates document properties, and emits reproducible ZIP metadata.

The first implementation must support native text and images. Charts and tables require dedicated native OOXML writers before manifests may expose those slot types. Unsupported slots fail before generation.

Generation succeeds only after package validation, immutable upload, and database commit. Preview rendering may finish afterward, but download is already available.

## Revision storage

Canonical objects use immutable keys:

```text
presentations/{presentation-id}/revisions/{revision}/deck.pptx
presentations/{presentation-id}/revisions/{revision}/previews/{slide-index}.webp
```

PostgreSQL records:

- presentation ID and current revision;
- object key, digest, byte size, slide count, and MIME type;
- source template identity and compiler version;
- author, source operation, and creation time;
- preview status and preview count;
- editor provider and base revision where applicable.

Writers use compare-and-swap against the expected current revision. Duplicate operation IDs return the prior result. Stale saves remain available as conflict revisions but do not replace the current revision.

## ONLYOFFICE integration

The Go API creates a signed editor configuration for one user, presentation, permission set, and base revision. The ONLYOFFICE document key derives from the presentation ID and immutable revision. The stable file identity remains the presentation ID.

The source URL is read-only and expires after the editor has fetched the document. The callback verifies the ONLYOFFICE JWT, session identity, callback status, base revision, result origin, size, content type, and package structure.

For a final save, SlideSage downloads the assembled PPTX from the trusted Document Server, writes a staging object while hashing it, validates it, promotes it to an immutable revision key, commits the database revision, and then acknowledges the callback.

## LibreOffice preview worker

The preview job names one immutable presentation revision. The worker:

1. downloads the PPTX;
2. creates an isolated temporary LibreOffice profile;
3. converts the deck to PDF with headless LibreOffice;
4. rasterizes each page to WebP under CPU, memory, time, and pixel limits;
5. uploads the complete preview set;
6. marks previews ready only if every expected slide exists.

Preview failure does not corrupt or replace the PPTX revision. The UI offers download and retry while previews are unavailable.

## Viewer and editor

The regular viewer displays revision preview images. It retains navigation, thumbnails, fullscreen, playback, generation progress, revision history, download, delete-presentation, and editor launch controls.

The ONLYOFFICE iframe owns element selection, movement, resizing, content changes, slide deletion, duplication, reordering, chart and table editing, and undo or redo. SlideSage removes its custom element canvas, semantic layout selector, scene renderer, widget renderer, and browser theme substitution.

PDF export uses the PDF produced from the canonical revision. It does not rasterize React DOM.

## AI revisions after manual editing

An editor save may change any supported PPTX object. After accepting a revision, SlideSage extracts slide order, text, notes, object inventory, and native slide count into a revision index. AI iteration reads this index and produces explicit content operations against the current revision.

The compiler applies those operations to a copy of the current PPTX rather than returning to the original template. This preserves manual edits. If the editor changed or removed a targeted object, the operation fails with a revision conflict and the worker requests a new index.

## Legacy behavior removed

The final implementation removes these paths:

- semantic `ContentSlide`, `SceneSlide`, and `ChartSlide` generation;
- AI layout, region, tone, density, pattern, and visual-intent output;
- React slide compositions and semantic preview themes;
- custom browser element selection and resizing;
- client-side OOXML export and download-time compilation;
- DOM-to-image PDF export;
- fixed 1280 by 720 viewer geometry.

Legacy presentation rows remain identifiable but cannot open in the new editor until the user regenerates them with a current template.

## Acceptance tests

- Generate every supported slide count for each published template and assert exact counts at assignment, content, PPTX, database, and preview stages.
- Open, edit, save, and reopen each template through ONLYOFFICE at least five times.
- Validate each revision with an OOXML validator and desktop PowerPoint smoke test.
- Compare LibreOffice previews with approved images for fonts, charts, tables, groups, SmartArt, media, portrait slides, and embedded fonts.
- Exercise callback retries, duplicate saves, stale revisions, concurrent AI and editor saves, expired URLs, object-store failures, editor crashes, and preview-worker failures.
- Reject ZIP bombs, path traversal, macros, external relationships, unapproved embedded objects, oversized media, and callbacks to untrusted result URLs.
