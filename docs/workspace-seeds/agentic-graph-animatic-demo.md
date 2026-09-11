---
title: "Agentic Graph Gantt-Timeline Demo"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "gantt"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
kgBottomPanelOpen: true
kgBottomPanelTab: "gantt"
kgFloatingPanelOpen: true
kgFloatingPanelView: "gantt"
kgSharedRendererContract: {"version": "shared-renderer-contract/v1", "semanticIdentity": "buildScopedGraphSemanticKey", "cardPreview": "CardMediaPreview + CardMarkdownPreview", "widgetCard": "canvas:widgetCard", "richMediaPanel": "RichMediaPanel", "storyboardDisplay": "2D Renderer: Storyboard Card (default) and Widget variants", "storyboardSurfaces": ["Cards", "Widgets", "Rich Media Panels"], "edgeModel": "active graph edges from the selected source graph", "timelineSurface": "TimelineTransportControls + shared bottom-panel surface", "rendererPolicy": "frontmatter and source payloads own data; renderers project view state only"}
socket_types: {"gantt_timeline_signal": {"color": "#14b8a6", "edgeWidthPx": 2, "handleStrokeWidthPx": 2, "accepts": ["gantt_timeline_signal"]}}
flow:
  direction: "LR"
  edgeType: "smoothstep"
  balancedViewportPreset: "widgetFrontmatter"
  computed: true
  snapToGrid: true
  nodes:
    - {"id":"GANTT_TIMELINE_SOURCE","type":"FlowDiagramSource","label":"HH:mm Gantt source","position":{"x":0,"y":0},"handles":{"source":["output"]},"flow:portTypes":{"out":{"output":"gantt_timeline_signal"}},"frontmatter:primitive":"node"}
    - {"id":"GANTT_TIMELINE_CANVAS","type":"MermaidGanttTimeline","label":"Canvas 2D Renderer: Gantt-timeline","position":{"x":380,"y":-120},"handles":{"target":["input"]},"flow:portTypes":{"in":{"input":"gantt_timeline_signal"}},"frontmatter:primitive":"node"}
    - {"id":"GANTT_TIMELINE_BOTTOM_PANEL","type":"BottomPanel","label":"BottomPanel Gantt-Timeline","position":{"x":380,"y":120},"handles":{"target":["input"]},"flow:portTypes":{"in":{"input":"gantt_timeline_signal"}},"frontmatter:primitive":"node"}
    - {"id":"GANTT_TIMELINE_FLOATING_PANEL","type":"FloatingPanel","label":"FloatingPanel Gantt-Timeline","position":{"x":760,"y":0},"handles":{"target":["input"]},"flow:portTypes":{"in":{"input":"gantt_timeline_signal"}},"frontmatter:primitive":"node"}
  edges:
    - {"id":"edge:gantt_timeline:source_canvas","source":"GANTT_TIMELINE_SOURCE","sourceHandle":"output","target":"GANTT_TIMELINE_CANVAS","targetHandle":"input","type":"gantt_timeline_signal"}
    - {"id":"edge:gantt_timeline:source_bottom","source":"GANTT_TIMELINE_SOURCE","sourceHandle":"output","target":"GANTT_TIMELINE_BOTTOM_PANEL","targetHandle":"input","type":"gantt_timeline_signal"}
    - {"id":"edge:gantt_timeline:source_floating","source":"GANTT_TIMELINE_SOURCE","sourceHandle":"output","target":"GANTT_TIMELINE_FLOATING_PANEL","targetHandle":"input","type":"gantt_timeline_signal"}
flow_diagrams: {"gantt_timeline": {"key": "gantt_timeline", "type": "mermaid_gantt", "floatingPanelView": "gantt", "floatingPanelOpen": true, "bottomPanelTab": "gantt", "bottomPanelOpen": true, "title": "Gantt-Timeline HH:mm markers", "value": "gantt\n    dateFormat HH:mm\n    axisFormat %H:%M\n    Initial vert : vert, v1, 17:30, 2m\n    Task A : 3m\n    Task B : 8m\n    Final vert : vert, v2, 17:58, 4m"}}
modelSelection: {"selectionModel": "projected-data", "scope": "local-overrides-global", "groups": {"text": {"global": "agnes-2.0-flash", "options": ["agnes-2.0-flash", "seed-2-0-mini-260215", "seed-2-0-lite-260228", "seed-2-0-pro-260328", "seed-1-8-251228"]}, "image": {"global": "seedream-4-0-250828", "options": ["seedream-4-0-250828", "seedream-4-5-251128", "seedream-5-0-260128"]}, "video": {"global": "seedance-1-0-pro-fast-251015", "options": ["seedance-1-0-pro-fast-251015", "seedance-1-5-pro-251215", "dreamina-seedance-2-0-fast-260128", "dreamina-seedance-2-0-260128"]}}}
kgParserRoutingContract: {"version": "agentic-graph-parser-routing/v1", "parserLogic": "opening frontmatter and authored source payloads are SSOT; parsers materialize graphData without renderer-local aliases", "routingKeys": {"surface": "kgCanvasSurfaceMode", "renderMode": "kgCanvasRenderMode", "renderer": "kgCanvas2dRenderer", "semanticMode": "kgDocumentSemanticMode", "frontmatterMode": "kgFrontmatterModeEnabled", "flowGraph": "flow", "flowNodes": "flow.nodes", "flowEdges": "flow.edges", "mermaidBlocks": "flow_diagrams", "strybldrStoryboard": "kgStrybldrStoryboard"}, "diagramKinds": ["mermaid_flowchart", "mermaid_gitgraph", "mermaid_architecture", "mermaid_eventmodeling", "mermaid_gantt", "frontmatter_flow", "strybldr_storyboard"], "surfaces": ["2D Renderer: Storyboard", "2D Renderer: Storyboard", "BottomPanel/FloatingPanel Mermaid panels"], "edgePolicy": "explicit graphData.edges, flow.edges, workflow.edges, and diagram edges are source-owned SSOT; renderers project visible connectors only", "forkPolicy": "fork, branch, candidate, and publish metadata remain authored source fields and surface through parsed graph edges without downstream remapping"}
source_provenance: {"repository": "huijoohwee/joohwee", "revision": "59e920337b5591943f10461d45af6b76ea24e1c5", "path": "huijoohwee-docs/agentic-graph-animatic-demo.md", "sha256": "1947ffda66959937c69f3bb7d9b0f95dfe3416f5128b2cf9518c668d8451b5a2", "restoration": "Source recovery; historical readiness claims require current validation."}
---

# Agentic Graph Gantt-Timeline Demo

## Response

Canvas `2D Renderer: Gantt-timeline`, BottomPanel `Gantt-Timeline`, and FloatingPanel `Gantt-Timeline` read the same typed Mermaid Gantt source from frontmatter.

The chart uses `HH:mm` task timing, `%H:%M` axis labels, and vertical marker rows so selection can move through the same shared row-key state across all three surfaces.

## Dynamic Input Tokens

- `dateFormat`: `HH:mm`
- `axisFormat`: `%H:%M`
- `initial_marker`: `Initial vert`
- `task_a`: `Task A`
- `task_b`: `Task B`
- `final_marker`: `Final vert`

## Mermaid Source

```mermaid
gantt
    dateFormat HH:mm
    axisFormat %H:%M
    Initial vert : vert, v1, 17:30, 2m
    Task A : 3m
    Task B : 8m
    Final vert : vert, v2, 17:58, 4m
```
