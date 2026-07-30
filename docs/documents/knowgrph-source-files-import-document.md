---
title: "Knowgrph Source Files Import"
id: "md:knowgrph-source-files-import-document"
version: "1.4.0"
updated: "2026-07-23"
status: "active"
doc_type: "Workflow and Runtime Reference"
frontmatter_contract: "required"
document_runtime_status: "runtime-ready-dev"
runtime_scope: "Frontmatter parsing, source validation, MCP grammar resolution, and read-only Source Files discovery; importer status remains section-specific."
deploy_boundary: "No Prod mirror or Cloudflare mutation is authorized by this document."
mcp:
  grammar_tool: "knowgrph.agentic_canvas_os.docs.invoke"
  published_source_tools: ["search", "fetch"]
  webmcp_source_tools: ["knowgrph.list_source_files", "knowgrph.read_source_file"]
  source_availability: "Read-only after the document is present in the configured published Source Files workspace."
invocation:
  normalize: "/source.normalize @source.frontmatter @source.body #frontmatter #no-legacy"
  verify: "/runtime-ready.check @local-harness @runtime-proof #runtime-ready #vcc"
---

# Knowgrph Source Files Import (Workflow → Workspace Actions)

## Design Mantras

```
- [ ] Markup; apply semantic elements; forbid generic div misuse
- [ ] Modularity; reuse shared utilities; forbid duplication across components
- [ ] Neutrality; stay dataset-agnostic; forbid dataset-specific assumptions
- [ ] Provenance; preserve imported source text; forbid metadata loss
- [ ] Reliability; bound remote fetch; forbid indefinite runs
```

---

## Architecture

**UI Surface Stack**: MainPanel Workflow → Step 3 (Ingest) → collapsible subsections (**Sample Dataset**, **Dataset fetch limits**, **Source Files**) → Source Files header "New Source File" (icon) → creates empty `.md` + selects it → opens the markdown workspace / Editor Workspace → left-side **Explorer** sidebar with sections (**Source Files**, **Outline**, **Backlinks**).

**Workspace Persistence**: The `sourceFiles` workspace is persisted locally via IndexedDB (Dexie) so Source Files survive reloads and act as a lightweight file-system abstraction; the persisted payload is intentionally minimal (no heavy parsed graph blobs) and includes workspace metadata (folder name/access mode/selected folder path). Local-folder-backed entries fall back to cached text when folder handles are unavailable.

**Durable Cache Contract**: Source Files document, chunk, graph-snapshot, sync-outbox, and cursor records restore independently through the shared Dexie adapter. Local writes and collaboration updates enter IndexedDB before transport. Initialization/quota or write-conflict failure retries once, then reports degraded in-memory persistence through MainPanel instead of silently claiming durable storage.

**Storage And Sync Settings**: MainPanel Settings → `Document Storage & Sync` exposes Online/Offline only mode, the `GitHub/knowgrph/docs` and `GitHub/huijoohwee/docs` roots, offline fallback state, and explicit `Sync now`. Import remains local-first: Offline only never discards imported content, and online publication routes Knowgrph product/workspace-seed paths to `knowgrph-docs`, collaborative workspace documents to `workspace-docs`, and rejects Agentic Canvas OS paths as write targets.

**Explorer Ownership Projection**: Explorer → Source Files renders a compact path-derived ownership ledger above the tree: product documents → `GitHub/knowgrph/docs`, workspace documents → `GitHub/huijoohwee/docs`, seeds → `GitHub/knowgrph/docs/workspace-seeds`, and offline fallback → IndexedDB. The canonical `workspace-seeds` folder has a shield marker. The byte-identical Agentic Canvas OS seed remains a protected runtime projection and is never shown as another editable root; `huijoohwee/docs/workspace-seeds` is rejected.

**Seed Mutation Enforcement**: Source Files reads, creates, writes, renames, and nested deletes below `/docs/workspace-seeds/**` resolve only to `$GITHUB_ROOT/knowgrph/docs/workspace-seeds/**`. The general local docs-mirror preference cannot redirect this subtree. Every local bridge mutation includes the workspace ownership key; mismatched host paths, direct unkeyed seed writes, and deletion of the seed root are rejected. IndexedDB remains the offline fallback and queued cloud saves retain the same `knowgrph-docs` authority.

**Seed Inventory Convergence**: The protected app build packages all six canonical seed files as a revision-pinned, read-only bootstrap artifact. Prod and offline startup materialize that exact inventory without GitHub API tree discovery. During repository-local Dev, Source Files also probes `$GITHUB_ROOT/knowgrph/docs/workspace-seeds`; a successful listing overlays only the bundled seed subtree so authored edits remain immediate. Authority-marked reconciliation materializes every canonical seed, refreshes changed bytes, removes stale cached seed paths and source metadata, and never prunes the subtree after an incomplete or unavailable authority read.

