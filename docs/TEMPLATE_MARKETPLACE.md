# Template Marketplace

The Template Marketplace is an authenticated theme library at `/marketplace`. It introduces a
single place to browse community presentation themes while preserving SlideSage's existing dark
navy application shell.

## Current Scope

- Browse seeded theme contributions.
- Preview every item through the production `SlideRenderer` using supported themes.
- Open a four-slide sample presentation in the Viewer by selecting a theme card.
- Search theme and creator metadata and sort the catalog.
- Upvote designs optimistically for the current page session.
- Add supported marketplace themes to the Generate and Viewer theme dropdowns.
- Show a disabled `Contribute a theme` toolbar action for the future theme editor.
- Use a responsive navigation tab and catalog layout on desktop and mobile.

The first implementation is intentionally frontend-only. Installed marketplace themes persist in
browser local storage, while catalog metadata, creators, usage counts, and votes are seeded data.
Votes and creator-access requests are not persisted. The interface states this boundary rather than
presenting mock behavior as a completed community backend.

## Renderer Constraints

Marketplace previews map to the six existing `ThemeId` values. Marketplace item IDs are separate
from renderer IDs so future catalog records cannot bypass presentation validation. New serialized
themes require a versioned format shared by the web renderer, API validation, generation schema, and
PowerPoint export.

Preview rendering is noninteractive. Content blocks use plain containers unless the viewer supplies
an editing callback, preventing editor controls from being nested inside the marketplace preview
button while retaining the same visual renderer.

Installed marketplace themes remain named entries in the dropdown but resolve to their supported
base `ThemeId` when selected. This keeps generation, persistence, and export validation intact.

## Backend Roadmap

A persistent community marketplace should add:

- Versioned marketplace items with author, type, tags, license, publication, and moderation state.
- Unique per-user votes and aggregate vote counts.
- Creator submission, revision, preview, publish, and reporting endpoints.
- Installation or application records linked to the supported theme format.
- Public catalog search, filtering, sorting, pagination, and creator profiles.

The internal semantic `slide_templates` table is AI generation memory and should not be reused as the
community catalog because it has no ownership, publishing, rendering, or voting contract.
