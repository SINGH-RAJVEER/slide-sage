# Embeddable Office editor evaluation

Research date: 2026-09-03

## Decision context

SlideSage has chosen a full browser-based Office editor with separate LibreOffice preview workers. The intended architecture makes PPTX the canonical editable artifact. Editor saves create immutable PPTX revisions in object storage. LibreOffice workers consume a committed revision and create raster previews; they never write the canonical file.

This document uses only first-party product sites, official documentation, official source repositories, and Microsoft's WOPI specification. Statements marked **Fact** report those sources. Statements marked **Recommendation** are engineering judgments for SlideSage. Licensing observations summarize vendor materials and are not legal conclusions.

## Short answer

**Recommendation:** Target self-hosted **ONLYOFFICE Docs Developer** first. Its native editor configuration accepts an absolute source URL, and its documented save flow calls an application callback with a URL from which the application downloads the assembled PPTX. That maps directly to SlideSage's Go API, object storage, and immutable revision model. ONLYOFFICE also describes Docs Developer as the edition for embedding in a SaaS product. Obtain written production, server, connection, multi-tenancy, branding, and redistribution terms before committing to it.[S6][S7][S9][S10]

Do not make Microsoft 365 for the web the initial dependency. SlideSage appears technically capable of becoming a WOPI host, but Microsoft's production service is available through the Cloud Storage Partner Program, whose stated audience and required product behavior are broader than a presentation editor. Admission and production approval are not automatic.[S1][S2][S4]

Keep Collabora Online as the fallback if an open WOPI integration, control of the full stack, or Collabora's commercial terms outweigh the simpler ONLYOFFICE callback flow. Use CODE only for evaluation. Collabora says CODE is not recommended for production; its supported Collabora Online subscriptions provide LTS, an SLA, signed security updates, and commercial support.[S12][S13][S14]

No official source reviewed provides a controlled, current comparison proving that one non-Microsoft editor preserves SlideSage's PPTX templates better than the other. Run the same fidelity suite against both paid trial builds before signing a production contract.

## Comparison

| Criterion | Microsoft 365 for the web | ONLYOFFICE Docs | Collabora Online |
| --- | --- | --- | --- |
| Availability | CSPP application, individual suitability review, verification, and production allow-list rollout | Self-hosted or vendor cloud; Developer edition is marketed for embedding in SaaS | Self-hosted; CODE for testing, supported Collabora Online for production |
| PPTX editing | PowerPoint for the web through WOPI | Presentation editor lists PPTX as a supported source format and uses PPTX as a native assembled format | Impress lists PPTX support; current discovery advertises `edit`, `view`, and `editnew` for PPTX |
| Host integration | WOPI REST host plus iframe host page and PostMessage | JavaScript editor config plus source URL and callback URL; WOPI is also available | WOPI host plus iframe/PostMessage integration |
| Save contract | Editor calls host `PutFile` with the complete binary body | Editor POSTs status to `callbackUrl`; host downloads the result from callback `url` | Editor calls host `PutFile` with the complete binary body |
| Object storage fit | Keep storage behind WOPI, or optionally expose a direct read `FileUrl`; writes still go to the WOPI host | Source can be an expiring absolute URL; callback result must be downloaded and committed by SlideSage | Keep storage behind WOPI; Collabora fetches from and uploads to the WOPI host |
| Go backend fit | Good, protocol is HTTP/JSON/binary but implementation is substantial | Good, protocol is HTTP/JSON/JWT and file download | Good, protocol is HTTP/JSON/binary but requires WOPI locks and versions |
| SaaS licensing signal | Users need qualifying Microsoft 365 licenses to edit; partner eligibility and integration terms also apply | Vendor explicitly positions Docs Developer for integrating into a SaaS product | Vendor says Collabora Online is for hosting and cloud businesses; production subscription details still need a quote |
| Main obstacle | Program eligibility and mandatory suite-wide WOPI/product work | Commercial terms and measured PPTX fidelity | WOPI implementation, stateful editor operations, commercial terms, and measured PPTX fidelity |

## Microsoft 365 for the web and WOPI

### Eligibility and approval facts

