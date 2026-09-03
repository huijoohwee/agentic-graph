---
title: "agentic-graph Mobile-First Enhancement Plan"
doc_type: "Implementation Plan"
status: "active"
lang: "en-US"
frontmatter_contract: "required"
---

# agentic-graph Mobile-First Enhancement Plan

## Authoring Contract

- The opening YAML frontmatter block remains the first-block metadata SSOT for this plan.
- This document is a canonical upstream implementation plan, not a generated publish artifact or runtime contract.
- Mobile-first enhancements must be implemented in Dev owners first, then mirrored to Prod artifacts and Cloudflare only through the normal publish path.
- This plan assumes the current no-code constraint; it defines source-owned priorities, acceptance criteria, and verification targets without mutating runtime code directly.

## Scope

This plan converts the current mobile-first design intent into a focused execution queue for:

- `$GITHUB_ROOT/agentic-graph`
- `$GITHUB_ROOT/huijoohwee/content/agentic-graph`
- `airvio.co/agentic-graph`

The goal is not broad redesign. The goal is higher mobile time-to-value for the existing orchestration stack, especially:

- Agent-ready `/`, `#`, and `@` invocation reachability
- Touch-safe canvas and workspace interaction
- Lower mobile transfer, CPU, and memory cost
- Repeatable proof through harness and release discipline

## Priority Order

1. Grammar reachability
2. Heavy-runtime gating
3. Virtual-keyboard safety
4. Workflow evidence and budgets
5. Publish parity

This order follows startup ROI: reduce input friction first, then keep mobile sessions light, then lock in proof so future changes do not drift.

## Enhancement Queue

### 1. Grammar Quick Bar

**Why**

Mobile keyboards make `/`, `#`, and `@` slower to reach than plain text. That adds friction at the exact point where Agentic Canvas OS wants fast invocation.

**Recommendation**

- Add one source-owned mobile grammar quick bar for `/`, `#`, and `@`.
- Dock it in the same safe-area-aware thumb zone already used by the mobile toolbar direction.
- Reuse one shared trigger contract across FloatingPanel Chat UI, Editor Workspace, and any controlled command composer.

**Implementation status**

- Implemented in source-owned edit surfaces: FloatingPanel Chat, inline Markdown block editing, and the Editor Workspace Markdown editor.
- Browser smoke now covers the shared chat composer, inline Markdown block editing, and the main Editor Workspace Markdown editor on the dedicated mobile-keyboard route.
- The remaining gap is expanding that proof to additional mobile edit surfaces beyond the current shared owners.

**Source owners**

- `agentic-graph/canvas/src/pages/Canvas.tsx`
- `agentic-graph/canvas/src/styles/responsive-toolbar.css`
- `agentic-graph/canvas/src/features/chat/**`
- `agentic-graph/canvas/src/features/markdown-workspace/**`

**Acceptance target**

- A mobile user can begin a slash, hash, or at-sign invocation in one tap without keyboard pane switching.

### 2. Heavy-Runtime Mobile Gating

**Why**

The current feature map already shows the main mobile cost centers clearly: Monaco, Mermaid plus ELK, MapLibre, and Three.

**Recommendation**

- Treat those runtimes as explicit-intent features on mobile.
- Keep default mobile entry routes on the lean shell and defer heavy activation until the user opens the feature.
- Prefer a static preview, placeholder, or summary state before full runtime hydration when the workflow allows it.

**Source owners**

- `agentic-graph/docs/documents/agentic-graph-feature-map.md`
- `agentic-graph/canvas/src/components/CanvasViewport.tsx`
- `agentic-graph/canvas/src/features/markdown/**`
- `agentic-graph/canvas/src/features/three/**`
- `agentic-graph/canvas/src/features/maps/**`

**Implementation status**

- `CanvasViewport` now treats 3D and geospatial viewport ownership as explicit-intent runtimes on touch viewports.
- On mobile and coarse-pointer devices, the viewport keeps a lightweight activation card in place until the user explicitly loads the 3D or map surface.
- Shared Markdown Mermaid rendering now stays behind the visibility gate and requires an explicit tap to hydrate once the diagram enters a touch viewport.
- The dedicated mobile browser smoke route now verifies the chat/workspace quick bars, the 3D/map activation cards, and the Mermaid touch placeholder on a real mobile viewport.
- Editable Markdown workspace panes now keep Monaco behind the existing plain-text fallback on touch viewports until the user explicitly loads the rich editor runtime.
- The same mobile Monaco gate is now browser-proven for the secondary JSON editor path, including fallback editing before rich-editor activation.
- Schema-editor serialization Monaco surfaces now follow the same touch activation gate, and the shared mobile smoke route now mounts that source-owned harness section with the serialization subsection expanded by default so the browser proof remains deterministic on fresh mobile sessions.

