# agentic-graph Settings Architecture

## Design Mantras

```
- [ ] Configuration; externalize behavior; forbid hardcoded settings
- [ ] Automation; derive settings schema; forbid manual sync
- [ ] Validation; enforce bounds; forbid invalid values
- [ ] Documentation; explain all settings; forbid undocumented options
- [ ] Performance; optimize schema generation; forbid slow builds
```

---

## Settings Architecture

**Settings Stack**: Source Markdown → Schema Extraction → JSON Schema → TypeScript Types → Runtime Validation

**Data Flow**: Responsibility Flow Doc → Build Script → Settings Schema → Canvas Store → UI Controls → User Preferences

**Design Principles**: Single Source of Truth | Build-Time Generation | Runtime Type Safety | Bounded Value Ranges

---

## Import Settings: PDF

**Scope**: MainPanel → Settings → `Import: PDF`

**Intent**: Let users tune PDF→Markdown conversion performance/fidelity without changing environment variables.

**Keys**

- `pdfImportIncludeImages`, `pdfImportEmbedImages`
- `pdfImportMaxExtractedImagesPerPage`, `pdfImportMaxEmbeddedImagesPerPage`
- `pdfImportMaxEmbeddedTotalBytes`, `pdfImportMaxEmbeddedAssetBytes`
- `pdfImportReconstructTables`, `pdfImportTableMinColumns`, `pdfImportTableMinRows`, `pdfImportTableMaxRows`
- `pdfImportProvider`, `pdfImportDoclingEndpoint`, `pdfImportProviderFallbackToNative`
- `pdfImportOcrEnabled`, `pdfImportOcrMode`

---

## Import Settings: Webpage

**Scope**: Source Files / Markdown Workspace → Import URL; MainPanel → Settings

**Intent**: Keep webpage parsing generic while letting users choose Markdown/JSON/HTML view modes without mutating graph/layout/zoom.

**Keys**

- `webpageImportIncludeImages`
- `webpageImportView` (`markdown` | `json` | `html`)
  - Mode contract: (1) `markdown` default SSOT, (2) `html` view-only iframe, (3) `json` view-only iframe.
  - `markdown`: editor/viewer use Markdown (graph parsing remains aligned to Markdown)
  - `html`: editor stays editable Markdown SSOT; viewer/presentation/slides render sandboxed HTML via iframe `srcdoc`
  - `json`: editor shows conversion JSON (read-only override); viewer/presentation/slides render sandboxed JSON via iframe `srcdoc`
- `webpageViewerScriptPolicy` (`strip` | `allow`)
  - Baseline script policy for the HTML Viewer. Effective per-page behavior remains auto by default: shared rich-media + iframe heuristics decide when scripts are needed for DOM export versus when they should be stripped. Most work should leave this at its safe default.
- `webpageArtifactFidelityMaxLevel` (1..4)
  - Caps the generated Webpage Markdown Artifact detail level so imports remain bounded and readable.

---

## Import Settings: Website

**Scope**: Markdown Workspace → Import website (sitemap); MainPanel → Settings

**Intent**: Crawl and import a whole website into the workspace as one Markdown file per page, while persisting conversion artifacts (markdown, JSON, HTML) for fast view switching.

**Keys**

- `websiteImportDiscoverSitemap`
- `websiteImportMaxPages`
- `websiteImportConcurrency`
- `websiteImportOutputDirRel`
- `websiteImportGenerateWebpageArtifactDocs`
  - Default `false` to avoid UI freezes on large imports.
  - When enabled, import may write server-generated `page.md` artifacts from stored `raw.html` for faster view switching.

