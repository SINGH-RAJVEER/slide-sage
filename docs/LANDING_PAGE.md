# Landing Page

The landing page is the public entry point at `/` for visitors without a session. It is a single full-viewport hero: template covers orbiting the SlideSage wordmark on the app's signature deep navy. There is no header, copy, or footer — the ring is the page.

## Route Behaviour

- The index route renders `EntranceRoute` (`apps/web/src/app/router/EntranceRoute.tsx`).
- Anonymous visitors see the landing page instead of being redirected straight to sign-in.
- Signed-in visitors go wherever their default-page setting points. `generate` and `presentations` forward through `HomePage` as before; `landing` keeps them on the landing page.
- `/landing` renders the landing page for everyone, signed in or not. The app header's SlideSage icon links there (`ROUTES.landing`), so clicking the icon from anywhere in the app always reaches the landing page.
- All other guarded routes keep the existing `RequireSignedInLayout` redirect to sign-in with a `redirect_url`.

## Hero: Slide Ring

`SlideRingHero` (`apps/web/src/routes/landing/SlideRingHero.tsx`) is a DOM ring adapted from the ThreeUI Gallery Heading reference (matte variant, rising-diagonal axis):

- The background is the SlideSage signature navy (`#161b27`) with the app's soft top glow.
- The wordmark is a rotating smoke sphere (`WordmarkOrb`), adapted from the ThreeUI energy-orb reference: raw WebGL renders a procedural fbm smoke sphere with a fresnel rim, outer glow, and a Canvas 2D star layer, all recoloured to the SlideSage palette — deep navy `#04172f`, icon blue `#0d3762`, steel highlights. "SlideSage" is painted twice onto an offscreen canvas texture (Yellowtail script with the wordmark's halo fill and dark navy outline) and mapped onto the sphere through the rotating normal's spherical coordinates, so one wordmark rotates out of view exactly as the next rotates in — one per visible hemisphere. The sphere completes one revolution per 26 seconds, matching the ring.
- A particle warp radiates from behind the sphere, adapted from the ThreeUI Constellation Field particle-network reference: particles spawn on a disc at far z behind the orb and fly toward the viewer, drawn as hairline streaks from their previous projection to their current one in restrained steel-white and brand-blue hues. The streak layer sits directly under the sphere canvas on a full-bleed transparent canvas whose trails are kept crisp by erasing toward nothing each frame (`destination-out`), so they never smear over the hero gradient or clip at the sphere stage's edge.
- The orb paints its first frame synchronously so it is never blank on first paint, pauses when off-screen or when the tab is hidden, and honours `prefers-reduced-motion: reduce` by rendering one static frame. Without WebGL it falls back to the flat SVG wordmark the hero used before the orb.
- Eight plates sit on a tilted ellipse. Plates behind the orb render at a lower z-index, plates in front above it, so orbiting plates pass over the sphere exactly as in the reference.
- The ring is in constant orbit — one revolution every 26 seconds — irrespective of the cursor or anything else. Dragging horizontally spins it directly in proportion to the drag's length — dragging right pushes the front plates right, like grabbing the ring — and on release the constant orbit resumes from where the drag left it, with no flick or momentum. A drag under six pixels counts as a click instead.
- Clicking a plate opens a hovering preview: the same cover at 68 percent of the hero's width over a blurred backdrop, captioned with the template name. Clicking anywhere outside it or pressing Escape dismisses it, while the ring keeps turning behind it.
- The sphere is the page's call to action: it is a link to `/sign-up` (keyboard focusable, pointer cursor), and the no-WebGL fallback wordmark links there too. Ring drags that pass over the sphere never fire the navigation — pointer travel across the link is tracked and past six pixels the click is suppressed, matching the plates' tap-versus-drag slop.
- `prefers-reduced-motion: reduce` disables the orbit entirely; the ring renders one static frame.

## The Plates

Each plate is a published template's cover thumbnail, served from the CDN through the API's signed `template-thumbnails` endpoint — the same image the marketplace shows. The landing page ships no slide fixtures of its own, so it cannot drift from what the product actually produces.

`apps/web/src/routes/landing/landing-plates.ts` selects them:

- The pool is every marketplace template that is published (a digest exists in the catalog) and 16:9, so a plate never letterboxes and never points at a missing thumbnail.
- `randomLandingPlates` shuffles that pool and takes the first eight. The sample is drawn once per mount, so the ring differs between visits and no single template becomes the page's face.
- The random source is injectable, which is how the tests pin a selection.
- If the catalog has fewer than eight publishable templates, the ring simply carries fewer plates.

## Files

- `apps/web/src/routes/landing/LandingPage.tsx` — full-viewport page shell.
- `apps/web/src/routes/landing/SlideRingHero.tsx` — ring geometry, spring orbit, drag and preview interactions.
- `apps/web/src/routes/landing/WordmarkOrb.tsx` — the rotating wordmark sphere (WebGL orb, star layer, SVG fallback).
- `apps/web/src/routes/landing/wordmark-orb-shaders.ts` — the orb's GLSL programs.
- `apps/web/src/routes/landing/landing-plates.ts` — the CDN plate sample and its randomiser.
- `apps/web/src/app/router/EntranceRoute.tsx` — auth- and preference-aware index route.
- `libs/ui/components/Settings/LandingPreference.tsx` — the default-page picker, including the landing option.
- `apps/web/src/app/Header.tsx` — app header; its icon links to `/landing`.
- `apps/web/src/test/routes/landing/LandingPage.test.tsx` — render, route, and plate tests.
- `apps/web/src/test/routes/landing/WordmarkOrb.test.tsx` — orb labelling, canvas layering, and fallback tests.