**Seed Filesystem Audit**: The canonical Knowgrph root currently contains six authored files. `huijoohwee/docs/workspace-seeds` is absent. One tracked Agentic Canvas OS physics file remains as an exact-byte, read-only runtime projection because the bootstrap authority gate still requires it; Source Files does not display it as writable and the save bridge rejects its path. Physical removal is gated on migrating that bootstrap dependency.

**Collaboration Admission**: Fetching, parsing, and first persistence always complete locally before an import can join a live room. When Online mode, authenticated workspace membership, a canonical document path, and one configured room provider are all available, Source Files may hydrate the Yjs document from a compacted provider snapshot plus ordered updates, then replay its IndexedDB-backed local update outbox. PocketBase is the recommended small-team provider after production gates pass; a Durable Object is a replacement provider, never a simultaneous second owner. Import credentials, local paths, and remote-source authorization headers are never transmitted to the room provider.

**Checkpoint Publication**: Imported collaborative text reaches GitHub only at explicit save or bounded autosave checkpoints through the server bridge with path-derived repository authority and compare-and-set content SHA. D1 projection follows a successful GitHub checkpoint; room updates are never committed per keystroke, and failed online delivery leaves the local import and outbox available offline.

**Initialization-File Bootstrap Contract**: The canonical family contains the three legacy root seeds sourced from `huijoohwee/docs`—`/workspace-readme.md`, `/knowgrph-agentic-video-canvas-demo.md`, and `/knowgrph-maps-places.md`—plus `/docs/workspace-seeds/knowgrph-physics-playground-demo.md`, sourced from Knowgrph and published under the same path in Agentic Canvas OS. A cold unselected workspace starts from the physics seed; its frontmatter owns XR/3D and Motion Control initialization. Explicit deep links, imported embeds, persisted non-initialization documents, and a custom validation-seed environment remain authoritative in their declared scopes.

**Imported-Document Activation Rule**: During the exact UI import path, the first imported workspace file chosen for focus becomes the active raw-frontmatter authority before any composed source-file replay runs. This prevents a previously selected document from reapplying stale renderer/surface frontmatter over the newly imported preset document.

**Source-Authority Transaction**: Bootstrap owns one terminal base phase and, when a URL selects a document, one keyed document-intent phase; each is `resolving`, `ready`, or `error`. Three, native XR, Game Mode, runtime hydration, and their HUDs remain unmounted until the combined transaction is `ready`. Successful materialization consumes the URL only after the selected document owns Source Files and the Canvas graph; failure keeps the URL, exposes a visible error, and stays fail-closed. A completion for an older key cannot settle a newer navigation. URL commits journal local workspace mutations with host mirrors disabled; supersession restores workspace bytes, the touched source-index union, CAS-matching Canvas fields, and the persisted Explorer path before the latest intent can commit.

**Composition Invariant**: Any change to `sourceFiles` (add/remove/clear/toggle/parsed hash updates) must trigger a recomposition via `applyComposedGraphFromSourceFiles()` so the active `graphData` and all graph-tied touchpoints (canvas, Graph Data Table) stay consistent. When Source Files becomes empty, the composed `graphData` must become empty as well (no stale rows).

**Document Versioning Rule**: Editor Workspace saves, Source Files writeback, and GitGraph CRUD must record bounded local document snapshots via the shared document-versioning utility. Source Files exposes per-file version counts, Editor Workspace `[ ] diff` opens the shared Timeline bottom panel in GitGraph view after `[ ] Markdown`, and that bottom panel exposes the GitGraph icon immediately to the right of the Timeline icon. MainPanel History does not own a document-version Docs surface.

**Bounded Import And Identity Rule**: Local and URL text imports stop at 10,485,760 bytes; URL fetches also stop after 30 seconds. Batch hydration isolates malformed, oversize, slow, and unreachable sources so earlier imports remain and later sources continue. Re-importing the same case-insensitive filename updates the existing Source Files id. Valid JSON, JSON-LD, and CSV parse/print/reparse cycles preserve normalized structure and ordering.

**Supported Formats**: Local import/export supports `.md .markdown .txt .json .jsonld .csv .html .htm .yaml .yml`, URL sources via `https://…`, and YouTube imports via the YouTube importer.

**GitHub Repo URL Rule**: When Import URL receives a GitHub repository URL (e.g. `https://github.com/<owner>/<repo>`), it must:

- Write a synthesized repo overview doc `repo.sitemap.md` into the created workspace folder and focus it as the first opened file.
- Also write `repo.user-journey.md` (user journey flow + UI map) into the same folder.
- Import up to a bounded number of likely-text files via `raw.githubusercontent.com` (no folder-by-folder `contents` crawling).
- Continue on per-file failures (record them) instead of failing the whole import.
- Emit progress toasts and bounded progress logs into MainPanel History → Log.

**Folder Mode Contract Rule**: When the user selects a workspace folder that contains `repo.sitemap.md` / `repo.user-journey.md`, the explorer row must show a right-side dropdown (same UI as File Mode Contract) that switches the Editor SSOT between Sitemap and User Journey.

**Sitemap LOD Rule**: `repo.sitemap.md` must include (bounded) Repository Statistics, a Directory Structure tree, extracted README feature groups with per-section “Section Statistics”, a Template Showcase grid + table, and a Core Entry Points section that derives function/class/method tables from key source files when available.

**UI Consolidation Rule**: Workspace Actions lives in MainPanel Workflow only; FloatingPanel is reserved for transient views (e.g. Props, Renderer, Traversal) to avoid duplicated controls.

**Workflow Aside Rule**: Workflow uses the shared MainPanel `<aside>` wrapper (same scrolling contract as Settings) and reuses the shared Expand/Collapse All header control.

**Search Rule**: Workspace Actions filtering reuses the MainPanel header Graph Search toggle (no duplicate per-section search input).

**GraphRAG Workflow Editing Rule**: Workflow Step 6 links to Floating Panel → Graph Traversal / Orchestrator for GraphRAG workflow JSON-LD editing (no duplicate editor in MainPanel Workflow).

**Toolbar Entry Point**: Toolbar "Open Data" opens MainPanel Workflow so ingest actions remain discoverable in the canonical step flow.

**Optional Geo Layer Path**: Source Files → per-row Geo Layer checkbox (visible only while Geospatial Mode is On) → geospatial dataset registry (gympgrph store) → Geospatial Overlay layers

**Embedded GeoJSON Path**: For local Markdown Source Files, the Geo checkbox can register embedded fenced `geojson` blocks (GeoJSON `FeatureCollection`) as overlay datasets by uploading them to the bounded local dataset cache and registering the returned `/__geo_local/...` URLs.

---

## Happy Path Sequence Diagrams

### Source Files List Import → Markdown Render (Singabldr)

```mermaid
sequenceDiagram
  participant U as User
  participant GH as normalizeGitHubBlobLikeUrl
  participant NET as fetchRemoteTextDetailed
  participant S as useGraphStore.updateSourceFile
  participant MW as MarkdownWorkspace
  participant MD as setMarkdownDocument
  participant OPEN as setEditorWorkspacePane

  U->>UI: click "Open Markdown Viewer" (row)
  UI->>GH: normalizeGitHubBlobLikeUrl(url)
  UI->>NET: fetchRemoteTextDetailed(url)
  UI->>S: updateSourceFile(id,{ text,status })
  UI->>MD: setMarkdownDocument(name,text)
  UI->>OPEN: set editor workspace to markdown
```

### Initialization-File Bootstrap → Frontmatter View Landing (Knowgrph)

```mermaid
sequenceDiagram
  participant BOOT as workspaceFs.ensureSeed
  participant DOCS as Canonical seed sources
  participant WS as IndexedDB Workspace
  participant SF as workspaceSeedSourceFiles
  participant MD as setMarkdownDocument
  participant FM as applyCanvasFrontmatterPreset

  BOOT->>DOCS: load editorial/video/maps plus source-owned physics text
  BOOT->>WS: materialize the canonical four-seed family
  WS->>SF: reconcile canonical source-file ids and paths
  SF->>MD: activate physics on cold start or preserve an explicit selection
  MD->>FM: apply frontmatter-selected renderer/document/surface mode
```

### UI Import Activation → Frontmatter-Preset Landing (Knowgrph)

```mermaid
sequenceDiagram
  participant U as User
  participant UI as Import local files
  participant WS as Workspace Import
  participant ACT as activateFirstImportedWorkspaceFile
  participant EXP as Explorer active path
  participant APP as applyWorkspaceImportToCanvas
  participant FM as applyCanvasFrontmatterPreset

  U->>UI: import README / video-demo / maps-demo
  UI->>WS: create workspace files
  WS->>ACT: pick first imported file for focus
  ACT->>EXP: set active path to imported file
  ACT->>APP: apply imported source files to canvas
  APP->>FM: apply imported file frontmatter as landing SSOT
```

### Format-Specific Import (Parse → GraphCanvas Render) (Knowgrph)