**Derived rules**
- Website import uses `webpageImportIncludeImages` for conversion and `webpageImportView` as the default per-page view (stored in each stub’s `kgWebpageView`).
- In the active-row dropdown, Viewer/Presentation render HTML in a sandboxed iframe when `kgWebpageView ∈ {json, html}`.
- When `kgWebsiteImportId/kgWebsiteNodeId` exist, Viewer prefers rendering from stored `raw.html` artifacts (in-repo) instead of proxying live HTML.
- Workspace artifacts are stored under the repo-local ignored `.agentic-graph-workspace/` root.
- If `kgWebsiteOutputDirRel` is present, it overrides the artifact root directory for resolving `raw.html/page.md/conversion.json`.

---

## Import Settings: Geospatial

**Scope**: Import JSON/GeoJSON; MainPanel → Settings

**Intent**: Auto-open the map overlay after geo-capable imports while keeping graph zoom/layout stable.

**Keys**

- `autoEnableGeospatialOnGeoImport`
  - When enabled, successful imports that yield nodes with `properties.geo.{lat,lng}` will automatically enable Geospatial Mode.
  - Intended for geo datasets (GeoJSON or record-style JSON) and should not require absolute local paths.

---

## Markdown Settings: Viewer / Presentation

**Scope**: Markdown Workspace → Viewer/Presentation; MainPanel → Settings

**Intent**: Keep Markdown rendering defaults configurable and consistent across Viewer, Presentation, and Gallery renderer.

**Keys**

- `markdownWordWrap`
- `markdownTextHighlight`

## Chat Settings: Endpoint, Model, Context

- `chatProvider` defaults to BytePlus ModelArk (`ap-southeast-1`) with OpenAI as the secondary official profile; preserve canonical official endpoint URLs in Settings even though requests route through the same-origin proxy.
- TextGeneration credential controls resolve the selected card's effective provider, auth mode, endpoint, and model before rendering a BYOK prompt. Provider rejection diagnostics require the key to match that provider and endpoint region, preserve the returned request id, and never log or persist the credential.
- `chatAuthMode` selects `serverManaged` (default) vs `byok`.
  - `serverManaged`: no user key is required; Cloudflare/dev proxy secrets stay server-side and the proxy injects the provider key.
  - `byok`: the user explicitly provides a fallback API key for the current runtime only (memory-only; never localStorage/sessionStorage).