- **Fact:** Microsoft says CSPP is for independent software vendors whose business is cloud storage and is not open directly to Microsoft 365 customers. Its definition includes operating a SaaS that stores all end-user files at rest in cloud infrastructure owned or leased by the partner, controlling identity and WOPI host domains, and serving more than one external customer. Microsoft reviews every application for suitability.[S1]
- **Fact:** A CSPP partner must support upload, download, viewing, and editing in Word, Excel, and PowerPoint for the web even if its published product exposes only a subset.[S1]
- **Fact:** Production verification requires all applicable WOPI Validator categories, all three Office applications, and testable multi-user co-authoring. Microsoft requires two test accounts that can upload test files and exercise co-authoring.[S4]
- **Fact:** After verification and sign-off, Microsoft says production domain configuration takes four to five weeks to deploy. Later allow-list changes also take four to five weeks.[S4][S5]
- **Fact:** Users need a valid Microsoft 365 license to edit, while read-only operations do not require one. For business users, the host must implement Microsoft's business-user flow and validate that the user has `SHAREPOINTWAC` or an equivalent service plan.[S3]
- **Fact:** Microsoft 365 for the web only calls production WOPI domains on its allow list. The partner must own the domains, use a dedicated production WOPI subdomain, and avoid serving user-controlled content from that domain.[S5]

### Integration facts

- **Fact:** Microsoft 365 for the web is a WOPI client. SlideSage would be the WOPI host and implement discovery handling, `CheckFileInfo`, `GetFile`, `PutFile`, lock operations, versions, access tokens, and the other operations required by enabled features.[S1][S2][S4]
- **Fact:** A WOPI file ID must be URL-safe, identify one file, remain stable through edits, moves, and renames, and be identical for every user accessing a shared file. Access tokens should be scoped to one user and resource and remain valid until their advertised expiry. WOPI locks expire after 30 minutes unless refreshed and are attached to a file rather than a user.[S15]
- **Fact:** `GetFile` returns the complete file body. A host may instead provide a direct `FileUrl` in `CheckFileInfo` for reads. `PutFile` sends the complete updated binary to `POST /wopi/files/{file_id}/contents` and normally includes the current WOPI lock.[S16][S17]
- **Fact:** The host page embeds the discovered Office action URL in an iframe, sends the access token and expiry by form POST, passes through `wd*` parameters, and handles PostMessage integration. Microsoft also prescribes iframe sandbox, clipboard, CSS, viewport, and cache behavior.[S18]

### SlideSage assessment

- **Recommendation:** Treat CSPP eligibility as unresolved, not assumed. SlideSage stores presentation files, but Microsoft's wording says the program is for ISVs whose business is cloud storage and demands a broad file-storage experience. Ask Microsoft to confirm eligibility before building a Microsoft-specific WOPI host.
- **Recommendation:** If Microsoft accepts SlideSage, model `presentation_id` as the stable WOPI file ID and the database revision as WOPI `Version`. Persist locks in PostgreSQL or another shared low-latency store so every Go API instance sees the same lock. Commit each successful `PutFile` atomically as a new immutable object and return its new version.
- **Recommendation:** Do not expose a raw object-store signed URL as `WOPISrc`. `WOPISrc` is the callback address for WOPI operations and must remain stable. A signed URL may be used as optional `FileUrl` only if its lifetime and redirect behavior meet the session and allow-list requirements. Serving `GetFile` through the Go host is simpler and keeps authorization and audit behavior in one place.
- **Recommendation:** The mandatory Word and Excel upload/edit/co-authoring work is disproportionate for a PPTX-only first release. This, rather than Go compatibility, rules Microsoft out as the initial target.

## ONLYOFFICE Docs

### Integration facts