```mermaid
sequenceDiagram
  participant U as User
  participant UI as Markdown Workspace Toolbar
  participant FLOW as runImportFlow
  participant PAR as loadGraphDataFromTextViaParser
  participant G as useActiveGraphData
  participant C as GraphCanvas

  U->>UI: Import local/URL (active file)
  UI->>FLOW: runImportFlow({ nameForParse, textForParse })
  FLOW->>PAR: loadGraphDataFromTextViaParser(nameForParse,textForParse)
  C->>G: useActiveGraphData()
```

### Optional Geo Layer Registration → MapLibre Layers (Gympgrph)

```mermaid
sequenceDiagram
  participant UI as Markdown Workspace (Geo integration)
  participant M as gympgrph.addGeospatialDatasetUrls
  participant H as GeospatialOverlayHost
  participant O as GeospatialOverlay
  participant L as loadDatasetFeatureCollection

  alt embedded GeoJSON blocks in Markdown
    UI->>UI: POST /__geo_upload (bounded)
    UI->>M: addGeospatialDatasetUrls([{label,url:"/__geo_local/...",format:"geojson"}])
  end
  H->>O: render overlay when active
  O->>L: loadDatasetFeatureCollection(dataset)
```

### High-Level Components

- **Workspace Actions (Knowgrph)**:
  - `knowgrph/canvas/src/features/workspace-actions/WorkspaceActionsPanel.tsx` renders Step 3 subsections (Dataset fetch limits + Source Files).
- **Source Files Ingest (Knowgrph)**:
  - `knowgrph/canvas/src/features/source-files/sourceFilesIngestIntegration.ts` implements Source Files import/export/clear + parse/apply helpers used by the markdown workspace toolbar.
  - `knowgrph/canvas/src/features/source-files/workspaceSeedSourceFiles.ts` keeps the canonical source-file aliases for the 3-file initialization family aligned with the root-level workspace paths.
- **Workspace Seed Bootstrap (Knowgrph)**:
  - `knowgrph/canvas/src/features/workspace-fs/workspaceFs.ts` loads the three legacy initialization files from `huijoohwee/docs`, loads the physics seed from `knowgrph/docs/workspace-seeds`, materializes the canonical family into the workspace root, and keeps seed ordering deterministic.
- **Source Files Runtime Bootstrap (Knowgrph)**:
  - `knowgrph/canvas/src/features/source-files/SourceFilesPersistenceBootstrap.tsx` coalesces seed-sync, rematerialization, and storage bridge scheduling through request-owned helpers to keep Source Files, Workspace, and Storage in sync on the same tick.
  - `knowgrph/canvas/src/features/source-files/sourceFilesBootstrapReadiness.ts` owns the base-plus-keyed-document transaction. Stale keyed completions are ignored, terminal bootstrap failures cannot be overwritten, and Canvas/XR consumers read the combined phase.
  - `knowgrph/canvas/src/features/source-files/sourceFilesRuntimeStartup.ts` owns per-bootstrap active-path snapshot reuse through `createWorkspaceStartupSourceRootEntriesReader(...)`, so repeated startup reads for the same selected Source File share one active-entry hydration.
  - `knowgrph/canvas/src/lib/markdown-workspace-runtime/markdownWorkspaceSelectionResolvedText.ts` owns resolved-text lookup and same-key in-flight caching for Source Files switching. Cache keys include the active path, canonical-read intent, entry timestamp, and entry text hash so switching does not duplicate FS/storage reads while stale entry text remains rejected upstream.
  - `knowgrph/canvas/src/lib/markdown-workspace-runtime/useMarkdownWorkspaceSelection.ts` treats an active document switch as settled only when the selected document name, text, and Canvas graph source have converged; settled switches clear retry timers, while in-flight applies remain deferred.
- **Document Versioning (Knowgrph)**:
  - `knowgrph/canvas/src/features/document-versioning/documentVersioning.ts` owns bounded local snapshots, git-style diffs, and GitGraph history code shared by Editor Workspace, Source Files, GitGraph CRUD, and the Timeline bottom panel GitGraph view.
- **Curation UI (Singabldr)**:
  - `singabldr/src/features/markdown/ui/MarkdownPanelLayout.tsx` renders an Explorer-like sidebar (Source Files + Outline + Backlinks).
  - `knowgrph/canvas/src/lib/markdown-workspace-runtime/MarkdownWorkspaceRuntime.impl.tsx` wires selection and active workspace path to `setMarkdownDocument(...)`.
  - `knowgrph/canvas/src/features/markdown-workspace/MarkdownWorkspaceToolbar.tsx` renders the Source Files ingest controls in the markdown workspace toolbar.
- **Geospatial Mode (Gympgrph)**:
  - `gympgrph/src/datasets.ts` exposes the lightweight `addGeospatialDatasetUrl` API for hosts.
  - `gympgrph/src/hooks/store/geospatialSlice.ts` persists `mapOverlayDatasets` under `kg:ui:geospatial:*` keys.

