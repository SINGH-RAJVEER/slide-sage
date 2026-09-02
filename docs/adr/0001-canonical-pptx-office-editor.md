# ADR 0001: Make PPTX revisions canonical

- Status: Accepted
- Date: 2026-09-03

## Context

SlideSage currently saves semantic slide JSON, renders it with React, and builds a PPTX only when the user downloads. The selected template does not control generation or the browser preview. This creates visible differences between the viewer and the downloaded file. It also requires SlideSage to maintain its own element editor while separately implementing PowerPoint behavior.

The replacement flow must use the selected curated PPTX as the source design. It must retain native PowerPoint editing, exact requested slide counts during generation, browser previews derived from the generated file, and versioned template delivery through the CDN.

## Decision

An immutable PPTX presentation revision is the canonical document.

The generation worker fetches the selected template package from the CDN, verifies its version and digest, allocates the requested number of slide archetypes, requests content for their writable slots, compiles the PPTX, validates it, and stores it as a presentation revision.

SlideSage uses ONLYOFFICE Docs Developer as the full browser editor. Editor saves return complete PPTX files to SlideSage, which commits each accepted save as a new immutable revision.

A separate LibreOffice worker renders committed revisions into slide images. The normal viewer, thumbnails, fullscreen mode, and PDF export use those images. LibreOffice never writes the canonical PPTX.

The existing semantic React renderer and custom element editor will not remain as a second document model. Existing semantic presentations are legacy presentations and require regeneration.

## Alternatives considered

### Keep semantic JSON canonical

Rejected because browser output and PPTX output would continue to diverge.

### Build a browser OOXML editor

Rejected because PowerPoint-compatible text layout, charts, tables, SmartArt, media, grouping, and package behavior would require a presentation engine in the browser.

### Use raster previews without an Office editor

Rejected because element selection, resizing, native chart editing, slide operations, and undo would require rebuilding a large part of an Office editor.

### Use Microsoft 365 for the web

Deferred because production access requires Cloud Storage Partner Program approval, broad WOPI requirements, and qualifying Microsoft licenses.

### Use Collabora Online

Kept as a fallback. It requires a larger WOPI host implementation than the selected ONLYOFFICE callback integration.

## Consequences

- Generation completes only after a downloadable PPTX revision exists.
- The viewer may briefly show a processing state while LibreOffice renders previews.
- Editor saves, AI revisions, restores, and imports use the same revision conflict rules.
- The deployment gains ONLYOFFICE, object storage, and sandboxed LibreOffice workers.
- Template onboarding requires manifests, sanitization, checksums, publication, and fidelity tests.
- SlideSage no longer owns low-level browser editing behavior.
- Vendor licensing and production terms must be confirmed before launch.