- **Fact:** ONLYOFFICE Docs can be self-hosted on Linux, Windows, or Docker. The application embeds the editor with the Document Server's JavaScript API and initializes it with a document `key`, absolute document `url`, type, permissions, and `editorConfig.callbackUrl`.[S6][S7]
- **Fact:** PPTX is a supported presentation `fileType`. ONLYOFFICE describes `.docx`, `.xlsx`, `.pptx`, and `.pdf` as native editor formats. The document service downloads the source from the configured URL.[S7][S8]
- **Fact:** The document `key` identifies the editor cache entry. It must change after a document has been edited and saved. `referenceData.fileKey`, by contrast, is intended as the stable application file identity.[S8]
- **Fact:** ONLYOFFICE signs integration messages with JWT using a secret shared by the integrator and Document Server. The server validates a signed config and uses its token payload rather than conflicting request parameters. Local or private source URLs require a token and must still be network-reachable from Document Server.[S6][S19]
- **Fact:** On normal session completion, Document Server POSTs to `callbackUrl`. Status `2` means the document is ready to save, and the `url` field points to the assembled file that the storage service must download. The callback handler must return `{"error": 0}` on success. Status `6` carries a force-saved current state.[S9][S20]
- **Fact:** A normal final save commonly arrives about ten seconds after editing ends. Force-save may be triggered by the command service, the editor Save button, or a server timer. Force-save revisions do not create separate entries in ONLYOFFICE's document history.[S20]

### Licensing facts

- **Fact:** ONLYOFFICE distributes the Community edition under AGPLv3 with additional terms. Its current license FAQ states the vendor's view that an application or website incorporating ONLYOFFICE source code must also be released under AGPLv3, and directs customers who cannot use AGPL to sales. Version 9.4 removed the Community edition's former 20-connection limit but updated attribution, notice, modified-version labeling, and trademark terms.[S11][S21]
- **Fact:** ONLYOFFICE says Docs Developer uses a commercial license and is intended for integrating the editors into an application and providing them to end users as part of that service. The current pricing page specifically says the Developer license allows integration into a SaaS product and offers development or production licensing, server/connection choices, multi-tenancy, clustering, and branding options.[S10][S21]
- **Fact:** The current Developer pricing page defines a simultaneous connection as one browser tab open for editing. Once the licensed limit is reached, later documents open read-only. It displays a configured starting total, but production, scaling, and branding choices can change the quote.[S10]
- **Fact:** Docs Enterprise is presented for integration into a company's own business platform, and its listed user metric counts people who can access editing. Its public FAQ says white label is not included. That positioning is less directly aligned with a customer-facing SaaS than Docs Developer.[S22]

### SlideSage assessment

- **Recommendation:** Use the native Docs API, not ONLYOFFICE's optional WOPI mode, for the first integration. It removes WOPI lock and discovery work and gives SlideSage the requested callback-based revision save.
- **Recommendation:** Generate `document.key` from the stable presentation ID plus committed revision, for example a bounded hash of `presentation_id:revision`. Set `referenceData.fileKey` to the stable presentation ID. Never reuse a key after accepting a save because ONLYOFFICE may return the cached document for a known key.[S8]
- **Recommendation:** Supply a short-lived, read-only object-store signed URL as `document.url`, or an authenticated Go download endpoint if URL expiry proves fragile. Its expiry must cover editor startup and Document Server's source fetch. Do not grant write access through that URL.
- **Recommendation:** Make the Go callback idempotent. Verify the ONLYOFFICE JWT, validate callback key and expected base revision, accept status `2` as the final session save, optionally accept status `6` as a checkpoint, download only from the configured Document Server origin, enforce size and content-type limits, validate that the result is a PPTX ZIP, and write a new immutable object before committing the database revision. Return `{"error": 0}` only after durable commit.
- **Recommendation:** Do not overwrite the source object. If the expected base revision is no longer current, preserve the upload as a conflict revision and require user resolution rather than silently replacing the canonical head.
- **Recommendation:** Run Document Server as dedicated stateful infrastructure, not inside the request-driven Go API service. Its documented health check covers databases, a message broker, Redis, and storage, and editing sessions outlive ordinary API requests.[S6]

## Collabora Online

### Integration facts

- **Fact:** Collabora Online is a browser office suite that can be integrated into the customer's infrastructure. Its Impress editor lists PPTX support, and the current official discovery file advertises `edit`, `view`, and `editnew` actions for `.pptx`.[S13][S23]
- **Fact:** Collabora's published integration route is WOPI. Its official materials direct integrators to a WOPI URL and SDK, and its current configuration enables WOPI storage with host allow lists, access-token lifetime handling, locks, HTTPS settings, and upload intervals.[S12][S24]
- **Fact:** Collabora's official test WOPI host implements `CheckFileInfo`, `GetFile`, lock operations, and `PutFile`; its `PutFile` handler receives the edited binary and updates storage. This confirms that a Collabora integration saves through the WOPI host rather than an ONLYOFFICE-style status callback containing a download URL.[S25]
- **Fact:** Collabora describes its service as stateful for scaled deployments: requests for one document must reach the same pod. Its Controller and routing-token design provide that affinity.[S12]
- **Fact:** Current server defaults include a 30-second connection timeout for server-initiated calls such as WOPI, a 30-second idle-save interval, a five-minute autosave interval, a five-second minimum between uploads, and a save/upload on last-editor exit when the document changed.[S24]