### Component Inventory

| Layer | Component | File | Status |
|---|---|---|---|
| Workspace Actions | Workflow Step 3 UI | `WorkspaceActionsPanel.tsx` | Built |
| Source Files | Import/export/clear/parse | `sourceFilesIngestIntegration.ts` | Built |
| Source Files | Seed aliases (3-file family) | `workspaceSeedSourceFiles.ts` | Built |
| Source Files | Ownership ledger + seed authority marker | `SourceFilesOwnershipSummary.tsx` + `MarkdownFileTree.tsx` | Built |
| Workspace FS | Seed bootstrap | `workspaceFs.ts` | Built |
| Workspace FS | Minimal persisted cache FS | `workspaceFsPersisted.ts` | Built |
| Workspace FS | In-memory FS | `workspaceFsMemory.ts` | Built |
| Workspace FS | Change events | `workspaceFsEvents.ts` | Built |
| Workspace FS | Bootstrap startup | `sourceFilesBootstrapStartup.ts` | Built |
| SF ↔ Storage | Runtime bootstrap | `SourceFilesPersistenceBootstrap.tsx` | Built |
| Document versions | Snapshot/diff/GitGraph utility | `documentVersioning.ts` | Built |
| Curation UI | Explorer sidebar | `MarkdownPanelLayout.tsx` (Singabldr) | Built |
| Curation UI | Workspace runtime | `MarkdownWorkspaceRuntime.impl.tsx` | Built |
| Curation UI | Toolbar ingest controls | `MarkdownWorkspaceToolbar.tsx` | Built |
| Geospatial | Dataset add API | `datasets.ts` (Gympgrph) | Built |
| Geospatial | Dataset store | `geospatialSlice.ts` (Gympgrph) | Built |
| Utilities | URL normalization | `url.ts` → `normalizeGitHubBlobLikeUrl` | Built |
| Fetch | Bounded remote fetch | `fetchRemoteText.ts` → `fetchRemoteTextDetailed` | Built |
| Import | YouTube pipeline | `youtube_cmd.py` | Built |
| Import | Local video download | `canvas/src/lib/video-download/*` + `cloudflare/pages/video-download.mjs` | Built |
| Import | Webpage proxy | `/__webpage_proxy` route | Built |
| Import | Website import | `/__website_import/start` route | Built |
| Import | Geo upload | `/__geo_upload` route | Built |

---

## Specifications

### YouTube Import (End-to-End Native Local In-Repo Pipeline)

**From/To**: Source Files Import URL -> `youtube_cmd.py` -> Native Fetch (HTML scrape/InnerTube/XML/JSON) -> Markdown/JSON output.

**Decision Logic**:
- **End-to-End Native Implementation**: Uses a dependency-free native Python implementation (`youtube_cmd.py`) to fetch transcripts via the YouTube `timedtext` API or InnerTube API, avoiding external library breakage (`youtube-transcript-api`) and ensuring fully local execution.
- **Fallbacks**: Tries native fetch first, then InnerTube API (Android client emulation), then `yt-dlp` (if installed), then `whisper` (if installed/configured).
- **Output Format**: Respects the `youtubeTranscriptOutputFormat` setting (Markdown with embedded thumbnail or raw JSON).
- **Error Handling**: Returns structured JSON errors (`{ "ok": false, "error": "..." }`) even on failure, ensuring the UI displays specific messages (e.g., "Transcript unavailable" due to IP blocking) instead of generic request failures.
- **Thumbnail**: Extracts high-res thumbnails via oEmbed or fallback URL construction.

### Import URL Local Video Download

**From/To**: Toolbar -> Launch -> Import URL -> Download local -> `VITE_VIDEO_DOWNLOAD_ENDPOINT` or same-origin `/__video_download` in Dev/Preview -> native in-repo downloader -> workspace download record.

