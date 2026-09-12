---
title: "agentic-graph Design Canvas Editor PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.3.1"
date: "2026-09-12"
lang: "en-US"
owner: "Documentation maintainers"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-DESIGN-EDITOR-BASELINE-PRD-TAD-ADR-MVP-GTM"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.3.0"
prd_revision: "0.3.1"
tad_revision: "0.3.1"
adr_revision: "0.3.1"
mvp_revision: "0.3.1"
gtm_revision: "0.3.1"
---

# agentic-graph Design Canvas Editor PRD-TAD-ADR-MVP-GTM

**Document Version**: 0.3.0  
**Date**: 2026-05-29  
**Status**: Accepted and implemented Design editor baseline

## Document Purpose

Design editor baseline is implemented natively in agentic-graph. This document records the product and technical contract for the in-repo Design editor surface that was originally scoped from a reference-editor mental model: a focused canvas, explicit tools, layers, inspector, tokens, DOM context, and reversible layout edits. The reference is directional only; the implementation owns its behavior in agentic-graph source files and does not import external editor code, fixtures, or assets.

The shipped baseline keeps renderer semantics neutral. Design editing operates on Design-owned view state, Design-only history, existing canvas pointer modes, and shared semantic-key helpers. It does not remap old aliases, layer local patches over downstream UI, or mutate graph topology to represent presentational frame edits.

## Implemented Product Contract

| Capability | Status | Source owner |
|------------|--------|--------------|
| MainPanel Design tab | Shipped | `canvas/src/features/panels/mainPanelTabs.ts`; `canvas/src/features/panels/MainPanel.tsx`; `canvas/src/features/panels/views/DesignEditorMainPanelView.tsx` |
| Design canvas render shell | Shipped | `canvas/src/components/DesignCanvas.tsx`; `canvas/src/components/DesignCanvas/DesignCanvasRenderShell.tsx` |
| Editor chrome | Shipped | `canvas/src/components/DesignCanvas/DesignCanvasEditorChrome.tsx` |
| Pointer modes, fit-to-view, undo, redo | Shipped | `canvas/src/components/DesignCanvas/DesignCanvasEditorChrome.tsx`; `canvas/src/features/design/DesignFloatingPanelView.tsx` |
| Move and resize operation commits | Shipped | `canvas/src/components/DesignCanvas/useFrameDragController.ts`; `canvas/src/components/DesignCanvas/useResizeMarqueeController.ts` |
| Layers, Style, tokens, DOM tree, DOM inspect panels | Shipped | `canvas/src/features/design/DesignFloatingPanelView.tsx`; `canvas/src/features/design/DesignLayersPanel.tsx`; `canvas/src/features/design/DesignInspectorPanel.tsx`; `canvas/src/features/design/DesignTokensPanel.tsx`; `canvas/src/features/design/DesignDomTreePanel.tsx`; `canvas/src/features/design/DesignDomInspectPanel.tsx` |
| Agent-native HTML video render | Shipped | `canvas/src/features/design/designAgentVideoSpec.ts`; `canvas/src/features/design/DesignAgentVideoPanel.tsx`; `canvas/src/features/html-video-renderer/*` |
| Design-only history | Shipped | `canvas/src/hooks/store/designHistorySlice.ts`; `canvas/src/hooks/store/store-types/graph-state-design-history.ts` |
| Design launch and Import URL activation | Shipped | `canvas/src/features/design/designEditorLaunchState.ts`; `canvas/src/__tests__/designEditorIntegrationRegression.test.ts` |
| Layer state and token summaries | Shipped | `canvas/src/features/design/designLayersState.ts`; `canvas/src/features/design/designTokenSummary.ts` |

## User Outcomes