### Licensing and production facts

- **Fact:** Collabora says CODE is a rolling development edition for testing, home use, and small teams and is not recommended for production.[S14]
- **Fact:** Collabora's production subscription page lists an on-premises Business plan for up to 99 users and a quoted Enterprise plan for 100 or more users. Both list LTS, an SLA, signed security updates, maintenance, and a customer portal; Enterprise also lists integration support and customization. Public prices and terms can change, so a quote is needed.[S13]
- **Fact:** Collabora says its production subscriptions are based on users per year. On its integration page, a user is a person with an account that can create, edit, and collaborate; it says external users who co-edit or review without an account are not charged. Confirm that definition in the contract for SlideSage's sharing model.[S12]
- **Fact:** The official source repository says Collabora Online is primarily MPL-2.0, with some components under other licenses. The supported production packages and services are offered by subscription even though the source is open.[S26][S27]

### SlideSage assessment

- **Recommendation:** A Go WOPI host is straightforward at the transport layer but larger than the ONLYOFFICE callback adapter. Reuse one provider-neutral storage module for `CheckFileInfo`, full-file reads, lock compare-and-swap, full-file writes, immutable revision commits, and audit events.
- **Recommendation:** Keep GCS private behind the WOPI endpoints. A direct signed read URL buys little because the Go host still has to authorize `CheckFileInfo`, handle locks, and receive `PutFile`. Proxying reads also avoids signed-URL expiry during long sessions.
- **Recommendation:** Treat each successful `PutFile` as a revision-save callback. It is not the callback shape requested in the narrow sense: Collabora POSTs the edited bytes to the WOPI contents endpoint instead of POSTing metadata with a temporary result URL.
- **Recommendation:** Do not deploy production Collabora as a scale-to-zero Cloud Run sidecar. Use dedicated VMs or a supported clustered deployment with document affinity. Ask Collabora whether its supported packages and SLA cover the chosen GCP topology.
- **Recommendation:** Collabora and a separate LibreOffice preview worker share a technology lineage, which may reduce renderer differences, but this is not proof of byte-level PPTX preservation or equivalent output. Only the fidelity suite can answer that.[S28]

## Go, storage, revisions, and preview workers

### Facts common to the options

- **Fact:** WOPI is REST over HTTP. `CheckFileInfo` returns JSON, while `GetFile` and `PutFile` transfer full binary files. Nothing in the protocol requires a Microsoft-specific backend language.[S2][S16][S17]
- **Fact:** ONLYOFFICE's native integration is also HTTP, JSON, JWT, and binary download. Its examples cover several languages but the contract is not tied to those languages.[S6][S9][S19]
- **Fact:** LibreOffice supports `--headless` operation and command-line conversion with `--convert-to` and `--outdir`. Its PDF export has Impress-specific controls including hidden-slide and notes-page handling.[S29][S30]

### Recommended revision pipeline

1. Store canonical objects at an immutable path such as `presentations/{id}/revisions/{revision}/deck.pptx`.
2. Store the current revision, object generation/checksum, byte size, editor provider, author, and commit time in PostgreSQL.
3. Start an editor session against one committed base revision. Bind the editor token or key to the presentation, user, permission, and base revision.
4. On ONLYOFFICE status `2` or a WOPI `PutFile`, stream the result to a staging object while hashing and applying size limits. Validate the package before promoting it to a revision path.
5. Commit the new current revision with compare-and-swap against the base revision. Make retries return the previously committed result for the same save idempotency key.
6. Publish a preview job only after the database commit. The job payload names the exact immutable revision, never merely "latest."
7. A sandboxed LibreOffice worker downloads that PPTX, uses an isolated writable user profile, exports to PDF in headless mode, rasterizes pages with a separate bounded tool, and uploads images under `previews/{revision}/...`.
8. Mark previews ready only if the presentation still has that revision. Older preview artifacts may remain for history but must not replace the current preview pointer.

