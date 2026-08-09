# Template Marketplace

The Template Marketplace is an authenticated theme library at `/marketplace`. It introduces a
single place to browse community presentation themes while preserving SlideSage's existing dark
navy application shell.

## Current Scope

- Browse six curated themes authored by SlideSage, including the bright Citrus Brief
  and monochrome Paper Grid systems.
- Preview every item through the production `SlideRenderer` using supported themes.
- Open a dedicated, URL-addressable theme preview by selecting a theme card.
- Search theme and creator metadata and sort the catalog.
- Upvote designs for the active user in this browser.
- Remove previously added themes from the installed collection.
- Add supported marketplace themes to the Generate and Viewer theme dropdowns.
- Show a disabled `Contribute a theme` toolbar action for the future theme editor.
- Use a responsive navigation tab and catalog layout on desktop and mobile.
- Use a centered, flexible marketplace search field with contribution and sorting actions anchored
  to the left and right edges of the toolbar.
- Scale marketplace previews from the canonical 1280x720 canvas to each card's measured size,
  preserving all slide element positions and proportions without cropping.

The first implementation is intentionally frontend-only. Installed marketplace themes and the active
user's upvotes persist in browser local storage, while catalog metadata, usage counts, and aggregate
votes are seeded data. All current catalog entries identify SlideSage as their author. A persistent
community backend still needs to replace these browser-local records.

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

The viewer and marketplace render slides at canonical 1280x720 coordinates. Display surfaces use a
shared measured scaling frame that applies one uniform scale to the complete slide. Marketplace cards
fit their actual width, while fullscreen presentations contain the slide within the available screen
and use the maximum size allowed by its 16:9 aspect ratio.
Fullscreen chart slides activate only after that frame has a measured size, ensuring Chart.js runs
its entrance animation against the final presentation dimensions instead of a zero-sized canvas.

Schema-v5 content slides use code-owned editorial compositions rather than theme-authored HTML. The
renderer supports `cover`, `section`, `body`, `split`, `comparison`, `sidebar`, `media-left`,
`media-right`, `quote`, `spotlight`, and `canvas`. Themes continue to provide the color and font
foundation, while renderer overrides establish consistent type scale, spacing, image cropping, and
asymmetric geometry. Pattern rendering uses CSS gradients only. Image and background-image URLs are
restricted to HTTPS; invalid content images become descriptive placeholders and invalid backgrounds
are omitted.

Blocks retain their semantic kind inside every composition. Their `emphasis` (`standard`, `strong`,
`hero`, or `supporting`) and `treatment` (`plain`, `card`, `outline`, or `accent`) values create visible
hierarchy without changing content. Layout changes migrate blocks among the canonical `main`,
`primary`, `secondary`, and `media` regions. Media layouts may add a temporary visual placeholder;
that placeholder is removed when leaving a media layout without removing authored placeholders.

Theme cards route to `/marketplace/:marketplaceId/preview`. This read-only page uses the same viewer
header, carousel, navigation, thumbnails, scaled fullscreen stage, playback, and fullscreen controls
as regular presentations. The selected theme is fixed and appears as a non-interactive indicator in
place of the theme dropdown. Iterate, layout editing, download, and deletion controls are omitted.
Because the catalog item is resolved from the URL, previews remain available on refresh and direct
navigation. Preview navigation uses the same keyboard contract as the viewer: Left or `J` moves to
the previous slide, Right or `L` moves to the next slide, Up moves to the first slide, and Down moves
to the final slide. Each sample deck includes content, statistics, line-chart, and doughnut-chart
slides to demonstrate typography, data visualization, Chart.js animation, and layout behavior.

## Backend Roadmap

A persistent community marketplace should add:

- Versioned marketplace items with author, type, tags, license, publication, and moderation state.
- Unique per-user votes and aggregate vote counts.
- Creator submission, revision, preview, publish, and reporting endpoints.
- Installation or application records linked to the supported theme format.
- Public catalog search, filtering, sorting, pagination, and creator profiles.

The internal semantic `slide_templates` table is AI generation memory and should not be reused as the
community catalog because it has no ownership, publishing, rendering, or voting contract.