- `chatEndpointUrl` and `chatApiKey` configure an OpenAI-compatible chat endpoint; official BytePlus/OpenAI calls use Bearer auth through the proxy and may attach `X-Client-Request-Id` for request tracing.
- `chatModel` accepts custom provider model ids via text input with shared suggestions; Settings can refresh `/v1/models` from the configured endpoint without forcing a static option list.
- `chatContextScope` selects selection-only, workspace-wide (default), or hybrid context; hybrid adds workspace-wide file context to selection-derived graph and markdown snippets while keeping behavior bounded and schema-neutral.
- `chatStorageTarget` selects primary persistence target: `chatAgenticGraph` (default) or `chatHistory`.
- `chatLocalStorageRootPath` defaults to workspace `/chat-log` and is used as the root folder for auto-created local markdown files. When the local mirror base is configured, `/chat-log/**` is mirrored to the sibling host `chat-log` folder.
- `chatAgenticGraphStorageMode` + `chatAgenticGraphWorkspacePath` + `chatAgenticGraphCloudUrl` configure Knowledge Graph Canvas storage (`/chat-log/YYYYMMDDTHHmmssZ/kgc_YYYYMMDDTHHmmssZ.md`, local/cloud).
- In Chat UI with `chatStorageTarget=chatAgenticGraph`, `New Chat` creates a fresh session folder plus canonical KGC workspace file (`/chat-log/YYYYMMDDTHHmmssZ/kgc_YYYYMMDDTHHmmssZ.md`), opens it in Workspace Editor (markdown pane), clears the active chat thread, and routes the next request/response into that new file.
- `chatHistoryStorageMode` + `chatHistoryWorkspacePath` + `chatHistoryCloudUrl` configure Chat History storage (`/chat-log/chh_YYYYMMDDHHmmss.md`, local/cloud).
- FloatingPanel Chat uses a thin `useFloatingPanelChatSubmit` shell that resolves request guards and optimistic state, then delegates the async lifecycle to `floatingPanelChatSubmitCoordinator.ts`; standard chat responses may include one `response:` YAML metadata block when non-trivial, while `chatAgenticGraph` uses the strict structured KGC contract or a renderable literal MCP structured response.
- For `chatAgenticGraph`, the saved `kgc_*.md` must be one standalone frontmatter-first canonical KGC document that opens directly in Canvas, Editor Workspace, Multi-dimensional Table, and Kanban, unless the assistant response is a literal MCP result whose `structuredContent` already extracts to renderable widgets, panels, cards, media, safe inline compute, or edges. The canonical saved document must not append same-session chat-history trailers, must not degrade to a minimal canvas-preset-only fallback, and must keep `flow.subgraphs` as the only grouping authoring surface.
- `chatAgenticGraph` validation and correction retries are handled upstream through the existing submit helpers and validator/recovery modules; malformed wrapped output may be salvaged before validation, and renderable literal MCP structured surfaces finalize without KGC retry or synthetic KGC text before shared workspace/canvas projection.
- `chatHistoryWorkspacePath` optionally pins a workspace Markdown file path to append chat exchanges; when empty, the first successful chat will create `/chat-log/chh_YYYYMMDDHHmmss.md` under `chatLocalStorageRootPath` and continue appending there so the history is viewable and editable in the Workspace Editor.
- `chatHistoryStorageMode` selects `local` (default, workspace file) vs `cloud` (reserved; does not write anywhere yet).
- `chatHistoryCloudUrl` reserves a future sync target (e.g. GitHub URL) and is inert until a backend exists.
- Chat history setup actions in Settings should reuse Toolbar Launch import pipelines: local mode reuses `Import local files` and cloud URL mode reuses `Import URL`, with bridge-first execution and Launch fallbacks.
- `integrationConfigsJson` remains the SSOT for AI chat enable/open-tab routing and simulation command defaults; MainPanel Integrations should show live Chat status, expose format/enable-disable helpers, and open a `chat` Settings search with matching groups expanded so `chatProvider`, `chatContextScope`, and `integrationConfigsJson` stay visible together.

---

## Video Generation Settings: Gemini Veo

**Scope**: MainPanel → Settings → Video Generation

**Intent**: Let users configure Gemini Veo video generation parameters (model, aspect ratio, resolution, duration, person generation) with safe defaults and localStorage persistence.

**Keys**

- `geminiVideoModel` — Gemini Veo model identifier; defaults to `CHAT_GEMINI_VIDEO_MODEL_DEFAULT` from `chatEndpoint.ts`.
- `geminiVideoAspectRatio` — Output aspect ratio; valid values: `16:9` (default), `9:16`.
- `geminiVideoResolution` — Output resolution; valid values: `720p` (default), `1080p`, `4k`.
- `geminiVideoDurationSeconds` — Video duration in seconds; valid values: `4`, `6`, `8` (default).
- `geminiVideoPersonGeneration` — Person generation policy; valid values: `allow_all` (default), `allow_adult`, `dont_allow`.

**SSOT**: `canvas/src/features/integrations/geminiVideoGenerationSsot.ts` defines the API doc rows and widget fields; `canvas/src/features/integrations/geminiVideoGenerationDefaults.ts` reads/normalizes defaults from localStorage.

**Runtime**: `canvas/src/features/chat/geminiRunGeneration.ts` uses long-running operation pattern (create task, poll up to 36 times at 10s intervals, ~6 min max). Provider-guarded to `CHAT_PROVIDER_GEMINI`.

---

## Video Generation Settings: BytePlus ModelArk

**Scope**: MainPanel → Settings → Video Generation

**Intent**: Let users configure BytePlus ModelArk video generation parameters.

**Keys**