**Acceptance target**

- Common phone entry flows do not load Monaco, Mermaid+ELK, MapLibre, or Three unless the user explicitly asks for those surfaces.

### 3. Virtual-Keyboard Proof Contract

**Why**

The goal contract already forbids keyboard overlap, scroll traps, and hidden controls, but the proof should be explicit and repeatable.

**Recommendation**

- Extend the responsive proof path with a mobile keyboard state.
- Simulate viewport-height loss during chat streaming and workspace editing.
- Verify that input, recent context, primary action controls, and one visible recovery path remain reachable.

**Source owners**

- `agentic-graph/agentic_graph_parser/superagent_responsive.py`
- `agentic-graph/agentic_graph_parser/superagent_harness_test.py`
- `agentic-graph/docs/documents/agentic-graph-superagent-harness.md`
- `agentic-graph/docs/documents/agentic-graph-testing-document.md`

**Acceptance target**

- Mobile proof classes stay usable when the virtual keyboard is open and streamed output updates are still arriving.

### 4. Route-And-Action Mobile Evidence

**Why**

Bundle size alone is not enough. The useful question is which mobile journeys trigger expensive work and whether that work is necessary immediately.

**Recommendation**

- Maintain one route-and-action matrix for the top mobile workflows.
- Record which user action triggers each heavy chunk family.
- Mark each feature as immediate, deferred, or fallback-safe on phones.

**Source owners**

- `agentic-graph/docs/documents/agentic-graph-feature-map.md`
- `agentic-graph/docs/documents/agentic-graph-ui-ux-design-document.md`
- `agentic-graph/docs/documents/agentic-graph-cross-repo-publish-topology.md`

**Acceptance target**

- Mobile performance decisions are driven by workflow evidence instead of one-off intuition.

### 5. Dev -> Prod -> Cloudflare Responsive Parity

**Why**

Mobile fixes lose value when they only exist in one surface or are patched downstream.

**Recommendation**

- Keep responsive behavior source-owned in Dev.
- Mirror only generated artifacts into Prod.
- Treat responsive proof as an explicit release gate before publish parity claims.
- Block `pages:deploy-cloudflare` when the mobile keyboard proof, route-and-action matrix, or publish sync proof is missing.

**Source owners**

- `agentic-graph/goal.md`
- `agentic-graph/docs/documents/agentic-graph-cross-repo-publish-topology.md`
- `huijoohwee.github.io/schema/AgenticRAG/README.md`

**Acceptance target**

- Mobile behavior described upstream matches the published route and schema mirror without route-specific downstream patches.

**Implementation status**

- The canonical route-and-action matrix now lives in `docs/documents/agentic-graph-feature-map.md`.
- The focused mobile keyboard browser smoke already proves the touch-first keyboard lane.
- The remaining cleanup is making those proofs an explicit publish blocker in the cross-repo release contract instead of leaving them as implied operator discipline.

## Release Gate Checklist

- Mobile grammar entry is reachable without symbol-pane switching.
- Default phone flows stay on the lean shell.
- Heavy feature families remain explicit-intent on phones.
- Virtual-keyboard proof covers chat and workspace surfaces.
- Mobile, tablet, desktop, and wide proof classes stay documented in one upstream path.
- Publish and schema mirrors describe only validated upstream behavior.
- `pages:check-sync` passes before publish.
- The route-and-action matrix and mobile keyboard smoke are reviewed together before `pages:deploy-cloudflare`.

## Deferred Until Code Edits Are Allowed

- Mobile-specific preview surfaces for Mermaid, maps, or 3D
- Browser-smoke automation for the quick bar and mobile fallback states
- Route-level runtime gating changes in canvas owners

These remain the next execution slice once the no-code boundary is lifted.

## Companion Documents

- `docs/documents/agentic-graph-ui-ux-design-document.md`
- `docs/documents/agentic-graph-feature-map.md`
- `docs/documents/agentic-graph-cross-repo-publish-topology.md`
- `docs/documents/agentic-graph-superagent-harness.md`
- `docs/documents/agentic-graph-testing-document.md`
