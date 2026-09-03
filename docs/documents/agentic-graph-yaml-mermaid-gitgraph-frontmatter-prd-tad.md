---
schema: agentic-os-computing-flow/v1
doc_id: agentic-graph-yaml-mermaid-gitgraph-frontmatter-prd-tad
doc_type: prd-tad
version: 0.1.8
status: dev-source-implemented-no-deploy
updated: 2026-06-24
deploy_status: not_deployed
---

# agentic-graph YAML Mermaid GitGraph Frontmatter PRD/TAD

## Document Purpose

This document defines the implemented Dev-source contract for Toolbar -> Canvas View Mode -> **2D Renderer: GitGraph**, **2D Renderer: Media**, the shared BottomPanel/FloatingPanel Mermaid diagram surfaces for GitGraph and Gantt, and the Timeline video sequence import projection. The feature lets a Markdown document land on a dedicated Mermaid GitGraph, shared rich-media, or Gantt-backed video sequence surface through YAML frontmatter while preserving the existing Flow frontmatter parser and renderer ownership boundaries.

The implementation is Dev-only. It does not claim a Prod mirror sync or Cloudflare deployment.

## Implemented Dev-Source Baseline

| Capability | Implemented owner | Proof |
|---|---|---|
| Mermaid diagram kind detection | `grph-shared/src/markdown/mermaidInput.ts` | `mmdNormalization.test.ts` covers `gitGraph`, `gitGraph:`, `gantt`, Mermaid config headers, and mixed diagram splitting. |
| Frontmatter ingestion | `canvas/src/lib/parsers/markdownJsonLd.impl.ts` | Frontmatter `mermaid: |` creates a `MermaidDiagram` with `properties.diagramKind = "gitgraph"`. |
| Flowchart parser isolation | `canvas/src/features/parsers/markdownJsonLdMermaidParser.ts` | GitGraph commands do not create Flowchart `MermaidNode` topology. |
| Frontmatter-flow metadata fallback | `canvas/src/lib/mermaid/mermaidFrontmatterCode.ts` | `frontmatter-flow` graphs can preserve and expose top-level `mermaid` metadata. |
| Mermaid diagram code resolver | `canvas/src/lib/mermaid/mermaidDiagramCode.ts`, `canvas/src/lib/mermaid/mermaidGitGraph.ts` | Scans typed `{key,type,value}` frontmatter objects for `mermaid_flowchart` / `mermaid_gitgraph` / `mermaid_architecture` / `mermaid_eventmodeling` / `mermaid_gantt`, then falls back to top-level `mermaid: |` candidates. |
| Renderer surface | `canvas/src/components/MermaidGitGraphCanvas.tsx` | Renders the resolved Mermaid GitGraph code through the shared Mermaid SVG cache and postprocessor. |
| Interactive viewport | `canvas/src/lib/diagram/InteractiveMermaidDiagram.tsx`, `canvas/src/components/GraphCanvas/hooks/useSvgSurfaceZoomRuntime.ts` | BottomPanel Version Graph, GitGraph, and Gantt wrap cached Mermaid SVG output with the shared SVG zoom controller, content-bounds fitting, actual SVG viewport measurement, per-diagram keyed zoom persistence, neutral SVG element selection, and row-selection callbacks. |
| Inline GitGraph CRUD | `canvas/src/lib/mermaid/mermaidGitGraphEdit.ts`, `canvas/src/components/MermaidGitGraphCanvas.tsx` | Command create/update/delete transforms operate on the active Markdown `mermaid: |` source and reuse the shared inline text editor. |
| Document version graph | `canvas/src/features/document-versioning/documentVersioning.ts`, `canvas/src/features/document-versioning/DocumentVersionGitGraphPanel.tsx`, `canvas/src/features/strybldr/StrybldrTimelineBottomPanel.tsx` | Editor Workspace `[ ] diff` opens the shared Timeline bottom panel in Version Graph view; the bottom panel keeps Version Graph separate from Mermaid GitGraph; MainPanel History does not own a duplicate document-version Docs surface. |
| BottomPanel / FloatingPanel Mermaid panels | `canvas/src/features/gitgraph/MermaidDiagramPanelView.tsx`, typed diagram FloatingPanel views, and typed diagram BottomPanel views | BottomPanel owns Mermaid diagram previews and omits parsed row lists; FloatingPanel owns parsed rows and omits Mermaid diagram previews. Both surfaces share the same selected-row store and document-version graph row-selection helper; document-version history never appears as a GitGraph fallback. |
| Timeline video sequence and XR lanes | `canvas/src/components/MediaCanvas.tsx`, `canvas/src/components/timeline/timelineTransport.ts`, `canvas/src/components/timeline/timelinePlanSync.ts`, `canvas/src/features/gitgraph/GanttTimelineTransportPanel.tsx`, `canvas/src/features/gitgraph/TimelineBottomPanelView.tsx`, `canvas/src/features/three/XrTimelineSceneLane.tsx`, `canvas/src/features/three/xrMotionReferenceTimeline.ts`, `canvas/src/features/gitgraph/TimelineFloatingPanelView.tsx`, `canvas/src/components/timeline/videoSequenceTimeline.ts`, `canvas/src/lib/mermaid/mermaidGanttBarInteraction.ts` | BottomPanel Timeline always reuses the visual Gantt transport/player. In XR context, the native motion plan projects fractional-minute Scene/Effect tasks into that player, supplies its duration/FPS clock scale, and follows its shared playhead; it does not mount a second form player. First-class FloatingPanel Animation controls native presets and exports without forking transport; the retired FloatingPanel XR route remains absent. |
| Toolbar video import projection | `canvas/src/features/markdown-workspace/workspaceImport/videoSequenceTimelineImport.ts`, `canvas/src/features/markdown-workspace/workspaceImport/localImport.ts`, `canvas/src/features/markdown-workspace/workspaceImport/urlImport.ts`, `canvas/src/features/markdown-workspace/workspaceImport/urlContent.ts`, `canvas/src/features/markdown-workspace/useWorkspaceFileActions/importActions.ts`, `canvas/src/lib/url.ts` | Launch -> Import local files/folder and Import URL preserve video media as corpus manifest source units, then leave one visible source-backed `kgVideoSequenceTimeline` Markdown document with `kgCanvas2dRenderer: "media"`, typed `mermaid_gantt` frontmatter, stacked video/audio rows, `kgsrc_*` source ranges, and no default Mask/Grade operation backfill. Local picker videos register runtime object URLs without persisting stale `blob:` URLs; Import URL accepts direct HTTP(S), root-relative, `file://`, and local absolute paths, and local `@fs` metadata probes must not treat successful video loads as abort-worthy failures. |
| Media renderer surface | `canvas/src/components/MediaCanvas.tsx`, `canvas/src/components/RichMediaPanel.tsx`, `canvas/src/components/timeline/timelineAnimationEngine.ts`, `canvas/src/lib/command-menu/commandMenuRichMediaInventory.ts`, `canvas/src/components/CanvasViewport.tsx`, `canvas/src/components/toolbar/canvasViewMenu.ts`, `canvas/src/lib/config.render.ts`, `canvas/src/lib/config-copy/uiCopy.ts` | Toolbar -> Canvas View Mode exposes `2D Renderer: Media` as a canonical renderer id. The surface reuses the shared rich-media inventory, `RichMediaPanel` viewer, and native timeline animation state for images, videos, audio, webpage iframes, and playable video-sequence sources without duplicating media parsing, lightbox, transport, or motion owners; identical video-sequence sources key by resolved playback URL so repeat imports do not remount the same visible media element. Mermaid/Gantt flow-diagram panels remain BottomPanel/FloatingPanel diagram surfaces. |
| Typed `flow_diagrams` frontmatter | `canvas/src/features/parsers/markdownFrontmatterFlowGraph.flowDiagrams.ts` | Routed `mermaid_flowchart`, `mermaid_gitgraph`, `mermaid_architecture`, and `mermaid_eventmodeling` entries render in FloatingPanel row-list and BottomPanel chart surfaces without filename checks, static backfill, or Rich Media Panel fallback. |
| Canvas mount | `canvas/src/components/CanvasViewport.tsx` | Mounts the GitGraph surface only when the active 2D surface is `gitGraph`. |
| Toolbar and registry | `canvas/src/lib/config.render.ts`, `canvas/src/components/toolbar/canvasViewMenu.ts`, `canvas/src/components/toolbar/canvasViewActions.ts`, `canvas/src/lib/config-copy/uiCopy.ts` | Registers canonical renderer ids, menu metadata, icons, normalized canonical-token resolution, and Canvas View Display Controls that open BottomPanel GitGraph/Gantt through the shared bottom-surface store. |
| Parser routing contract | opening frontmatter `kgParserRoutingContract` | Names parser logic, routing keys, diagram kinds, surfaces, edge policy, and fork policy for runtime-ready demos without renderer-local aliases, stale carryover, or body-side topology mirrors. |

