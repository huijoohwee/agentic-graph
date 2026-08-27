# Markdown Editor Mode Contract (Webpage ↔ Markdown)

## Goal

- `HTML` / `DOM` / `Raw` views maximize inspection and render fidelity inside a sandboxed iframe.
- `Markdown` view maximizes information capture by preserving complex structures either as:
  - Markdown,
  - allowlisted HTML blocks (safe render), or
  - escaped code blocks when a block cannot be safely rendered.

## View Modes

Controlled by `kgWebpageView` in frontmatter:

- `markdown`: show the markdown artifact doc (SSOT).
- `markdown`: show the Markdown SSOT doc (frontmatter + Markdown body).
- `html`: render HTML via sandboxed iframe.
- `dom`: render a post-hydration DOM snapshot (best for JS-heavy pages).
- `raw`: show raw HTML source for debugging.
- `json`: show conversion/metadata JSON.

## Per-Document Fidelity Controls

Optional frontmatter keys (escape hatches; default is **Auto**):

`kgWebpageScriptPolicy: allow | strip`  
`kgWebpageIncludeImages: true | false`  
`kgWebpageFidelityLevel: 1 | 2 | 3 | 4`

Semantics (per-doc overrides, not required for normal usage):

- `kgWebpageScriptPolicy`: nudges iframe script policy for this page only (`allow` = higher render fidelity; `strip` = strict sanitization). When absent, the viewer applies shared auto script heuristics.
- `kgWebpageIncludeImages`: nudges whether HTML→Markdown conversion keeps `<img>/<picture>` blocks when auto image handling is insufficient.
- `kgWebpageFidelityLevel`: nudges how aggressively complex HTML is preserved as HTML blocks during conversion when auto fidelity selection is not ideal.

## UI Placement (SSOT)

The canonical UI for webpage-backed docs is the Markdown toolbar `nav` ("Webpage" group):

- Selectors: `View`, `Script`, `Imgs`, `Fid` (all default to **Auto**, reflecting shared rich-media + iframe heuristics; frontmatter is only written when a non-auto override is explicitly chosen)
- Action: `Sync` (DOM→Markdown)

No other surface should duplicate these controls.

## Rich Media SSOT (Markdown Viewer ↔ Canvas)

- Rich Media detection is shared: a neutral `getNodeMediaSpec`-style heuristic inspects node/document properties to decide whether a block should render as image/svg/video/iframe, independent of renderer (Markdown Viewer, Canvas 2D/3D, Design, Geospatial).
- Script/Imgs/Fid defaults are auto and driven by shared rich-media + iframe heuristics; frontmatter overrides are optional escape hatches and must not be required for normal imports.
- Canvas 2D (D3) and Canvas 3D reuse the same Rich Media SSOT: media nodes render as bounded overlay panels (DOM, not SVG/WebGL), scheduled via a shared RAF-coalesced overlay scheduler so drag/pan/zoom/3D motion do not induce per-frame React rerenders or recomputation loops.

## Round-Trip Rules

- Switching view modes must be lossless for frontmatter keys.
- `Sync` explicitly regenerates Markdown from a DOM snapshot:
  - DOM capture → HTML→Markdown conversion (with `IncludeImages` + `FidelityLevel`) → Markdown SSOT update.
- The Markdown SSOT output must be Markdown-only (no duplicate “artifact doc” wrapper sections, no YAML/HTML snapshot blocks, no “HTML Head” blocks). Metadata remains available via the HTML/Raw/JSON views.
- HTML→Markdown conversion must be URL-agnostic but URL-correct: resolve `href/src/action/poster/srcset` and common lazy-load `data-*` media attributes against `baseUrl`; upsert missing `<img src>` from `data-src` or `srcset` so markdown images do not become empty.
- Markdown preview must preserve layout and media fidelity for allowlisted HTML blocks:
  - **Grid**: `grid-cols-*` and `col-span-*`/`row-span-*` class-derived layout must render as CSS grid, and item spans must apply even when the item itself is not `display:grid`.
  - **Media**: allowlisted `<video>/<audio>` should preserve safe attributes (`autoplay`, `muted`, `loop`, `playsinline`, `poster`) and prefer `<source>` candidates when direct `src` is absent.
- Markdown preview renders allowlisted HTML blocks safely (no `dangerouslySetInnerHTML`). Unsupported blocks must never be silently dropped.

## Inline Editing Palette + Commands (Viewer/Editor parity)

