---
title: "Self-contained document Share URL without sign-in"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.1.0"
date: "2026-10-13"
lang: "en-US"
frontmatter_contract: "required"
owner: "Canvas source-sharing"
continuity_id: "canvas-local-document-share-url"
prd_revision: "0.1.0"
tad_revision: "0.1.0"
adr_revision: "0.1.0"
mvp_revision: "0.1.0"
gtm_revision: "0.1.0"
guideline_revision: "3.4.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/085eb0b9f2351b30d8cb5fd00c16f04f4d127280/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: true
worktree_id: "device-0232231d4a19--share-url-no-sign-in"
agent_id: "device-0232231d4a19"
---

# Self-contained document Share URL without sign-in — PRD, TAD, ADR, MVP and GTM

This joined artifact owns `canvas-local-document-share-url@0.1.0`. The target is a read-only copy of a small Markdown file that opens in a browser without an account, server-side publication, new service, or added package. The existing authenticated, revision-checked publication path remains available for durable sharing.

## Evidence and grounding

### Observed sources

The source revision is Graph `ba488e7b8716538dc348172cb27c5505f881e2ab`.

| ID | Source | Observation | Limit |
|---|---|---|---|
| E-01 | `canvas/src/features/markdown-workspace/markdownFileTreeContextMenuItems.ts` | The existing file action is labelled **Share URL** and delegates URL creation to the source-sharing owner. | UI presence does not show anonymous operation. |
| E-02 | `canvas/src/features/source-files/sourceFileShareUrl.ts` | Durable sharing verifies exact content, queues/synchronizes the selected revision, publishes it, and anonymously verifies the published bytes. The current durable path requires session/write access. | A public read does not authorize a private workspace write. |
| E-03 | `canvas/src/features/canvas/canvasDocDeepLink.ts`; `CanvasDocDeepLinkRuntime.tsx` | The app already resolves local and published document deep links and lazy-loads its import runtime. | Existing routes do not contain local document bytes. |
| E-04 | `canvas/src/App.tsx`; `canvas/src/pages/LocalDocumentSharePage.tsx` | The share fragment can select a standalone read-only view before workspace runtime initialization. | Exact route and lazy-load behavior require local verification. |
| E-05 | User request | The selected **Share URL** action should work without sign-in. | Product intent; no usage or demand evidence. |

### Problem and outcome

When a user selects **Share URL** for a local file without an authenticated durable workspace, publication cannot proceed. The local document is already available on the device, but requiring an account prevents a small read-only handoff. The pain and frequency are not measured.

**Outcome:** for Markdown up to 4 KiB, one click produces a link containing a UTF-8 copy in its URL fragment. Opening that link after the app shell is available renders the document read-only, without a sign-in flow or document upload. The share view explains that the link carries readable content and can be forwarded.

**Boundaries:** the link is not encrypted, revocable, or appropriate for secrets. Content is not placed in the query string, sent in an HTTP request, or written to remote storage by the local-share path. Larger files retain the authenticated publication path or report the size limit. Attachments and binary assets are out of scope.

## PRD — product intent

| Criterion | Given / when / then | Verification criterion |
|---|---|---|
| S-01 no-sign-in creation | Given a local non-empty Markdown file and no authenticated durable session, when the user selects **Share URL**, then a working local-copy URL is copied without queuing or publishing document bytes. | Exercise unauthenticated, access-denied and memory-only branches; inspect requests and local storage for no content write. |
| S-02 copy fidelity | Given Unicode Markdown, when the link is opened in a new browser context, then title and bytes match the selected content. | Round-trip Unicode, newlines and exact Markdown content through the URL fragment. |
| S-03 size and parser bounds | Given content over 4,096 UTF-8 bytes, invalid encoding, unsupported version or a URL over 8,192 characters, when built or opened, then the action fails clearly and invalid data is not rendered. | Boundary checks at 4,096/4,097 bytes, malformed payloads, disallowed URL schemes and URL-length cap. |
| S-04 no server disclosure | Given a locally encoded share, when the URL is requested, then content is carried only after `#` and no server-side write or query-string disclosure occurs. | Confirm the query is empty and no upload/publication request contains document bytes. |
| S-05 read-only receiver | Given a valid self-contained link, when opened, then a standalone read-only document view is shown without workspace hydration or authentication. | Browser check confirms the title, rendered content and audience disclosure; app starts no workspace source import. |
| S-06 durable path preserved | Given an authenticated user and eligible workspace, when they share a file, then exact-revision publication, anonymous readback and existing opaque route behavior remain. | Existing authenticated publication and exact-readback checks pass unchanged. |
| S-07 disclosure | Given a local-copy link is generated or opened, when the user sees the result, then the UI states that anyone with the URL can read the copy and that it is not encrypted or uploaded. | Browser copy/read view shows the disclosure before or with the generated URL. |

