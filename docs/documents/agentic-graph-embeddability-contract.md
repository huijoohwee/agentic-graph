---
title: "Reference implementation: agentic-graph Embeddability Contract"
id: "md:agentic-graph-embeddability-contract"
doc_type: "Implementation Contract"
version: "1.3.0"
date: "2026-10-05"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.embeddability-contract"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agentic-graph-embeddability-contract.md"
---

# Reference implementation: agentic-graph Embeddability Contract

**Context**: Third-party webpages, products, and operator shells need to reuse agentic-graph without forking the canvas runtime.
**Intent**: Freeze one source-owned embed boundary before host integrations drift into parallel renderers.
**Directive**: Keep the complete document/workspace runtime in its canonical `iframe` with the validated `postMessage` bridge. A bounded native data-view component may mount directly through the source-owned adapter below; both native and embedded tables must use one rendering core. Host-side `<canvas>` remains an optional visual projection only.

---

## Goal

Make agentic-graph embeddable into external webpages while preserving the current source-backed runtime contract:

- frontmatter and Markdown remain the SSOT
- agentic-graph keeps ownership of rendering, interaction, and heavy-runtime gating
- host pages get a narrow, stable integration boundary
- no second interactive renderer is introduced downstream

## Canonical Embed Ladder

### 1. Canonical live embed: `iframe`

The default host contract is a cross-origin `iframe` that frames the run-scoped or doc-scoped agentic-graph surface.

- Canonical URL shape: `/agentic-graph/share/<opaque-share-token>?kgPreview=1&kgLiveHero=1`
- Current source owners:
  - `canvas/src/features/canvas/canvasEmbedIframeMarkup.ts`
  - `canvas/src/features/markdown-workspace/markdownFileTreeContextMenuItems.ts`
  - `cloudflare/pages/agentic-graph-agent-ready.mjs`
- Current security attributes:
  - `sandbox="allow-scripts allow-same-origin"`
  - `referrerpolicy="no-referrer"`

Use this path when the host needs the real agentic-graph runtime: DOM, semantic HTML, chat, selection, viewport logic, rich media, Storyboard projection, and existing mobile/heavy-runtime guards.

### 2. Host control bridge: `postMessage`

The host page may control the embedded agentic-graph frame only through a thin message boundary.

The first source-owned bridge message is:

```json
{
  "type": "agentic-graph.canvas-embed.select",
  "version": 1,
  "sourcePath": "/docs/shared-canvas.md",
  "embedUrl": "https://airvio.co/agentic-graph/share/<opaque-share-token>"
}
```

The Home runtime accepts this message only from its embedding `parent` or opening window. The same validator also powers **Import canvas embed** on Home and in **MainPanel Settings → Canvas Embed**, accepting either the generated `<iframe>` HTML or the JSON payload above. Both entry points reuse `CanvasEmbedImportPanel` and the same `CanvasEmbedPanelShell` chrome, responsive boundary, accessibility labels, close lifecycle, and code-panel visual grammar as **Share canvas embed**. Generic imports normalize the HTTP(S) source to `kgPreview=1&kgLiveHero=1`; every apex origin defaults to the Workspace README preset, carrying `kgCanvasSurfaceMode=2d`, `kgCanvasRenderMode=2d`, `kgCanvas2dRenderer=storyboard`, and `openEditorWorkspace=1`. The existing workspace transition opens Explorer, Editor Workspace, and its Canvas pane in the split composition. Source code maps development requests to the current origin and configures `airvio.co` as the canonical published origin; those declarations are not delivery evidence.

Allowed categories:

- identity and routing: `runId`, `docId`, share path, base path
- presentation hints: theme, height, width, compact mode
- bounded runtime intent: focus, open chat, seed `/`, `#`, `@` input, request current state snapshot

Forbidden categories:

- direct mutation of internal renderer state
- bypassing approval, auth, or spend gates
- reimplementing internal state machines in the host shell

### 3. Optional visual projection: host `<canvas>`

If a host truly needs `<canvas>`, treat it as a visual projection only:

- snapshot
- poster frame
- texture
- read-only scene preview

Do not define host `<canvas>` as the primary interactive embed path.

## Portable native data view — reference implementation

The user selected **Embed the native table in Commerce** on 2026-10-05. This authorizes a
portable presentation adapter for existing host-owned records. It does not widen full-workspace
framing, import private documents, or move the native application stores into the host.

