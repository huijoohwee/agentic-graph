# AgenticGraph Graph Data Curation (singabldr Extraction)

## Overview

AgenticGraph hosts the end-to-end import → parse → store → render pipeline, while the Graph Data curation and document presentation surfaces are owned by the sibling repo `singabldr`.

**Goal**: enforce single-source-of-truth ownership for Graph Data UI (tables + editors + presentation) without changing the visible frontend/UI behavior.

Canonical ownership and contract details live in:

- `agenticgraph/docs/documents/singabldr-graph-data-curation-document.md`

---

## Ownership Boundary

### AgenticGraph (host)

- Owns pipeline orchestration: ingest/import → parser selection → GraphData commit → canvas render.
- Owns global state wiring (Zustand store and app routing) and calls Graph Data surfaces as UI modules.

#### Host-only workspace tools (do not drift into singabldr)

- The Editor workspace includes a host-owned **Multi-dimensional Table** (Graph Table / “Graph Data Table” inside Editor mode) that is intentionally lightweight:
  - Canvas fast-grid renderer for the body grid with a DOM header overlay (synced to the same scroll owner) + a small toolbar (fields/filter/group/sort/row height).
  - Persisted via `kg:ui:graphTable:*` keys.
  - Selection-synced with the Canvas pane (single `CanvasViewport`) and the Markdown Explorer TOC.

This surface must remain stable under stress: forbid ResizeObserver→React state loops, forbid scroll/resize feedback loops, and ensure pinned header/columns are fully opaque (no scrolled text bleed-through).

This host workspace tool must not be duplicated inside `singabldr` (keep one owner per surface).

### singabldr (Graph Data surfaces)

- Owns Graph Data curation/presentation UI and supporting modules:
  - Historical note: older panel-owned import/markdown wrappers have been removed; the active host now uses canonical markdown workspace runtime surfaces and shared JSON-backed markdown helpers
  - Graph Data Table (filter/sort/group + frozen areas + column reorder + cell editors)
  - Markdown viewer/editor/presentation/gallery
  - Preview panel UI primitives used by markdown/presentation (e.g. gallery + overlays)
  - JSON Editor used by curation/workflow inspectors

This boundary mirrors the earlier pattern used for Geospatial Mode extraction (implementation lives in a sibling repo; AgenticGraph remains host-only).

---

## Module Map

**singabldr**
- `singabldr/src/features/*`: shared curation and document-view surfaces consumed by the host without reintroducing legacy panel-owned wrappers.
- `singabldr/src/features/graph-data-table/*`: Graph Data Table model and UI.
- `singabldr/src/features/markdown/*`: Markdown lexing/rendering/presentation surfaces.
- `singabldr/src/features/markdown/ui/MarkdownStructuredTextEditor.tsx`: Monaco-backed structured editor (JSON/YAML) consolidated under Markdown.
- `singabldr/src/features/panels/views/preview-panel/ui/*`: gallery + preview overlay primitives used by markdown/presentation.

**agenticgraph**
- `agenticgraph/canvas/src/*`: continues to host the app entrypoints, renderers, store orchestration, and pipeline logic.

---

## Graph Data Table (singabldr) Notes

- The curation table is a DOM `<table>` with a single scroll owner; sticky header and optional frozen first data column must remain aligned with the scrollable columns.
- Column widths must be shared between header and body so horizontal scroll never produces drift.
- Visible columns can be reordered via pointer drag on the header (Glide-like); persist order via `graphDataTableColumnOrder`.
- When the active graph becomes empty, the table must render empty state (no stale rows from prior graphs).

---

## Build & Runtime Integration

AgenticGraph integrates the extracted Graph Data code via:

- Local dependency wiring for `singabldr` (sibling repo).
- Runtime module resolution targets the installed package copy at `agenticgraph/canvas/node_modules/singabldr/src` (not direct sibling `../../singabldr/src` imports) to avoid cross-repo path coupling.
- Host resolution preserves symlink paths in both Vite and TypeScript so extracted modules resolve dependencies from the host install (single node_modules truth).
- Host bundler config dedupes shared deps (notably `react` and `highlight.js`) and pre-optimizes `highlight.js` so extracted markdown rendering does not hit ESM/CJS default-export hazards at runtime.
- Tailwind content scanning includes `node_modules/singabldr/src` so UI classes remain stable.

---

## Verification (bounded)

Graph Data extraction is verified using bounded execution:

- TypeScript no-emit checks (host + extracted module).
- Filtered CI runner cases only for impacted surfaces (bottom surface shell, markdown workspace, structured editor, preview gallery), avoiding full-suite runs.