**Decision Logic**:
- **Eligibility**: `canvas/src/lib/video-download/isVideoDownloadEligible.ts` owns the only eligible-domain set. Launch UI calls the helper and shows the download affordance only for matching video hosts.
- **Transport**: `resolveVideoDownload` checks `workspaceActionBridge.downloadVideo` first, then falls back to an HTTP POST endpoint read from `VITE_VIDEO_DOWNLOAD_ENDPOINT`; if unset in a browser Dev/Preview runtime, it derives the same-origin `/__video_download` endpoint. The client does not import server, Cloudflare, MCP, or Node runtime modules.
- **Request contract**: POST JSON contains `url` plus optional `format`, `mediaKind`, `quality`, `subtitleLang`, and `outputDir`. Real validation URLs must come from runtime env or operator input, never from committed tests or fixtures.
- **Output location**: MainPanel Settings exposes `workspace.import.videoDownload.outputDir`. When unset, the Dev/Preview server derives the sibling `huijoohwee/video` folder from the detected workspace root; configured paths are validated against that workspace root before writing.
- **Video-frame output location**: `/__video_frame` writes extracted frame images to `$GITHUB_ROOT/huijoohwee/image/video-frame/YYYYMMDDTHHmmssZ`, reusing the timestamped sibling-root shape of `/docs_/YYYYMMDDTHHmmssZ` Import URL artifacts.
- **Native runtime**: The local `/__video_download` route is inspired by mature downloader safety defaults (bounded output naming, no playlist expansion, best-available default semantics) but does not copy or invoke yt-dlp. It downloads direct audio/video URLs, HTML pages that expose media sources, and YouTube pages whose player metadata exposes direct media URLs through the in-repo native resolver.
- **Local file access**: Dev/Preview results include a browser-local `fileUrl` served through `/__video_download_file` with workspace-root bounded path resolution and byte-range support. Workspace registration writes a visible media document containing a playable video embed and open link.
- **Native boundary**: Requests that require unsupported muxing, transcoding, or unavailable direct media URLs return sanitized native error codes with clean messages instead of invoking external tools or surfacing stack traces.
- **Workspace registration**: successful downloads persist `fileName`, `filePath`, `mimeType`, `sizeBytes`, and `sourceUrl` into a workspace document and source index entry.

### Webpage Import (URL/Local Path → Markdown SSOT + HTML/JSON Viewer)

**From/To**: Source Files / Workspace Import URL → browser-native webpage conversion (hidden sandboxed iframe DOM export + proxy-fetch fallback) → Markdown → Graph parse; Viewer/Presentation → fetch HTML via `/__webpage_proxy` (or stored artifacts) → sanitize → sandboxed iframe `srcdoc`.

**Decision Logic**:
- **Graph Alignment**: Webpages convert to Markdown for Document Structure parsing, preserving graph/content sync across touchpoints.
- **View Mode (Strictly View-Only)**: Per-file `kgWebpageView` frontmatter (and default `webpageImportView` setting) selects `markdown | json | html`.
- **Mode contract (active-row dropdown)**:
  - (1) `Markdown` (default): Editor shows Markdown; Viewer/Presentation render Markdown.
  - (2) `HTML`: Editor shows editable Markdown SSOT; Viewer/Presentation render sandboxed HTML via iframe `srcdoc` (view-only).
  - (3) `JSON`: Editor shows conversion JSON (read-only override); Viewer/Presentation render sandboxed JSON code via iframe `srcdoc` (view-only).

**Webpage Markdown (Editor SSOT)**:
- Generated output is a single Markdown SSOT document (frontmatter + Markdown body). It must not include duplicate “artifact doc” wrappers, alternate formats, or synthetic table-of-contents/layout sections by default.
- If a webpage embeds a Markdown payload in its HTML (e.g., React `data-page` JSON fields like `props.article.content`), the importer prefers that embedded Markdown and writes it directly (lossless for text/images/links).

**Shared token vocabulary (mode-independent)**: the app uses a generic signal extraction layer to derive consistent tokens from Markdown across modes: `[NAV]`, `[CTA]`, `[LINK]`, `[PRICE]`, `[TIME]`.
- **Iframe implementation**:
  - HTML/JSON always render via sandboxed iframe `srcdoc`.
  - HTML source is fetched via `/__webpage_proxy` (remote or local in-repo path), or read from stored website-import artifacts when available.
-  - For local in-repo webpages, assets resolve through `/__codebase_asset?path=...` plus optional `kgWebpageSiteRootRel` for root-relative URLs. Local HTML rewriting should target the codebase routes directly instead of relying on path-based baseHref behavior.
  - Script execution baseline is controlled by `webpageViewerScriptPolicy`, but effective per-page behavior is auto by default: shared rich-media + iframe heuristics decide when scripts are required for DOM export versus when they should be stripped.
- **Iframe sandbox policy**: Use `sandbox="allow-scripts"` with `referrerPolicy="no-referrer"`; forbid top-level navigation. Also set a restrictive `allow` feature policy (no geolocation/camera/mic/payment/clipboard).
- **Safety invariant**: Switching view must not mutate graph/layout/zoom/layers, trigger re-parsing/apply-to-graph, or write default import settings.
- **Iframe Fidelity**: The proxy strips conflicting `<base>` and CSP/XFO meta tags, rewrites asset URLs (including relative URLs) to `/__webpage_asset_proxy` for same-origin loading, and supports local in-repo file reads for HTML + assets.
- **Neutrality**: No site-specific parsing; URL normalization + bounded fetch/convert only.

