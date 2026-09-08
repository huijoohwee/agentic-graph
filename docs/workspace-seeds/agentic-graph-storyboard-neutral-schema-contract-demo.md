---
title: "Agentic Graph Storyboard Neutral Schema Contract Demo"
schema: "agentic-os-computing-flow/v1"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "storyboard"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgWorkflowManagerModeEnabled: true
kgAutoSaveEnabled: true
kgAutoSaveDebounceMs: 1500
kgAutoSaveOn: ["nodeEdit", "runComplete", "approval", "assetReady"]
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
kgSharedRendererContract: {"version": "shared-renderer-contract/v1", "semanticIdentity": "buildScopedGraphSemanticKey", "cardPreview": "CardMediaPreview + CardMarkdownPreview", "widgetCard": "canvas:widgetCard", "richMediaPanel": "RichMediaPanel", "storyboardDisplay": "2D Renderer: Storyboard Card (default) and Widget variants", "storyboardSurfaces": ["Cards", "Widgets", "Rich Media Panels"], "edgeModel": "active graph edges from the selected source graph", "timelineSurface": "TimelineTransportControls + shared bottom-panel surface", "rendererPolicy": "frontmatter and source payloads own data; renderers project view state only"}
flow:
  balancedViewportPreset: {"key": "balancedViewportPreset", "type": "string", "value": "widgetFrontmatter"}
  direction: {"key": "direction", "type": "string", "value": "LR"}
  edgeType: {"key": "edgeType", "type": "string", "value": "smoothstep"}
  snapToGrid: {"key": "snapToGrid", "type": "boolean", "value": true}
  computed: {"key": "computed", "type": "boolean", "value": false}
  nodes:
    - {"id":{"key":"id","type":"string","value":"CONTRACT_ROOT"},"type":{"key":"type","type":"string","value":"Story"},"label":{"key":"label","type":"string","value":"Neutral Schema Contract"},"group":{"key":"group","type":"string","value":"Contract"},"summary":{"key":"summary","type":"string","value":"Minimal storyboard contract fixture for neutral alias validation."},"task":{"key":"task","type":"string","value":"Hold one compact source graph for storyboard schema validation."},"theme":{"key":"theme","type":"string","value":"Neutral"},"tags":{"key":"tags","type":"array","value":["storyboard","contract","neutral"]}}
    - {"id":{"key":"id","type":"string","value":"CONTRACT_A"},"type":{"key":"type","type":"string","value":"Panel"},"label":{"key":"label","type":"string","value":"Alias Group Step"},"group":{"key":"group","type":"string","value":"Backlog"},"step":{"key":"step","type":"number","value":1},"context":{"key":"context","type":"string","value":"Schema Surface"},"state":{"key":"state","type":"string","value":"Pending"},"summary":{"key":"summary","type":"string","value":"Validates `group`, `step`, `context`, and `state`."},"task":{"key":"task","type":"string","value":"Validate action alias parsing through `task`."},"narration":{"key":"narration","type":"string","value":"Speaker: \"Validate neutral aliases.\""},"brief":{"key":"brief","type":"string","value":"Neutral board card for schema validation."},"theme":{"key":"theme","type":"string","value":"Base"},"assets":{"key":"assets","type":"array","value":["https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80"]},"image":{"key":"image","type":"string","value":"https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80"},"documentUrl":{"key":"documentUrl","type":"string","value":"https://airvio.co/agentic-graph"},"priority":{"key":"priority","type":"string","value":"P0"},"order":{"key":"order","type":"number","value":10}}
    - {"id":{"key":"id","type":"string","value":"CONTRACT_B"},"type":{"key":"type","type":"string","value":"Shot"},"label":{"key":"label","type":"string","value":"Alias Category Sequence"},"category":{"key":"category","type":"string","value":"In Review"},"sequenceNumber":{"key":"sequenceNumber","type":"number","value":2},"summary":{"key":"summary","type":"string","value":"Validates `category`, `sequenceNumber`, `workflow`, and `speakerLine`."},"workflow":{"key":"workflow","type":"string","value":"Validate action alias parsing through `workflow`."},"speakerLine":{"key":"speakerLine","type":"string","value":"Reviewer: \"Sequence alias remains stable.\""},"visualBrief":{"key":"visualBrief","type":"string","value":"Minimal visual brief alias coverage."},"variant":{"key":"variant","type":"string","value":"Review"},"referenceLinks":{"key":"referenceLinks","type":"array","value":["https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=1200&q=80"]},"imageUrl":{"key":"imageUrl","type":"string","value":"https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=1200&q=80"},"priority":{"key":"priority","type":"string","value":"P1"},"order":{"key":"order","type":"number","value":20}}
    - {"id":{"key":"id","type":"string","value":"CONTRACT_C"},"type":{"key":"type","type":"string","value":"Frame"},"label":{"key":"label","type":"string","value":"Alias Bucket Position"},"bucket":{"key":"bucket","type":"string","value":"Approved"},"position":{"key":"position","type":"number","value":3},"summary":{"key":"summary","type":"string","value":"Validates `bucket`, `position`, `instructions`, `quote`, `briefUrl`, and `assetRefs`."},"instructions":{"key":"instructions","type":"string","value":"Validate action alias parsing through `instructions`."},"quote":{"key":"quote","type":"string","value":"Lead: \"Approved contract state.\""},"artDirection":{"key":"artDirection","type":"string","value":"Minimal art direction alias coverage."},"preset":{"key":"preset","type":"string","value":"Contract"},"assetRefs":{"key":"assetRefs","type":"array","value":["https://images.unsplash.com/photo-1522542550221-31fd19575a2d?auto=format&fit=crop&w=1200&q=80"]},"videoUrl":{"key":"videoUrl","type":"string","value":"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"},"briefUrl":{"key":"briefUrl","type":"string","value":"https://airvio.co/agentic-graph"},"priority":{"key":"priority","type":"string","value":"P0"},"order":{"key":"order","type":"number","value":30}}
    - {"id":{"key":"id","type":"string","value":"local_brief_input"},"type":{"key":"type","type":"string","value":"InputWidget"},"label":{"key":"label","type":"string","value":"Local review request"},"position":{"key":"position","type":"object","value":{"x":-720,"y":0}},"request":{"key":"request","type":"string","value":"Describe the intended outcome and acceptance criteria."},"canvas:widgetCard":{"key":"canvas:widgetCard","type":"object","value":{"previewField":"request","actions":[{"id":"edit","label":"Edit request","trigger":"openFieldEditor","targetField":"request"}]}},"flow:widgetFormId":{"key":"flow:widgetFormId","type":"string","value":"fm:local_brief_input"},"handles":{"key":"handles","type":"object","value":{"source":["request"]}},"flow:portTypes":{"key":"flow:portTypes","type":"object","value":{"out":{"request":"local_draft_text"}}}}
    - {"id":{"key":"id","type":"string","value":"local_brief_compute"},"type":{"key":"type","type":"string","value":"ComputeWidget"},"label":{"key":"label","type":"string","value":"Schema review"},"position":{"key":"position","type":"object","value":{"x":-360,"y":0}},"handles":{"key":"handles","type":"object","value":{"target":["request"],"source":["output","outputSrcDoc"]}},"flow:portTypes":{"key":"flow:portTypes","type":"object","value":{"in":{"request":"local_draft_text"},"out":{"output":"local_draft_text","outputSrcDoc":"local_draft_text"}}},"flow:widgetFormId":{"key":"flow:widgetFormId","type":"string","value":"fm:local_brief_compute"},"canvas:widgetCard":{"key":"canvas:widgetCard","type":"object","value":{"previewField":"output","actions":[{"id":"run","label":"Prepare local review","trigger":"compute"}]}},"canvas:runAction":{"key":"canvas:runAction","type":"object","value":{"fn":"compute","inputs":["request"],"outputs":["output","text_out","outputSrcDoc","run_status"],"updateBody":false}},"output":{"key":"output","type":"string","value":""},"outputSrcDoc":{"key":"outputSrcDoc","type":"string","value":""},"run_status":{"key":"run_status","type":"string","value":"idle"},"compute":{"key":"compute","type":"string","value":"inputs => { const value=inputs.prompt??inputs.request??inputs.input??''; const supplied=Array.isArray(value)?value.map(v=>String(v??'')).join('\\n'):String(value); const output=\"# Schema review\\n\\nLocal preparation only. Review the supplied facts and source graph. No provider, payment, publication, market research, or external verification has run.\\n\\nOperator input:\\n\"+supplied; const escaped=output.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); return {output,text_out:output,outputSrcDoc:'<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><article><pre style=\"white-space:pre-wrap\">'+escaped+'</pre></article></html>',run_status:'prepared'}; }"}}
  edges:
    - {"id":"edge:contract:a","source":"CONTRACT_ROOT","target":"CONTRACT_A"}
    - {"id":"edge:contract:b","source":"CONTRACT_ROOT","target":"CONTRACT_B"}
    - {"id":"edge:contract:c","source":"CONTRACT_ROOT","target":"CONTRACT_C"}
    - {"id":{"key":"id","type":"string","value":"local-review-request"},"source":{"key":"source","type":"string","value":"local_brief_input"},"sourceHandle":{"key":"sourceHandle","type":"string","value":"request"},"target":{"key":"target","type":"string","value":"local_brief_compute"},"targetHandle":{"key":"targetHandle","type":"string","value":"request"},"type":{"key":"type","type":"string","value":"local_draft_text"}}