| Source owner | Contract |
|---|---|
| `canvas/src/features/markdown/ui/MarkdownDataViewTableCore.tsx` | Single semantic table, header, row, selection and responsive frame structure extracted from the existing native table. Native row and column wrappers delegate to it, preserving their richer editing and media slots. |
| `canvas/src/features/markdown/ui/dataViewBrowserAdapter.tsx` | `mountDataView(target, state)` returns `update(fullState)` and `destroy()`; row orientation shows the list and column orientation shows selected-record properties through the same core. The consumer does not build another table or detail renderer. |
| `canvas/scripts/build-data-view-adapter.mjs` | Generate the portable browser artifact and scoped CSS from the native source and existing locked FOSS dependencies. Bind source/input/output digests; refuse any chunk ≥500,000 bytes. |
| [Canonical UI/UX guide](agentic-graph-ui-ux-design-document.md#global-appearance-authority) | Design authority remains here; no competing `DESIGN.md`, brand guide, copied palette or host-specific table theme. `grph-shared/ui/themeTokens`, `selectedRowClasses` and native responsive primitives own table visuals. |

**Data and effect boundary:** the host owns records, selection context, persistence, revision checks,
mutations and effect authorization. The adapter receives bounded explicit values and callbacks;
it has no store, document loader, media runtime, credentials, remote request or model call.
`DATA_VIEW_BROWSER_LIMITS` bounds 64 columns, 1,000 rows, 4,096 characters per cell, 128 per ID,
256 per name/label and 196,608 serialized UTF-8 bytes. State includes `columns: {id, name}[]`,
`rows: {id, cells: string[]}[]`, optional `selectedRowId`, `onActivateRow`, `orientation`
(`rows` or `columns`) and `ariaLabel`. Validate before replacing a valid view; render plain text.
Initially show 32 records and reveal 32 more on an explicit action. A target inside the host
ShadowRoot keeps generated component CSS isolated without inventing a second palette.
Closing or replacing a view destroys the previous mount. An asynchronous load must not revive a
stale mount or selection. Empty, loading, stale and failed storage remain explicit host states.

The consumer lazy-loads the generated module only when the relevant surface opens and serves
its pinned assets locally, including offline after cache priming. It never fetches source code,
CSS, fonts or media from an upstream service at runtime. The generated bundle is an artifact,
not a downstream authoring surface: fixes go to these source owners, then regenerate and pin
module/CSS/provenance together. Full canvas/document use still follows the iframe ladder.

**Acceptance:** prove both native wrappers consume this core; prove bounded mount/update/destroy,
selection and safe record detail; verify unchanged native editing regression coverage, keyboard
activation, focus, mobile horizontal containment and 200% text resize in the host. Verify no
Graph store or remote/media closure in the artifact, matching provenance hashes and chunk limits.
These are scoped component checks, not complete workspace parity or production delivery.
The source implementation is complete. Four adapter tests and ten focused native regressions pass;
source-generated assets are deterministic with retained MIT notices. The observed working build is
168,142-byte JS, 52,697-byte component CSS and 6,088-byte token CSS. Clean-source pins, protected
publication/integration and consumer/browser acceptance remain pending; this is no full-parity claim. The
[commerce platform plan](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.md#native-data-view-reuse--reference-implementation)
owns the five-role increment and separate release gates.

## Why `iframe` Is The SSOT Boundary

`iframe` matches the complete document/workspace runtime and keeps that runtime upstream:

- preserves semantic HTML and accessibility
- preserves text selection, native input, focus, and browser behaviors
- preserves the existing rich media and DOM-driven rendering model
- avoids a second interactive renderer contract
- keeps TCO lower than rebuilding agentic-graph inside a host-page canvas abstraction

## Why Host `<canvas>` Must Stay Secondary

An HTML `<canvas>` is a bitmap surface, not the native document/runtime boundary.

If promoted to the main embed contract, it would force downstream reimplementation of:

- text rendering and selection
- accessibility semantics
- form controls and editing affordances
- overlay and rich-media behaviors
- input/focus handling
- responsive/mobile runtime gates

That path is higher churn, higher TCO, and easier to let drift from source-owned behavior.

## Current source baseline

The current source tree contains an iframe-first implementation direction:

- Explorer → Source Files → **Share URL**, **Share canvas embed**, **Copy Path**, and **Copy Relative Path** open one reusable code-block panel with the shared code copy control. Canvas embed renders sandboxed iframe HTML, while URL and path actions render their exact plaintext values; the raw embed URL remains the internal Live Canvas Hero selection event value.
- `canvasEmbedIframeMarkup.ts` owns the external HTML attributes and rejects non-HTTP(S) sources.
- `cloudflare/pages/agentic-graph-agent-ready.mjs` allows external framing only for the apex embed owner and opaque published-document HTML routes.
- ordinary app paths continue to inherit the narrower `_headers` frame policy.

## Embed Contract

### Runtime ownership

agentic-graph owns:

- the canvas/document runtime and the portable native table rendering core
- render mode selection
- Storyboard and document projection
- approval and spend boundaries
- heavy-runtime gating
- doc-view URL resolution

The host owns:

- page layout around the frame or bounded component mount
- container sizing
- optional bridge messages
- optional open-in-new-tab affordances

### Security ownership

The embedded route must remain responsible for:

- `frame-ancestors`
- referrer policy
- run/doc entitlement checks
- approval and auth boundaries

The host must not assume that a valid frame URL alone grants runtime authority.

### Data ownership

Embedding must not move SSOT ownership out of Markdown/frontmatter.

The host may reference a document or run, but it must not become the source of truth for:

- graph topology
- widget layout semantics
- runtime approvals
- renderer state persistence

## Forbidden Patterns

- Rebuilding the interactive agentic-graph runtime inside a third-party host `<canvas>`
- Defining a second interactive renderer for external hosts; the portable table must delegate to the native core
- Letting host-specific embed code own approval, auth, or spend policy
- Splitting embed behavior across multiple undocumented URL schemes
- Shipping host-side patches that compete with the source-owned `doc-view` route

## Immediate Doc-Owned Queue

1. Freeze this embeddability ladder as the source doc.
2. Keep README discovery linked to this contract.
3. Keep the public share route as the single external iframe surface; do not widen ordinary workspace routes.
4. Keep new host-control actions versioned under the validated `postMessage` envelope; do not add parallel ad-hoc listeners.

## VCC and Evidence Reference register

The portable component has bounded local implementation proof below; its consumer/browser and protected-source gates remain open. Earlier frame observations retain their original scope.

| VCC | End state | Named check | Constraint | Recorded result | Local rung | Delivered rung |
|---|---|---|---|---|---|---|
| `VCC-EMBED-1` | share/import actions emit and accept the canonical sandboxed frame envelope | `npm --prefix canvas run test:ci:unit -- canvasEmbed` exits 0 | no host-side renderer or unvalidated message path is added | not recorded | `spec-complete` | `undocumented` |
| `VCC-EMBED-2` | opaque share routes retain preview parameters and source identity | `npm --prefix canvas run test:ci:unit -- sourceFiles.shareCanvasEmbed` exits 0 | source/frontmatter ownership remains upstream | not recorded | `spec-complete` | `undocumented` |
| `VCC-EMBED-4` | portable list and selected-record details reuse the native table core with bounded lifecycle/data and generated native styles | adapter unit/build checks plus Commerce browser integration record exact source and artifact digests | no stores, media/network runtime, second renderer or conflicting visual owner; every chunk <500,000 bytes | four portable tests + ten native regressions pass; deterministic build below limit; clean pin and host/browser acceptance pending | `spec-complete` | `undocumented` |
| `VCC-EMBED-3` | an external clean-origin page frames an exact approved document and preserves selection, media, and auth boundaries | protected live browser check records the exact revision, origin, result, and rollback target | configured URLs and source tests cannot satisfy delivery | not recorded; no delivery host attached | `spec-complete` | `undocumented` |

## Readiness Gap Matrix

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|---|
| Source-owned frame and message contract | `spec-complete` | `undocumented` | local results are not attached | none | `VCC-EMBED-1` and `VCC-EMBED-2` gain satisfying local Evidence References |
| Portable native component | `spec-complete` | `undocumented` | source implementation and local native/adapter checks complete; clean pin and host/browser proof pending | selected next increment | `VCC-EMBED-4` gains candidate-bound checks; deployment remains separate |
| External framing | `spec-complete` | `undocumented` | no exact-revision live browser result or operator instruction | none | `VCC-EMBED-3` gains a delivery Evidence Reference through closed deploy boundaries |

## Portable native sequence guide — reference implementation

The existing browser artifact also exports `mountSequenceGuide(target, state)`, returning
`update(fullState)` and idempotent `destroy()`. State carries bounded literal title/summary/status,
items `{id, label, detail, meta, actionLabel, actionDisabled}`, selected ID, busy, optional notice,
close label and selection/action/close callbacks. The adapter validates snapshots before mutation.
`FloatingPanelShell` and `SequenceInspectorView` are consumed by the native toolbar/inspector too.
Native sequence CSS and shared tokens remain authoritative; no host override or renderer copy.
The portable adapter supplies initial heading focus and Escape; the host owns return/follow-up focus,
late-load cancellation, route disposal, data revisions and action authorization. Busy disables
selection/actions; close remains available. Destroy removes its root/listeners and never steals focus.
No pin/drag/playback, document parser, Graph store or persistence is implied by this bounded guide.
The additive `browserExports` manifest names both mounts; exact clean provenance and output hashes
must bind the consumer pin. VCC-EMBED-5: native delegation, adapter validation/lifecycle and Commerce
keyboard/mobile/offline/current-review checks bind the candidate. Five native guide tests, 39 sequence
checks, native typecheck and focused Commerce browser checks pass; clean pin/protected CI remain gates.