**Native fidelity upgrade (no headless browser)**:

- If the initial conversion produces low-quality Markdown (typical for JS-rendered/accordion pages), the client may upgrade the conversion using a **hidden sandboxed iframe** pointed at `/__webpage_proxy` and the `kg-export-dom` bridge to export rendered DOM text/HTML, then convert to Markdown.
- This path is domain-neutral and does not require external headless browser dependencies.

### Website Import (Sitemap/Tree → Workspace Pages + Artifact-Backed View Switching)

**From/To**: Markdown Workspace → Import website (Globe button) → `/__website_import/start` → sitemap discovery + bounded crawling → per-page artifacts persisted under `.knowgrph-workspace/website-imports/<importId>/nodes/<nodeId>/` → workspace stubs written under `/websites/<host>/<importId>/...`.

**Website Sitemap Artifact (workspace)**:
- Writes `website.sitemap.md` at the website import root folder.
- Contains a tree view (ASCII) and a page table (path/title/url) so imported webpages are visible in a single sitemap document.

**Per-Page Stub Contract (frontmatter)**:
- `kgWebpageUrl`: canonical page URL
- `kgWebpageView`: `markdown | json | html`
- `kgWebsiteImportId`: website import job id
- `kgWebsiteNodeId`: stable node id (hash of URL)
- `kgWebsiteOutputDirRel`: optional override for the in-repo artifact root directory