modelSelection: {"selectionModel": "projected-data", "scope": "local-overrides-global", "groups": {"text": {"global": "agnes-2.0-flash", "options": ["agnes-2.0-flash", "seed-2-0-mini-260215", "seed-2-0-lite-260228", "seed-2-0-pro-260328", "seed-1-8-251228"]}, "image": {"global": "seedream-4-0-250828", "options": ["seedream-4-0-250828", "seedream-4-5-251128", "seedream-5-0-260128"]}, "video": {"global": "seedance-1-0-pro-fast-251015", "options": ["seedance-1-0-pro-fast-251015", "seedance-1-5-pro-251215", "dreamina-seedance-2-0-fast-260128", "dreamina-seedance-2-0-260128"]}}}
kgParserRoutingContract:
  version: "agentic-graph-parser-routing/v1"
  parserLogic: "opening frontmatter and authored source payloads are SSOT; parsers materialize graphData without renderer-local aliases"
  routingKeys: {"surface": "kgCanvasSurfaceMode", "renderMode": "kgCanvasRenderMode", "renderer": "kgCanvas2dRenderer", "semanticMode": "kgDocumentSemanticMode", "frontmatterMode": "kgFrontmatterModeEnabled", "flowGraph": "flow", "flowNodes": "flow.nodes", "flowEdges": "flow.edges", "mermaidBlocks": "flow_diagrams", "strybldrStoryboard": "kgStrybldrStoryboard"}
  diagramKinds: ["mermaid_flowchart", "mermaid_gitgraph", "mermaid_architecture", "mermaid_eventmodeling", "mermaid_gantt", "frontmatter_flow", "strybldr_storyboard"]
  surfaces: ["2D Renderer: Storyboard", "2D Renderer: Storyboard", "BottomPanel/FloatingPanel Mermaid panels"]
  edgePolicy: "explicit graphData.edges, flow.edges, workflow.edges, and diagram edges are source-owned SSOT; renderers project visible connectors only"
  forkPolicy: "fork, branch, candidate, and publish metadata remain authored source fields and surface through parsed graph edges without downstream remapping"
