# agenticgraph Frontend Document: Interactions and Operations

Continuation of agenticgraph-frontend-document.md covering canvas-markdown interactions, QA, operations, and directives.

## Canvas ↔ Markdown Interaction Patterns

### Bidirectional Selection Sync

**Canvas to Markdown**:
- Node/edge selection → Auto-scroll markdown editor/viewer to corresponding source line
- Graph layer selection → Scroll to layer definition in frontmatter
- Mermaid frontmatter sync → Scroll to exact node definition line within frontmatter block

**Markdown to Canvas**:
- Meta/Cmd-click a preview block → Show on Canvas (highlights the corresponding node/edge when provenance exists)
- Right click → Opens the “Show on/in …” Selection Toolbar at the exact pointer position
- Text selection gestures remain native (single click places caret anchor; double click selects word; triple click selects paragraph/line)

### Auto-Scroll Behavior

**Editor (Monaco)**:
- Uses wrap model to align first wrapped row of selected range to top of viewport
- Preserves line numbers for nested content
- Flash effect on navigation from other views

**Viewer**:
- Uses block-level `data-start-line` markers to anchor rendered blocks
- Scrolls selected range to top of scroll container
- Avoids "lost in the middle" placements

### Text Highlight Toggle

**When Enabled**:
- Node-backed ranges: Inherit node fill color, appear as tinted background band in viewer and editor gutter
- Edge-backed ranges: Rendered with underline treatment mirroring edge color
- Graph layer highlights: Reuse layer background color for visual alignment

**When Disabled**: Markdown remains unadorned, scrolling and auto-alignment still active

### Workflow Surface Auto-Open

**Trigger**: Selecting media card in Gallery renderer

**Behavior**:
- Automatically opens the Graph Data Table / workspace surface in Markdown mode
- Maintains alignment between media selection, canvas selection, and source text
- Applies brief, subtle highlight to panel chrome for visual feedback

### Markdown Preview Interaction

**Selection Toolbar**: Appears on Right Click (with or without a text selection), provides context-aware navigation

**Available Actions**:
- Show on Canvas: Highlights corresponding node/edge
- Show in Viewer: Switches to Markdown Viewer, auto-positions to exact line
- Show in Editor: Switches to Markdown Editor
- Show in Presentation: Enters Presentation mode
- Show in Gallery: Switches to Gallery renderer view
- Show in Graph Data Table: Opens the Graph Data Table surface for the selected node or edge

**Conditional Availability**: Irrelevant options disabled based on current view

**Apply Shortcut**: In Editor/Viewer layout modes, Cmd/Ctrl+Enter toggles Editor↔Viewer. When in Editor, it applies and then switches to Viewer.

### Shared Inline Command Invocation

**Supported Surfaces**:
- Canvas card inline editors (including Storyboard and Strybldr cards)
- Markdown Viewer / WYSIWYG editable blocks
- Workflow Manager graph fields
- Renderer-adjacent rich media text fields that commit through shared markdown/frontmatter or graph-field owners

**Triggers**:
- `/` opens shared slash actions such as headings, lists, quotes, code blocks, and media placeholders.
- `@` opens shared variable, reference, image, and video insertion actions.
- `#` opens shared keyword actions such as canvas lanes, card fields, media keywords, and graph workflow tags.