## Product Requirements

### PRD-GG-E01 - Frontmatter GitGraph Landing

As a agentic-graph author, I want a Markdown document to declare `kgCanvas2dRenderer: "gitGraph"` and `mermaid: |` GitGraph code so that Canvas opens directly to a Git history diagram.

Acceptance criteria:

- Given a Markdown file with `kgCanvasRenderMode: "2d"` and `kgCanvas2dRenderer: "gitGraph"`, when the document is parsed, then the renderer id resolves through the shared 2D renderer registry.
- Given `mermaid: |` with `gitGraph` or `gitGraph:`, when the document is parsed, then the parser creates a `MermaidDiagram` tagged with `diagramKind: "gitgraph"`.
- Given the active Canvas surface is GitGraph, when the renderer mounts, then it renders the Mermaid GitGraph code without mutating graph nodes, edges, layout caches, or frontmatter Flow state.

### PRD-GG-E02 - Parser Neutrality

As a graph author, I want GitGraph Mermaid syntax to stay diagram-native so that branch and commit commands are not misread as Flowchart topology.

Acceptance criteria:

- Given a GitGraph Mermaid block, when the Mermaid parser runs, then it must not emit Flowchart `MermaidNode` or `MermaidSubgraph` topology.
- Given a Flowchart Mermaid block, when the Mermaid parser runs, then the existing Flowchart topology path remains unchanged.
- Given a Mermaid config header before `gitGraph`, when diagram kind detection runs, then config keys such as `flowchart:` are ignored as declarations while the header remains attached to the rendered slice.

