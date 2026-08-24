# Landing Page

The landing page is the public entry point at `/` for visitors without a session. It opens on a
canvas hero: static slide thumbnails orbiting the SlideSage wordmark, in the app's signature
deep navy.

## Route Behaviour

- The index route renders `EntranceRoute` (`apps/web/src/app/router/EntranceRoute.tsx`).
- Signed-in visitors are sent to the existing app home (presentations or generate, via
  `HomePage`), so authenticated behaviour is unchanged.
- Anonymous visitors see the landing page instead of being redirected straight to sign-in.
- All other guarded routes keep the existing `RequireSignedInLayout` redirect to sign-in with a
  `redirect_url`.

## Hero: Slide Ring

`SlideRingHero` (`apps/web/src/routes/landing/SlideRingHero.tsx`) is a single Canvas 2D element,
adapted from the ThreeUI Gallery Heading reference (matte variant, rising-diagonal axis):

- The background is the SlideSage signature navy (`#161b27`) with the app's soft top glow, so
  the canvas blends into the page shell.
- The wordmark `slidesage` sits at the center, fitted by measurement to at most 52 percent of
  the frame width so the ring clears it at rest.
- Twelve 4:3 plates are arranged on a tilted ellipse. Plates behind the wordmark draw first,
  the wordmark next, plates in front last, so orbiting plates pass over the text exactly as in
  the reference.
- The ring holds still until the pointer arrives, then springs into orbit (stiffness 26,
  damping 5.7) and springs to a stop when the pointer leaves — the reference's own motion
  model. One revolution takes 26 seconds.
- `prefers-reduced-motion: reduce` disables the orbit entirely; the ring renders one static
  frame.

## Static Slide Plates

The plates are fixed images, not live slides. At startup each entry in
`apps/web/src/routes/landing/slide-examples.ts` is painted once into an offscreen canvas
(640x480) and never re-rendered:

- The plate background is the theme's own flat colour shaded by a procedural value-noise field
  (never a gradient), finished with a fine grain overlay — the reference's matte treatment.
- The slide's content is set in the theme's real visual system from `getTemplate`: eyebrow in
  the accent colour, title in the theme's display face (shrunk to fit two lines before falling
  back to an ellipsis), subtitle in the muted tone, and the lower half shows the slide's stats
  or bullet lines.
- The twelve examples span eight themes — Midnight Terminal, Neon District, Terra Mesa, Concrete
  Brutal, Velvet Marquee, Bubblegum Pop, Elegant Serif, and Draft Board — using the sample deck
  copy authored for the landing page.

## Files

- `apps/web/src/routes/landing/LandingPage.tsx` — page composition: header, hero, tagline,
  calls to action, footer.
- `apps/web/src/routes/landing/SlideRingHero.tsx` — canvas hero: plate painting, ring
  geometry, wordmark, spring orbit.
- `apps/web/src/routes/landing/slide-examples.ts` — the frozen slide examples painted onto the
  plates.
- `apps/web/src/app/router/EntranceRoute.tsx` — auth-aware index route.
- `apps/web/src/test/routes/landing/LandingPage.test.tsx` — render, route, and example-data
  tests.