**Media Behavior**:
- `@` media rows must display derived thumbnails or previews when available from shared media/reference candidates.
- Image/video picks insert persistent inline content, not transient overlay state.
- `@` image picks insert Markdown image syntax `![alt](url)`, where `alt` comes from the shared media name or a source-key-derived fallback.
- `@` video picks insert `<video src="..." poster="..." title="..." controls></video>`. `title` carries the shared media name and `poster` is included only when the shared resolver can derive one.
- Indexed or imported media references must survive blur, block rerender, canvas card reprojection, and document reload through the same owner-path persistence used by the active text surface.
- Inserted inline image/video references inside Cards and Widgets render as font-height tokenized thumbnail pills using shared agenticgraph border, panel background, and shadow tokens.
- Floating Panel `@` media rows render compact list thumbnails with the same token family, but may be larger than inline text-height inserts.
- Floating Panel `Media` names are inline-editable: graph media names commit through the owning graph node label, and markdown media names commit through the owning link or image-alt line.
- Floating Panel `Media` exposes Upload Media for image, audio, and video files. Uploaded files render as local session rows first; when runtime storage confirms the Worker media PUT route and media asset persist route, the row exposes the Cloudflare access link and the generated Markdown reference joins the shared media inventory.
- `#` keyword browsing is backed by the full active graph keyword inventory in MainPanel Dashboard and by the same centralized graph-wide context when inline card editors open the `#` command menu. Reusable keyword browsing must not collapse to only the currently selected subgraph.

**Command Menu Surfaces**:
- MainPanel Help `Command Menu` is the discovery and inspection view over the full shared `/`, `@`, and `#` command catalog used inline.
- Floating Panel `Media` is the current `@` image, audio, video, webpage, iframe, YouTube, and graph rich-media list. It is the rich-media browsing SSOT, may show derived thumbnails and source URLs, and feeds Preview Panel selection without duplicating the media gallery there; command keys, prefixes, media candidate resolution, insertion payloads, and persistence rules remain shared.

### Full Screen Presentation

**Entry**: Dedicated "Enter Full Screen" button (`Maximize2`) in toolbar when in Presentation mode. Gallery is selected through Canvas View Mode as `2D Renderer: Gallery`.

**Sidebar Behavior**:
- Auto-Hide: Sidebar hides on full screen entry
- Auto-Show on Hover: Sidebar reveals as overlay when hovering left edge
- Manual Toggle: Toolbar button or 'O' shortcut, shared state with embedded view

**Zoom Reset**: Automatically resets slide zoom to 100% on full screen entry

### Right-Click Context Menu

**Unified Behavior**: Displays Selection Toolbar in Viewer, Editor, Presentation, Gallery renderer, and Graph Data Table

**Positioning Rule**: The toolbar is positioned at the exact pointer coordinates (no “fly-out” bias).

**Consistent Navigation**: Provides same context-aware actions across all views

### Flash Feedback

**Purpose**: Visual emphasis when navigating from other views

**Implementation**:
- `flashLine` prop triggers temporary highlight
- CSS animations: `monaco-flash-fade` (Editor), `markdown-flash-highlight` (Viewer)
- Automatic fade-out after configured duration

### Token Sharing Architecture

**Optimization**: Markdown tokenization runs once, shared across Viewer, Editor, TOC, and Presentation

**Hook**: `useMarkdownPreviewTokens` ensures tokens computed once, reused during mode switches

**Line Map Preservation**: Maintained during token processing for accurate scroll synchronization

### Component Separation

**View Logic**: `useMarkdownSectionLogic` (scroll sync, auto-positioning, flash effects, TOC)

**Data Logic**: `MarkdownWorkspaceRuntime.impl.tsx` + `useMarkdownWorkspaceBootstrapState` (workspace markdown state management)

**Parsing Logic**: `useMarkdownApply` (markdown parsing and graph updates)

**JSON Conversion**: JSON-backed markdown workspace utilities and runtime preferences (JSON ↔ Markdown transformation)

**File Size Constraint**: <600 lines per file enforced

### Canvas ↔ Markdown Interaction Compliance