### PRD-GG-E03 - Flow Frontmatter Coexistence

As a power user, I want typed Flow frontmatter and GitGraph Mermaid frontmatter to coexist so that I can keep workflow metadata and render Git history from the same document.

Acceptance criteria:

- Given a document with both `flow:` and `mermaid: | gitGraph`, when it parses as `frontmatter-flow`, then `metadata.frontmatterMeta.mermaid` preserves the GitGraph code.
- Given that graph is rendered with `kgCanvas2dRenderer: "gitGraph"`, then the renderer reads the preserved Mermaid metadata instead of depending on Flowchart topology nodes.
- Given normalized `{key, type, value}` wrappers appear in Flow validation fixtures, then they remain fixture-only and do not become the canonical GitGraph authoring contract.
- Given a runtime-ready demo declares `kgParserRoutingContract`, when Source Files routes the document, then routing keys, diagram kinds, surfaces, edges, and fork policy remain source-owned and do not require renderer-local fallback aliases.

### PRD-GG-E04 - Interactive Dynamic Canvas

As a Canvas user, I want GitGraph to pan, zoom, fit, and expose selected SVG elements like other 2D surfaces so that Git history diagrams are inspectable without a scroll-only preview.

Acceptance criteria:

- Given a rendered GitGraph SVG, when the user pans, wheels, pinches, or uses toolbar zoom actions, then the surface reuses the shared D3 Graph viewport controller and keyed zoom store instead of a renderer-local event stack.
- Given the active renderer is GitGraph, when fit/auto-fit runs, then it fits the measured SVG visual bounds through a neutral synthetic bounds graph instead of GitGraph-specific topology backfill.
- Given a user clicks a visible GitGraph SVG element, then the surface marks that SVG element as selected with generic SVG metadata and does not mutate GraphData, Flow frontmatter, Mermaid code, or layout caches.
- Given the active document changes or the GitGraph SVG is re-rendered, then stale SVG listeners, RAF commits, gesture handlers, and selection metadata are cleaned up.

### PRD-GG-E05 - Inline Source CRUD