### User and value hypothesis

The user is a workspace author handing a small document to a browser recipient. The minimum value is avoiding sign-up and service setup for a one-time read-only handoff. Accounts avoided, time saved, repeat use, willingness to pay and commercial buyer are unknown; this is not a paid feature hypothesis.

**TTV target:** under 30 seconds from selecting a file to opening the copied link. Measure on a mobile browser and desktop browser; no measurement is claimed before those observations.

## TAD — technical architecture

| Owner | Responsibility | Boundary |
|---|---|---|
| `sourceFileShareUrl.ts` | Keep durable publication; select the self-contained fallback only when persistence is memory-only or session is unauthenticated/access-denied. | Network/service errors remain visible; no fallback masks a 503 or publication conflict. |
| `localDocumentShare.ts` | Versioned UTF-8 JSON/base64url codec, validation, URL-size limits and fragment parsing. | No dependency, encryption claim, filesystem write or remote call. Dynamically loaded on the fallback/view path. |
| `App.tsx` | Detect the share fragment and lazy-load the standalone page. | One short prefix check; do not boot workspace source runtimes for this route. |
| `LocalDocumentSharePage.tsx` | Show validated title, rendered Markdown and read-only audience disclosure. | Invalid payloads fail closed; no authoring controls. |
| `MarkdownWorkspaceSourceFilesList.tsx` | Surface the “anyone with this link” disclosure when the fragment URL is returned. | Existing menu item remains the interaction owner. |

### Data and request flow

`WorkspaceEntry` text → strict UTF-8 byte cap → `{version,title,markdown}` JSON → base64url in `#kgShare=` → copied URL → local fragment parser → read-only Markdown view. The server receives the route request without the fragment. No server endpoint or authentication token is involved in this flow. The disclosure must say that the URL itself carries readable content; base64 is encoding, not encryption.

### Runtime and resource caps

- Content: at most 4,096 UTF-8 bytes; title: 160 characters; URL: at most 8,192 characters.
- Added dependencies, remote writes and always-loaded renderers: zero.
- The codec and rendered page remain dynamically loaded outside the sharing/view path.
- Each source module remains below 600 lines; this increment adds no binary or hosted asset.
- Local app-shell/browser cache is required to open while fully offline; initial app delivery is not claimed as offline.

**Sprint guard:** at most eight existing runtime modules, 12 KiB net source growth, zero packages, and 120 active minutes. Record check wall time separately; if a bound is reached, stop for a narrower successor before expanding scope.

### Failure and privacy boundaries

Malformed input, unsupported version, invalid UTF-8, disallowed URL scheme and over-limit payload fail closed. A session endpoint returning unavailable, remote conflict, storage failure or timeout remains an error; only the established unauthenticated/access-denied and memory-only conditions choose the local-copy fallback. The user may discard a generated URL; the application has no revocation control over a copied URL.

## ADR — decisions

### ADR-01: self-contained fragment fallback

**Decision:** use a compact versioned UTF-8 payload in the URL fragment and render it in an isolated read-only route.

| Alternative | Decision | Reason |
|---|---|---|
| Remove authentication from remote publication | Rejected | Would authorize writes to private workspaces without a valid session. |
| Upload to a new anonymous storage service | Rejected | Adds service, retention, abuse and access-control costs. |
| Put document bytes in the query string | Rejected | Query values are sent to the server and more likely to enter logs. |
| Keep small content in the fragment | Chosen | Browser does not send the fragment in the HTTP request; no service or sign-in is needed. |

**Recovery:** if the URL is malformed or exceeds limits, report the reason. If durable publication is unavailable for a reason outside the no-session conditions, preserve the existing explicit error. Revisit the cap only with mobile copy/paste evidence and a bounded replacement.

### ADR-02: separate local and durable sharing semantics

The local link is an encoded, forwardable copy with no access revocation. Durable sharing continues to publish a verified exact revision and uses its existing opaque route. Do not represent the local link as a public server publication or claim that it is secret.

## MVP — bounded implementation and checks

### Included

Anonymous self-contained Markdown sharing up to 4 KiB, fragment validation, isolated read-only view, visible audience disclosure, memory-only fallback, and existing authenticated exact-revision publication.

### Excluded

Attachments, binary assets, encryption, expiring links, revocation, collaborative editing, server-side anonymous storage, larger-than-cap local links, and publication of private workspace content without authorization.