| Context              | Intent                          | Directive                                                                                   | Module/Component | Function/Method | Input                | Output              | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|----------------------|---------------------|----------------------------------|
| Selection Sync       | Maintain bidirectional link     | - [ ] Track provenance metadata; update both views; forbid desync                          | MarkdownSection  | syncSelection   | selection event      | updated views       | Provenance lookup + scroll       |
| Auto-Scroll          | Position source in viewport     | - [ ] Calculate line offset; scroll to top; apply flash; forbid mid-viewport placement    | MonacoEditor     | scrollToLine    | line number          | scroll position     | Line to pixel + viewport offset  |
| Token Sharing        | Optimize rendering              | - [ ] Lex once; share tokens; preserve line maps; forbid redundant lexing                 | MarkdownTokens   | useTokens       | markdown text        | shared tokens       | Marked lexer + memoization       |
| Inline Command Menus | Keep text actions consistent    | - [ ] Reuse one `/`, `@`, and `#` catalog across card, viewer, and workflow fields; persist through owner writes; forbid surface-local command forks | Inline editors + Workflow Manager | invokeCommandMenu | trigger + selection + media candidates | inserted text or media payload | Shared catalog lookup + owner-path commit |
| Fullscreen Toggle    | Maximize presentation           | - [ ] Enter native fullscreen; auto-hide sidebar; reset zoom; forbid jarring transitions  | Presentation     | enterFullscreen | void                 | fullscreen state    | Fullscreen API + state updates   |

---

## Label and Tooltip Behavior

### Node Labels

**Default**: Center-aligned, wrapped text

**Compact Mode**: Truncate with ellipsis at low zoom to reduce clutter

**Word-Based Clamping**: Labels with >20 words (excluding markdown heading layers `hn`) are clamped with ellipsis; full text is revealed via the shared hover tooltip.

**Theme Safety**: Label fill + halo follow theme tokens (System/Light/Dark) to prevent “invisible text” in dark mode.

### Edge Labels

**Default**: Truncate with ellipsis in hover surfaces

**Expansion**: Full text expands on hover

### Hover Content

**Long Descriptions**: Scrollable overflow support

**Interaction**: Toggle expansion on click

### Tooltip Configuration

**User Controls**: Configurable via "Graph Interaction" settings in MainPanel Settings

**Options**:
- Show Node ID
- Show Node Name
- Show Node Label (Type)
- Show Node Description
- Show Node Properties
- Corresponding Edge options

**Schema Integration**: Settings override or work with `schema.behavior.hover.content` (project-level defaults)

### Fit to Screen & Zoom Behavior

**2D Implementation**: `useZoomEffects` and `applyZoomRequest("fit")`

**Fit Logic**:
- Uses `fitAllTransform` to compute strict bounding box of all nodes (ignoring origin)
- Centers box in SVG viewport with small margin on all sides
- Single-node graphs: treat node position as entire bounding box
- Empty to non-empty transition: guarantees visibility

**Fit Triggers**:
- Graph changes (node/edge add/remove)
- Viewport resize
- Does NOT trigger on: schema layout changes, layer toggles (prevents unexpected camera movement)

**Label Bounds**: Fit calculations account for node labels (estimated width/height from `schema.labelStyles.*`)

**Pin to View**: Toolbar toggle that preserves camera transform across graph updates and viewport resizes (no jump when floating panels open/close)

**While Pinned**:
- Disables Fit to Screen
- Disables Zoom to Selection
- Selection (nodes, edges, graph layers) never triggers zoom/fit/camera moves
- In 3D: Also disables auto-rotate for visual stability

**View-only Toggle**:
- Rich Media (Render Media as Nodes) is a presentation-only switch and must not trigger zoom/fit/camera moves.
- Rich Media sources are sanitized and normalized (e.g. GitHub blob URLs resolve to raw) before proxying to avoid broken media placeholders.
- Rich Media opacity composes with graph layer opacity: `effectiveOpacity = mediaNodeOpacity × layerOpacity`, and media-specific opacity rules only apply while Rich Media is enabled.

**Safety Forces**:
- Box Force: Soft constraint around centered 16:9 frame capped at 1920×1080
- Collision avoidance: Accounts for rectangular node half-extents (including schema-driven `visual:width`/`visual:height`) and estimated label bounds
- Configuration: `schema.layout.forces.boxForce` and `boxForceStrength`

**3D Implementation**: `Controls` and `requestThreeCamera("fit")`

### Port Handles

**Toggle**: Toolbar button shows node connection handles

**Routing**: Routes 2D force/radial edge endpoints to nearest cardinal handle

**Schema Configuration**: `schema.behavior.portHandles.*`

