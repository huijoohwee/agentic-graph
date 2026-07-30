---
title: "Reference implementation: Knowgrph Markdown SSOT UI Contract"
id: "md:knowgrph-markdown-ssot-ui-contract-document"
doc_type: "Document"
version: "1.1.0"
date: "2026-07-30"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.markdown-ssot-ui-contract"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-markdown-ssot-ui-contract-document.md"
---

# Reference implementation: Knowgrph Markdown SSOT UI Contract

## Markdown YAML Frontmatter Enforcement

- Canonical Markdown UI contracts, SSOT docs, and runtime-ready Markdown artifacts must start with a valid YAML frontmatter block as the first block in the file.
- Frontmatter is the SSOT for document metadata, UI mode ownership, activation flags, and reusable context keys referenced by body-level Markdown and frontmatter rules.
- Canonical authored Markdown UI docs use plain YAML for frontmatter and related schema-bearing blocks; do not replace normal authoring syntax with normalized typed wrappers.
- Normalized `{key, type, value}` wrappers are permitted only in dedicated validation fixtures that explicitly test ingest -> parse -> render, ingest -> parse -> validate, or parser-fidelity behavior.
- Scalars that contain reserved punctuation, including inline `:` content, must be quoted so strict YAML parsers read SSOT metadata deterministically.
- Parser warning, repair, or fallback behavior is recovery-only; malformed YAML frontmatter remains an upstream authoring defect that must be fixed at source.

## Purpose
This document defines the Single Source of Truth (SSOT) contract for Markdown UI surfaces so Markdown Editor, Viewer, and Presentation share the same header, sidebar, TOC structure, typography, and shared utility behavior, and so secondary surfaces (Gallery renderer, Graph Data, Canvas) never drift from the active document’s text identity.

## Scope
- **In scope**: Markdown workspace header, Explorer sidebar (Source Files + Outline + Backlinks), typography ladder, shared markdown utilities used by UI and parsers.
- **Out of scope**: Canvas graph rendering, parser schema details (covered in the Markdown processing and schema documents).

## SSOT Rule (Non-Negotiable)
- There must be **one-and-only** Markdown section header implementation (used by Editor/Viewer/Presentation).
- There must be **one-and-only** Markdown sidebar/TOC structure implementation (used by Viewer/Presentation, and referenced by Editor flows).
- Shared markdown logic must live in `knowgrph/grph-shared` and be imported via `grph-shared/*` exports (no `grph-shared/src/*` runtime imports).

## Markdown Text SSOT (Editor / Viewer / Presentation)

- Editor, Viewer, and Presentation are three render modes over the **same markdown text source**.
- Host and extracted UI must keep `markdownDocumentText` hydrated so:
  - Viewer/Presentation showing content implies Editor must show the same content (no split-brain).
  - Switching modes never changes the active document selection.
- Explorer folder expansion/collapse must not clear or change the active document; only explicit file selection changes the active document.
- Source Files selection may carry a full relative path (e.g. `sandbox/docs/demo.md`) while stored document names may be basenames (e.g. `demo.md`). Loader logic must use **loose basename matching** to decide when to prefer imported/store text and avoid blank editors caused by failed `@fs` loads.

## Round-Trip Fidelity (MD → HTML → MD)

- Markdown SSOT must remain recoverable from any HTML/DOM rendering produced by the app.
- Viewer/Presentation must embed the exact Markdown source inside the rendered DOM using a non-executing payload:
  - `<script type="application/x-kg-markdown" data-kg-markdown-source="1" data-kg-encoding="base64">...</script>`
- HTML→Markdown import must restore this embedded source before running heuristic HTML→Markdown conversion.
- Derived UI overlays (wireframes, computed summaries) must be marked as derived and must not be selectable/copiable as source text.

## Cross-Surface Sync (Slides / Graph Data / Canvas)

- Gallery renderer, Graph Data, and Canvas interactions are read-only projections over the same active markdown document identity; they must not maintain a separate markdown text source.
- Any memoized markdown token cache must be isolated by `activeDocumentPath` and must not return cached tokens when the stored document path differs (prevents cross-document bleed and “content disappears” on view switches).
- When the host supports Geospatial Mode, Markdown preview surfaces must receive `geoDatasetIntegration` so fenced GeoJSON blocks can render previews and register datasets into the geospatial layer.