As a Canvas user, I want to edit GitGraph commands inline and add or remove common Git commands so that Git history can be maintained from the rendered surface without leaving the Markdown source as a stale parallel copy.

Acceptance criteria:

- Given the GitGraph renderer is active, when the user selects a rendered SVG label or a command row, then the command editor resolves the selected source command by Mermaid command text, branch target, commit `id`, or `tag` without project-specific labels.
- Given the user edits a selected command inline, then the renderer updates only the matching Mermaid command line in the active `mermaid: |` YAML frontmatter block and preserves unrelated frontmatter keys and Markdown body text.
- Given the user creates a command, then the renderer appends neutral Mermaid GitGraph source commands for commit, branch, merge, or cherry-pick using unique generated ids where needed.
- Given the user deletes a command, then the renderer removes only the selected GitGraph command line.
- Given any inline CRUD action succeeds, then the active Markdown document text, active Source Files entry, workspace file writeback, graph/document revisions, and history label are updated through shared owners.
- Given the renderer cannot create a merge or cherry-pick because the source has no eligible branch or commit, then it leaves the source unchanged instead of creating an invalid hardcoded fallback.

## Technical Architecture

### Pipeline

```text
Markdown Source
  -> YAML frontmatter parse
  -> Mermaid diagram kind detection
  -> MermaidDiagram preservation
  -> GitGraph renderer selection
  -> Mermaid SVG render cache
  -> postprocessed SVG surface
  -> shared D3 viewport adapter
  -> inline source CRUD transform
  -> active Markdown and Source Files writeback
```

### Ingestion

- Markdown and `.mmd` ingestion continue through the existing Markdown parser and shared Mermaid normalization helpers.
- YAML frontmatter `mermaid: |` is the canonical source for GitGraph content in Markdown documents.
- `readYamlFrontmatterMermaidCode` is a structured frontmatter read, not a filename or project-specific string scan.

### Parsing

- `readMermaidDiagramKind` recognizes `flowchart`, `graph`, `gitGraph`, `gitGraph:`, and `gantt` declarations.
- `splitMermaidDiagrams` keeps mixed Flowchart, GitGraph, and Gantt Mermaid blocks separate and preserves immediate Mermaid config headers with their diagram slice.
- `parseMermaidFrontmatter` remains Flowchart-only. GitGraph and Gantt are preserved as diagram code and rendered by Mermaid itself.

### Rendering

- `gitGraph` and `media` are canonical 2D renderer ids and map to the `gitGraph` and `media` surfaces.
- The surface is mounted from `CanvasViewport` only when active.
- The surface resolves GitGraph code from active Markdown frontmatter text first, then from parsed graph metadata as fallback, so inline source edits render immediately without waiting on a parser reapply.
- Mermaid rendering uses the existing cached SVG renderer and SVG postprocessor.
- Media rendering uses `MediaCanvas` to project active-document playback media inventory and playable `kgVideoSequenceSources` through the shared `RichMediaPanel` surface. The Media renderer does not parse Mermaid diagrams, fork upload/import handling, persist runtime-only object URLs, or render flow-diagram/Mermaid `srcDoc` panels that belong in BottomPanel/FloatingPanel diagram surfaces.
- Interaction uses `useSvgSurfaceZoomRuntime`, which adapts the rendered SVG to the shared D3 Graph viewport path (`createZoom`, toolbar `useZoomEffects`, `fitAllTransform`, `useAutoZoomModes2d`, and keyed zoom commits).
- The adapter creates a neutral one-node visual-bounds graph from the wrapped SVG content bounds, with the root `viewBox` or dimensions as fallback. This graph is only a fit/zoom measurement input and is not written back to source GraphData.
- SVG selection is generic and element-local. It exposes selected labels through surface data attributes for inspection without adding GitGraph semantic parsing, hardcoded labels, or file-specific behavior.

### Inline Editing

- `mermaidGitGraphEdit.ts` is the source-text helper for GitGraph command parsing, label lookup, line update, line delete, command append, and frontmatter `mermaid: |` replacement.
- The `GitGraphFloatingPanelView` reuses the shared FloatingPanel shell and `CardInlineTextEditor` for command editing; the SVG canvas stays render/selection-only and does not introduce prompt dialogs, renderer-local storage, or a second text model.
- Source commits call the existing Markdown document setter, patch the active Source Files row when present, and reuse the workspace source writeback helpers.
- The helper is intentionally tolerant and source-preserving. It does not become a full GitGraph grammar implementation and does not emit GraphData topology.

