# Landing Page

The landing page is the public entry point at `/` for visitors without a session. It is a single
full-viewport hero: real slide thumbnails orbiting the SlideSage wordmark on the app's signature
deep navy. There is no header, copy, or footer — the ring is the page.

## Route Behaviour

- The index route renders `EntranceRoute` (`apps/web/src/app/router/EntranceRoute.tsx`).
- Signed-in visitors are sent to the existing app home (presentations or generate, via
  `HomePage`), so authenticated behaviour is unchanged.
- Anonymous visitors see the landing page instead of being redirected straight to sign-in.
- All other guarded routes keep the existing `RequireSignedInLayout` redirect to sign-in with a
  `redirect_url`.

## Hero: Slide Ring

`SlideRingHero` (`apps/web/src/routes/landing/SlideRingHero.tsx`) is a DOM ring adapted from the
ThreeUI Gallery Heading reference (matte variant, rising-diagonal axis):

- The background is the SlideSage signature navy (`#161b27`) with the app's soft top glow.
- The wordmark is the shipped `icon.webp` itself — same script face, same halo — centered with
  layered `drop-shadow` filters, so the mark on the page matches the product icon exactly.
- Fifteen plates sit on a tilted ellipse. Plates behind the wordmark render at a lower z-index,
  plates in front above it, so orbiting plates pass over the mark exactly as in the reference.
- The ring holds still until the pointer arrives, then springs into orbit (stiffness 26,
  damping 5.7) and springs to a stop when the pointer leaves — the reference's own motion
  model. One revolution takes 26 seconds.
- `prefers-reduced-motion: reduce` disables the orbit entirely; the ring renders one static
  frame.

## The Plates

Each plate is a real slide rendered by the production pipeline — `SlideRenderer` inside
`ScaledSlide` at the canonical 1280x720 16:9 canvas, scaled down to plate size — the same
implementation the viewer and the marketplace previews use. Plates are positioned, faded, and
scaled per frame, but their content never changes.

`apps/web/src/routes/landing/slide-examples.ts` defines the plates:

- Nine authored slides across Midnight Terminal, Neon District, Terra Mesa, Concrete Brutal, and
  Editorial Ledger, using the sample deck copy written for the landing page.
- All six marketplace themes, reusing each item's own `previewSlide` from the catalog.
- The list is interleaved round-robin by theme, so two slides from one visual system never sit
  side by side on the ring (including across the wrap from last to first).

## Files

- `apps/web/src/routes/landing/LandingPage.tsx` — full-viewport page shell.
- `apps/web/src/routes/landing/SlideRingHero.tsx` — ring geometry, spring orbit, wordmark.
- `apps/web/src/routes/landing/slide-examples.ts` — plate definitions and theme interleaving.
- `apps/web/src/app/router/EntranceRoute.tsx` — auth-aware index route.
- `apps/web/src/test/routes/landing/LandingPage.test.tsx` — render, route, and plate tests.