### Frontmatter + Mermaid + Rich Media Linking (SSOT)

- YAML frontmatter may define:
  - Flow graphs via `nodes` / `connections` / `'kg:subgraphs'`.
  - Mermaid diagrams via `mermaid: |` and diagram text.
  - Rich Media nodes via `media_kind` + `media_url` / `iframe_url` (and optional `media_interactive`).
- Markdown body may reference these structures using:
  - `[[wikilinks]]` targeting node ids (e.g., `[[OPENCLAW]]`) or headings/block-ids (e.g., `[[#Phase 1]]`, `[[#^block-id]]`).
  - Template placeholders `{{key}}` inside fenced code/param templates to describe how node properties/params are formatted into captions or prompts.
  - Explicit anchors `<a id="..."></a>` placed near relevant paragraphs for Mermaid `click` targets or frontmatter-driven GraphData nodes.
- Implementations must:
  - Keep frontmatter graphs, Mermaid diagrams, body anchors, and Rich Media overlays in a **single semantic graph** (no export-only or renderer-only derivations).
  - Forbid absolute in-repo filesystem paths in Markdown content; use repo-relative or logical identifiers instead, and rely on runtime helpers to resolve them.
  - Preserve wikilinks and `{{}}` templates as plain Markdown syntax; Canvas/Graph parsers may interpret them structurally but must not require non-standard Markdown or mode-specific link syntax.
  - Reusable pitchdeck frontmatter templates must keep YAML frontmatter as machine SSOT and Markdown body as human projection; see `docs/documents/knowgrph-pitchdeck-frontmatter-template-contract.md`.
  - Deliverables Widget Card output must remain Markdown SSOT: slide decks reuse `---` slide boundaries and the shared native presentation renderer without generated iframe `srcDoc`; financial models reuse Markdown pipe tables and the shared DataView renderer. A deterministic XLSX workbook may be materialized as a hashed companion artifact, but it never replaces the Markdown table authority. HTML/`srcDoc` is not a financial-model persistence format. See `docs/documents/knowgrph-rich-media-deliverables-contract.md`.

### Active Graph Render View (SSOT)

- Graph Data Table, Graph Fields, Props Panel/Node Editor, Canvas (D3/Flow/3D), Canvas Preview, and Geospatial overlays must render from the same derived `GraphData` view (no per-surface re-derivation).
- Canonical derivation API: `useActiveGraphRenderData()` in `knowgrph/canvas/src/hooks/useActiveGraphData.ts`.
- Derivation rules (in order): keyword semantic mode may derive a keyword base graph → optional frontmatter Mermaid filter (document mode only) → optional group collapse (`collapsedGroupIds`).
- SSOT consumers include `PreviewPanelView`, `DatasetInspectorSection`, and `MultiDimTableSurface` (host), plus extracted table/stats surfaces.
- Bounded verification: `canvas/src/__tests__/graphRecordDb.test.ts` (`testGraphRecordDbSyncsCollapsedGraphViewRows`) asserts table rows match the collapsed render view.

### Shared Surface Vocabulary + Events (SSOT)

- Cross-repo surfaces must share a stable surface vocabulary defined in `grph-shared/ssot/types` (`SsotSurface`).
- Hosts emit SSOT focus/change events using `grph-shared/ssot/events` so extracted UI surfaces can subscribe without reaching into host implementation details.
- The host must bridge the canonical store to these events once (e.g. `canvas/src/features/ssot/SsotEventBridge.tsx`) so Table/Markdown/Slides/Canvas/Map can stay selection-synchronized even as module ownership is split across repos.

### TOC Focus Contract (Table → Explorer)

- Non-markdown projections (e.g. Graph Data Table / Graph Table) may request TOC focus.
- The contract is event-driven and DOM-agnostic:
  - Emit: `window.dispatchEvent(new CustomEvent('kg:tocFocus', { detail: { id } }))`
  - Receive: the Explorer TOC scrolls the corresponding heading row into view and highlights it as active.