### Acceptance sequence

1. Run the selected source-sharing suite, including unauthenticated/access-denied, no-write, Unicode, malformed and cap cases.
2. Run the Canvas type/build and local browser smoke checks for the exact lane revision.
3. Open the generated URL in a clean browser context; confirm read-only rendering, disclosure and no workspace/auth runtime.
4. Recheck the authenticated publication cases and the local route after the final source change.

Passing source tests establish local evidence for their cases only. They do not prove deployment, internet-scale URL handling, user comprehension or commercial demand.

### Evidence References

| Check | Result | Scope and limit |
|---|---|---|
| `npm run test:ci:unit -- sourceFiles.shareUrl.publication` | Passed, 15/15 cases. | Includes exact 4,096-byte acceptance, 4,097-byte rejection, overlong URL rejection, invalid UTF-8, unauthenticated/access-denied fallback, no-write and durable exact-revision publication. |
| `npm run check` | Passed. | Canvas typecheck and three local Vite browser-smoke checks; does not prove deployment or all target browsers. |
| Local browser at `http://127.0.0.1:4174/#kgShare=…` | Passed read-only view check. | Confirmed decoded title/content and audience disclosure without workspace hydration. This was a local app-shell browser check, not mobile or cold-offline evidence. |

The local rung is `dev-proven` for these bounded cases. `runtime-ready` and delivered readiness remain unclaimed until mobile URL handling and all applicable VCCs have evidence.

## GTM — audience and economics

No separate market or paid offer is proposed. This is a zero-provider-cost convenience for existing local workspace authors. The first-dollar path remains the host product’s independently evidenced offer; this capability supplies no pricing basis. User reach, saved time, repeat use, support load and willingness to pay are unmeasured.

| Learning | Measure | Decision trigger |
|---|---|---|
| TTV | Time to create and open a link on mobile and desktop. | If the 8 KiB link cap disrupts a real supported case, measure URL transport limits before changing it. |
| Comprehension | Recipient can state that the link contains a readable copy. | Revise disclosure if any observed recipient mistakes it for encrypted/revocable storage. |
| Cost | Added dependencies, service calls and data writes. | Target remains zero for local-copy share. |

## C01–C16 coverage record

| ID | Domain | Status | Evidence or next owner |
|---|---|---|---|
| C01 | Purpose and pain | covered | User selected the existing action; frequency remains unknown. |
| C02 | Market and timing | deferred | No segment count or timing evidence; product owner after initial use. |
| C03 | Offer and alternatives | deferred | Convenience only; no price or buyer hypothesis. |
| C04 | Product experience | covered | S-01–S-07 and mobile/desktop checks. |
| C05 | Architecture and data | covered | TAD flow and byte/URL caps. |
| C06 | Quality, security and AI | covered | No AI; fragment, size, URL scheme, no-write and disclosure boundaries. |
| C07 | Decisions | covered | ADR-01/02 record alternatives and recovery. |
| C08 | Smallest slice | covered | Four-KiB Markdown fallback with exact-readback path retained. |
| C09 | Acquisition and retention | deferred | No channel or repeat-use data. |
| C10 | Operations | not-applicable | No hosted share service or support obligation is added. |
| C11 | Organization and obligations | deferred | Revisit for binary/attachment or hosted sharing. |
| C12 | Financial viability | not-applicable | No independent product or revenue claim. |
| C13 | Capital | not-applicable | No capital decision. |
| C14 | ADLC execution | covered | Admitted lane, bounded paths and repository check required. |
| C15 | Audience projections | not-applicable | No external deck/business plan/financial model requested. |
| C16 | Learning | covered | Mobile/desktop TTV and disclosure comprehension trigger are specified. |

**Coverage counts:** 16/16 dispositioned; 8 covered applicable domains / 12 applicable domains; 4 deferred; 4 not applicable. Deferred items have owners or revisit triggers. Demand and revenue remain unknown.

## Planning and evidence handover

| Revision | Context / intent / directive | Role / action / outcome | Evidence and next check |
|---|---|---|---|
| `canvas-local-document-share-url@0.1.0` | C: selecting Share URL currently requires an authenticated durable publication path. I: let a user hand off a small local document without sign-in. D: encode a size-bounded copy in a fragment and render it read-only. | R: Canvas source-sharing. A: extend existing URL publication and deep-link owners. O: working local link with no unauthorized write, visible audience disclosure and exact content. | Graph base `ba488e7b8716538dc348172cb27c5505f881e2ab`; selected sharing suite 15/15, Canvas check green, and local read-only browser check passed. Mobile transport and deployment remain unverified. |