- `byteplusVideoModel`, `byteplusVideoContentJson`, `byteplusVideoResolution`, `byteplusVideoRatio`, `byteplusVideoDuration`, `byteplusVideoGenerateAudio`, `byteplusVideoDraft`, `byteplusVideoCameraFixed`, `byteplusVideoImageUrlUrl`

**SSOT**: `canvas/src/features/integrations/byteplusVideoGenerationSsot.ts`

---

## Image Generation Settings: BytePlus ModelArk

**Scope**: MainPanel → Settings → Image Generation

**Intent**: Let users configure BytePlus ModelArk image generation parameters.

**Keys**

- `byteplusImageModel`, `byteplusImageSize`, `byteplusImageOutputFormat`, `byteplusImageResponseFormat`, `byteplusImageOptimizePromptOptions`, `byteplusImageAspectRatio`, `byteplusImageStream`, `byteplusImageWatermark`, `byteplusImageSeed`, `byteplusImageGuidanceScale`

**SSOT**: `canvas/src/features/integrations/byteplusImageGenerationSsot.ts`

---

## Image Generation Settings: OpenAI Images

**Scope**: MainPanel → Settings → Image Generation

**Intent**: Let users configure OpenAI Images API generation parameters.

**Keys**

- `provider` (OpenAI), `auth_mode`, `api_key`, `endpoint`, `model`, `prompt`, `size`, `quality`, `background`, `output_format`, `response_format`, `n`, `moderation`, `stream`, `partial_images`, `output_compression`, `style`, `user`

**SSOT**: `canvas/src/features/integrations/openaiImagesSsot.ts` — 18 API doc rows covering all OpenAI Images parameters.

---

## Settings UI Tooltip Semantics

**Scope**: MainPanel → Settings → key/value rows (hover tooltips)

**Key tooltip (max 50 words)**
- Format: `Role → Actions → Outcome`
- Semantics: one atomic role, 1–2 atomic actions, one concrete outcome

**Value tooltip (max 15 words)**
- Format: `Default: …; Min: …; Max: …; Interval: …; Impact: …`
- Semantics: include default; include min/max/interval when applicable; describe impact succinctly

**Implementation anchors**
- Tooltip builders: `canvas/src/lib/config-copy/tooltips.ts` (`buildRoleActionOutcomeTooltip`, `buildNumericTooltip`)
- Settings UI surface: `canvas/src/features/panels/views/SettingsView.tsx`

**Interaction**
- Hover key label → show key tooltip
- Hover value control → show value tooltip (no separate icon affordance)

**Expanded details row (click to expand)**
- Render only: `Modules | Classes/Objects | Functions/Methods`

---

## Settings Row Layout Consistency (Key / Type / Value)

**Scope**: MainPanel → Settings rows (shared key/value layout utilities)

**Layout rules**
- One setting row renders as one row: Key / Type / Value do not stack into multiple rows at narrow widths.
- Value controls are right-edge aligned within the Value column (text inputs, selects, checkboxes, pill buttons).
- Height is consistent: value controls, preview chips, and pill actions use the same baseline height (`h-6`) to keep rows visually stable.
- Composite value controls (preview + input) must be shrink-safe: wrappers use `w-full min-w-0` and inputs use `min-w-0` so the right border stays aligned.
- Clean interactions: clicking inside a value control does not toggle expand/collapse; only row click toggles.

**Implementation anchors**
- Key/Type/Value compatibility entrypoint: `canvas/src/features/panels/ui/canvasKeyTypeValueCompatibility.ts`
- Settings surface + status/action pills: `canvas/src/features/panels/views/SettingsView.tsx`
- Settings input renderer (composite controls + alignment/height): `canvas/src/features/settings/ui.tsx` (`renderSettingInput`)

---


---

## Continuation

See continuation in `agentic-graph-settings-document-schema-and-specs.md` for component matrix, schema extraction flow, core setting specifications, testing gates, and anti-pattern constraints.
