---
title: "Reference implementation: agentic-graph Design Document"
id: "md:agentic-graph-design-document"
doc_type: "Generated Registry Surface"
version: "1.0.2"
date: "2026-07-30"
lang: "en-US"
owner: "docs.generated.design-registry"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
guideline_version: "1.7.0"
doc_path: "docs/agentic-graph-design-document.md"
canonical_docs_root: "docs/documents"
generator_owner: "canvas/src/cli/lint-doc.ts"
---

# Reference implementation: agentic-graph Design Document

## Generated Registry Contract

- The opening YAML frontmatter block remains the first-block machine SSOT for this design registry surface's generated status, canonical owner path, and generator ownership.
- This file is an auto-generated registry/index surface, not the canonical authored design document.
- Canonical design prose and behavior ownership live under `docs/documents/`; update the source docs or generator inputs there instead of hand-authoring this registry surface.
- Registry rows must remain generator-owned output from `canvas/src/cli/lint-doc.ts`, not a parallel authoring surface or validation fixture.
- Runtime or documentation decisions must never be inferred from stale generated rows when the canonical authored docs disagree; fix the upstream source and regenerate.

Canonical design documentation lives in `docs/documents/agentic-graph-design-document.md`.

This root document exists as the auto-generated table surface used by `canvas/src/cli/lint-doc.ts`.

## Orchestrator Sections

<!-- ORCHESTRATOR_SECTIONS_TABLE_START -->

| Section ID | Label | Storage Key | Owner |
| ---------- | ----- | ----------- | ----- |
| graphRag | GraphRAG Workflow (AgenticRAG) | kg:orchestrator:graphRagCollapsed | orchestrator.prefs |
| presets | Traversal presets and helpers | kg:orchestrator:presetsCollapsed | orchestrator.prefs |
| editor | Traversal editor and layers | kg:orchestrator:editorCollapsed | orchestrator.prefs |
| context | AgenticRAG context and ignore filters | kg:orchestrator:contextCollapsed | orchestrator.prefs |
| workflowIndexing | Indexing parameters | kg:orchestrator:workflow:indexingCollapsed | orchestrator.prefs |
| workflowTracing | Tracing options | kg:orchestrator:workflow:tracingCollapsed | orchestrator.prefs |

<!-- ORCHESTRATOR_SECTIONS_TABLE_END -->

## Render Sections

<!-- RENDER_SECTIONS_TABLE_START -->

| Section ID | Label | Storage Key | Owner |
| ---------- | ----- | ----------- | ----- |
| renderPresets | Render presets and tuning | kg:render:presetsCollapsed | render.prefs |
| datasetInspector | Dataset inspector | kg:render:datasetInspectorCollapsed | render.prefs |
| codebaseIndexPipeline | Codebase index pipeline | kg:render:codebaseIndexCollapsed | render.prefs |
| threeLinks | Renderer: edges and particles | kg:render:three:linksCollapsed | render.prefs |
| threeLayout | Renderer: layout and geometry | kg:render:three:layoutCollapsed | render.prefs |
| threeBackgroundFog | Renderer: background and fog | kg:render:three:backgroundFogCollapsed | render.prefs |
| threeStarfield | Renderer: starfield and depth | kg:render:three:starfieldCollapsed | render.prefs |
| threeCamera | Renderer: camera and motion | kg:render:three:cameraCollapsed | render.prefs |
| threeSelection | Renderer: selection highlighting | kg:render:three:selectionCollapsed | render.prefs |

<!-- RENDER_SECTIONS_TABLE_END -->

## Verification Condition

| VCC | Condition | Invocable check | Expected result | Evidence |
|---|---|---|---|---|
| `VCC-GEN-DESIGN-01` | Generated orchestrator and render rows exactly match their source registries. | `npm --prefix canvas run doc:lint && npm --prefix canvas run doc:sanity` | Regeneration is idempotent and both registry counts report `status=OK`. | None recorded in this document |