| User | Need | Implemented behavior |
|------|------|----------------------|
| Knowledge curator | Arrange graph-derived frames into a readable canvas | Design mode supports frame selection, movement, resize, layers, and inspector controls without changing canonical graph topology. |
| Research analyst | Reopen and refine visual layouts | Design state is scoped by graph metadata and committed through Design-owned store actions. |
| Builder | Extend Design editor behavior without duplicate state paths | MainPanel, floating panel, render shell, controllers, and store history expose source-owned contracts covered by registry tests. |

## Functional Requirements

### FR-1: Dedicated Design Surface

The Design editor is reachable through the MainPanel Design tab and through Design renderer activation paths. `DesignEditorMainPanelView` reuses `DesignFloatingPanelView`, so the MainPanel and floating panel share the same overview, Layers, Style, token, DOM tree, DOM inspect, and Video behavior.

Acceptance:

- `mainPanelTabs.ts` defines `key: 'design'`.
- `MainPanel.tsx` lazy-loads `DesignEditorMainPanelView`.
- `DesignEditorMainPanelView.tsx` delegates to `DesignFloatingPanelView`.

### FR-2: Editor Chrome and Tooling

The canvas render shell mounts `DesignCanvasEditorChrome` when Design is active. The chrome exposes select, pan, undo, redo, and fit-to-view affordances through existing store actions, preserving one owner for pointer mode and viewport behavior.

Acceptance:

- `DesignCanvasRenderShell.tsx` mounts `DesignCanvasEditorChrome`.
- `DesignCanvasEditorChrome.tsx` calls `setCanvasPointerMode2d`, `undoDesignHistory`, `redoDesignHistory`, and `dispatchRuntimeFitToViewSoon`.
- The floating panel exposes matching viewport and shortcut actions without creating an alternate command path.

### FR-3: Move and Resize Commit Boundaries

Frame movement and resizing preview during pointer gestures and commit once per completed operation. The drag controller commits position patches through `commitDesignFramePosHistory`; the resize controller commits rectangle patches through `commitDesignFrameRectHistory`.

Acceptance:

- `useFrameDragController.ts` commits move operations with `commitDesignFramePosHistory`.
- `useResizeMarqueeController.ts` commits resize operations with `commitDesignFrameRectHistory`.
- Store writes are operation-level commits, not pointer-move recomputation loops.

### FR-4: Design-Only History

Design frame position, frame size, and layer state edits are reversible through Design-owned history commands. Undo and redo operate on Design state and do not rewrite canonical graph data.

Acceptance:

- `designHistorySlice.ts` owns `undoDesignHistory`, `redoDesignHistory`, `commitDesignFrameRectHistory`, `commitDesignFramePosHistory`, and `commitDesignLayerStateHistory`.
- `DesignLayersPanel.tsx` records layer visibility and ordering changes through `commitDesignLayerStateHistory`.
- `DesignInspectorPanel.tsx` records numeric frame edits through `commitDesignFrameRectHistory`.

### FR-5: Semantic-Keyed Token Summaries

Design token summaries reuse the shared semantic-key helper. Token summary caching is scoped by graph metadata and token inputs, avoiding ad-hoc cache keys and redundant derivation.

Acceptance:

- `designTokenSummary.ts` calls `buildScopedGraphSemanticKey('design-token-summary'`.
- `designEditorSurfaceRegression.test.ts` verifies shared semantic-key helper usage.
- `designTokenSummary.test.ts` covers extraction and semantic cache behavior.

### FR-6: Agent-Native HTML Video Render

The Design Video panel can derive a programmatic HTML-video render from the active graph. `designAgentVideoSpec.ts` converts selected or visible Design layers into semantic HTML, scoped CSS motion, seekable composition data attributes, virtual workspace files, composition rows, source-derived assets, timeline lanes, and structured data, then `DesignAgentVideoPanel.tsx` sends the generated HTML-video renderer node through the existing runtime-registered engine path. The shipped browser runtime can render MP4 through the `canvas-2d` adapter when supported by the browser; no hardcoded fallback engine is allowed.

Acceptance:

