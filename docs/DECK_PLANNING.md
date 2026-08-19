# Deck Planning

SlideSage generation uses a plan-first pipeline for new presentations:

```text
request and reviewed research
-> validated DeckPlan
-> deterministic semantic slide compilation
-> constrained content draft
-> normalized persisted presentation
```

The plan is persisted in `slides_data.deckPlan` and delivered as a `plan` SSE
event before slide events. The existing `outline` event is derived from the
same plan for clients that render outline cards.

## DeckPlan contract

Each plan has a title, audience, thesis, style, and exactly one entry per
requested slide. A plan entry contains:

- A stable slide ID.
- A bounded purpose: cover, section, context, problem, insight, solution,
  evidence, comparison, process, recommendation, or closing.
- A title and a single slide message.
- Short evidence references, normally tied to reviewed research.
- A data-only visual intent.

Supported visual intents are `none`, `image-hero`, `timeline`, `process`,
`comparison`, `metric-grid`, and `chart`. The validator bounds all collection
sizes and text fields. It rejects arbitrary CSS, coordinates, code, URLs,
styles, and unsupported chart types.

## Deterministic compilation

The server maps a validated purpose and visual intent to the existing semantic
layout allowlist before persisting the presentation. For example, comparison
intent maps to `comparison`, timeline and process map to `canvas`, metric and
chart intent map to `spotlight`, and image-hero maps to `media-right`. Cover
and section purposes always map to their corresponding layouts.

Drafting is constrained by the validated plan. The compiler, rather than the
provider, owns slide IDs, titles, and layout selection. The current milestone
persists rich intent for later deterministic widget and asset renderers; it
does not yet render plan intents as generated charts or diagrams.

## Generation stages and billing

New-deck generation has four stages: planning, drafting, design finalization,
and saving. Planning and drafting provider usage are summed before settlement.
The authorization includes a bounded planning-output allowance. Iteration
continues to revise the existing deck without creating a replacement plan.
