# Presentations API

Endpoints for managing presentations and AI generation.

## Base URL

- **Development**: `http://localhost:8000/api`
- **Production**: `VITE_API_URL` + `/api`

## Authentication

All presentation endpoints require a valid session cookie. Clients must send cookies:

```bash
fetch(`${API_URL}/api/presentations`, {
    credentials: "include",
});
```

---

## POST /api/generate-presentation-stream

Generate a new presentation with Server-Sent Events (SSE) streaming.

The endpoint estimates the point cost from `slide_count`, `detail_level`, and `tonality` before
streaming begins. If the authenticated user does not have enough points, it returns `402` and no
presentation record is created. After a successful save, the same estimate is deducted from
`users.slide_tokens`.

After a successful save, the API also stores semantic memory for future retrieval:
slide summaries, deck summary, prompt event, style memory, source chunks when available, and a
few-shot example of the generated deck. The exact deck JSON remains in `presentations.slides_data`.

### Headers

```bash
Content-Type: application/json
```

### Request Body

```json
{
    "topic": "Introduction to Machine Learning",
    "slide_count": 8,
    "detail_level": "balanced",
    "tonality": "professional",
    "research": {
        "enabled": true,
        "freshness": "week",
        "maxResults": 5
    },
    "research_payload": {
        "summary": "Optional research summary",
        "sources": [
            {
                "url": "https://example.com",
                "title": "Example",
                "snippet": "Summary excerpt",
                "retrieved_at": "2026-01-04T12:00:00Z"
            }
        ]
    }
}
```

### Field Details

- `topic` (required): String, 1-500 characters
- `slide_count` (required): Integer, 1-50
- `detail_level` (optional): One of `brief`, `concise`, `balanced`, `detailed`, `comprehensive` (default: `balanced`)
- `tonality` (optional): One of `professional`, `casual`, `enthusiastic`, `persuasive` (default: `professional`)
- `research` (optional): Web research settings
    - `enabled` (boolean): Enable/disable web research
    - `freshness` (optional): `day`, `week`, `month`, `year`
    - `maxResults` (optional): 1-10
    - `includeDomains` / `excludeDomains` (optional): Domain filters for Exa search
    - `startPublishedDate` / `endPublishedDate` (optional): ISO date filters for Exa search
    - `maxAgeHours` (optional): Maximum age for fetched Exa result contents
- `research_payload` (optional): Pre-fetched research summary and sources (usually from `/api/research-presentation`)

### Response (200 OK - SSE Stream)

Content-Type: `text/event-stream`

#### Events Sequence

1. **created** - Presentation ID created

```
event: created
data: {"presentation_id": "presentation-id"}
```

2. **theme** - Theme selected

```
event: theme
data: {"theme": "modern"}
```

3. **slide** - Individual slide generated (repeated for each slide)

```
event: slide
data: {"slide": {...}, "title": "Presentation Title"}
```

4. **complete** - Generation complete

```
event: complete
data: {"slides": [...], "theme": "modern", "title": "...", "tokens_used": 5000}
```

5. **saved** - Presentation saved to database

```
event: saved
data: {"presentation_id": "presentation-id", "success": true, "slide_tokens_remaining": 42.5}
```

6. **error** - Error occurred

```
event: error
data: {"error": "Error message"}
```

### Client-side SSE Implementation (POST + fetch)

```javascript
const response = await fetch("/api/generate-presentation-stream", {
    method: "POST",
    credentials: "include",
    headers: {
        "Content-Type": "application/json",
    },
    body: JSON.stringify({
        topic: "Introduction to AI",
        slide_count: 5,
    }),
});

if (!response.ok || !response.body) {
    throw new Error("Failed to start stream");
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE frames from buffer here.
}
```

### Error Responses

- `400`: Validation failed
- `401`: Not signed in
- `402`: Insufficient points
- `500`: Internal error

Example insufficient-points response:

```json
{
    "error": {
        "message": "Insufficient points",
        "code": "INSUFFICIENT_TOKENS"
    },
    "slide_tokens_remaining": 1.5,
    "slide_tokens_required": 4,
    "slide_tokens_shortfall": 2.5
}
```

---

## POST /api/research-presentation

Run a research prepass before generation. Returns a summary and sources that can be passed to `research_payload`.
The search query and returned source snippets are stored as embeddings for later retrieval, but live
search is still required for latest-information prompts.

### Request Body

```json
{
    "topic": "Introduction to Machine Learning",
    "research": {
        "enabled": true,
        "freshness": "week",
        "maxResults": 5
    }
}
```

### Success Response (200 OK)

```json
{
    "summary": "Research summary text",
    "sources": [
        {
            "url": "https://example.com",
            "title": "Example",
            "snippet": "Summary excerpt",
            "retrieved_at": "2026-01-04T12:00:00Z",
            "published_date": "2026-01-03",
            "author": "Example Author",
            "summary": "Exa-generated page summary",
            "highlights": ["Relevant Exa highlight"]
        }
    ],
    "tokens_used": 1200,
    "tokens_estimated": 1400
}
```

### Error Responses

- `400`: Missing required fields
- `401`: Not signed in

---

## POST /api/iterate-presentation-stream

Iterate on an existing presentation with streaming.

Iteration uses the same point estimate, `402` insufficient-points response, and saved-event
`slide_tokens_remaining` payload as presentation generation.

Before generating the iteration, the API retrieves semantic memory for the deck, including relevant
slide summaries, prompt history, source chunks, templates, examples, style, and feedback. After a
successful save, current slide/deck/style/source memories are refreshed and the prompt/feedback
history is preserved.

### Request Body

```json
{
    "parent_presentation_id": "presentation-id",
    "feedback": "Make this more concise",
    "slide_count": 6,
    "detail_level": "concise",
    "tonality": "professional",
    "research": {
        "enabled": false
    }
}
```

### Response

SSE stream with the same event types as `/api/generate-presentation-stream`.

---

## GET /api/presentations

Get all presentations for the authenticated user.

### Success Response (200 OK)

```json
{
    "presentations": [
        {
            "id": "presentation-id",
            "title": "Introduction to ML",
            "slide_count": 8,
            "created_at": "2026-01-04T12:00:00Z",
            "updated_at": "2026-01-04T12:00:00Z"
        }
    ]
}
```

### Error Responses

- `401`: Not signed in

---

## GET /api/presentations/:id

Get a specific presentation with full slide data.

### Success Response (200 OK)

```json
{
    "presentation": {
        "id": "presentation-id",
        "title": "Introduction to ML",
        "prompt": "Original prompt",
        "slides_data": {
            "slides": [
                {
                    "id": "slide-id",
                    "title": "What is Machine Learning?",
                    "content": [
                        {
                            "type": "text",
                            "text": "Machine learning is..."
                        }
                    ],
                    "layout": "title-content"
                }
            ],
            "theme": "modern",
            "title": "Introduction to ML",
            "totalSlides": 8
        },
        "created_at": "2026-01-04T12:00:00Z",
        "updated_at": "2026-01-04T12:00:00Z"
    }
}
```

### Error Responses

- `401`: Not signed in
- `403`: Unauthorized access
- `404`: Presentation not found

---

## DELETE /api/presentations/:id

Delete a specific presentation.

### Success Response (200 OK)

```json
{
    "message": "Presentation deleted successfully"
}
```

### Error Responses

- `401`: Not signed in
- `403`: Unauthorized access
- `404`: Presentation not found

---

For authentication endpoints, see [AUTH_API.md](AUTH_API.md).
