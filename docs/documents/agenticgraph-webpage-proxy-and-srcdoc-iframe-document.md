# Webpage Proxy + Sandboxed `srcdoc` Iframe Rendering

## Goal

Render imported webpages with high fidelity (rich media, animations) while preserving the app invariants:

- **Sandbox boundary**: untrusted HTML must never escape the iframe.
- **View-only switching**: `Markdown | HTML | JSON` must not mutate graph/layout/zoom.
- **Neutrality**: no site-specific hacks or hardcoded domains.

## Surfaces

- **Editor**: shows an editable Markdown SSOT; JSON may be shown as a read-only text override.
- **Viewer / Presentation**: render either Markdown (view = `markdown`) or a sandboxed iframe (view in `{html, json}`).
- **2D Renderer: Gallery**: renders the active Markdown document as a gallery surface through Canvas View Mode.

## Editor Loading Invariants

- **Async Monaco init must not blank the buffer**: Monaco loads lazily; the initial model value must always be the latest `value` prop at the moment the editor is created (not a stale first-render snapshot). This prevents an “empty editor” when a large imported file hydrates after Monaco init starts, or when `kgWebpageView` toggles change the editor URI.
- **Webpage view switching must not write from stale editor state**: `kgWebpageView` switches must hydrate from disk (or last-loaded text) before writing, and must clear any HTML/JSON overrides immediately when switching back to Markdown.

## Frontmatter Contract (per imported page)

- `kgWebpageUrl`: source URL
- `kgWebpageView`: `markdown | html | json`
- `kgWebpageSiteRootRel`: optional local in-repo site root (for resolving `/assets/...` in `srcdoc`)
- `kgWebpageScriptPolicy`: optional per-doc script policy override (`allow | strip`) for rare cases where automatic script heuristics need a manual override
- `kgWebpageIncludeImages`: optional per-doc conversion override (`true | false`) when the default auto image handling is not sufficient
- `kgWebpageFidelityLevel`: optional per-doc conversion fidelity (`1 | 2 | 3 | 4`) used only when the default auto fidelity is not acceptable
- `kgWebsiteImportId`: optional website-import job id
- `kgWebsiteNodeId`: optional stable node id
- `kgWebsiteOutputDirRel`: optional artifact root override

Unsupported historical view values such as `dom`, `raw`, `source`, and `preview` are not active modes and must fall back to `html` through the shared frontmatter parser; do not add compatibility aliases.

## Endpoints (dev server middleware)

### `GET /__webpage_proxy?url=...`

- Fetches upstream HTML and **injects a same-origin compatibility layer**:
  - strips CSP / XFO meta tags and upstream `<base>`
  - rewrites asset URLs (including relative URLs) to `/__webpage_asset_proxy?url=...`
  - ensures `/__webpage_*` links resolve same-origin in iframe context
  - injects scroll-sync to align Editor ↔ iframe scroll ratio

Repo-relative (in-codebase) HTML/text artifacts are fetched via `GET /__codebase_file?path=<repoRel>` (utf-8) and then rendered via sandboxed `srcdoc`. Repo-relative binary assets (CSS/images/fonts/media) are served via `GET /__codebase_asset?path=<repoRel>` so responses carry correct `Content-Type`.

Additionally, the injected layer exposes a **DOM export bridge** (see `kg-export-dom`) that lets the host request a best-effort rendered `text` or `html` snapshot from inside the sandboxed iframe.

Note: the HTML Viewer typically uses `/__webpage_proxy` (or stored `raw.html` artifacts) as the HTML source, but the viewer surface renders via sanitized `srcdoc` to keep the app deterministic and prevent freezes.

When `kgWebsiteImportId/kgWebsiteNodeId` are present, the HTML Viewer prefers stored website-import artifacts (`/__website_import/artifact?kind=rawHtml`) for both HTTP and repo-relative URLs.

### `GET /__webpage_asset_proxy?url=...`

- Proxies assets (CSS/JS/images/fonts/media) as same-origin responses to improve fidelity.
- Supports fetching remote URLs (bounded) or reading local files within the workspace.
- Must be bounded (timeout/max-bytes) and not rely on streaming indefinite bodies.

### `GET /__codebase_file?path=...` / `GET /__codebase_asset?path=...`

- Serves repo-relative files under the monorepo root with traversal/absolute-path guards.
- Use `/__codebase_file` for text (HTML/Markdown/JSON). Use `/__codebase_asset` for binary assets so iframe rendering preserves MIME types.

### `POST /__chat_proxy/*` (Canvas Chat)

- Routes local LM Studio chat calls through a same-origin proxy path instead of direct localhost URLs, normalizes legacy endpoint/model ids, extracts real upstream error text, and may auto-switch to a discovered working model when the configured id is invalid.