**Layout Neutrality**: Border anchoring derives from graph topology + Mermaid direction when available (LR/RL/TB/BT); no hardcoded axis or domain assumptions

### Label & Tooltip Compliance

| Context              | Intent                          | Directive                                                                                   | Module/Component | Function/Method | Input                | Output              | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|----------------------|---------------------|----------------------------------|
| Label Truncation     | Reduce visual clutter           | - [ ] Clamp labels with >20 words (excluding heading layers `hn`); full text in tooltip; forbid overflow | NodeLabel        | renderLabel     | zoom level + text    | styled label        | Word threshold + zoom threshold  |
| Tooltip Content      | Show configurable details       | - [ ] Read settings; include enabled fields; forbid unconfigured display                  | HoverTooltip     | buildContent    | node/edge + settings | tooltip HTML        | Settings flags + field inclusion |
| Fit to Screen        | Center visible graph            | - [ ] Fit on capped `1920×1080` frame with `targetFillRatio=0.8`; center by graph centroid; account for label-aware bounds; clamp via `schema.performance.zoom`; forbid origin-centric fit | ZoomEffects      | fitAll          | nodes + labels + schema + viewport | zoom transform      | Frame cap + fill ratio + centroid centering |
| Pin to View          | Preserve camera position        | - [ ] Lock transform; disable auto-fit; disable selection zoom; forbid unexpected movement| CameraControl    | togglePin       | void                 | pinned state        | Boolean flag + event blocking    |

---

## Unified Markdown Layout (Editor & Viewer)

### Layout Architecture

**Shared Container**: `MarkdownPanelLayout` with collapsible sidebar Table of Contents (TOC)

**Semantic Structure**:
- `<section>`: Outer container
- `<aside>`: Sidebar (TOC)
- `<header>`: Panel header
- `<main>`: Content area
- `<article>`: Editor/Viewer panes
- `<figure>`: Frontmatter Mermaid diagrams

**Sidebar Position**: Left side (default layout)

**Token Sharing**: Markdown lexer runs once at parent level, tokens shared between Viewer, TOC, Editor, and Presentation

**Line Map**: Preserved during token processing for accurate scroll synchronization

### Component Architecture

**View Separation**:
- `MarkdownEditorPane`: Dedicated editor component
- `MarkdownViewerPane`: Dedicated viewer component
- `MarkdownPreviewPresentation`: Presentation mode component
- `GalleryCanvas`: Canvas View Mode 2D renderer for thumbnail-grid navigation

**View Mode Toolbar**: Explicit Markdown Workspace controls for "Viewer", "Editor", and "Markdown Presentation"; Gallery is consolidated under Canvas View Mode as `2D Renderer: Gallery`.

**Icon Buttons**:
- `MonitorPlay`: Markdown Presentation
- `Images`: `2D Renderer: Gallery`
- `Edit3`: Editor
- `Eye`: Viewer

**Renderer Order**: `2D Renderer: Gallery` is listed with the other shared Canvas View Mode renderers, adjacent to Dashboard.

### Editor Features

**Monaco Integration**: Robust text editing with syntax highlighting

**Word Wrap Toggle**: Toolbar control for long line readability

**Flash Line**: Visual feedback on navigation from other panels

**Code Block Modes**: "Beside" and "Inline" annotations with persisted user preference

**Apply Button**: Re-parse markdown and update graph

**Theme Alignment**: Fully respects global theme (Light/Dark/System), matches `UI_THEME_TOKENS` and `UI_THEME_COLORS`

### Viewer Features

**Rendered Preview**: Syntax highlighting and Mermaid diagram support

**Scroll Synchronization**: With editor

**Interactive Elements**: Links, anchors integrate with graph selection

**Error Feedback**: Descriptive errors for invalid Mermaid diagrams

**Sticky Headings**: `h1`-`h6` snap to top of viewer container (below panel header)

**Cascading Behavior**: Lower-level headers stick below higher-level headers (stacked context)

**Table Headers**: `<th>` inside `<figure>` elements stick to top of table container, ensuring column labels visible while scrolling

