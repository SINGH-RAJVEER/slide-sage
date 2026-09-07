# Office editor

SlideSage uses ONLYOFFICE Docs as the browser editor for canonical PPTX revisions. SlideSage never edits the package here: the editor returns a complete PPTX, which is committed as a new immutable revision under the same conflict rules as generation and AI revisions. The evaluation that chose this provider is in [OFFICE_EDITOR_EVALUATION.md](OFFICE_EDITOR_EVALUATION.md), and the decision is recorded in [ADR 0001](adr/0001-canonical-pptx-office-editor.md).

## Endpoints

| Method and path | Caller | Authentication |
| --------------- | ------ | -------------- |
| `POST /presentations/{id}/editor/session` | Browser | Session cookie |
| `GET /presentations/{id}/editor/document` | Document server | Signed URL |
| `POST /presentations/{id}/editor/callback` | Document server | ONLYOFFICE JWT |

`POST .../editor/session` returns the document server origin, the document key, the base revision, and the signed editor configuration to hand to the ONLYOFFICE API. Pass `?mode=view` for a read-only session. A presentation with no PPTX revision returns `409`.

## Document key

```text
{presentation-id}-{revision}
```

The key changes with every revision, which is how ONLYOFFICE knows a document has been replaced rather than reopened. The stable file identity remains the presentation ID.

## Source URL

The configuration hands the document server a read-only URL scoped to one presentation and one revision, signed with HMAC-SHA256 and valid for `EDITOR_SOURCE_TOKEN_TTL` (five minutes by default). The endpoint is authenticated by that signature, never by a user cookie, because the document server fetches it server-side.

## Callback

The signed claims, not the plain request body, are the authoritative callback. A header token wraps them in `payload`; a body token carries them directly. An unsigned callback is rejected.

| Status | Meaning | Action |
| ------ | ------- | ------ |
| 1 | Editing | Acknowledged |
| 2 | Ready for saving | Commits a revision |
| 3 | Save failed | Logged and acknowledged |
| 4 | Closed with no changes | Acknowledged |
| 6 | Force save | Commits a revision |
| 7 | Force save failed | Logged and acknowledged |

For a save, SlideSage checks that the document key names this presentation, that the reporting user owns it, and that the result URL is on the document server origin. Redirects are refused outright, because a redirect would move the download off the trusted origin and let the callback choose the bytes SlideSage commits. The download is bounded by `EDITOR_MAX_SAVE_BYTES`, and the package is validated by the revision service before it is stored.

The operation ID is `onlyoffice:{key}:{sha256 of the saved bytes}`, so a retried callback carrying the same bytes for the same base revision commits once.

An editor save is the one operation allowed to commit without an expected slide count: adding and deleting slides is normal editing. A save whose base revision is behind the current revision is kept as a conflict revision without advancing the current pointer, matching the rule for every other stale write.

After a save advances the current revision, preview rendering is scheduled. A scheduling failure never fails the save: the deck is already downloadable, and the revision stays `pending` for a later claim.

## Configuration

The editor is optional. An API process with no ONLYOFFICE configuration logs that the editor is disabled and serves every other route; a partial configuration is fatal rather than silently insecure. See [Environment variables](ENVIRONMENT_VARIABLES.md).

The document server must be configured with the same JWT secret, and it must be able to reach `PUBLIC_API_URL` to download decks and post callbacks.

## Not yet implemented

- The browser has no editor iframe yet; the session endpoint is ready for it.
- Vendor licensing and production terms still need confirmation before launch, as ADR 0001 requires.
