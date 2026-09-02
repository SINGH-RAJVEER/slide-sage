# Chart Composition

Charts no longer exist only as whole-slide objects. An embedded chart block can share a slide with explanatory text, scaled and dressed according to each theme's layout language, with every data value printed directly on the chart so nothing depends on hover tooltips.

## Data model

`ChartBlock` extends the block union in `libs/types`:

```ts
interface ChartBlock extends BaseSlideBlock {
	type: "chart";
	chartConfig: ChartConfig;
	scale?: "inline" | "panel" | "hero";
}
```

Scales describe how much of the slide a chart claims:

| Scale  | Used for                                       | Behavior                                   |
| ------ | ---------------------------------------------- | ------------------------------------------ |
| inline | narrow columns (split secondary, sidebar rail) | constrained 4:3 aspect, compact typography |
| panel  | composition cells (media region, spotlight hero) | fills its grid cell, standard typography   |
| hero   | legacy standalone chart slides                 | near-full-bleed, preserved behavior        |

When `scale` is omitted the renderer derives it: media region or full-width region means panel, narrow column means inline. Legacy `type: "chart"` slides remain valid and render at hero scale.

Embedded charts suppress their in-canvas Chart.js title and description; the hosting figure renders them as themed HTML text (`figcaption`) so captions use the theme display font, wrap correctly, stay selectable, and appear as text in exports. Explanatory prose always lives in sibling text blocks, never inside the chart canvas.

## Always-visible values

A custom Chart.js plugin (`ssValueLabels`, registered in `ChartRenderer`) draws each data point's value after datasets render:

- bars label just past the free end of the bar,
- line/radar points label above (outward for radar),
- pie/doughnut/polarArea slices label along the mid-angle,
- labels that would collide horizontally are skipped,
- large numbers compact (`12k`, `3.4M`).

Disable per chart with `options.plugins.ssValueLabels.display = false`.

## Theming

Structural styles live under `.ss-chart-block` in `viewer.css` and are built from `--ss-*` custom properties only. Each theme then adds a dressing section keyed by `[data-theme]` following its layout language: Signal Grid uses a hairline exhibit panel with an accent rule; Midnight Terminal floats the chart frameless with a terminal tick caption; Monochrome Grid stays frameless; Kinetic Blocks uses a poster card with hard offset shadow; Editorial Ledger uses print-figure rules above and below with serif italic captions; Field Notes uses a dashed sketch frame; the six marketplace themes each have their own treatment.

A card-within-card guard strips panel dressing when a chart sits inside comparison panels or sidebar rails, which already carry surface treatment.

## Generation pipeline

In `apps/api/internal/presentation`:

- `layoutForPlan` routes chart intents by evidence size: at most two series and eight total points compile to `split` (chart beside prose); richer series compile to `spotlight` (chart as hero, message and evidence around it).
- `applyChartIntent` deterministically compiles the intent into a chart block (secondary region for splits, primary + hero emphasis otherwise), reusing a draft-supplied chart config when valid, synthesizing one from the validated series otherwise, and injecting the plan message as explanatory text when the draft supplied none.
- `normalizeBlocks` accepts `type: "chart"` blocks inside content slides and validates them against the same bounded contract as standalone chart slides.

## Scene engine and exports

- `slideToScene` treats chart widgets as the visual partner in split compositions, placing them in their own grid column beside body text.
- The scene chart widget now receives the theme palette, grid color, and font, and switches to compact density in narrow bounds.
- OOXML template export does not create native PowerPoint charts. It rejects standalone chart slides and content slides containing embedded chart blocks rather than producing a partial result.