**Visual Treatment**: `backdrop-blur-md` and `UI_THEME_TOKENS.panel.bg` to obscure scrolling content

### Presentation Mode

**Aspect Ratio**: 16:9 (1920x1080) for slide layout

**Token Optimization**: Shares `fullDocTokens` via `MarkdownPreviewPresentation` prop

**Robust Rendering**: Fallback lexing ensures content visibility even with imperfect line maps or filtered tokens

**Sticky Headings in Slides**: Slide headings (`h1`-`h6`) are sticky within slide scroll container

**Dynamic Offset**: Top offset calculated based on slide header presence:
- 32px: Default theme
- 40px: Academic theme
- 0px: No header

**Sidebar Synchronization**:
- "Gallery renderer" sidebar uses same semantic structure (`aside`, `header`, `nav`) as Viewer sidebar
- UI components: `IconButton`, `UI_THEME_TOKENS` for consistent appearance
- State: `showSidebar` prop synchronized with Viewer sidebar
- Persistence: shared Markdown workspace sidebar preference (`LS_KEYS.markdownShowSidebar`)

**Fixed Footer**: Matches header positioning strategy (`fixed bottom-0`, `h-8`), uses semantic `<footer>`, matching z-index/border styles

### Synchronization Guarantees

**100% Sync**: Enforced between Markdown Viewer, Editor, Presentation, Gallery renderer, and Graph Data Table

**Sync Aspects**:
- Heading navigation
- Content updates
- Scroll position
- Collapse/expand state

**Mechanism**: Shared state and explicit jump triggers

### Click & Selection Behaviors

**Viewer/Presentation/Gallery renderer**: Native selection gestures only (single click caret anchor; double click word; triple click paragraph/line). No implicit navigation on double-click.

**Bottom Surface Tab Bar**: Double-click → toggle fullscreen expansion

**Fullscreen Impact**: When expanded to 100% height, graph canvas rendering and simulation paused (frozen) for performance optimization

### Canvas Click Behavior

**Node/Edge/Graph Layer Click**: Auto-positions Markdown Editor to corresponding Mermaid Frontmatter line (if applicable)

**Single Source of Truth**: Removes legacy implementations, ensures consistent behavior

**Layout Neutrality**: `MermaidNode` and `pointsTo` edges styled and filtered via schema-driven layer configuration

**Universal Layout Support**: Force, radial, tidy-tree layouts operate on same schema-aligned subgraph without special cases

### Unified Markdown Layout Compliance

| Context              | Intent                          | Directive                                                                                   | Module/Component | Function/Method | Input                | Output              | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|----------------------|---------------------|----------------------------------|
| Token Sharing        | Optimize lexing                 | - [ ] Lex once; share across views; preserve line maps; forbid redundant processing       | MarkdownTokens   | usePreviewTokens| markdown text        | shared tokens       | Marked lexer + React memo        |
| Sidebar TOC          | Navigate document structure     | - [ ] Extract headings; render nav tree; sync with scroll; forbid stale TOC               | TableOfContents  | renderNav       | tokens + scroll pos  | TOC nav tree        | Heading extraction + position map|
| Sticky Headers       | Maintain context while scrolling| - [ ] Apply sticky positioning; cascade levels; obscure content; forbid header overlap     | Viewer           | renderHeading   | heading level        | styled header       | Z-index stack + backdrop blur    |
| Presentation Slides  | Generate slide boundaries       | - [ ] Parse heading levels; split content; apply 16:9 ratio; forbid content overflow      | Presentation     | buildSlides     | tokens               | slide array         | Heading delimiter + aspect calc  |
| Double-Click Nav     | Jump to corresponding view      | - [ ] Map line numbers; trigger scroll; flash target; forbid imprecise jumps              | PanelLayout      | handleDblClick  | click event          | view transition     | Line map lookup + scroll trigger |

---

## Visual QA Checklist: Media Panels