### Document Version Visualization

- Document version snapshots remain owned by `documentVersioning.ts`; entries may carry optional collaborator metadata without requiring a collaboration backend.
- Document-version graph rendering is owned by `DocumentVersionGitGraphPanel`; BottomPanel placement is owned by `StrybldrTimelineBottomPanel`.
- Document-version Version Graph reuses the same `InteractiveMermaidDiagram` SVG row-key selection path as Mermaid GitGraph and Gantt: version ids are row keys, rendered commit dots/labels are chart targets, unmatched SVG parts dim through the shared SVG runtime, and no proxy version-widget is rendered.
- Editor Workspace `[ ] diff` opens the shared Timeline bottom panel in Version Graph view immediately after `[ ] Markdown` and does not render an inline document notice.
- The bottom Timeline panel exposes Timeline, Version Graph, Flowchart, GitGraph, Architecture, EventModeling, and Gantt as separate controls. The GitGraph control is reserved for typed `mermaid_gitgraph` diagram source.
- MainPanel History stays limited to Chat, History, and Log; it does not render a Docs tab, document-version list, Monaco diff review, or duplicate GitGraph timeline.
- Document version rendering is browser-local and Dev-source only. It does not write review state back to Prod, Cloudflare, GraphData topology, or Mermaid source.

### Typed Mermaid Diagram Panel Rendering