### `POST /__website_import/import-url`

- Persists per-URL artifacts to the repo-local ignored workspace output dir (default `.agenticgraph-workspace/...`):
  - `raw.html` (guaranteed)
- `page.md` and `conversion.json` may exist for some imports; when present they are served via `/__website_import/artifact`, otherwise the client falls back to on-demand conversion.

Conversion fallback is bounded and should yield to the main thread for large HTML payloads.

### `GET /__website_import/artifact?importId=...&nodeId=...&kind=...`

- Returns stored artifact content.
- Used for fast view switching in the active-row dropdown.

### `GET /__website_import/status?importId=...`

- Returns a small **status + progress** snapshot for UI polling:
  - `status`: `queued | running | done | failed`
  - `progress.stage`: `queued | discovering | crawling | converting | done | failed`
  - `progress.total/processed/ok/error/queued`
  - `progress.lastUrl` (optional)
- Must be **bounded + backoff-aware** on the client (avoid tight polling loops).

### `GET /__website_import/manifest?importId=...`

- Returns the final manifest including `nodes[]` and `errors[]`.
- UI should treat this as a post-completion fetch (avoid repeatedly pulling a large node list while the job is running).

## `srcdoc` Rendering Rules

Webpage HTML/JSON view renders via a sandboxed iframe using a **sanitized `srcdoc` snapshot**.

The srcdoc builder:

- strips `Content-Security-Policy` and refresh `<meta http-equiv="...">` tags (avoid self-blocking / auto-redirect)
- strips all `<script>` tags and inline `on*=` handlers by default (untrusted scripts do not execute)
- upserts a sandbox CSP meta allowing images/media/styles while restricting scripts to injected utilities
- injects scroll-sync utilities (iframe ↔ parent via `postMessage`)
- upserts `<base>` to preserve correct resolution (use the original URL, or `${window.location.origin}/` when serving proxied assets)

This policy prioritizes safety and determinism. For JS-rendered content capture, use the DOM export bridge (`kg-export-dom`) to extract a rendered snapshot and then upgrade the saved Markdown.

### Large HTML Handling (No Hard Fail)

When upstream HTML is very large (common for app shells or pages embedding large inline SVG/CSS), the `srcdoc` renderer must not fail early by size alone.

Instead:

- Sanitize first.
- If still oversized, apply a **domain-neutral shrink** pass (strip scripts/handlers/comments; collapse whitespace; replace large base64 `data:image/...` with `data:,`; drop oversized inline `<svg>` and `<style>` blocks).
- Only if the sanitized+shrunk result is still oversized, fall back to the text viewer.

Script policy baseline is controlled by `webpageViewerScriptPolicy` but effective behavior is **auto by default**:

- The viewer always sanitizes and strips untrusted scripts/handlers unless a safe, JS-required path is detected via DOM export heuristics.
- Global `webpageViewerScriptPolicy` stays a coarse safety knob; most work should leave it at the default.

Per-document frontmatter keys are **optional escape hatches**, not required inputs:

- `kgWebpageScriptPolicy: allow | strip`
- `kgWebpageIncludeImages: true | false`
- `kgWebpageFidelityLevel: 1 | 2 | 3 | 4`

When present, they override auto Script/Imgs/Fid for that page only. The recommended default is to omit them so Script/Imgs/Fid stays truly auto and driven by shared rich-media + iframe heuristics.

## DOM Export Bridge (`kg-export-dom`) and Layout Snapshots

The proxy-injected layer inside the sandboxed iframe listens for `postMessage` requests of the form:

- `kind`: `kg-export-dom`
- `id`: request correlation id
- `mode`: `text | html | layout`
- `maxChars`: cap the exported payload
- `maxElements`: best-effort cap on exported DOM elements (neutral, URL-agnostic)
- `expandFaq`: best-effort click/expand for accordion-like FAQ sections
- `scrollCrawl`: best-effort scroll/settle loop to load lazy content and stabilize text

For `mode ∈ {text, html}` it replies with:

- `kind`: `kg-export-dom`
- `id`: same id
- `text`: exported content (either rendered visible text or serialized HTML)
- `title`: best-effort title
- `clipped`: whether the result was truncated

For `mode = layout` it replies with:

- `kind`: `kg-export-dom`
- `id`: same id
- `text`: JSON string containing a layout snapshot:
  - `meta`: `{ title, href, viewport: { w, h }, scroll: { x, y }, ts, diag? }`
  - `elements`: bounded array of `{ id, pid, tag, rect: { x, y, w, h }, text, attrs, style }` records
- `title`: best-effort title
- `clipped`: whether the serialized payload was truncated by `maxChars`

The host DOM-export client (`exportWebpageDomViaHiddenIframe`) is responsible for:

- Choosing **viewport size** and **element cap** in a URL-agnostic way (based on per-doc fidelity level and current window size).
- Waiting for:
  - network-idle (`kg-webpage-net` messages with `pending=0` for ≥`networkIdleMs`)
  - DOM-quiet (`kg-webpage-dom` messages with stable `lastMutAt` for ≥`domQuietMs`)
- Taking the best snapshot across multiple rounds (bounded by time and minimal score improvements).

This bridge powers three native (no headless browser) fidelity surfaces:

- **Sync DOM → Markdown** from the Markdown toolbar by exporting DOM `text`/`html`.
- **Import URL fallback** when the initial conversion yields low-quality Markdown for JS-rendered pages.
- **Webpage layout snapshot (`webpageLayout`)** used by the Design 2D renderer as a neutral, DOM-derived layout SSOT for webpage wireframes.

## Canvas Preview Sync (External Embedded Preview)

If a Canvas is embedded outside the main workspace via an iframe (marked with `data-kg-preview="1"` or `?kgPreview=1`), it is view-only by default.

This embedded preview iframe is not used for the Editor/Table split view (Editor/Table reuse the same in-app Canvas pane).

- It must not write graph updates back to the parent store unless explicitly enabled.
- Selection sync may be enabled, but graph/layout writeback must be opt-in to prevent preview↔parent feedback loops.

**Opt-in flag**: add `data-kg-preview-writeback="1"` on the preview iframe to allow `kg-preview-graph` writeback.

## Renderer Toggle Invariants (D3 / Flow / Storyboard)

- Switching 2D renderer variants must not reseed layout positions when node positions already exist.
- The layout-position cache key must be renderer-agnostic for `renderMode: 2d` so D3/Flow/Storyboard toggles preserve the same cached positions.
- 3D render variants may remain isolated by variant.

## Markdown Round-Trip Fidelity (MD → HTML → MD)

When rendering Markdown to the preview DOM (Viewer/Presentation), the renderer must embed the exact Markdown source so HTML imports can round-trip without loss.

- Embed a non-executing payload in the rendered DOM: `<script type="application/x-kg-markdown" data-kg-markdown-source="1" data-kg-encoding="base64">...</script>`
- HTML→Markdown import must detect and restore this payload before applying heuristic HTML→Markdown conversion.

When the embedded payload is not present (or invalid), HTML→Markdown import uses a **unified/rehype/remark** pipeline as a general-purpose fallback for large/complex HTML, while keeping `markdown-it` as the renderer for the Markdown UI (no duplicate markdown rendering stack).

## HTML/CSS/JS → Markdown SSOT (Universal, URL-Agnostic)

When converting webpage HTML (static fetch or DOM-export snapshot) into Markdown SSOT:

- **Neutrality**: forbid hardcoded domains and per-site branching. All rules are tag/attribute-based and driven by `baseUrl` + frontmatter fidelity controls.
- **URL resolution (required)**: resolve relative URLs against `baseUrl` for common attributes:
  - Link-like: `a[href]`, `link[href]`, `use[href]`, `form[action]`
  - Media-like: `img/src`, `picture source/srcset`, `img/srcset`, `video/src`, `audio/src`, `source/src`, `track/src`, `embed/src`
  - Posters + lazy-load: `video[poster]`, `data-src`, `data-srcset`, `data-poster` variants
- **Missing media src (required)**: if an `<img>` has no `src` but has `data-src` or `srcset`, upsert a `src` candidate so the Markdown output never degrades into `![alt]()` while preview still renders an image.
- **Output discipline**: keep Sync/convert output Markdown-only and forbid duplicate content blocks (no repeated synthetic headings, no repeated card blocks, no duplicated pricing/features, no artifact-doc wrapper echoes).

## Iframe Sandbox Policy

All webpage HTML rendering in Viewer / Presentation uses a sandboxed iframe with:

- `sandbox="allow-scripts"`
- `referrerPolicy="no-referrer"`

The sandbox must forbid top-level navigation (do not include `allow-top-navigation`).

## Website Import → Workspace File Generation

When importing a website (sitemap/tree), each created workspace entry can be generated as a full **Webpage Markdown Artifact** (Document Structure analysis) instead of a frontmatter-only stub.

- Setting: `websiteImportGenerateWebpageArtifactDocs` (default `false`)
- Behavior: when enabled, the import prefers server-generated `page.md` artifacts (when available) and falls back to client conversion if needed. When disabled, it writes frontmatter-only stubs for speed and stability.

Additionally, the website import root folder includes a generated `website.sitemap.md` artifact that summarizes the imported pages (tree + pages table).

The pages table includes a `Doc` column with relative links to the actual generated workspace markdown files (to avoid mismatches when name collisions are resolved).