**Dependency Declaration**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| React Components     | Minimize coupling               | - [ ] Inject store via hooks; use shallow selectors; forbid prop drilling                 |
| Store Slices         | Isolate state concerns          | - [ ] Define slice boundaries; export actions; forbid cross-slice mutations                |
| External Libraries   | Centralize imports              | - [ ] Import from canonical sources; document versions; forbid multiple import paths       |

**Integration Contracts**

- **Panel ↔ Store**:
  - Must use shallow selectors for performance.
  - Panel state updates must flow through store actions, not local state.
- **Parser ↔ Schema**:
  - Parsers must validate against current schema catalog.
  - Schema IDs use namespaced format defined in schema documentation.
- **Canvas ↔ Markdown**:
  - Must maintain bidirectional selection sync via provenance metadata.
  - Markdown section defines source position mappings for graph nodes.

**Coupling Metrics**

- Canvas is decoupled from panels:
  - Canvas only depends on store selection state, not panel implementation.
  - Panel visibility is attached via store flags, not direct canvas references.

---

## Code Organization Framework

**Directory Structure (relevant subset)**:

```text
canvas/
├── src/
│   ├── components/
│   │   ├── GraphCanvas.tsx
│   │   ├── Toolbar.tsx
│   │   └── Minimap.tsx
│   ├── features/
│   │   ├── panels/
│   │   │   ├── MainPanel.tsx
│   │   │   ├── BottomSurface.tsx
│   │   │   └── views/
│   │   │       ├── WorkflowPanel.tsx
│   │   │       ├── SchemaPanel.tsx
│   │   │       └── SettingsPanel.tsx
│   │   └── orchestrator/
│   │       ├── OrchestratorPanel.tsx
│   │       └── WorkflowExecutor.tsx
│   ├── hooks/
│   │   └── store/
│   │       ├── useGraphStore.ts
│   │       ├── graphDataSlice.ts
│   │       ├── schemaSlice.ts
│   │       └── uiSettingsSlice.ts
│   ├── parsers/
│   │   ├── csvParser.ts
│   │   ├── jsonParser.ts
│   │   └── markdownParser.ts
│   └── utils/
│       ├── iconUtils.ts
│       └── localStorageHelpers.ts
└── docs/
    └── documents/
        ├── agenticgraph-design-document.md
        ├── agenticgraph-parser-document.md
        └── agenticgraph-ui-ux-design-document.md
```

**Naming Conventions**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| TypeScript Files     | Follow React standards          | - [ ] Use PascalCase for components; camelCase for utilities; forbid inconsistent casing  |
| Store Slices         | Indicate domain                 | - [ ] Name slices by domain (graphDataSlice, schemaSlice); forbid generic names           |
| Panel Components     | Indicate purpose                | - [ ] Suffix with Panel (WorkflowPanel, SettingsPanel); forbid vague names                |
| Constants            | Signal immutability             | - [ ] Use SCREAMING_SNAKE_CASE for LS_KEYS; declare in utils; forbid inline magic strings |

**File Organization**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Component Size       | Maintain readability            | - [ ] Keep components under 500 LOC; extract subcomponents; forbid monolithic files       |
| Function Length      | Enable comprehension            | - [ ] Limit functions to 50 lines; extract helpers; forbid deep nesting (>3 levels)       |
| Import Organization  | Clarify dependencies            | - [ ] Group React, external libs, internal modules; sort alphabetically; forbid arbitrary order |

---

## Testing & Quality Standards

**Test Coverage Metrics**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Store Tests          | Validate state mutations        | - [ ] Test all store actions; assert state changes; forbid untested mutations             |
| Component Tests      | Verify rendering                | - [ ] Test panel switching; selection behavior; forbid untested user interactions         |
| Integration Tests    | Verify end-to-end flows         | - [ ] Test markdown→graph pipeline; parser→store→canvas; forbid incomplete coverage       |

**Test Categories**

- **Unit Tests**:
  - Schema CRUD and validation logic can be exercised via store action tests.
  - UI utilities (icon sizing, localStorage) can be tested in isolation.
