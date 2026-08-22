# Template Marketplace

The Template Marketplace is an authenticated theme library at `/marketplace`. It introduces a
single place to browse community presentation themes while preserving SlideSage's existing dark
navy application shell.

## Current Scope

- Browse six complete third-party-style offerings rather than placeholder catalog entries: Neon
  District, Draft Board, Velvet Marquee, Bubblegum Pop, Concrete Brutal, and Terra Mesa.
- Preview every item through the production `SlideRenderer` using supported themes.
- Open a dedicated, URL-addressable theme preview by selecting a theme card.
- Search theme and creator metadata and sort the catalog.
- Upvote designs for the active user in this browser.
- Remove previously added themes from the installed collection.
- Add supported marketplace themes to the Viewer theme dropdown.
- Show a disabled `Contribute a theme` toolbar action for the future theme editor.
- Use a responsive navigation tab and catalog layout on desktop and mobile.
- Use a centered, flexible marketplace search field with contribution and sorting actions anchored
  to the left and right edges of the toolbar.
- Scale marketplace previews from the canonical 1280x720 canvas to each card's measured size,
  preserving all slide element positions and proportions without cropping.

## Theme Systems

The six default renderer themes are complete visual systems, not palette swaps. Each owns a
different typography pairing, color system, information density, shape grammar, image treatment,
chart palette, and default composition treatment. They stay installed with every workspace:

| Default system | Renderer ID | Design language |
| --- | --- | --- |
| Midnight Terminal | `modern-dark` | Dark cinematic space, terminal metadata, luminous proof points |
| Signal Grid | `corporate-blue` | Strict analytical grid, slim blue rail, precise data hierarchy |
| Monochrome Grid | `minimalist` | Quiet serif headlines, paper grid, reading-first layouts |
| Kinetic Blocks | `creative-studio` | Poster-like typography, hard edges, fixed diagonal accents |
| Editorial Ledger | `elegant-serif` | Warm paper, folios, magazine columns, editorial serif voice |
| Field Report | `nature-green` | Organic contours, human-scale spacing, restrained natural palette |

Marketplace offerings are a separate shelf of visual systems. None of them reuses a default theme
ID, palette, typography pairing, or layout language. Each is authored as its own studio identity,
so installing one swaps in a different design language instead of recoloring a built-in theme:

| Marketplace offering | Renderer ID | Design language | Catalog author |
| --- | --- | --- | --- |
| Neon District | `neon-district` | Violet-black synthwave, magenta/cyan neon, monospaced display type | Vera Kato |
| Draft Board | `draft-board` | Blueprint blue linework, orange markups, drafting-caps lettering | Ines Okafor |
| Velvet Marquee | `velvet-marquee` | Theater-black glamour, champagne gold and burgundy, didone serif | Maison Lune |
| Bubblegum Pop | `bubblegum-pop` | Y2K candy pastels, hot pink and sky accents, rounded chunky type | Pip Sundae |
| Concrete Brutal | `concrete-brutal` | Raw concrete gray, safety-orange signage, heavy grotesque caps | R. Castellanos |
| Terra Mesa | `terra-mesa` | Adobe sand craft, burnt sienna and turquoise, slab-serif voice | Ada Reyes |

Every offering has its own cover, showcase composition, narrative slide, data colors, and close.
Installation now selects the marketplace's own renderer system: the viewer dropdown lists it under
"From Marketplace", saved presentations persist the marketplace theme ID, generation can target it,
and both PDF and PowerPoint exports carry matching palette and typography tokens.

Theme token definitions for defaults live in `AVAILABLE_TEMPLATES` in `libs/ui/lib/templates.ts`;
marketplace systems live in `MARKETPLACE_TEMPLATES` in the same module. The renderer publishes
those values as CSS custom properties for editorial content and uses the same colors and font
families for scene slides and chart rendering. The PowerPoint exporter maintains matching palette
and typography tokens for its native output.

The first implementation is still frontend-only. Installed marketplace themes and the active user's
upvotes persist in browser local storage, while catalog metadata, usage counts, and aggregate votes
are seeded data. Catalog authors are fictional seed identities; a persistent community backend must
replace these browser-local records with real creator profiles.

## Renderer Constraints

Marketplace previews render through their own `ThemeId` values, listed in `MARKETPLACE_THEME_IDS`
in `libs/types`. Marketplace item IDs match their renderer ID so a deck saved from an installed
marketplace theme normalizes cleanly; the API's `validThemes` allowlist includes the marketplace
IDs so persistence and generation validation stay intact. Adding further serialized themes requires
the same four-way update: web renderer tokens, API validation, the presentation document contract,
and PowerPoint export.

Preview rendering is noninteractive. Content blocks use plain containers unless the viewer supplies
an editing callback, preventing editor controls from being nested inside the marketplace preview
button while retaining the same visual renderer.

Installed marketplace themes appear as named entries under "From Marketplace" in the theme dropdown
and select their own visual system when chosen. Defaults and marketplace systems are resolved
through the same `getTemplate` contract, so generation, persistence, and export validation remain
intact.

The viewer and marketplace render slides at canonical 1280x720 coordinates. Display surfaces use a
shared measured scaling frame that applies one uniform scale to the complete slide. Marketplace cards
fit their actual width, while fullscreen presentations contain the slide within the available screen
and use the maximum size allowed by its 16:9 aspect ratio.
Fullscreen chart slides activate only after that frame has a measured size, ensuring Chart.js runs
its entrance animation against the final presentation dimensions instead of a zero-sized canvas.

Schema-v5 content slides use code-owned editorial compositions rather than theme-authored HTML. The
renderer supports `cover`, `section`, `body`, `split`, `comparison`, `sidebar`, `media-left`,
`media-right`, `quote`, `spotlight`, and `canvas`. Themes establish both the visual foundation and
the composition treatment: for example, Signal Grid adds a data rail and a measured grid, Paper
Grid removes panels in favor of reading columns, Kinetic Blocks uses hard-edged poster geometry, and
Field Report uses rounded organic frames. Pattern rendering uses CSS gradients only. Image and
background-image URLs are restricted to HTTPS; invalid content images become descriptive
placeholders and invalid backgrounds are omitted.

Blocks retain their semantic kind inside every composition. Their `emphasis` (`standard`, `strong`,
`hero`, or `supporting`) and `treatment` (`plain`, `card`, `outline`, or `accent`) values create visible
hierarchy without changing content. Layout changes migrate blocks among the canonical `main`,
`primary`, `secondary`, and `media` regions. Media layouts may add a temporary visual placeholder;
that placeholder is removed when leaving a media layout without removing authored placeholders.

The semantic deck-plan compiler also selects varied default content layouts before a slide reaches
the renderer. Context, evidence, and recommendation slides use a sidebar; problem and solution
slides use a split composition; insights use spotlight. Visual intents still take precedence, so
comparisons, image heroes, timelines, processes, metrics, and charts retain their appropriate
specialized layouts.

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