**Recommendation:** Serialize canonical writes per presentation. Editor sessions, AI revisions, imports, and restores must use the same compare-and-swap rule. LibreOffice workers are read-only consumers and therefore need no editor lock.

**Recommendation:** Match fonts across the editor service and preview workers. Missing or substituted fonts can make a correct PPTX look different without any corruption. Include the actual SlideSage templates, embedded-font cases, charts, SmartArt, grouped shapes, media, notes, transitions, and repeated open-save-open cycles in the fidelity suite.

## Implementation target

Build a thin provider boundary around these application operations:

- `CreateEditSession(presentationID, revision, user, permissions)`
- `AcceptRevisionSave(providerSession, baseRevision, stream)`
- `EndEditSession(providerSession)`

Implement ONLYOFFICE first:

- A Go endpoint returns a signed editor config with `fileType: "pptx"`, a revision-derived `document.key`, stable `referenceData.fileKey`, a read-only source URL, and a signed callback URL.
- A Go callback verifies JWT and status, downloads the assembled PPTX from the trusted Document Server, and calls the shared immutable revision commit path.
- A dedicated self-hosted ONLYOFFICE Docs Developer deployment serves the editor JavaScript and editing traffic.
- The existing job system queues a LibreOffice preview only after revision commit.

Keep WOPI outside the first milestone but preserve stable presentation IDs and revision versions so a Collabora adapter, or Microsoft adapter after CSPP acceptance, can use the same revision store later.

### Acceptance gates

- Obtain commercial trial builds and written quotes for ONLYOFFICE Docs Developer and Collabora Online.
- Pass a corpus-based PPTX fidelity comparison, including a desktop PowerPoint reopen check and OOXML validation after at least five edit/save cycles.
- Demonstrate callback retry, editor crash, expired source URL, concurrent AI edit, duplicate save, stale base revision, object-store failure, and preview-worker failure.
- Load test editor start, active websocket sessions, save assembly, callback download, and preview throughput with realistic decks.
- Complete security review for JWT/access-token leakage, callback SSRF, macro handling, file bombs, tenant isolation, logs, and outbound network policy.

## Unresolved commercial and legal questions

These require written vendor answers and, where appropriate, qualified legal review. This document does not answer them.

### Microsoft

- Does Microsoft consider SlideSage's PPTX-canonical product a cloud storage business eligible for CSPP?
- Can SlideSage satisfy the mandatory Word and Excel upload, editing, and co-authoring experience without exposing those products broadly?
- Which consumer and business Microsoft 365 licenses qualify, and how must SlideSage validate each user and handle guests?
- What CSPP integration terms, branding rules, telemetry/data-processing terms, support duties, service limits, and costs would apply?
- What regions process or cache customer files, for how long, and what contractual data-residency terms are available?

### ONLYOFFICE

- Confirm that Docs Developer production terms cover a multi-tenant, customer-facing SlideSage SaaS and the planned number of regions, clusters, standby nodes, and disaster-recovery replicas.
- Is pricing based on simultaneous editing tabs, named users, servers, clusters, tenants, or a combination for the proposed deployment?
- Which standard or white-label branding obligations apply, and may SlideSage expose the editor under its own product name?
- Do any AGPLv3 or additional-term obligations apply to SlideSage when using unmodified commercial binaries across a network? What notices and attribution remain required?
- May SlideSage distribute or deploy the container through its own private registry and CI/CD system?
- What SLA, security-update window, support response, version pinning, upgrade rights, audit rights, and end-of-subscription behavior apply?
- Are fonts, templates, plugins, AI features, mobile web editing, and Document Builder included in the quoted license, and are any separately metered?

### Collabora

- Do the Business or Enterprise subscription terms cover embedding Collabora Online in a commercial multi-tenant SaaS offered to SlideSage customers?
- How does Collabora count registered SlideSage users, inactive accounts, guests, anonymous share recipients, and multiple tenants?
- Does pricing cover multiple production nodes, regions, standby capacity, development/staging environments, and the Controller or Kubernetes deployment?
- What branding and trademark requirements apply to supported packages and a customized iframe?
- What source-notice or MPL obligations apply if SlideSage modifies Collabora components rather than running unmodified packages?
- Which SLA, security-update cadence, upgrade policy, support scope, and PPTX interoperability commitments appear in the contract?
- Does Collabora support the intended GCP topology, and is integration support included in the quoted tier?