- **Integration Tests**:
  - Full pipeline from markdown paste → parser → store update → canvas render → selection sync.
  - Panel open/close → preference persistence → reload verification.

**Quality Gates**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Schema Validation    | Ensure compliance               | - [ ] Validate node/edge structure; check required fields; forbid invalid types           |
| UI Persistence       | Prevent lost preferences        | - [ ] Test localStorage read/write; verify restore on reload; forbid missing persistence  |
| Render Performance   | Avoid unnecessary updates       | - [ ] Assert shallow selectors used; measure re-render counts; forbid broad subscriptions |

---

## Operational Configuration: Environment Wiring

**Canvas Environment Variables**:

| Variable                          | Scope            | Default                            | Impact                                              |
|-----------------------------------|------------------|------------------------------------|-----------------------------------------------------|
| `VITE_DEFAULT_LAYOUT_MODE`        | deployment       | `'semantic'`                       | Controls initial graph layout algorithm             |
| `VITE_ENABLE_DEBUG_PANELS`        | deployment       | `false`                            | Shows debug panels for store inspection             |
| `VITE_PARSER_VALIDATION_LEVEL`    | deployment       | `'strict'`                         | Controls schema validation strictness during parse  |

**Artifact Generation**: `graph-export.json` (serialized graph) | `schema-export.yaml` (type definitions) | `workflow-config.json` (orchestrator settings)

**Development Workflow Integration**:

| Step | Action                                  | Command/Trigger                         | Artifact Consumer                  |
|------|----------------------------------------|------------------------------------------|-------------------------------------|
| 1    | Start development server               | `npm run dev`                            | Browser                             |
| 2    | Load sample graph                      | Upload CSV/JSON via UI                   | Parser → Store                      |
| 3    | Validate schema                        | Click "Validate" in Schema Panel         | Schema validator                    |
| 4    | Export graph                           | Click "Export" in Toolbar                | User downloads JSON                 |
| 5    | Run tests                              | `npm test`                               | Test runner                         |

| Context              | Intent                          | Directive                                                                                   | Module/Component  | Class/Object | Function/Method              | Dependency      | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|-------------------|--------------|------------------------------|-----------------|------------------------------|------------------------|----------------------------------|
| Env Resolution       | Map env to config paths         | - [ ] Read VITE_ variables; construct config objects; forbid hardcoded paths               | ConfigModule      | —            | resolveConfig                | process.env     | env variables                | config object          | Env var parsing + defaults       |
| Parser Invocation    | Run selected parser             | - [ ] Detect format; execute parser; validate output; forbid silent failures               | ParserModule      | —            | runParser                    | parsers         | file, format                 | graph data             | Format detection + parsing       |
| Export Generation    | Serialize graph/schema          | - [ ] Serialize to JSON/YAML; validate structure; forbid partial exports                   | ExportModule      | —            | exportGraph                  | serializers     | graph + schema               | file download          | Serialization + validation       |

---

## Data Flow

**Pipeline**: File Upload → Parser Detection → Normalization → Schema Validation → Store Update → Canvas/Panel Render

| Stage       | Input                          | Output                         | Responsibility                                              | Performance Consideration                    |
|-------------|--------------------------------|--------------------------------|-------------------------------------------------------------|----------------------------------------------|
| Upload      | User file                      | File object                    | UI handles file input, passes to parser module              | File size validation to prevent large uploads|
| Detection   | File object                    | Format enum                    | Parser detects CSV/JSON/JSON-LD/Markdown format             | Header inspection only, O(1)                 |
| Normalize   | Raw file data                  | Internal graph representation  | Parser transforms to nodes/edges with typed properties      | O(n) for n elements, streaming for large files|
| Validate    | Graph data                     | Validated graph + errors       | Schema validator checks types, required fields, references  | O(n) for n nodes/edges, early exit on errors |
| Store Update| Validated graph                | Updated store state            | Store slice applies mutations atomically                    | Shallow selectors minimize re-render impact  |
| Render      | Store state                    | UI update                      | Canvas/panels subscribe via selectors, re-render on change  | Use shallow selectors, memoize components    |