- `id` must be a stable heading identifier derived from the SSOT markdown pipeline (e.g. `anchorId`, `anchor`, or shared `slugify` output); do not invent per-surface ids.

## Canonical UI Surfaces

### Markdown Section Header (SSOT)
**Contract**: The Markdown section header is the canonical place for cross-document actions (Source Files ingest/export/save/apply) and editor workflow actions (Apply/Save).

- Webpage-backed documents must expose per-document webpage controls only in the header `nav` (no duplicates in Source Files rows): `View` (`markdown/html/dom/raw/json`), `Script`, `Imgs`, `Fid`, plus an explicit `Sync` (DOM→Markdown) action.
- Sync output must remain Markdown-only (no duplicate artifact-doc wrappers, no HTML/YAML snapshot blocks, no synthetic HTML Head sections). If the page HTML contains an embedded Markdown payload (e.g. `data-page` JSON `props.article.content`), the importer should prefer and write that Markdown directly.

- **Canonical implementation**: `knowgrph/canvas/src/features/markdown-workspace/MarkdownWorkspaceToolbar.tsx` (`MarkdownWorkspaceToolbar`).
- **Required behavior**:
  - Same header structure across Editor/Viewer/Presentation; only state changes (enabled/disabled) are allowed.
  - `Apply changes`, `Save`, `Save As...` are always present but disabled when not in editing mode.
  - `Save As...` may include direct export actions (Markdown / JSON / JSON-LD / PDF). PDF export must use a print pipeline that avoids pop-up windows and cleans up any temporary print DOM.
  - `Source files` actions (`Open folder`, `Refresh files`, `New folder`, `New source file`) render **in the header**, immediately left of `Apply changes`.
  - The Explorer sidebar may also surface icon-only Source Files actions for VS Code-like parity, but must reuse the same underlying integrations (no duplicated logic paths).

### Explorer Sidebar (SSOT)
**Contract**: The Explorer sidebar uses a stable, semantic DOM with SSOT typography; it owns the only Source Files tree and the only Outline (TOC) renderer.

- **Canonical container**: `singabldr/src/features/markdown/ui/MarkdownPanelLayout.tsx`.
- **Canonical frame**: `singabldr/src/features/markdown/ui/MarkdownSidebarFrame.tsx`.
  - Renders the sidebar `<aside>` and the top `Explorer` header.
- **Canonical section wrapper**: `singabldr/src/features/markdown/ui/MarkdownSidebarSection.tsx`.
  - Renders section title (`h3`) and section body.
  - **Rule**: section headers are typography-only except Source Files (may include an action menu for Explorer parity).
  - **Rule**: section headers (`EXPLORER`, `SOURCE FILES`, `TOC`) must remain visible while scrolling (sticky within the sidebar scroll container).
- **Canonical sections**:
  - Source files: `singabldr/src/features/markdown/ui/MarkdownSourceFilesPanel.tsx`
  - Outline (TOC): `singabldr/src/features/markdown/ui/MarkdownTableOfContents.tsx`
  - Backlinks: `singabldr/src/features/markdown/ui/MarkdownBacklinksPanel.tsx`

### Explorer Persistence (SSOT)
- **Shared state hook**: `singabldr/src/features/markdown/ui/useMarkdownExplorerControls.ts`
  - Centralizes sidebar-open + collapsed-heading persistence across Viewer and the markdown workspace (no duplicated local fallbacks).
- **LocalStorage (UI state)**: keys are SSOT in `knowgrph/canvas/src/lib/config.ls.ts`.
  - Sidebar: `LS_KEYS.markdownSidebarOpen`, `LS_KEYS.markdownSidebarWidthPx`
  - Explorer sections: `LS_KEYS.markdownExplorerSourceFilesCollapsed`, `LS_KEYS.markdownExplorerOutlineCollapsed`, `LS_KEYS.markdownExplorerBacklinksCollapsed`
  - Source Files tree: `LS_KEYS.markdownExplorerSourceFilesExpandedPaths`