### LibreOffice previews

- Confirm license-notice and distribution obligations for the exact LibreOffice container image and all bundled fonts and rasterization tools.
- Confirm that template fonts may be installed and used for server-side rendering, including any per-user, server, embedding, or redistribution restrictions imposed by each font license.

## Official sources

All sources were accessed on 2026-09-03.

- **[S1] Microsoft:** [Integrate with Microsoft 365 for the web](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/overview)
- **[S2] Microsoft:** [WOPI REST API reference](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/)
- **[S3] Microsoft:** [Managing Microsoft 365 user licenses](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/scenarios/business)
- **[S4] Microsoft:** [Launch your Microsoft 365 for the web integration](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/build-test-ship/shipping) and [testing requirements](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/build-test-ship/testing)
- **[S5] Microsoft:** [Microsoft-configured settings and domain allow lists](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/build-test-ship/settings)
- **[S6] ONLYOFFICE:** [Self-hosted installation and embedding](https://api.onlyoffice.com/docs/docs-api/get-started/installation/self-hosted/)
- **[S7] ONLYOFFICE:** [Opening a file](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/opening-file/)
- **[S8] ONLYOFFICE:** [Document configuration](https://api.onlyoffice.com/docs/docs-api/usage-api/config/document/)
- **[S9] ONLYOFFICE:** [Callback handler](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/)
- **[S10] ONLYOFFICE:** [Docs Developer pricing and SaaS positioning](https://www.onlyoffice.com/developer-edition-prices.aspx)
- **[S11] ONLYOFFICE:** [ONLYOFFICE license FAQ](https://www.onlyoffice.com/license-faq.aspx)
- **[S12] Collabora:** [Integrate Collabora Online](https://www.collaboraonline.com/integrate-collabora-online/)
- **[S13] Collabora:** [Production subscriptions](https://www.collaboraonline.com/subscriptions/) and [Collabora Online product page](https://www.collaboraonline.com/collabora-online/)
- **[S14] Collabora:** [Collabora Online Development Edition](https://www.collaboraonline.com/code/)
- **[S15] Microsoft:** [WOPI key concepts](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/concepts)
- **[S16] Microsoft:** [WOPI GetFile](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/files/getfile)
- **[S17] Microsoft:** [WOPI PutFile](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/files/putfile)
- **[S18] Microsoft:** [Set up a WOPI host page](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/hostpage)
- **[S19] ONLYOFFICE:** [Request security and JWT](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/security/)
- **[S20] ONLYOFFICE:** [Saving and force-saving files](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/saving-file/)
- **[S21] ONLYOFFICE:** [Developer Edition license FAQ](https://helpcenter.onlyoffice.com/docs/faq/developer.aspx) and [Docs 9.4 license update](https://www.onlyoffice.com/blog/2026/05/onlyoffice-docs-9-4)
- **[S22] ONLYOFFICE:** [Docs Enterprise pricing](https://www.onlyoffice.com/docs-enterprise-prices.aspx)
- **[S23] Collabora:** [Official current WOPI discovery file](https://github.com/CollaboraOnline/online.mirror/blob/main/discovery.xml)
- **[S24] Collabora:** [Official current server configuration](https://github.com/CollaboraOnline/online.mirror/blob/main/coolwsd.xml.in)
- **[S25] Collabora:** [Official WOPI test host implementation](https://github.com/CollaboraOnline/online.mirror/blob/main/test/WopiTestServer.hpp)
- **[S26] Collabora:** [Official source repository README](https://github.com/CollaboraOnline/online.mirror/blob/main/README.md)
- **[S27] Collabora:** [Official source COPYING notice](https://github.com/CollaboraOnline/online.mirror/blob/main/COPYING)
- **[S28] Collabora:** [Collabora Online is based on LibreOffice](https://www.collaboraonline.com/built-on-libreoffice/)
- **[S29] The Document Foundation:** [LibreOffice command-line parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)
- **[S30] The Document Foundation:** [LibreOffice PDF command-line parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html)