- `mermaidDiagramCode.ts` is the neutral resolver for typed Mermaid diagram source. It scans any parsed frontmatter object for `type: mermaid_flowchart`, `type: mermaid_gitgraph`, `type: mermaid_architecture`, `type: mermaid_eventmodeling`, or `type: mermaid_gantt` with a string `value`, so authoring is not tied to a specific document name, fixture path, or `flow_diagrams` nesting.
- The resolver preserves source precedence: active Markdown frontmatter text is read before parsed graph metadata, and typed entries are read before the legacy top-level `mermaid: |` fallback.
- `MermaidDiagramPanelView` is the shared BottomPanel/FloatingPanel split shell. `renderMode="diagram"` mounts `InteractiveMermaidDiagram`, which renders through the cached Mermaid SVG renderer and then hands the SVG to `useSvgSurfaceZoomRuntime` with a diagram-kind surface key. `renderMode="list"` mounts parsed command/task rows only.
- BottomPanel diagram views annotate the rendered Mermaid SVG with parsed row keys and select rows from direct SVG targets such as commit dots, commit-label backgrounds, branch labels, branch lanes, task bars, task labels, section bands, section/title text, architecture nodes, event-modeling items, and flowchart nodes/edges. The hit-test may tolerate a small near-miss around an annotated SVG target, but it does not add visible proxy row-marker controls or select rows by canvas x-position.
- FloatingPanel diagram views keep parsed rows and any kind-specific row editing without mounting a Mermaid diagram preview.
- BottomPanel and FloatingPanel stay in sync through `mermaidDiagramSelectedRowKeyByKind`; row clicks in FloatingPanel update BottomPanel diagram selection, and direct SVG element clicks in BottomPanel update the FloatingPanel selected row.
- BottomPanel diagram views render their typed frontmatter only. GitGraph does not import, mount, or fallback to the document-version graph panel, and Gantt does not reuse document-version state.
- Canvas View -> Display Controls exposes Flowchart, GitGraph, Architecture, EventModeling, and Gantt beside Timeline. These controls route to `bottomSurfaceTab` / `bottomSurfaceCollapsed`; they must not switch the 2D renderer, mutate layout state, or duplicate panel rendering logic.
- Video-sequence documents declare `kgCanvas2dRenderer: "media"` and render playback sources through `MediaCanvas`. Legacy video-sequence documents that still declare `kgCanvas2dRenderer: "gantt"` normalize to Media at the frontmatter preset boundary. Ordinary non-video Gantt documents still render through `MermaidGanttCanvas` / `InteractiveMermaidDiagram` when the user explicitly selects the Gantt renderer.
- BottomPanel Timeline reuses the Gantt transport owner for source-backed video sequence editing. FloatingPanel Timeline renders the same Gantt-backed sequence as a Mermaid row/list surface only. Cut splits the selected Gantt row at the playhead, Splice moves the selected row to the playhead, Mask inserts a mask operation row, and Grade inserts a grade operation row. Pinch-zoomed timeline rulers must derive bounded multi-step zoom, rounded scale-domain ticks, bar/lane scale parity, and right-side append workspace from shared helpers without changing source-backed scrub or trim math.
- Timeline row lanes are derived from row labels/sections (`video`, `mask`, `grade`, `audio`) through `videoSequenceTimeline.ts`; generated Gantt task metadata stays Mermaid-valid as `task_id, HH:mm, duration` instead of unsupported lane tags. Empty BottomPanel Timeline state renders the neutral sequence editor shell instead of a blank Mermaid-only panel.
- BottomPanel Timeline transport and Media preview playback share the same document transport/controller path. In XR context, `XrTimelineSceneLane` feeds native stage, cast, camera, Scene, and Runtime tasks into the same `GanttTimelineTransportPanel`; the shared transport owns play/pause and scrub state, generated XR rows stay read-only, first-class FloatingPanel Animation remains a control projection, and the retired FloatingPanel XR route must not return.
- Toolbar -> Launch -> Import local files/folder and Import URL detect video sources through shared corpus media inference, keep the actual media as source-unit metadata, and materialize a generated `kgVideoSequenceTimeline` document that opens the Gantt-backed Timeline surface in both BottomPanel and FloatingPanel. Generated imports author video/audio source rows with `kgsrc_*` source ranges only; Mask/Grade and other operation rows are inserted later by Timeline tools, not by import backfill. Local picker video bytes remain session-local object URLs keyed by source metadata; those object URLs are never written into Markdown.
- Direct video URLs are treated as media metadata and are not fetched as webpage text. Generated sequence documents carry `kgVideoSequenceSources` provenance plus typed `flow_diagrams.video_sequence.type: mermaid_gantt` source, so edits remain ordinary Mermaid Gantt source mutations.
- Local absolute-path video imports resolve through `/@fs...` runtime URLs when needed; successful metadata probes stay attached long enough to finish cleanly, and runtime-only probe cleanup must not reintroduce `net::ERR_ABORTED` noise for valid media loads.
- Toolbar -> Canvas View Mode -> `2D Renderer: Media` renders images, videos, audio, webpage iframes, and playable video-sequence sources from the shared rich-media inventory. It is a preview surface only: Timeline remains the source-backed editor for cuts, splices, masks, grades, and transport state, and Gantt flow diagrams remain in BottomPanel/FloatingPanel diagram surfaces.
- Media Canvas, BottomPanel Timeline, FloatingPanel Timeline, and FloatingPanel Media expose dependency-free `data-kg-animation-*` attributes from `timelineAnimationEngine.ts` so CSS, SVG, DOM attributes, JavaScript objects, HTML, Canvas 2D, and WebGL/Three.js animation targets stay source-owned without importing anime.js.
- Shared preview sync and ruler emphasis stay upstream too: selected-row preview alignment, playhead-active family highlights, ruler activity markers, and native animation timing must flow through one preview-sync plan plus shared source-activity helpers instead of BottomPanel/FloatingPanel-local heuristics.
- Edited-media export remains a derived browser-runtime surface only. It compiles the same source-backed sequence plan used by preview/edit, resolves media through shared timeline source/metadata helpers, renders via neutral browser media APIs (`captureStream`, `MediaRecorder`, `createMediaElementSource`), and hands off the output through the shared delayed-revoke blob download helper instead of introducing alternate export-specific source registries or success-path probe cleanup. Shared export progress/cancel semantics belong here too: preparing/rendering/finalizing labels, shared abort detection, active-button cancellation, and the structured `completedSegments`/`totalSegments` payload must reuse the upstream export helper rather than panel-local state or label parsing. Shared export-plan validation belongs there too: empty plans or plans without any positive-duration source range must fail before recorder/runtime work starts. Shared export error taxonomy belongs there too: abort, capability, plan, source, and runtime failures must resolve through shared export error codes/messages plus shared feedback mapping rather than panel-local fallback strings. Shared export outcomes belong there too: downloaded/cancelled/failed results must reuse one structured upstream payload with canonical message, toast kind, filename, and error-code fields. Shared export event telemetry belongs there too: progress events and terminal outcome events must reuse one shared `onEvent` envelope rather than parallel callback shapes. Shared export session history belongs there too: run snapshots must reuse one bounded upstream reducer/history model keyed by run id and filename base rather than surface-local bookkeeping. Shared export retry/replay belongs there too: retry requests must reuse one upstream helper that validates active-export state and current-plan filename-base parity before replaying a previous run. Shared export retry control belongs there too: BottomPanel must surface one latest-session retry control from shared helper output instead of deriving retry copy/state from local button heuristics. Shared export session surface belongs there too: BottomPanel must render recent export rows from a shared session-surface model instead of formatting per-status history entries locally. Shared export session tone/style belongs there too: recent export rows must reuse one upstream helper that maps running/downloaded/cancelled/failed state into semantic tone and style-mode metadata instead of panel-local class decisions. Shared export session selection belongs there too: recent export rows must be chosen through one upstream ordering/filter helper that can prioritize the latest retryable run, keep active runs visible, and filter statuses before applying recency. Export teardown stays centralized too: recorder-stop failure or cancellation must not skip stream-track shutdown, Web Audio disconnect/close, or final video element cleanup.
- The sequence import projection is neutral and data-driven. It must not branch on local validation directories, copied vendor implementations, project filenames, or fixture-specific paths.
- `bottomSurfaceTab: "gitGraph"` is Mermaid-only. Document version control uses `bottomSurfaceTab: "documentVersionGraph"` and is labeled Version Graph in the bottom panel.
- The shared panel path must not backfill static diagrams, regenerate stale templates, or branch on demo filenames.