- **Dexie (workspace + cached sources)**: `knowgrph/canvas/src/features/source-files/sourceFilesDb.ts`
  - DB name: `kg:source-files`
  - Persists ordered Source Files payloads plus minimal workspace metadata (folder name, access mode, selected folder path).

## Typography Contract
- Sidebar labels use `uiPanelMicroLabelTextSizeClass` (default `text-[10px]`) and the shared builder:
  - `singabldr/src/features/markdown/ui/markdownSidebarText.ts`
- Viewer and Presentation must pass the same micro label sizing into `MarkdownPanelLayout`.
- Floating panel (Inspector / Props / Tool Menu) is the baseline typography ladder for non-markdown panels.
  - Host must apply `uiPanelTextFontClass` + `uiPanelKeyValueTextSizeClass` at the floating panel content root.
  - Inspector implementations must not hardcode `text-*` or `font-*`; they must inherit and only apply semantic emphasis (e.g. `font-semibold`).
  - Record Inspector key labels must use the same key/value text size as inputs (no micro-label sizing on `dt`).
  - Shared selector: `knowgrph/canvas/src/lib/ui/panelTypography.ts` (returns `PanelTypography`).
  - `PanelTypography` SSOT type: `knowgrph/grph-shared/src/ui/panelTypography.ts`.
  - `PanelTypography.keyLabelClass` is the canonical class for “Key label” typography (align with value inputs).
  - `PANEL_TYPOGRAPHY_DEFAULTS` centralizes fallback classes (avoid string drift across repos).
  - Cross-repo panels rendered inside Floating Panel (e.g. `gympgrph` geospatial panel) must receive the same ladder via an explicit `panelTypography` prop (typed by `grph-shared/ui/panelTypography`).
  - MainPanel / Editor workspace / Graph Data Table surfaces must also use the same ladder (`usePanelTypography`) and avoid hardcoded `text-*` / `font-*`.
- Editor workspace Source Files rows and per-file view-mode controls (e.g. `Markdown/JSON/HTML` select) must inherit `usePanelTypography` sizing; do not hardcode pixel text sizes.
  - Portal content (dropdowns/popovers) must explicitly apply `microLabelClass` when it cannot inherit from a panel root.

## Viewer Width Contract
- In Viewer and Split modes, the rendered Markdown article content width must remain a stable 80% of the Viewer `section` width.
- Toggling Explorer open/closed and toggling the Editor workspace Canvas pane open/closed must not change the 80% rule.

## In-Place Block Editing + Bubble Toolbar (Read mode)
- Viewer Read mode may enable in-place block editing for supported block types (headings, paragraphs, lists, blockquotes, callouts, HTML/code blocks) via a single `MarkdownBlockContainer` implementation. The underlying document remains pure Markdown text; there is no separate WYSIWYG document model.
- Clicking a block enters a contentEditable surface in-place (no textarea popup). The surface must:
  - Reuse the block’s typography (transparent background, no extra borders/shadows).
  - Reuse read-surface layout baseline (indent/padding/margin/border/wrapper) and carry caret/whitespace/tab-size parity; entering edit must not mutate surrounding layout.
  - Track selection offsets in Markdown text (line/character) so all edits are applied via shared `applyMarkdownFormatAction`/wrap helpers as text transforms.
  - Commit via blur or Cmd/Ctrl+Enter, writing through `onReplaceLineRange` with bounded line range updates and skipping no-op commits to avoid churn.