| Context              | Intent                          | Directive                                                                                   | Module           | Function/Method              | Input                | Output                  | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|------------------------------|----------------------|-------------------------|----------------------------------|
| File Upload          | Accept user files               | - [ ] Validate size/type; trigger parser; forbid unsupported formats                       | FileUploader     | handleUpload                 | File object          | parser invocation       | File type + size validation      |
| Format Detection     | Identify source format          | - [ ] Inspect headers/extension; return format enum; forbid ambiguous detection            | ParserUtils      | detectFormat                 | File object          | format enum             | Header/extension matching        |
| Normalization        | Convert to internal model       | - [ ] Map fields; apply defaults; validate types; forbid data loss                         | CSVParser        | normalize                    | CSV rows             | graph nodes/edges       | Field mapping + type coercion    |
| Schema Validation    | Ensure graph integrity          | - [ ] Check types/required fields; return errors; forbid invalid graphs                    | SchemaValidator  | validate                     | graph data + schema  | validation result       | Type checking + reference checks |
| Store Mutation       | Update application state        | - [ ] Apply mutations atomically; notify subscribers; forbid partial updates               | graphDataSlice   | updateGraph                  | mutations            | updated state           | Atomic apply + subscriber notify |

---

## Design Decisions & Trade-offs

| Decision             | Rationale                          | Pros                                                  | Cons                                      | Mitigation                                    |
|----------------------|------------------------------------|-------------------------------------------------------|-------------------------------------------|-----------------------------------------------|
| Single Zustand Store | Centralize all state for observability | Single source of truth, predictable updates, easy debugging | Risk of store becoming too large          | Use domain slices, shallow selectors          |
| Panel Isolation      | Separate concerns by view type     | Clear responsibilities, independent testing, reusable | Extra boilerplate for new panels          | Provide template/recipe for adding panels    |
| Shallow Selectors    | Minimize re-renders                | Better performance, avoid unnecessary updates         | Requires discipline to use correctly      | Document selector patterns, code review checks|
| localStorage for UI  | Persist user preferences           | Survives reloads, simple API                          | No sync across tabs, size limits          | Use LS_KEYS constants, validate on read       |
| Schema-Driven        | Validate all graph data            | Type safety, early error detection, clear contracts   | Initial setup overhead, schema migration  | Version schemas, provide migration tools      |

---

## Panel System Directives

### Panel Registration Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| Tab Key Uniqueness   | Avoid collisions                | - [ ] Use unique string keys; document in types; forbid duplicate tab keys                | TypeScript union type for tab keys           |
| Panel Body Component | Isolate rendering               | - [ ] Create focused component; read from store; forbid direct state mutation             | Code review, component structure conventions |
| Store Integration    | Use central state               | - [ ] Read via selectors; write via actions; forbid local state for shared data           | Enforce in linter rules, code review         |

### Panel Layout Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| Main Panel Tabs      | Organize by workflow concern    | - [ ] Group workflow/schema/settings; use clear labels; forbid ambiguous tab names        | Design review, user testing                  |
| Bottom Surface Tabs  | Organize quick-review concerns  | - [ ] Keep tabs limited to lightweight stats/history review; forbid workspace, parser, or renderer ownership drift | Component organization, code review          |
| Floating Panels      | Context-sensitive tools         | - [ ] Show on selection/action; hide when irrelevant; forbid always-visible floaters      | UI state rules, user preference toggles      |

---

## UI Density and Icon System Directives

### Icon Consistency Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| Icon Sizing          | Use central scale               | - [ ] Call getIconSizeClass(uiIconScale); apply uniformly; forbid hardcoded sizes         | Utility function, code review                |
| Stroke Width         | Use central setting             | - [ ] Read uiIconStrokeWidth from store; apply to Lucide icons; forbid inline stroke values| Store-driven rendering, code review          |
| Preview Consistency  | Match settings to UI            | - [ ] Reuse icon utilities in previews; show live changes; forbid static preview
