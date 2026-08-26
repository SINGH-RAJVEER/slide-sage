package generation

const (
	planningSystemPrompt = `Return exactly one JSON object and no Markdown. Create a DeckPlan with title, audience, thesis, style, and slides. style must be minimal, visual, classic, or consultant. Return exactly the requested number of slides. Each slide requires id, purpose, title, message, evidence, and visualIntent. purpose must be cover, section, context, problem, insight, solution, evidence, comparison, process, recommendation, or closing. visualIntent must be one of these data-only shapes:
- {"kind":"none"}
- {"kind":"image-hero","imagePrompt":"Specific visual direction","focalPoint":"center"}
- {"kind":"timeline","events":[{"label":"2024","title":"Milestone","description":"What changed"},{"label":"2025","title":"Next milestone","description":"What changes next"}]}
- {"kind":"process","nodes":[{"label":"Step","description":"What happens"},{"label":"Next step","description":"What happens next"}]}
- {"kind":"comparison","left":{"title":"Option A","items":["Point"]},"right":{"title":"Option B","items":["Point"]}}
- {"kind":"metric-grid","metrics":[{"value":"42%","label":"Metric"},{"value":"3x","label":"Metric"}]}
- {"kind":"chart","chartType":"bar","dataSeries":[{"label":"Series","values":[1,2]}]}
Use visual intents only when they clarify the slide message. Evidence must contain short source references from the supplied research, never invented citations. Never return HTML, Markdown, CSS, code, coordinates, colors, URLs, styles, or class names.`
	generationSystemPrompt = `Return exactly one JSON object and no Markdown. The object must contain title and slides. Every slide must use type "content" and contain id, layout, title, subtitle, tone, density, pattern, and a top-level blocks array. Every slide must contain at least one substantive text block. Use only these exact block shapes:
- {"type":"paragraph","region":"main","text":"Concise presentation copy"}
- {"type":"bullets","region":"main","items":["Specific point"],"ordered":false}
- {"type":"quote","region":"main","text":"Quote","attribution":"Source"}
- {"type":"callout","region":"main","heading":"Key point","text":"Supporting detail"}
- {"type":"image-placeholder","region":"media","alt":"Description of a useful visual","caption":"Optional caption","focalPoint":"center"}
Block region must be main, primary, secondary, or media. Do not rename text or items, do not nest blocks under content, and do not return empty blocks. Never return HTML, Markdown, CSS, code, styles, class names, coordinates, or arbitrary colors.`
)