For local repo-relative inputs, `Import URL` accepts both `path/to/file.html` and `file://path/to/file.html` (the `file://` prefix is stripped and treated as repo-relative).

## View Mode Semantics

- **Mode contract (ordered)**:
  - (1) `Markdown` (default): Editor shows Markdown; Viewer/Presentation render Markdown.
  - (2) `HTML`: Editor stays editable Markdown SSOT; Viewer/Presentation render sandboxed HTML via iframe (view-only).
  - (3) `JSON`: Editor shows conversion JSON (read-only override); Viewer/Presentation render sandboxed JSON code via iframe (view-only).

DOM export remains a capture/sync bridge, not a selectable view mode. Raw HTML remains an internal artifact source for the HTML viewer, not a user-facing `kgWebpageView` value.

The canonical place for these controls is the Markdown toolbar `nav` ("Webpage" group): `View`, `Script`, `Imgs`, `Fid`, and an explicit `Sync` action.

Markdown rendering supports safe rich-media HTML blocks through an allowlist renderer (no `dangerouslySetInnerHTML`), including `<svg>`, `<iframe>`, `<video>`, `<audio>`, `<details>/<summary>`, plus layout-safe media wrappers like `<picture>`, `<figure>`, and `<figcaption>`. The same shared rich-media SSOT (URL heuristics + iframe sandbox policy + auto Script/Imgs/Fid defaults) is reused across Markdown Viewer, Canvas 2D/3D, Design, and Document/Geospatial modes; per-doc frontmatter is an optional override and must not be required for normal Rich Media rendering. Image/media kind inference must derive from neutral extensions, media path segments, image transform paths, and format-like query parameters (for example `format`, `fmt`, `*_fmt`, `tp`) rather than host allowlists.

## Shared Signal Tokens (Mode-Independent)

All view modes share the same generic signal/token vocabulary derived from Markdown (no site-specific branching):

- `[NAV]`, `[CTA]`, `[LINK]`: classified link intent
- `[PRICE]`: price/cost tokens
- `[TIME]`: timecode tokens

The Markdown artifact can render these tokens inline (for example `Nav: [NAV] Docs | [CTA] Get started`) and the Document Structure section includes the same token prefixes.

The workspace toolbar also surfaces a compact token summary for webpage-backed docs so the same `[NAV]/[CTA]/[PRICE]/[TIME]` categorization is visible in `Markdown`, `JSON`, and `HTML` view modes.

## Webpage Markdown Artifact Structure (No Hardcoded Domains)

The Markdown artifact uses *generic extracted signals* plus optional extracted detail blocks to produce a more fixture-like, sectioned document without branching on any specific website.

### Required Signals (Generic)

- Header navigation must be derived from `[NAV]`/`[LINK]` intent plus optional `## Extracted Navigation Menus` blocks.
- Hero block must be derived from the main H1 + nearby summary paragraph + a first inline command (e.g. `$ npx ...`) + nearby CTAs.
- Section details must be derived from counts over the section body (paragraphs, links, media, price tokens, timecodes).

### Generic HTML Extraction Heuristics

- Navigation/header roots may not use semantic `<header>/<nav>` tags. Prefer elements marked by `role="navigation"`, `aria-label` containing `navigation/menu`, or menu-like containers with multiple links/buttons.
- Main content text may be nested in generic containers without `<p>/<h*>` tags. Extract leaf text blocks from containers when they do not contain known block descendants, while excluding `<script>/<style>` contents.
- Header image should prefer social preview metadata (`og:image` / `twitter:image`) when present; otherwise fall back to first meaningful content image.

### Optional Extracted Blocks (Preferred When Present)

If the upstream conversion appends structured blocks, the artifact should use them directly:

- `## Pricing Comparison (Extracted)` → detailed pricing comparison table.
- `## Company License Options (Extracted)` → company-license option bullets + callouts.
- `## Pricing Details (Extracted)` → price-point table.
- `## Rendering Options (Extracted)` → rendering options table.

### Fixture Parity Policy

- Use fixture-like ASCII layouts only when the corresponding signal set is detected (for example, template set contains `Blank/Hello World/Next.js/Prompt to Motion/React Router/Find a template`).
- Never check `kgWebpageUrl` or host strings to decide formatting.

### Regression Testing (Offline)

- Keep a local upstream-markdown fixture (not HTML, not live fetch) that includes extracted blocks.
- Assert on structural invariants (presence of sections/tables/frames) and avoid asserting on domain content beyond the fixture itself.

## Local Webpage Markdown Artifact Generation

Generate a webpage markdown artifact file from a URL (domain-neutral, no hardcoded sites or fixture paths):

```bash
npm --prefix agenticgraph/canvas run webpage:markdown -- --url "https://example.com/" --out "./webpage.md"
```
