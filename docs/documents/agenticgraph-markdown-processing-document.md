---
title: "Reference implementation: AgenticGraph Markdown Processing"
doc_type: "Document"
version: "1.1.0"
date: "2026-07-30"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.markdown.processing"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
frontmatter_contract: "required"
---

# Reference implementation: AgenticGraph Markdown Processing

## Markdown YAML Frontmatter Enforcement

- Canonical Markdown processing docs, parser-facing Markdown specs, and runtime-ready Markdown artifacts must start with a valid YAML frontmatter block as the first block in the file.
- Frontmatter is the SSOT for document metadata, mode flags, processing hints, and reusable context keys consumed by rendering and parser flows.
- Canonical authored Markdown docs use plain YAML for frontmatter and related schema-bearing blocks; do not replace normal authoring syntax with normalized typed wrappers.
- Normalized `{key, type, value}` wrappers are permitted only in dedicated validation fixtures that explicitly test ingest -> parse -> render or ingest -> parse -> validate fidelity.
- Scalars that contain reserved punctuation, including inline `:` content, must be quoted so strict YAML parsers read processing metadata deterministically.
- Parser warning, repair, or fallback behavior is recovery-only; malformed YAML frontmatter remains an upstream authoring defect that must be fixed at source.

## Overview
The Markdown rendering engine in AgenticGraph has been enhanced to support GitHub-style code blocks with semantic HTML structure and optimized token sharing architecture. This ensures high performance during rendering cycles and a consistent, accessible UI.

## SSOT UI Contract
Markdown Editor/Viewer/Presentation must share a single SSOT header and a single SSOT Contents sidebar/TOC structure.

- SSOT contract document: `agenticgraph/docs/documents/agenticgraph-markdown-ssot-ui-contract-document.md`
- Header SSOT: `agenticgraph/canvas/src/features/markdown-workspace/MarkdownWorkspaceToolbar.tsx`
- Runtime SSOT: `agenticgraph/canvas/src/lib/markdown-workspace-runtime/MarkdownWorkspaceRuntime.impl.tsx`
- Shared workspace UI types: `agenticgraph/canvas/src/features/markdown-explorer/workspaceUi.ts` + `agenticgraph/canvas/src/features/markdown-workspace/markdownUtils.ts`
- Sidebar SSOT: `canvas/src/features/markdown/ui/MarkdownPanelLayout.tsx` (frame + sections)
- Shared utils SSOT: `agenticgraph/grph-shared/src/markdown/*` (wikilinks/backlinks/slugify)

## Non-Goals (Explicit)

- Do not import, embed, or copy Editor.js (or similar) for Markdown editing/rendering.
- Provide Editor.js-like affordances via native controls only (e.g., formatting buttons that apply Markdown syntax to the current selection while keeping live preview).
- Keep the core stack: Monaco for editing + tokenized Markdown rendering for preview/presentation.

## Design Mantras

```
- [ ] Cleanup; prevent resource leaks; forbid dangling handlers
- [ ] Computation; eliminate redundancy; forbid recalculation
- [ ] Neutrality; preserve domain independence; forbid domain coupling
- [ ] Reusability; maximize component utility; forbid single-use implementations
- [ ] Validation; test across contexts; forbid single-context validation
```

## Universal Design Principles

| Context        | Intent                           | Directive                                                                           |
|----------------|----------------------------------|-------------------------------------------------------------------------------------|
| Computation    | Eliminate redundancy             | - [ ] Memoize outputs; eliminate recomputation; forbid recalculation               |
| Neutrality     | Preserve domain independence     | - [ ] Drive via schema/config; preserve neutrality; forbid domain coupling         |
| Cleanup        | Prevent resource leaks           | - [ ] Remove listeners/timers; prevent leaks; forbid dangling handlers             |
| Validation     | Enforce correctness              | - [ ] Validate ingest outputs; enforce correctness; forbid untested assumptions    |
| Reusability    | Maximize component utility       | - [ ] Share token pipelines; maximize reuse; forbid single-use logic               |

## Features

