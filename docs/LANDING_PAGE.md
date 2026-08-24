# Landing Page

The landing page is the public entry point at `/` for visitors without a session. It is a single
full-viewport hero: real slide thumbnails orbiting the SlideSage wordmark on the app's signature
deep navy. There is no header, copy, or footer — the ring is the page.

## Route Behaviour

- The index route renders `EntranceRoute` (`apps/web/src/app/router/EntranceRoute.tsx`).
- Signed-in visitors are sent to the existing app home (presentations or generate, via
  `HomePage`), so authenticated behaviour is unchanged.
- Anonymous visitors see the landing page instead of being redirected straight to sign-in.
- `/landing` renders the landing page for everyone, signed in or not. The app header's
  SlideSage icon links there (`ROUTES.landing`), so clicking the icon from anywhere in the app
  always reaches the landing page.
- All other guarded routes keep the existing `RequireSignedInLayout` redirect to sign-in with a
  `redirect_url`.

## Hero: Slide Ring

`SlideRingHero` (`apps/web/src/routes/landing/SlideRingHero.tsx`) is a DOM ring adapted from the
ThreeUI Gallery Heading reference (matte variant, rising-diagonal axis):

- The background is the SlideSage signature navy (`#161b27`) with the app's soft top glow.
- The wordmark is a rotating smoke sphere (`WordmarkOrb`), adapted from the ThreeUI energy-orb
  reference: raw WebGL renders a procedural fbm smoke sphere with a fresnel rim, outer glow, and
  a Canvas 2D star layer, all recoloured to the SlideSage palette — deep navy `#04172f`, icon
  blue `#0d3762`, steel highlights. "SlideSage" is painted twice onto an offscreen canvas texture
  (Yellowtail script with the wordmark's halo fill and dark navy outline) and mapped onto the
  sphere through the rotating normal's spherical coordinates, so one wordmark rotates out of view
  exactly as the next rotates in — one per visible hemisphere. The sphere completes one
  revolution per 26 seconds, matching the ring.
- A particle warp radiates from behind the sphere, adapted from the ThreeUI Constellation Field
  particle-network reference: particles spawn on a disc at far z behind the orb and fly toward the
  viewer, drawn as hairline streaks from their previous projection to their current one in
  restrained steel-white and brand-blue hues. The streak layer sits directly under the sphere
  canvas on a full-bleed transparent canvas whose trails are kept crisp by erasing toward nothing
  each frame (`destination-out`), so they never smear over the hero gradient or clip at the
  sphere stage's edge.
- The orb paints its first frame synchronously so it is never blank on first paint, pauses when
   off-screen or when the tab is hidden, and honours `prefers-reduced-motion: reduce` by
   rendering one static frame. Without WebGL it falls back to the flat SVG wordmark the hero
   used before the orb.
- Twenty-six plates sit on a tilted ellipse. Plates behind the orb render at a lower z-index,
   plates in front above it, so orbiting plates pass over the sphere exactly as in the
   reference.
- The ring is in constant orbit — one revolution every 26 seconds — irrespective of the cursor
   or anything else. Dragging horizontally spins it directly in proportion to the drag's length
   — dragging right pushes the front plates right, like grabbing the ring — and on release the
   constant orbit resumes from where the drag left it, with no flick or momentum. A drag under
   six pixels counts as a click instead.
- Clicking a plate opens a hovering preview: the slide re-rendered at 68 percent of the hero's
   width (still through `ScaledSlide` at the full 1280x720 stage) over a blurred backdrop, with
   the theme name and slide title as a caption. Clicking anywhere outside the slide or pressing
   Escape dismisses it, while the ring keeps turning behind it.
- The sphere is the page's call to action: it is a link to `/sign-up` (keyboard focusable,
   pointer cursor), and the no-WebGL fallback wordmark links there too. Ring drags that pass
   over the sphere never fire the navigation — pointer travel across the link is tracked and
   past six pixels the click is suppressed, matching the plates' tap-versus-drag slop.
- `prefers-reduced-motion: reduce` disables the orbit entirely; the ring renders one static
   frame.

## The Plates

Each plate is a real slide rendered by the production pipeline — `SlideRenderer` inside
`ScaledSlide` at the canonical 1280x720 16:9 canvas, scaled down to plate size — the same
implementation the viewer and the marketplace previews use. Plates are positioned, faded, and
scaled per frame. The plate currently sitting at the front of the ring renders in a "live" slot
(keyed remount with `isActive`), so its charts draw in and its stats count up each time it
swings to the front; every other plate renders statically.

`apps/web/src/routes/landing/slide-examples.ts` defines the plates:

- Twenty authored slides across ten visual systems, using sample deck copy written for the
  landing page. Only one plain heading page remains — every other plate pairs its title with
  real content, chosen as permutations:
  - Image-plus-text: photos (stable Unsplash urls, https as the renderer requires) in
    media-left/right compositions with bullets, paragraphs, quotes, callouts, and stats, plus
    one full-bleed photographic cover with an overlay.
  - Live-animation-plus-text: whole-slide charts (line, doughnut, bar, polar area), an embedded
    inline radar chart beside bullets, count-up stat rows beside paragraphs, and generated
    timeline/flow diagrams beside prose.
  - Structure pages: a spec table, a side-by-side comparison, and a quote slide.
- All six marketplace themes, reusing each item's own `previewSlide` from the catalog.
- The list is interleaved round-robin by theme, so two slides from one visual system never sit
  side by side on the ring (including across the wrap from last to first).

## Files

- `apps/web/src/routes/landing/LandingPage.tsx` — full-viewport page shell.
- `apps/web/src/routes/landing/SlideRingHero.tsx` — ring geometry, spring orbit, drag and
  preview interactions.
- `apps/web/src/routes/landing/WordmarkOrb.tsx` — the rotating wordmark sphere (WebGL orb,
  star layer, SVG fallback).
- `apps/web/src/routes/landing/wordmark-orb-shaders.ts` — the orb's GLSL programs.
- `apps/web/src/routes/landing/slide-examples.ts` — plate definitions and theme interleaving.
- `apps/web/src/app/router/EntranceRoute.tsx` — auth-aware index route.
- `apps/web/src/app/Header.tsx` — app header; its icon links to `/landing`.
- `apps/web/src/test/routes/landing/LandingPage.test.tsx` — render, route, and plate tests.
- `apps/web/src/test/routes/landing/WordmarkOrb.test.tsx` — orb labelling, canvas layering, and
  fallback tests.