- Workspace Editor `Markdown + Read + Viewer` must not render a duplicate header-level `Formatting` menu for `Heading/Bold/Italic/Strikethrough/...` when click-to-edit is active on the read surface; the inline floating selection toolbar is the only formatting palette SSOT for that surface.
- In that viewer-read editing path, the workspace header keeps navigation/layout/display actions only; formatting ownership moves to `MarkdownBlockContainer` bubble toolbar so header and block chrome cannot drift or compete.
- Viewer header controls must render only when actionable: hide Content mode controls when there is no real mode switch, hide `Storyboard Widget` when unavailable, and do not render disabled/no-op mode placeholders.
- Display controls (`Toggle text highlight`, `Toggle word wrap`) are markdown read-surface affordances and must not render on non-markdown or non-read viewer surfaces.
- Selecting text inside an editable block surfaces a floating “bubble toolbar” positioned near the selection using shared SSOT styles from `floatingMenuStyles` (`FLOATING_BUBBLE_TOOLBAR_CLASSNAME`, `FLOATING_BUBBLE_BUTTON_CLASSNAME`, `FLOATING_MENU_*` variants). The bubble palette may include:
  - Inline formatting: bold/italic/underline/strike/inline code/link, superscript/subscript/math markers.
  - Block transforms: H1/H2/H3 toggles, bullet/numbered lists, quotes, checklist toggles, horizontal divider insertion.
  - Color and highlight palette: stable, bounded sets of text colors and background colors implemented as Markdown/HTML wraps, scoped strictly to the current selection.
  - Structural actions: duplicate/delete block, HTML comment wraps, and other view-only affordances.
- FORBID copy in Read mode:
  - Viewer root must block copy/cut and Cmd/Ctrl+C/X shortcuts when `forbidCopy` is true; inline block toolbars must render Copy actions disabled and must never bypass this guard via direct clipboard APIs.
  - Code-block copy buttons must respect the same `forbidCopy` pipeline and be disabled when copy is forbidden.
- Inline link editing:
  - Cmd/Ctrl+K opens a small inline link popover near the current selection using SSOT popover classes; the popover edits a single URL string and applies it as a `[label](href)` Markdown transform over the current selection.
  - Empty or cancelled input must leave the document unchanged; link application must be idempotent and strictly selection-scoped.
- Slash commands:
  - Typing `/` near the caret at the start of a line (or after whitespace) may open a lightweight slash-command menu aligned with the caret. The menu reuses the same floating menu SSOT styles and triggers the same heading/list/quote/code transforms as the bubble toolbar.
  - Slash detection must be local to the active line and must not scan the full document repeatedly; hide the menu when the trailing slash context is removed or when focus leaves the editor.
- `@` and `#` commands:
  - `@` must reuse the shared variable/media command catalog. Image insertion emits `![alt](url)` and video insertion emits `<video src="..." poster="..." title="..." controls></video>` using the owner write path of the active text surface.
  - `#` must reuse the shared keyword catalog plus centralized full-graph keyword inventory; reusable keyword browsing must not degrade to selection-only terms when a selection subgraph is active elsewhere in the UI.
- In-place editing + bubble/command menus must be:
  - Selection-scoped and view-only: all actions are pure Markdown text transforms; no hidden graph or layout derivations are allowed.
  - Bounded and debounced: avoid recomputation loops by memoizing selection offsets, gating selection-change listeners with `requestAnimationFrame`, and skipping redundant bubble repositioning when geometry is unchanged.
  - SSOT-driven: all floating toolbars, popovers, and palettes must reuse shared floating menu classes and theme tokens (no mode-specific clones or legacy variants).
  - Floating selection toolbar interaction and palette buttons must call shared helpers (markdownFloatingSelectionToolbar) for pointer-down, summary toggles, and selection capture; forbid per-surface handlers or alternate floating menu stacks.
  - Interactive toolbar/menu buttons must use the shared hand-cursor class token and shared pointer-down guard; forbid per-button arrow-cursor overrides or focus-loss-prone handlers.
  - Variable toolbar Apply must route through shared `applyVariableToken` only; direct DOM query/mutation paths are forbidden.
- Workspace Data View header controls for Table/Multi-dimensional Table/Kanban must use semantic landmarks (`header/nav/aside`) and floating menus must render above sticky table layers via shared high-z menu classes; controls must remain fully clickable and never be hidden behind table/header surfaces.
- Storyboard card toolbars and Editor Workspace Table/Multi-dimensional Table/Kanban controls must reuse shared toolbar/data-view utility owners when semantics overlap. Keep action binding, hover `New Record`, header/settings payloads, and external-open affordances centralized in shared helpers rather than per-surface inline branches.