## YAML Frontmatter Contract

Canonical authoring example:

```yaml
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "gitGraph"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
mermaid: |
  ---
  config:
    theme: base
  ---
  gitGraph:
    commit id:"root" tag:"v1.0"
    branch feature
    checkout feature
    commit id:"feature-a" type:HIGHLIGHT
    checkout main
    merge feature tag:"merge"
```

Coexistence with typed Flow metadata:

```yaml
kgCanvas2dRenderer: "gitGraph"
kgFrontmatterModeEnabled: true
mermaid: |
  gitGraph
    commit id:"root"
    branch feature
    checkout feature
    commit id:"feature-a"
flow:
  direction: {key: direction, type: string, value: "LR"}
  nodes:
    - id: {key: id, type: string, value: "root"}
      type: {key: type, type: string, value: "commit"}
      label: {key: label, type: string, value: "Root"}
```

Combined `flow_diagrams` block for Storyboard Card/Widget diagram surfaces:

```yaml
flow_diagrams:
  key: flow_diagrams
  type: object
  value:
    gitgraph:
      key: gitgraph
      type: mermaid_gitgraph
      floatingPanelView: "gitGraph"
      floatingPanelOpen: true
      bottomPanelTab: "gitGraph"
      bottomPanelOpen: true
      render_on: [flow_editor, storyboard]
      value: |-
        gitGraph
          commit id:"source_input"
          branch research
          checkout research
          commit id:"parallel_review"
          checkout main
          merge research
    gantt:
      key: gantt
      type: mermaid_gantt
      floatingPanelView: "gantt"
      floatingPanelOpen: true
      bottomPanelTab: "gantt"
      bottomPanelOpen: true
      render_on: [flow_editor, storyboard, document_view, timeline_view]
      value: |-
        gantt
          title computing flow
          dateFormat YYYY-MM-DD
          section Critical path
          Source input :done, source_input, 2026-06-05, 1d
          Parallel review :crit, parallel_review, after source_input, 2d
```

The parser treats each entry as source data. When an entry declares both
`floatingPanelView` and `bottomPanelTab`, the parser skips derived
`FlowDiagramSource -> TextGeneration compute -> RichMediaPanel` fallback nodes
for that entry. The FloatingPanel row list and BottomPanel chart read directly
from the typed frontmatter source. Rich Media Panel nodes remain available for
ordinary generated outputs, not for routed diagram records.

## Mermaid GitGraph Syntax Boundary

