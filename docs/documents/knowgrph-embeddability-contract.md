---
title: "Knowgrph Embeddability Contract"
id: "md:knowgrph-embeddability-contract"
doc_type: "Implementation Contract"
version: "1.0.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.embeddability-contract"
local_rung: "dev-proven"
delivered_rung: "runtime-ready"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-embeddability-contract.md"
---

# Knowgrph Embeddability Contract

**Context**: Third-party webpages, products, and operator shells need to reuse Knowgrph without forking the canvas runtime.
**Intent**: Freeze one source-owned embed boundary before host integrations drift into parallel renderers.
**Directive**: Treat `iframe` as the canonical live embed, `postMessage` as the host-control bridge, and host-side `<canvas>` as an optional visual projection only.

---

## Goal

Make Knowgrph embeddable into external webpages while preserving the current source-backed runtime contract:

- frontmatter and Markdown remain the SSOT
- Knowgrph keeps ownership of rendering, interaction, and heavy-runtime gating
- host pages get a narrow, stable integration boundary
- no second interactive renderer is introduced downstream

## Canonical Embed Ladder

### 1. Canonical live embed: `iframe`

The default host contract is a cross-origin `iframe` that frames the run-scoped or doc-scoped Knowgrph surface.

- Canonical URL shape: `/knowgrph/share/<opaque-share-token>?kgPreview=1&kgLiveHero=1`
- Current source owners:
  - `canvas/src/features/canvas/canvasEmbedIframeMarkup.ts`
  - `canvas/src/features/markdown-workspace/markdownFileTreeContextMenuItems.ts`
  - `cloudflare/pages/knowgrph-agent-ready.mjs`
- Current security attributes:
  - `sandbox="allow-scripts allow-same-origin"`
  - `referrerpolicy="no-referrer"`

Use this path when the host needs the real Knowgrph runtime: DOM, semantic HTML, chat, selection, viewport logic, rich media, Storyboard projection, and existing mobile/heavy-runtime guards.

### 2. Host control bridge: `postMessage`

The host page may control the embedded Knowgrph frame only through a thin message boundary.

The first source-owned bridge message is:

```json
{
  "type": "knowgrph.canvas-embed.select",
  "version": 1,
  "sourcePath": "/docs/shared-canvas.md",
  "embedUrl": "https://airvio.co/knowgrph/share/<opaque-share-token>"
}
```

The Home runtime accepts this message only from its embedding `parent` or opening window. The same validator also powers **Import canvas embed** on Home and in **MainPanel Settings → Canvas Embed**, accepting either the generated `<iframe>` HTML or the JSON payload above. Both entry points reuse `CanvasEmbedImportPanel` and the same `CanvasEmbedPanelShell` chrome, responsive boundary, accessibility labels, close lifecycle, and code-panel visual grammar as **Share canvas embed**. Generic imports normalize the HTTP(S) source to `kgPreview=1&kgLiveHero=1`; every apex origin defaults to the Workspace README preset, carrying `kgCanvasSurfaceMode=2d`, `kgCanvasRenderMode=2d`, `kgCanvas2dRenderer=storyboard`, and `openEditorWorkspace=1`. The existing workspace transition opens Explorer, Editor Workspace, and its Canvas pane in the split composition. Dev mirrors the canonical share token through its current origin so media access URLs, playback, postMessage selection, and selection-tool semantics stay runtime-valid; production retains the canonical `airvio.co` origin.

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

## Why `iframe` Is The SSOT Boundary

`iframe` matches the repo's current architecture and keeps the runtime upstream:

- preserves semantic HTML and accessibility
- preserves text selection, native input, focus, and browser behaviors
- preserves the existing rich media and DOM-driven rendering model
- avoids a second interactive renderer contract
- keeps TCO lower than rebuilding Knowgrph inside a host-page canvas abstraction

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

## Current Repo Evidence

The current repo ships an iframe-first direction:

- Explorer → Source Files → **Share URL**, **Share canvas embed**, **Copy Path**, and **Copy Relative Path** open one reusable code-block panel with the shared code copy control. Canvas embed renders sandboxed iframe HTML, while URL and path actions render their exact plaintext values; the raw embed URL remains the internal Live Canvas Hero selection event value.
- `canvasEmbedIframeMarkup.ts` owns the external HTML attributes and rejects non-HTTP(S) sources.
- `cloudflare/pages/knowgrph-agent-ready.mjs` allows external framing only for the apex embed owner and opaque published-document HTML routes.
- ordinary app paths continue to inherit the narrower `_headers` frame policy.

## Embed Contract

### Runtime ownership

Knowgrph owns:

- the canvas/document runtime
- render mode selection
- Storyboard and document projection
- approval and spend boundaries
- heavy-runtime gating
- doc-view URL resolution

The host owns:

- page layout around the frame
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

- Rebuilding the interactive Knowgrph runtime inside a third-party host `<canvas>`
- Defining a second first-class renderer contract for external hosts
- Letting host-specific embed code own approval, auth, or spend policy
- Splitting embed behavior across multiple undocumented URL schemes
- Shipping host-side patches that compete with the source-owned `doc-view` route

## Immediate Doc-Owned Queue

1. Freeze this embeddability ladder as the source doc.
2. Keep README discovery linked to this contract.
3. Keep the public share route as the single external iframe surface; do not widen ordinary workspace routes.
4. Keep new host-control actions versioned under the validated `postMessage` envelope; do not add parallel ad-hoc listeners.

## Success Condition

Knowgrph is considered embeddable when:

- an external webpage can frame the live Knowgrph doc-view through the canonical `iframe` path
- the frame preserves upstream runtime behavior without host-side renderer forks
- any future host `<canvas>` usage is explicitly documented as a read-only projection, not the primary runtime contract