### Title and title-like inline editing
- Heading blocks render title text truncated with ellipsis in View and Edit rest state, reuse the same typography in html contentEditable, and reveal full text on focus via horizontal scroll; entering edit must not introduce alternate WYSIWYG title stacks or layout/spacing drift.
- Title-like name surfaces (for example, workspace data view property names) reuse the same ellipsis-at-rest contract, using a truncated label in view mode and a horizontally-scrollable single-line edit input during rename; both surfaces share typography tokens and forbid duplicate header rows or spacing/overflow divergence.

### View↔Edit WYSIWYG-ish parity SSOT (inline code + lists)

- Inline-code view and edit surfaces must reuse the same centralized parity classes: read-mode inline code uses `MARKDOWN_INLINE_CODE_VIEW_CLASS`; contentEditable html surfaces apply `MARKDOWN_INLINE_CODE_EDIT_DESCENDANT_CLASSES` via `MarkdownBlockContainer` html normalization so entering edit never changes inline-code typography, line-height, padding, or ring/border layout.
- Ordered/unordered list view and edit surfaces must reuse the same shared layout SSOT: `markdownListLayout` defines list marker/indent/spacing view classes, row-level editor/view inline classes, and row gutter padding/alignment; `MarkdownListBlock` must not introduce per-surface list typography or spacing forks beyond code-backed parity tightening.

### Shared View↔Edit parity helpers (SSOT)

- View↔Edit parity for blockquotes and callouts must use a shared helper layer instead of per-surface regex/range implementations. The helper layer centralizes quote-line detection, contiguous quote-line range resolution for edit-open, and no-op replacement-line detection for commit/blur guards.
- `markdownEditParitySsot` + `MarkdownBlockContainer` + `MarkdownBlockquoteBlock` + `MarkdownCalloutBlock` own this helper layer in Canvas. No other module may reimplement quote/callout regexes, line-range mapping, or no-op guards; tightening must always flow through these helpers to avoid churn, conflicts, or loops.

## Scroll Sync Contract
- In split view, Editor↔Viewer scroll sync must be bidirectional, stable, and view-only (no text mutations).
- Editor uses the in-repo Monaco editor wrapper; scroll sync must operate via the editor handle API (not direct textarea DOM access).

## Shared Utilities (SSOT)
Shared markdown logic is contractually owned by `knowgrph/grph-shared`.

- **Panel typography contract**: `grph-shared/ui/panelTypography`
- **Tailwind text size mapping (px)**: `grph-shared/ui/tailwindTextSize`

- **Wikilinks**: `grph-shared/markdown/wikiLinks`
  - Parse + normalize wiki link targets and build safe in-app hrefs.
- **Backlinks**: `grph-shared/markdown/backlinks`
  - Compute linked backlinks + heuristic unlinked mentions from Source Files.
- **Slugify**: `grph-shared/markdown/slugify`
  - Deterministic heading ids shared by preview rendering and parsers.
- **TOC transforms**: `grph-shared/markdown/toc`
- **Formatting transforms**: `grph-shared/markdown/formatting`

## Removal Policy (Legacy Cleanup)
- Remove or block any Viewer-only or Presentation-only header/sidebar variants.
- If a duplicate TOC renderer appears (e.g., nested inside Source Files rows), it is a contract violation and must be deleted (not conditionally hidden).
- If webpage view controls exist outside the canonical toolbar `nav` (for example in Source Files row affordances), they are legacy/conflicting UI and must be removed.

## VCC and Evidence Reference register

No satisfying result is attached to this revision. Obsolete sibling-checkout command paths are not
Evidence References.

| VCC | End state | Named check | Constraint | Recorded result | Local rung | Delivered rung |
|---|---|---|---|---|---|---|
| `VCC-MD-SSOT-1` | shared workspace and utility owners type-check | `npm --prefix canvas run typecheck` exits 0 | no second markdown document model or sibling-checkout dependency is introduced | not recorded | `spec-complete` | `undocumented` |
| `VCC-MD-SSOT-2` | workspace source identity, inline edit, toolbar, TOC, backlinks, and viewer cases pass | `npm --prefix canvas run test:ci:unit -- markdownWorkspace` exits 0 | test filters do not mutate authored documents | not recorded | `spec-complete` | `undocumented` |