### GitHub-Style UI
Code blocks now feature a structured layout matching GitHub's design system:
- **Header Bar**: A distinct header (`<header>`) containing metadata and controls.
- **Language Label**: Clearly visible language identifier (e.g., YAML, TSX).
- **Copy Button**: Integrated clipboard copy functionality with visual feedback.
- **Main View Toggle**: A global toggle in the Markdown Viewer header sets the default mode for most code blocks:
  - **Inline**: Renders annotations above the code block.
  - **Beside**: Renders code on the left and annotations on the right (on desktop), or annotations above code (on mobile).
  - **Render**: Switches supported code blocks from source to a fitted preview.
    - **Mermaid** (`mermaid` / `mmd`): Render-preferred in Viewer/Presentation (defaults to Render even when the global mode is Inline/Beside).
      - **`.mmd` import normalization**: Mermaid-only `.mmd` inputs are normalized into a fenced `mermaid` block before parsing and before being stored as the active Markdown document, so both graph extraction and preview rendering behave consistently.
      - **Pan/Zoom + In-doc anchors**: In Render mode, Mermaid previews support drag/pan (and optional zoom) inside the code block; in-diagram `#anchor` links trigger in-document scrolling within the Markdown preview container.
      - **Preview Panel (double-click)**: Double-clicking a rendered Mermaid preview focuses it in MainPanel → Preview. Single click remains navigation-only (e.g., `#hash` anchors).
      - **Per-block Mermaid frontmatter**: A Mermaid code block may start with a YAML `--- ... ---` header. The viewer strips that header from the diagram text and merges it into Mermaid init config for that block (e.g., `theme`, `themeVariables`, or `mermaidTheme`/`mermaidThemeVariables`).
      - **ELK layout engine (Flow enhancement)**: Mermaid preview supports `config.layout: elk` (and `elk.*` variants) for flowchart layout. This is enabled by registering the ELK layout loaders at runtime before Mermaid initializes.
      - **Multi-diagram fences**: When a single Mermaid fence contains multiple diagram starts (e.g., repeated `graph TB` / `graph LR` blocks), the viewer splits it into multiple renderable diagrams using a shared `grph-shared` helper (`splitMermaidIntoDiagrams`).
    - **Frontmatter**: When the active document begins with YAML frontmatter (`--- ... ---`), clicking the global **Render** control also enables Frontmatter Mode so the frontmatter blocks are visible without a second toggle.
    - **GeoJSON** (`geojson`): Render-preferred in Viewer/Presentation (defaults to Render; may be overridden per-block).
    - **HTML/SVG** (`html` / `htm` / `svg`): Renders safe HTML inside the code block in Render mode (sanitized; no script/event handlers).
      - **Drag-to-pan**: The HTML render surface supports click-drag panning by scrolling the container (useful for wide content).
      - **srcdoc iframes**: `<iframe srcdoc="...">` renders as a sandboxed iframe (no network; scripts disabled).
    - **Other languages**: Falls back to the source code view.
- **Per-Block Mode Icons**: Each code block header also exposes icon-only controls for **Beside / Inline / Render** so a specific block can override the global mode without mutating the global preference.
- **Hover Effects**: The entire code block (including annotations in Beside/Inline modes) is highlighted with a blue border on hover, ensuring clear visual grouping of the code and its associated notes.
- **Viewer Block Controls**: In Viewer mode, blocks may expose icon-only controls (on hover) to support bounded block-style operations: heading grip drag reorder among same-parent siblings, and “Add line” insertion after a block. This is implemented as pure Markdown text transforms (not a WYSIWYG block editor).
- **Reorder Grip**: Drag reorder is enabled only from a dedicated grip handle; controls live in a reserved left gutter so they never overlap content.
- **Nested Blocks Rule**: Nested blocks rendered inside lists/quotes do not render the block gutter/controls (prevents double-indentation and preserves the natural list marker / blockquote border alignment).
- **Text Selection Gestures**: Viewer/Presentation preserve native browser selection (single click caret anchor; double click word; triple click paragraph/line). No double-click navigation.
- **Right Click → “Show on/in …”**: Right click opens the Selection Toolbar at the exact pointer position; Monaco’s built-in context menu is disabled so the same toolbar behavior is used across Editor/Viewer/Presentation.
- **Apply Shortcut**: In Editor/Viewer layout modes, Cmd/Ctrl+Enter toggles Editor↔Viewer; when in Editor it applies and then switches to Viewer.
- **Left-Side Contents Panel (Markdown Workspace)**: The Markdown “Contents” sidebar is rendered on the left and includes a Source Files tree (folder/file hierarchy derived from `/` in file names) with icon-only create actions.