- `designAgentVideoSpec.ts` calls `buildScopedGraphSemanticKey('design-agent-video'` and reuses `summarizeDesignTokens`.
- `DesignAgentVideoPanel.tsx` calls `createHtmlVideoEngineRegistryFromRuntimeConfig()` and `runHtmlVideoFlowNode`.
- `designAgentVideoWorkspace.test.ts` verifies semantic HTML, deterministic motion CSS, virtual workspace/composition/asset/timeline metadata, timeline `data-start` / `data-duration` / `data-track-index` markers, generated `video/mp4` preview state, and no copied upstream design engine path.

## Technical Architecture

```mermaid
flowchart LR
  A["MainPanel Design tab"] --> B["DesignEditorMainPanelView"]
  C["Design renderer"] --> D["DesignCanvasRenderShell"]
  B --> E["DesignFloatingPanelView"]
  D --> F["DesignCanvasEditorChrome"]
  D --> G["Drag and resize controllers"]
  E --> H["Layers / Style / Tokens / DOM panels"]
  G --> I["designHistorySlice"]
  H --> I
  H --> J["designTokenSummary"]
  J --> K["buildScopedGraphSemanticKey"]
  E --> L["designAgentVideoSpec"]
  L --> M["HTML-video renderer runtime registry"]
```

### Source Ownership

| Layer | Owner | Contract |
|-------|-------|----------|
| MainPanel registration | `canvas/src/features/panels/mainPanelTabs.ts` | Defines the Design tab identity. |
| MainPanel mounting | `canvas/src/features/panels/MainPanel.tsx` | Lazy-loads the Design editor panel. |
| MainPanel view | `canvas/src/features/panels/views/DesignEditorMainPanelView.tsx` | Reuses the shared Design floating panel. |
| Canvas root | `canvas/src/components/DesignCanvas.tsx` | Wires frame edit operations into Design history actions. |
| Render shell | `canvas/src/components/DesignCanvas/DesignCanvasRenderShell.tsx` | Mounts editor chrome with selected and layer counts. |
| Editor chrome | `canvas/src/components/DesignCanvas/DesignCanvasEditorChrome.tsx` | Exposes existing pointer, undo, redo, and fit actions. |
| Move controller | `canvas/src/components/DesignCanvas/useFrameDragController.ts` | Commits move operations once per gesture. |
| Resize controller | `canvas/src/components/DesignCanvas/useResizeMarqueeController.ts` | Commits resize operations once per gesture. |
| Panel shell | `canvas/src/features/design/DesignFloatingPanelView.tsx` | Hosts overview, Layers, Style, Tokens, DOM Tree, DOM Inspect, and Video workspace tabs. |
| Layers | `canvas/src/features/design/DesignLayersPanel.tsx`; `canvas/src/features/design/designLayersState.ts` | Owns layer visibility and ordering behavior. |
| Inspector | `canvas/src/features/design/DesignInspectorPanel.tsx` | Owns numeric frame edits. |
| Tokens | `canvas/src/features/design/DesignTokensPanel.tsx`; `canvas/src/features/design/designTokenSummary.ts` | Owns token extraction and semantic-keyed cache. |
| DOM context | `canvas/src/features/design/DesignDomTreePanel.tsx`; `canvas/src/features/design/DesignDomInspectPanel.tsx` | Owns DOM context display for Design workflows. |
| Agent video | `canvas/src/features/design/designAgentVideoSpec.ts`; `canvas/src/features/design/DesignAgentVideoPanel.tsx`; `canvas/src/features/html-video-renderer/*` | Owns graph-derived HTML/CSS/data render specs and MP4 generation through registered runtime adapters. |
| Design history | `canvas/src/hooks/store/designHistorySlice.ts`; `canvas/src/hooks/store/store-types/graph-state-design-history.ts` | Owns reversible Design-only commands. |

### State and Data Flow