**Decision Logic**:
- **Tree fidelity**: Workspace path is derived from URL pathname so the Explorer reflects the website’s directory structure.
- **View switching (active-row dropdown)**: `Markdown | JSON | HTML` is strictly view-only (no apply-to-graph, no layout/zoom mutation, no default-setting mutation).
- **Artifact mapping (editor text)**: `json→conversionJson`, `html→rawHtml`, `markdown→(no override)`.
- **Frontmatter preservation**: View switching must preserve existing frontmatter keys (including `kgWebsiteImportId/kgWebsiteNodeId/kgWebsiteOutputDirRel`) so artifact-backed HTML/JSON resolution remains stable after switching.
- **HTML fidelity**: For `kgWebpageView = html`, Viewer/Presentation render sandboxed HTML via `srcdoc`. HTML is sourced from stored `raw.html` artifacts (preferred) or via the same-origin proxy. `json` renders sandboxed JSON code via `srcdoc`.
- **Markdown artifact**: The Markdown view can embed a ` ```text kg-webpage-layout ` block as a lightweight, editable layout snapshot.

**Single-URL Artifact Path (non-sitemap)**:
- Source Files / Markdown Workspace “Import URL” can also persist per-URL artifacts via `POST /__website_import/import-url`, writing `raw.html`, `page.md`, `conversion.json` under `.knowgrph-workspace/...`.
 
Note: The current website-import artifact set is `raw.html`, `page.md`, `conversion.json` (no separate layout artifacts).

### Optional Geo Layer Registration

**From/To**: Source Files Import → registers dataset URLs → enables multi-dataset overlay rendering.

**Decision Logic**:

- When a local Markdown Source File contains fenced `geojson` blocks that parse as GeoJSON (FeatureCollection/Feature/Geometry), the renderer integration uploads each block to the local dataset cache (`/__geo_upload`) and registers them as overlay datasets.

### Parse Routing (Source Files → Parse → Graph)

**From/To**: Source Files → per-row Local import or URL import → `runImportFlow` (format inferred by name/URL) → GraphCanvas render.

**Decision Logic**:

- Source Files is the canonical ingest surface for text-like and document-like sources (Markdown/HTML/PDF/JSON/JSON-LD/CSV/GeoJSON) and URL sources (including YouTube).
- Legacy tool-menu ingest actions are removed to avoid duplicated/conflicting ingest surfaces.
- Remote URL fetching is bounded and uses the Step 3 **Dataset fetch limits** (timeout/max-bytes) so large URL sources do not fail against the shared default limit.
- Local file import is also bounded by the same max-bytes limit to keep local and URL ingest behavior consistent.
- Local file import upserts the canonical same-name workspace document when the source content changes, preventing stale model payloads from remaining beside duplicate replacement files.
- Local folder import detects complete spatial capture filesets (`.ply`, `.spz`, panorama image, collider `.glb`) by neutral role/name heuristics, writes one XR-ready model manifest, keeps the collider GLB only as the pending render payload, and records fileset members in the source-unit manifest without standalone duplicate Source Files entries.
- BytePlus/Lumina canvas JSON exports are detected structurally (`nodes` + `links` + BA node metadata) with a text-level gate before large-file JSON parsing, parsed before broad widget/raw JSON fallbacks, cached through the shared parser LRU, and projected as `strybldr-storyboard` graph data. Local import hydrates large pending JSON files before apply-policy checks; same-origin dev-file URL imports (`/@fs`, `/__codebase_file`, `/__codebase_asset`) use the direct local fetch path instead of the generic remote text cap. Preserved Lumina links opt into the shared `strybldrWorkflowEdge` contract so `2D Renderer: Storyboard` renders connectors while FloatingPanel Strybldr opens through the shared Strybldr import surface; structural/group edge endpoints render through their first visible member card while retaining original source/target edge metadata. The parsed graph also carries a `metadata.markdownSource` payload whose byte-zero YAML frontmatter exposes `flow.nodes` and `flow.edges` as typed inline maps, preserving JSON <-> Markdown mode without remapping the Lumina source. Lumina link handles are emitted as typed `sourceHandle`/`targetHandle`, `sourcePort`/`targetPort`, per-node `flow:portTypes`, and `socket_types`, so Markdown frontmatter parses back through the shared frontmatter-flow pipeline with source-derived node/link cardinality, renderable Storyboard semantics, and no typed-envelope warnings. Every parsed graph node property, including empty-string source values, is emitted as typed YAML unless an equivalent canonical field already exists; this keeps JSON -> Markdown -> graph round trips from dropping runtime-ready node fields such as `title`, `width`, `height`, Lumina source-model metadata, Lumina source prompt labels, Lumina status, references, and media URLs. Lumina-native node titles are preserved as neutral `cardTypeLabel` / `nodeTypeLabel` metadata so Storyboard card chips render canvas-facing labels such as native script/image/video node names instead of raw implementation type ids. Lumina-native model names stay in `sourceModel` / `modelLabel` / `luminaModelName` and render as read-only Storyboard source-model output unless the card explicitly owns `chatModel`; they do not seed the shared chat-model selector. Lumina prompts stay in `prompt` with `sourcePromptLabel` and do not backfill canonical `summary`, `output`, `action`, or `dialogue`, so imported cards avoid starter-style text rows unless those fields are explicitly authored. Lumina references remain available to media slots, prompt context, and graph operations, but native-source prompt cards do not render starter-style `refs`, `Open brief`, or `Open source` actions. Lumina media preserves decoded source paths for identity and dedupe; signed video results render through their Lumina object URLs, and unsigned image paths render as source-derived SVG image surfaces instead of hardcoded fallback copy or browser broken-media text. Shared graph-media inventory preserves each graph node media item even when multiple nodes share an asset URL, while Markdown duplicates of graph media are still collapsed. Shared card and FloatingPanel Media thumbnail rendering keeps image decoding lazy/asynchronous with low fetch priority and loads audio/video metadata only until the user interacts.
- Composed source-files apply guards (`composedApplyGuards.ts`) prevent stale or conflicting graph mutations when multiple source files are composed into a single active graph: guards check text hash consistency, frontmatter mode compatibility, and overlay state before applying a composed graph update.
- Frontmatter-flow import mode clearing: importing a frontmatter-flow graph clears both the global `flowWidgetWorldPosByNodeId` and the per-graph-key variant `flowWidgetWorldPosByNodeIdByGraphMetaKey[graphKey]` to ensure a clean slate when switching between frontmatter-flow graphs.

---

## Design Compliance

| Context | Intent | Directive | Module/Component | Function/Method | Input | Output | Decision Logic |
|---|---|---|---|---|---|---|---|
| Utilities | Centralize parsing | - [ ] Reuse URL normalization; forbid ad-hoc GitHub URL handling | `knowgrph/canvas/src/lib/url.ts` | `normalizeGitHubBlobLikeUrl` | URL | URL | Normalize blob-like URLs to the canonical fetch URL when possible |
| Fetch | Bound remote work | - [ ] Bound fetch; forbid indefinite streaming | `knowgrph/canvas/src/lib/net/fetchRemoteText.ts` | `fetchRemoteTextDetailed` | URL | `{ ok,text }` | Timeout + max-bytes guard |
| Curation UI | Preserve discoverability | - [ ] Show Source Files/Outline/Backlinks in Explorer; forbid hidden state | `singabldr/.../MarkdownPanelLayout.tsx` | `MarkdownPanelLayout` | `sourceFiles`, `tokens` | Explorer sidebar | Render Source Files tree + Outline (TOC) + Backlinks as stable sections |
| Geospatial | Avoid duplicate import surfaces | - [ ] Consolidate dataset import; forbid conflicting UIs | `gympgrph/src/GeospatialPanelHost.tsx` | `GeospatialPanelHost` | Dataset list | Dataset list UI | Geo panel does not provide dataset-add inputs; adding is consolidated into Source Files import |