### In-Doc Navigation (Anchors, Callouts, Wikilinks)
- **HTML anchors are preserved**: Empty anchor targets like `<a id="phase-1-input"></a>` remain in the rendered DOM so `#phase-1-input` hash navigation works (including Mermaid `click ... "#phase-*"` directives).
- **Heading anchors are generated**: Headings receive deterministic ids using the shared `slugify` implementation from `grph-shared` so UI and parser agree on targets.
- **Block-id anchors are supported**: A trailing `^block-id` at end-of-line emits a DOM anchor with id `^block-id`, enabling links like `[[#^block-id]]`.
- **Callouts (subset)**: Blockquotes whose first line is `[!type]` render as semantic callouts. `+` / `-` after the type enables foldable callouts.
- **Wikilinks + Backlinks**: In-doc `[[#Heading]]` / `[[#^block-id]]` render as safe hash links; file-level `[[Note]]` / `[[Note#Heading]]` resolve against Source Files (loose name normalization) and navigate in-app. The Contents sidebar also includes a computed Backlinks view (linked + heuristic unlinked mentions).
- **Caret hash href stability**: For `#^block-id` links, the rendered anchor preserves a raw `href="#^..."` attribute so tests and UI selectors remain stable even if URL serialization encodes the caret.

### Semantic HTML
The implementation replaces generic HTML division element wrappers with semantic elements:
- `<figure>`: The main container for the code block.
- `<header>`: Container for the top bar controls.
- `<pre>` & `<code>`: Standard elements for code content.
- `<span>` & `<button>`: For labels and interactive elements.

### Syntax Highlighting
- Powered by `highlight.js`.
- Supports Light (GitHub-like) and Dark (GitHub Dark-like) themes.
- Theme tokens are centralized in `UI_THEME_TOKENS`.
- **Line Highlighting**: Supports highlighting specific lines using `{1-3,5}` syntax in the language info string (e.g., `ts {1-3}`).
- **Mermaid Support**: Standard `mermaid` and `mmd` blocks support both source view and a fitted rendered diagram preview via the main "Render" mode. `textmermaid` is treated as a standard code block.
- **Markdown File Extensions (Graph Pipeline)**: Files ending in `.md`, `.markdown`, `.mmd`, or `.mdx` are treated as Markdown inputs for graph extraction (`isMarkdownLikeFileName` in `agenticgraph/grph-shared/src/markdown/mermaidInput.ts`).

## Architecture & Performance

### Token Sharing
To avoid redundant processing and ensure consistency across the application (e.g., between Canvas, Preview, and Slides):
- **Shared Lexing**: Markdown content is lexed once using `markdownPreviewLex.ts`.
- **Token Passing**: The resulting tokens (`TokenWithLines`) are passed directly to `MarkdownCodeBlock`.
- **No Re-lexing**: The component consumes the pre-computed token, avoiding expensive re-parsing during render cycles.
- **Cache Isolation (Cross-View)**: Any cached token result must be returned only when `activeDocumentPath` matches the stored tokens path (prevents cross-document token bleed when switching Viewer/Presentation/Gallery renderer/Graph Data with Canvas mounted).
- **Stable Token Keys (Presentation)**: In Presentation Mode, token render keys must incorporate `activeDocumentPath` + `startLine/endLine` to prevent per-slide state leakage (e.g., a code block “Inline” override persisting onto a different slide’s GeoJSON block).
- **Code Block Mode Sync**: Global Beside/Inline/Render acts as the default. Per-block toggles create a local override; when the per-block mode matches the global default again, the override is cleared so future global changes apply.