- Editor and Viewer reuse the same markdown-formatting pipeline (`applyMarkdownFormatAction` and wrap helpers) for formatting buttons, bubble toolbars, and slash-command menus so that all actions are pure text transforms against the Markdown SSOT.
- In Markdown Viewer Read mode, click-and-edit in-place uses a contentEditable surface and a selection-aware bubble toolbar to expose inline formatting, heading/list/quote transforms, color/highlight palette, checklist/divider insertion, and structural actions (duplicate/delete) without introducing a separate WYSIWYG document model.
- Slash commands (`/` near the caret) may open a lightweight slash menu that reuses the same SSOT floating menu classes and triggers the same heading/list/quote/code transforms as the Editor toolbar. Detection must be line-local and must not perform full-document rescans on every keystroke.
- `@` commands must reuse the shared variable/media catalog. Image insertion emits `![alt](url)` and video insertion emits `<video src="..." poster="..." title="..." controls></video>` through the same text-owner write path used by cards and workflow fields.
- `#` commands must reuse the shared keyword catalog plus the centralized full-graph keyword inventory, so reusable keywords remain available even when other stats or panels are scoped to a selection.
- Inline link editing (Cmd/Ctrl+K) opens a small SSOT-styled popover near the selection; applying a link wraps the current selection as `[label](href)` and is strictly selection-scoped. Cancel or empty href must leave the document unchanged. Implementations must not introduce a separate link state store or background URL validators that recompute on every keystroke.
- All palette, slash, and link actions are view-only: they operate solely on Markdown text and must not mutate GraphData, layout, or zoom state; they must also respect the Viewer `forbidCopy` policy (no alternate code paths that write to the clipboard).
- WYSIWYG-ish in-place editing must preserve read-mode typography and spacing for inline code and lists, including list-to-list gaps and mixed paragraph→code→list sequences; entering contentEditable must not change layout, margins, or padding.
- In-place edit surfaces must reuse read-surface baseline layout and interaction styling, including indent/padding/margin/border plus caret/whitespace/tab-size parity; entering edit must not mutate wrapper geometry.
- In Workspace Editor `Markdown + Read + Viewer`, header-level duplicate formatting buttons (`Heading/Bold/Italic/Strikethrough/...`) must be removed from the workspace toolbar and deferred to the inline floating selection toolbar SSOT. Viewer-read header chrome keeps navigation/layout/display actions only.
- Viewer header controls must be actionable-only: hide Content controls when no mode switch exists, hide `Storyboard Widget` when unavailable, and avoid disabled/no-op toolbar placeholders.
- Header Display controls are markdown read-surface only; do not render them for non-markdown or non-read viewer surfaces.
- Floating toolbar and slash/variable menus must use shared pointer-down guards and shared hand-cursor class tokens for all actionable buttons; arrow-cursor or per-button interaction forks are forbidden.
- Variable toolbar Apply must use the shared variable action pipeline only; direct contentEditable query/mutation fallbacks are forbidden.
- View↔Edit parity for inline code and lists is centralized: `markdownInlineCodeParity` defines `MARKDOWN_INLINE_CODE_VIEW_CLASS` and `MARKDOWN_INLINE_CODE_EDIT_DESCENDANT_CLASSES` for read/edit inline-code surfaces; `markdownListLayout` defines list marker/indent/spacing, row editor/view inline classes, and gutter alignment reused by `MarkdownListBlock` so list editing never introduces per-surface typography forks or layout mutations beyond bounded parity tightening.
- View↔Edit parity for blockquotes and callouts must reuse a shared helper layer for contiguous quote-line/callout-line range mapping, no-op replace-line detection, and bounded typography/spacing capture; implementations must not scatter ad-hoc regex/range/guard logic across surfaces or introduce churny commit/blur paths that can loop or oscillate.
- Titles and title-like labels (for example, headings and workspace property names) must render truncated with ellipsis in rest state, reuse the same typography in in-place html editors, reveal full text on focus via horizontal scroll, and forbid alternate WYSIWYG title stacks or layout/spacing drift on edit-open.
- Workspace Data View controls (Table/Multi-dimensional Table/Kanban) in Markdown Read Viewer must keep semantic landmarks (`header/nav/aside`) and ensure dropdown/menu layers stay above sticky table headers. Implementations must not ship blocked or underneath controls, duplicate headers, or alternate non-SSOT interaction stacks.
- When Storyboard or FloatingPanel `View` exposes the same record/table affordances, it should reuse these shared Workspace Data View utility owners for header/settings/new-record behavior instead of inventing renderer-local Kanban or toolbar variants.