source_provenance: {"repository": "huijoohwee/joohwee", "revision": "59e920337b5591943f10461d45af6b76ea24e1c5", "path": "huijoohwee-docs/knowgrph-storyboard-neutral-schema-contract-demo.md", "sha256": "9a04f1b27812134c8e13a337348c9811655884b40af5f2716747831ba5535c8b", "restoration": "Source recovery; historical readiness claims require current validation."}
socket_types: {"local_draft_text": {"dataType": "string"}}
local_execution: {"mode": "prepare-only", "paid_calls": 0, "provider_execution": "Separate explicit operator action; generated media and live evidence stay blank."}
---

# Agentic Graph Storyboard Neutral Schema Contract Demo

Use this document to validate the neutral alias contract for the native `2D Renderer: Storyboard` surface.

This fixture keeps `flow.nodes[*]` in normalized `{key, type, value}` form so parser/runtime regression checks cover the typed ingestion path, not just the plain-YAML authoring path.

## Typed Fixture Contract

- This file is an approved typed validation fixture for compact storyboard schema and alias regression coverage.
- The opening YAML frontmatter block remains the first-block machine SSOT for renderer activation and graph-backed storyboard data.
- Normalized `{key, type, value}` envelopes in `flow.nodes[*]` are intentional here so typed ingest -> parse -> render behavior stays validated.
- This document is not the canonical plain-YAML authoring example; canonical authored storyboard docs should still prefer plain YAML for frontmatter and related schema-bearing blocks.
- Parser warning, repair, or fallback behavior is recovery-only; malformed YAML frontmatter still remains invalid source that must be fixed upstream.