### Rendering Optimization
- **Memoization**: `MarkdownCodeBlock` is wrapped in `React.memo` to prevent unnecessary re-renders when parent components update.
- **Highlight Caching**: Syntax highlighting is memoized via `useMemo`, ensuring that `highlight.js` is only invoked when the code content or language changes.
- **GeoJSON Map Load**: Inline GeoJSON previews defer MapLibre initialization until the preview scrolls into view, wait for non-zero layout via bounded observers, keep a stable map container element across deferred-load states, and show a visible overlay message (“Loading map preview…” / “Map preview unavailable”) instead of failing silently ([InlineMarkdownGeoJsonLayerMap.tsx](../../canvas/src/features/geospatial/InlineMarkdownGeoJsonLayerMap.tsx)).
- **GeoJSON Detection**: `geojson` blocks are always GeoJSON-renderable; `json` blocks are treated as GeoJSON only when `geoDatasetIntegration.isGeoJsonCodeBlock` identifies the content as GeoJSON.
- **GeoJSON Render Defaults**: GeoJSON-renderable blocks are render-preferred in Viewer/Presentation (including `json` fences identified as GeoJSON).
- **GeoJSON Interaction**: Map previews follow the same overlay conventions as Mermaid: container-scoped overlays use `PreviewOverlay` for fullscreen inspection; viewport-scoped previews delegate to `requestOpenGeoPanel`.
- **GeoJSON Actions**: GeoJSON-renderable blocks can expose quick actions in the code-block toolbar: “Load as Graph” converts the FeatureCollection into GraphData nodes (with `properties.geo.{lat,lng}`) and loads the graph surface; “Add as Dataset” uploads the GeoJSON text to the bounded local geo cache and registers a same-origin dataset URL for Geospatial overlay rendering (format auto-detected; no hardcoded providers).
- **GeoJSON Mode Independence**: GeoJSON previews in the Markdown Viewer/Presentation are available in both Document Mode and Geospatial Mode. Document Mode disables the full-screen geospatial overlay, but Markdown code-block previews can still render fitted MapLibre maps using the same basemap style configuration.
- **GeoJSON Renderer Wiring**: Viewer-mode render trees must include `geoDatasetIntegration` in memo dependency arrays so injected renderers don’t stay stale and emit “GeoJSON renderer unavailable”.
- **GeoJSON Error UI**: GeoJSON render failures show a compact error bar (≈50% of the Markdown toolbar nav height) to avoid consuming the code block preview area.
- **Widget Mode Bundle Gating**: Markdown Workspace widget-mode bundle generation is view-only and must run only while widget mode is actually active; document mode must not prebuild or prewarm the large widget bundle.
- **Widget Mode Graph Caching**: Widget bundle generation must derive a shared semantic graph key, reuse the upstream graph lookup cache, and reuse a cached node-id subgraph lookup keyed by graph revision plus semantic node-id signatures rather than raw array identity.

### Media Proxy Handling
- **Background Sources**: Slide `background` URLs are normalized via [markdownSlideVisuals.ts](../../canvas/src/features/markdown/ui/markdownSlideVisuals.ts) before render.
- **Proxy Routing**: Cross-origin URLs are routed through `/__fetch_remote` by [applyMediaProxySrc](../../canvas/src/lib/url.ts).
- **Domain Neutrality**: No special-case domain rewrites; all remote backgrounds follow the same proxy path.
- **Webpage SSOT conversion**: For HTML/CSS/JS → Markdown SSOT rules (URL resolution, lazy media src filling, and duplicate-content forbiddance), use `agenticgraph-webpage-proxy-and-srcdoc-iframe-document.md` + `agenticgraph-markdown-editor-mode-contract-document.md` as the canonical references.

### Markdown / JSON → Graph → Canvas flow

**Processing Flow**: Markdown or JSON/JSON-LD input → parser stack (HTML/DOM→Markdown when applicable) → GraphData store → layer derivation → Canvas scene and Multi-dimensional Table.

- **Import & Parse (Markdown)**: Markdown is ingested via [markdownImportAction.ts](../../canvas/src/features/toolbar/markdownImportAction.ts), which calls [loadGraphDataFromTextViaParser](../../canvas/src/features/parsers/loader.ts). The Markdown parser builds JSON‑LD (`buildMarkdownJsonLd`) and converts it into GraphData ([default.ts](../../canvas/src/features/parsers/default.ts)).
- **Import & Parse (JSON/JSON-LD)**: JSON and JSON‑LD are ingested via [jsonImportAction.ts](../../canvas/src/features/toolbar/jsonImportAction.ts) and the parser stack (`loader.ts` + `adapter.ts` + `parseJsonLd.ts`). When inputs are JSON‑LD, they are interpreted structurally into GraphData; when inputs are arbitrary JSON, `rawToGraphData` normalizes records/graphs into nodes/edges without changing the underlying schema contract.
- **HTML/DOM→Markdown SSOT**: Webpage/HTML inputs are converted to Markdown using the unified HTML→Markdown converter and, for JS‑rendered pages, an optional sandboxed iframe DOM export bridge. Markdown remains the SSOT text form; HTML/JSON views are view‑only projections controlled by frontmatter (see `agenticgraph-webpage-proxy-and-srcdoc-iframe-document.md`).
- **YouTube Import**: Workspace Actions → Source Files → YouTube fetches transcripts/subtitles (manual or generated) via `/__youtube_transcript` and converts them into Markdown + a JSON source payload. Markdown is loaded into the Markdown Editor/Preview/Slides, while the JSON payload is stored as `jsonSourceDocumentText` for JSON-backed markdown workspace and UI Editor flows.
- **GraphData Commit**: Parsed GraphData is stored via the graph store (`setGraphData`), which triggers minimap and layout autosuggest side effects without blocking the UI ([graphDataSlice.ts](../../canvas/src/hooks/store/graphDataSlice.ts)).
- **Layer Derivation**: The renderer derives a view‑specific graph (document/schema/semantic) with [deriveGraphDataForLayers](../../canvas/src/lib/graph/layerDerivation.ts) and optional frontmatter filtering; this stage clones nodes/edges so D3 can mutate render-only objects without polluting the store.
- **Canvas + Table Rendering**: [GraphCanvas](../../canvas/src/components/GraphCanvas.tsx) builds the scene via [setupGraphScene](../../canvas/src/components/GraphCanvas/scene.ts), producing SVG layers for nodes, edges, labels, and graph layers. In parallel, the host Multi-dimensional Table workspace materializes the same GraphData into the persisted `GraphRecordDb` cache (nodes/edges tables + property columns) and renders a canvas fast-grid + Record Inspector over that materialization.