1. The user opens the Design tab or activates the Design renderer.
2. `DesignEditorMainPanelView` and `DesignFloatingPanelView` render shared Design controls.
3. `DesignCanvasRenderShell` mounts `DesignCanvasEditorChrome` on the active canvas.
4. Drag, resize, inspector, and layer interactions preview through the UI and commit through Design history actions.
5. Token summaries use `buildScopedGraphSemanticKey('design-token-summary'` for stable cache identity.
6. Design video specs use `buildScopedGraphSemanticKey('design-agent-video'` and reuse token summaries for stable render identity.
7. Renderer output remains derived from graph data plus Design-scoped view state.

## Implementation Boundaries

Implemented:

- MainPanel Design tab.
- Shared Design floating panel and MainPanel view.
- Canvas editor chrome for select, pan, undo, redo, fit-to-view, selected count, and layer count.
- Design-only move, resize, layer, and inspector history commits.
- Token summary extraction using the shared semantic-key helper.
- DOM tree and DOM inspect panels for Design context.
- Import URL path that can activate the shared Design surface.
- HTML-video render action in the Design overview that derives source-owned semantic HTML/CSS/data and renders MP4 through registered runtime adapters.

Out of scope for this baseline:

- Importing external OpenPencil code, assets, schemas, or runtime behavior.
- Full vector design-suite parity beyond agentic-graph frame, layer, token, and DOM workflows.
- External design-file import/export.
- Collaborative Design operation transport.
- Replacing the existing renderer backend.

Planned extension boundary:

- Any future collaborative Design operations must add source owners and tests before this document can mark them implemented.
- Any future external design-file import/export must keep conversion in a dedicated source owner and preserve graph semantics.
- Any future advanced vector tools must commit through Design history and reuse shared semantic keys for derived caches.

## Validation Contract

Run these focused checks after editing Design owners or this document:

```bash
npm --prefix canvas run test:ci:unit -- "design.editor.prdTad"
npm --prefix canvas run test:ci:unit -- "design.editor.surface"
npm --prefix canvas run test:ci:unit -- "design.editor.agentVideo"
npm --prefix canvas run test:ci:unit -- "design.layers"
npm run hygiene:check
npm --prefix canvas exec tsc -- -p canvas/tsconfig.json --noEmit --pretty false
```

The registry guard `design.editor.prdTad.implementedOwners` requires this PRD/TAD to stay aligned with implemented Design source owners and rejects proposed-only language for shipped behavior.

## ADR: retain Design-owned history and shared canvas controls

Keep presentational edits in Design-owned view state and history, with operation-level commits through the existing pointer and viewport owners. Encoding frame edits as graph topology or adding a second input controller would couple presentation to canonical data and create conflicting undo behavior. Shared semantic-key helpers continue to own derived identity. This records the implemented boundary; future collaboration or external-format support still needs its own source changes and validation.

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-DESIGN-EDITOR-BASELINE-PRD-TAD-ADR-MVP-GTM@0.3.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Functional Requirements](agentic-graph-design-editor-baseline-prd-tad-adr-mvp-gtm.md#functional-requirements) |
| TAD | [Technical Architecture](agentic-graph-design-editor-baseline-prd-tad-adr-mvp-gtm.md#technical-architecture) |
| ADR | [ADR: retain Design-owned history and shared canvas controls](agentic-graph-design-editor-baseline-prd-tad-adr-mvp-gtm.md#adr-retain-design-owned-history-and-shared-canvas-controls) |
| MVP | [MVP — reference implementation](agentic-graph-design-editor-baseline-prd-tad-adr-mvp-gtm.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-design-editor-baseline-prd-tad-adr-mvp-gtm.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/features/panels/mainPanelTabs.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/panels/mainPanelTabs.ts), [`canvas/src/features/panels/MainPanel.tsx`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/panels/MainPanel.tsx), [`canvas/src/features/panels/views/DesignEditorMainPanelView.tsx`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/panels/views/DesignEditorMainPanelView.tsx). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