## Related Docs

- [Storyboard Demo Index](./agentic-graph-storyboard-demo-index.md)
- [Storyboard Demo](./agentic-graph-storyboard-demo.md)
- [Storyboard Product UI Demo](./agentic-graph-storyboard-product-ui-demo.md)

## Validation Goals

- Confirm the storyboard renderer activates from `kgCanvas2dRenderer: "storyboard"`.
- Confirm `2D Renderer: Storyboard` presents the same source nodes as `Cards` by default and as `Widgets` when Storyboard Display is switched to Widget.
- Confirm Rich Media Panels stay connected to the same Storyboard graph and edge handles instead of becoming detached preview fixtures.
- Confirm minimal neutral alias fields project into the same native storyboard card layout without any renderer-specific schema fork.
- Confirm `group`, `category`, and `bucket` all resolve to lane grouping.
- Confirm `step`, `sequenceNumber`, and `position` all resolve to the frame/index badge.
- Confirm `context` + `state` compose slugline text when no explicit `slugline` is present.
- Confirm `task`, `workflow`, and `instructions` all resolve to the native `Action` block.
- Confirm `narration`, `speakerLine`, and `quote` all resolve to the native `Dialogue` block.
- Confirm `brief`, `visualBrief`, and `artDirection` all resolve to the native `Visual Brief` block.
- Confirm `theme`, `variant`, and `preset` all resolve to the style chip in the visual brief.
- Confirm `assets`, `referenceLinks`, and `assetRefs` all resolve to the native `Reference Pack`.
- Confirm `documentUrl` and `briefUrl` both resolve to the outbound source/brief link.
- Confirm the fixture stays universal, neutral, project-agnostic, and file-agnostic.

## Expected Lanes

- `Backlog` should contain `CONTRACT_A`.
- `In Review` should contain `CONTRACT_B`.
- `Approved` should contain `CONTRACT_C`.

## Expected Card Signals

- `CONTRACT_A` should validate `group`, `step`, `context`, `state`, `task`, `narration`, `brief`, `theme`, `assets`, and `documentUrl`.
- `CONTRACT_B` should validate `category`, `sequenceNumber`, `workflow`, `speakerLine`, `visualBrief`, `variant`, and `referenceLinks`.
- `CONTRACT_C` should validate `bucket`, `position`, `instructions`, `quote`, `artDirection`, `preset`, `assetRefs`, `videoUrl`, and `briefUrl`.

## Fixture Intent

- Keep content minimal so schema coverage stays obvious.
- Prefer alias breadth over narrative depth.
- Use this file as a lightweight regression and manual validation surface for neutral storyboard parsing.
