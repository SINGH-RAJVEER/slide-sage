# Landing Page

The landing page is the public entry point at `/` for visitors without a session. It introduces
SlideSage with a canvas-animated hero and a rotating carousel of sample slides, each rendered in
a different theme by the production slide renderer.

## Route Behaviour

- The index route renders `EntranceRoute` (`apps/web/src/app/router/EntranceRoute.tsx`).
- Signed-in visitors are sent to the existing app home (presentations or generate, via
  `HomePage`), so authenticated behaviour is unchanged.
- Anonymous visitors see the landing page instead of being redirected straight to sign-in.
- All other guarded routes keep the existing `RequireSignedInLayout` redirect to sign-in with a
  `redirect_url`.

## Hero: Gallery Heading

The hero uses the `GalleryHeading` component from `@designcodeio/threeui` (already a workspace
dependency). It renders a sandboxed iframe with a Canvas 2D animation: an oversized two-line
headline ringed by twelve 4:3 plates shaded by a procedural noise field. The plates hold still
until the pointer arrives, then orbit; each variant has its own field, typography, and orbit
direction.

## Galleries and the Carousel

Four galleries pair one `GalleryHeading` variant with one SlideSage theme and a two-slide sample
deck authored in `apps/web/src/routes/landing/landing-galleries.ts`:

| Gallery | Theme | Variant (field) |
| --- | --- | --- |
| Midnight Terminal | `modern-dark` | `rising-diagonal` (matte) |
| Neon District | `neon-district` | `falling-diagonal` (glitch) |
| Terra Mesa | `terra-mesa` | `horizontal-sweep` (riso) |
| Concrete Brutal | `concrete-brutal` | `vertical-loop` (halftone) |

`ThemeSlideCarousel` renders the active sample slide through `ScaledSlide` and `SlideRenderer`
with the gallery's theme id, so every example is a real renderer output rather than a screenshot.

A single flat position drives both the hero and the carousel: each step advances one slide, and
after a gallery's last slide the next gallery begins, switching the hero variant in step. The
position wraps around after all eight slides.

## Playback Rules

- Autoplay advances every 5.2 seconds while the tab is visible.
- Hovering or focusing the carousel pauses playback; leaving resumes it.
- A play/pause toggle sets the autoplay preference, shown as the effective state.
- `prefers-reduced-motion: reduce` disables autoplay entirely; manual controls still work.
- Previous/next controls step one slide; the theme tabs jump to a gallery's first slide.
- An `aria-live` region announces the current slide for screen readers.

## Files

- `apps/web/src/routes/landing/LandingPage.tsx` — page composition, playback state, hero.
- `apps/web/src/routes/landing/ThemeSlideCarousel.tsx` — carousel stage, controls, theme tabs.
- `apps/web/src/routes/landing/landing-galleries.ts` — gallery definitions, sample slides, and
  flat-position helpers.
- `apps/web/src/app/router/EntranceRoute.tsx` — auth-aware index route.
- `apps/web/src/test/routes/landing/LandingPage.test.tsx` — render and interaction tests.