## Component Responsibility Matrix

| Layer/Subsystem | Path/Module | Component | Interface/Method | Responsibility (S-V-O) | Dependencies | Contracts | LOC |
|-----------------|-------------|-----------|------------------|------------------------|--------------|-----------|-----|
| Ingestion | `features/toolbar` | `markdownImportAction` | `import` | Toolbar triggers file read → invokes parser → updates store | `parsers/loader` | File IO | ~50 |
| Ingestion | `features/toolbar` | `youtubeImportAction` | `performYouTubeImport` | Toolbar reads YouTube URL/ID → fetches transcript JSON → converts to Markdown → updates store and opens Markdown view | `/__youtube_transcript` | Markdown+JSON ingest | ~140 |
| Parser | `features/parsers` | `markdownJsonLdParser` | `buildMarkdownJsonLd` | Parser transforms text → JSON-LD structure → GraphData | `remark`, `rehype` | Schema | ~300 |
| Store | `hooks/store` | `graphDataSlice` | `setGraphData` | Store commits data → notifies listeners → triggers side-effects | `zustand` | Immutable | ~400 |
| Renderer | `components/GraphCanvas` | `GraphCanvas` | `render` | React coordinates lifecycle → derives scene → mounts D3 | `d3`, `layerDerivation` | Visual | ~400 |
| Layout | `components/GraphCanvas` | `scene` | `setupGraphScene` | D3 simulates physics → positions nodes → updates DOM | `d3-force` | SVG | ~400 |

## Usage

For cross-feature smoke testing (Frontmatter + Mermaid + GeoJSON + Presentation), use a repo-local fixture under `data/test-data/` or pass an operator-owned fixture explicitly through `AG_MARKDOWN_SLIDE_DEMO_PATH` / `AG_EXTERNAL_FIXTURE_ROOT`.

For slide-demo interop (anchors/callouts/wikilinks), keep the bounded tests aligned with the same fixture:

- `agenticgraph/canvas/src/__tests__/markdown/markdownSlideDemoSupportInterop.test.ts`
- `agenticgraph/canvas/src/__tests__/markdown/markdownJsonLdSlideDemoInterop.test.ts`

Tests use repo-local fixtures by default; optional external fixture reads are environment-gated so docs do not hardcode machine-specific or sibling-checkout paths.

```markdown
```yaml
name: Example Workflow
on: push
jobs:
  build:
    runs-on: ubuntu-latest
```
```

The above markdown will be rendered with the enhanced code block UI automatically.

## Annotation & Stable Identifiers
To support robust annotations even when code block content or position changes, the system supports stable identifiers in the code block info string:

```markdown
```js {id:my-stable-block-id}
console.log('hello')
```
```

The parsed `id` is used as the key for looking up annotations, falling back to line-based keys only when no ID is present. This ensures annotations persist through refactors.

## VCC and Evidence Reference register

No satisfying result is attached to this revision. The following commands are check hosts only.

| VCC | End state | Named check | Constraint | Recorded result | Local rung | Delivered rung |
|---|---|---|---|---|---|---|
| `VCC-MD-PROC-1` | parser, workspace, and preview source contracts type-check | `npm --prefix canvas run typecheck` exits 0 | no generated document is accepted as an authored source | not recorded | `spec-complete` | `undocumented` |
| `VCC-MD-PROC-2` | bounded markdown workspace, conversion, render, and source-identity cases pass | `npm --prefix canvas run test:ci:unit -- markdown.` exits 0 | the active markdown text remains the source owner | not recorded | `spec-complete` | `undocumented` |