agentic-graph does not reimplement the GitGraph grammar. It detects the diagram kind and delegates rendering to Mermaid. The supported syntax surface therefore follows Mermaid's GitGraph documentation for declarations and commands such as:

- `gitGraph` or `gitGraph:`
- `commit`
- `branch`
- `checkout` / `switch`
- `merge`
- `cherry-pick`
- optional commit metadata such as `id`, `tag`, and `type`

Mermaid syntax references:

- GitGraph: `https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/docs/syntax/gitgraph.md`
- Gantt: `https://github.com/mermaid-js/mermaid/blob/develop/docs/syntax/gantt.md`

## Out Of Scope

- No Prod mirror sync.
- No Cloudflare deployment.
- No GitGraph-to-GraphData topology expansion.
- No legacy renderer alias remap; renderer frontmatter uses centralized canonical renderer-token resolution.
- No document-specific fixtures or repository-path heuristics.

## Validation

Focused validation completed:

```text
npm --prefix canvas run build:grph-shared
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs -e "import * as t from './src/__tests__/mmdNormalization.test.ts'; t.testReadMermaidDiagramKindDetectsGitGraph(); t.testReadMermaidDiagramKindSkipsMermaidConfigHeader(); t.testSplitMermaidDiagramsKeepsGitGraphSlicesSeparate(); console.log('mmd normalization gitgraph ok')"
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs -e "import * as t from './src/__tests__/mmdNormalization.test.ts'; t.testReadMermaidDiagramKindDetectsGantt(); t.testSplitMermaidDiagramsKeepsGanttSlicesSeparate(); console.log('mmd normalization gantt ok')"
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs -e "import * as t from './src/__tests__/mermaidGanttPanelRouting.test.ts'; t.testTypedMermaidDiagramResolverReadsGitGraphAndGanttFrontmatter(); t.testTypedMermaidDiagramResolverReadsParsedGraphMetadata(); t.testGanttPanelRoutingUsesSharedGitGraphMermaidUtilities(); console.log('mermaid gitgraph gantt panel routing ok')"
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs -e "import * as t from './src/__tests__/canvas3dMode.test.ts'; t.testCanvasViewTimelineToggleUsesSharedViewModeOption(); console.log('canvas view diagram bottom-panel controls ok')"
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs -e "import * as t from './src/__tests__/mermaidFrontmatterRender.test.ts'; (async () => { await t.testMermaidFrontmatterGitGraphPreservesDiagramWithoutFlowchartTopology(); await t.testFrontmatterFlowGitGraphRendererCanReadMermaidMetadata(); console.log('mermaid frontmatter gitgraph ok') })()"
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs -e "import * as t from './src/__tests__/rendererPipelineNeutrality.test.ts'; t.test2dRendererPipelineUsesSharedSurfaceHelpers(); console.log('renderer pipeline gitgraph ok')"
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs -e "import * as t from './src/__tests__/mermaidGitGraphEdit.test.ts'; t.testMermaidGitGraphEditParsesCrudCommandsAndFindsSvgLabel(); t.testMermaidGitGraphEditUpdatesAddsAndDeletesCommands(); t.testMermaidGitGraphEditReplacesYamlMermaidFrontmatterOnly(); t.testMermaidGitGraphEditCreatesFrontmatterWhenMissing(); console.log('gitgraph edit helpers ok')"
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs -e "import * as t from './src/__tests__/zoomViewKeySharedAcross2dRenderers.test.ts'; t.testZoomViewKeyIsIsolatedAcross2dRenderers(); console.log('gitgraph zoom key isolation ok')"
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs -e "(async () => { await import('./src/components/MermaidGitGraphCanvas.tsx'); await import('./src/components/GraphCanvas/hooks/useSvgSurfaceZoomRuntime.ts'); console.log('gitgraph interactive imports ok') })()"
npm --prefix canvas run typecheck
```

## Handoff Notes

- Prod and Cloudflare remain intentionally untouched until explicitly instructed.
- A future publish pass should copy only after Dev validation and should not alter the GitGraph contract.
- Any future GitGraph semantic extraction must be added as a new source-owned parser feature with tests. It must not be layered into the Flowchart parser.
- Inline CRUD is source-text CRUD. It is not a Git repository operation, does not call local `git`, and does not infer history semantics beyond Mermaid command-line transforms.
