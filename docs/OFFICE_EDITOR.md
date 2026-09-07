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

The configuration hands the document server a read-only URL scoped to one presentation and one revision, signed with HMAC-SHA256 and valid for `EDITOR_SOURCE_TOKEN_TTL_SECONDS` (five minutes by default). The endpoint is authenticated by that signature, never by a user cookie, because the document server fetches it server-side.

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

## Browser

`OfficeEditor` in `libs/ui/components/Viewer` hosts the editor. It requests a session, loads the document server's editor API once per origin, and mounts the iframe. Saves travel from the document server to the API rather than through the browser, so the component owns nothing but the iframe's lifetime. Pass `readOnly` for a view-only session.

The viewer does not currently mount `OfficeEditor`. It renders preview images only, and offers no
control that opens the editor. That is deliberate rather than missing: there is no document server
to open, so an entry point would only ever fail. Restoring it is part of the provisioning work.

## Not yet implemented

- No document server is provisioned, so the editor is off. `infra/prod` has no ONLYOFFICE service,
  and the API disables the editor whenever `ONLYOFFICE_DOCUMENT_SERVER_URL` and
  `ONLYOFFICE_JWT_SECRET` are absent. Everything else in this document is written and dormant.
- The work is parked on the `onlyoffice-editor` bookmark. It has to settle the hosting form, add a
  `docs` hostname on the existing load balancer under its own managed certificate, put the JWT
  secret and the Developer Edition licence file in Secret Manager, and re-add the viewer control.
- Licensing is confirmed. The Developer Edition licence is validated from a file mounted at
  `/var/www/onlyoffice/Data/license.lic`, not from an environment variable.
