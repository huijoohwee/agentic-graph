# agentic-graph Graph Data Table (Host) — Canvas Fast Grid

**Context**: Editor workspace Graph Data Table (host-owned)

**Intent**: Render large `GraphData` tables (Nodes/Edges) with stable scroll/selection/inspector behavior.

**Directive**: Use a canvas fast-grid with a single scroll owner and explicit scroll extents; forbid ResizeObserver→React state loops, scroll/resize feedback loops, canvas resize jitter, and any path where scrolled text can appear under pinned header/columns.

---

## Ownership

- This Graph Data Table is **host-owned** (agentic-graph) and is **not** the extracted `singabldr` Graph Data Table surface.
- It exists as a workspace tool for inspecting the active graph view and syncing selection with the shared Canvas pane / TOC.

---

## Architecture (Fast Grid)

- **Scroll owner**: a single `overflow-auto` viewport element.
- **Scroll extents**: a dedicated spacer element whose `width/height` are set to `layout.totalWidth/layout.totalHeight` so `scrollWidth/scrollHeight` are correct.
- **Renderer**: a `<canvas>` draws the body grid; the header is a DOM overlay synced to the same scroll owner.
- **Model**: a derived grid model that computes column layout, row grouping/visibility, and selection metadata.

---

## GraphRecordDb Persisted Cache (Graph Inspector Adjunct)

- **Database**: `GraphRecordDb` is a minimal persisted cache named `kg:graph-table` with five collections:
  - `tables` (`GraphTableDoc`) for logical tables such as `nodes` and `edges`.
  - `columns` (`GraphColumnDoc`) for property columns with stable `columnId`, `kind`, and per-table `order`.
  - `rows` (`GraphRecordRowDoc`) for table rows keyed by `rowId` and `data: Record<string, JSONValue>`.
  - `views` (`GraphRecordViewDoc`) for per-table view configs (`sort`, `filters`).
  - `meta` (`GraphRecordMetaDoc`) for table-level JSON metadata and sync markers.
- **Storage backend**: `GraphRecordDb` uses the shared persisted collection store:
  - Persists to local storage when `globalThis.localStorage` is available.
  - Falls back to in-memory storage when local storage is unavailable (for example in tests).
  - Reuses the shared collection query/sort path for indexed reads and sort/filter operations.
- **Shared facade**: runtime consumers must import the shared row/column model through the neutral `lib/graph-record-db` facade; the older feature-level `graph-table-db` pass-through must stay removed.
- **Graph inspector semantics (not the workspace surface)**:
  - Dimension 1: logical tables (`GraphRecordTableId∈{nodes,edges}`) for node and edge rows.
  - Dimension 2: property columns inferred from `GraphData` properties; base columns (`id`, `label`, `type`, `source`, `target`) are seeded via `ensureGraphRecordSeed`.
  - Dimension 3: saved views (`GraphRecordViewDoc`) that hold sort/filter JSON, plus `GraphRecordMetaDoc` for per-workspace sync metadata.
  - Each `GraphRecordRowDoc.data` cell stores a normalized JSON value (`JSONValue`) derived by `toJsonValueForDb`, so scalar, object, and array properties share a single JSON-based storage contract.
- **Boundary**: `GraphRecordDb` backs graph-specific inspector/state flows only. Opening Workspace `Multi-dimensional Table` must not require pre-warming or routing through this cache because the workspace surface is owned by `MarkdownWorkspaceDerivedViewer`.

---

## Data Sync (Import → Persisted Cache → Grid)

- **Source of truth**: Graph import commits `GraphData` into the store; the workspace `Multi-dimensional Table` reads from the shared markdown/data-view pipeline, while graph-specific inspector flows may mirror selection state through the persisted `GraphRecordDb` materialized view.
  - Canvas View Mode “2D Renderer: Multi-dimensional Table” is the canonical canvas entry point for the Markdown data-view renderer. It reuses the Editor Workspace Viewer `MarkdownWorkspaceDerivedViewer` in `multiDimTable` mode; it does not route through the D3 renderer surface or the GraphRecordDb workspace surface.
  - Workspace toolbar “Workspace: Multi-dimensional Table” remains the only entry point for the shared workspace surface and must stay decoupled from GraphRecordDb warm-up.
  - Workspace Editor `multiDimTable` must remain first-class in workspace preferences, Graph Data Table view selection, and local-storage persistence; the current DOM table renderer may be reused for that mode, but the mode contract itself must not be downgraded to plain `table`.
  - Table/Multi-dimensional Table/Kanban header controls, settings payloads, and hover `New Record` affordances must stay on the shared Workspace data-view owner so Storyboard/FloatingPanel `View` reuse the same utilities instead of mounting local renderer variants.
- **Sync key**: table sync is keyed by a `(revision, collapsedGroupIdsKey)` pair plus a per-view `viewKey`:
  - In **Static** Canvas Interaction Mode, the revision is `graphContentRevision` (structure-only) so position-only drags do not cause table recomputation.
  - In **Interactive** Canvas Interaction Mode, the revision is `graphDataRevision` so table rows can reflect position-affecting edits when real-time sync is enabled.
- **Workspace Sync Mode**:
  - `canvasWorkspaceSyncMode = 'manual'` disables automatic sync and exposes a single **Sync now** button in the Graph Table header that runs a bounded `GraphData → GraphRecordDb` sync for the current view.
  - `canvasWorkspaceSyncMode = 'realtime'` enables automatic sync on revision changes using the same gated pipeline; sync remains deduped via per-view `lastGraphWriteRevision` and `lastSyncedRevision` to prevent loops.
- **Neutral runtime owner**: the live Record Inspector sync hook and cell-to-store writeback helper belong to `graph-inspector`, and its scheduler identity must stay on the neutral `graph-record:runtime-persistence` scope rather than legacy `graph-table` hook ownership.
- **Baseline anchor**: table sync uses the document-structure baseline graph and applies only group-collapse derivation; it must not depend on keyword/frontmatter mode so mode switches do not rewrite the table.
- **Change detection**: `syncGraphDataToGraphRecordDb`:
  - Infers new property columns when it observes new properties on nodes/edges and upgrades column `kind` (for example from `text` to `date`) only when all non-empty values are compatible.
  - Inserts or updates `GraphRecordRowDoc` rows for changed nodes/edges and avoids rewriting unchanged rows, so noop syncs keep `updatedAtMs` stable.
  - Serializes writes via a `withGraphRecordDbWrite` queue to avoid concurrent write conflicts while still allowing concurrent callers.

## Widget Parity

- The Record Inspector must render the same Storyboard Widget panel as Storyboard Widget for any node id in the shared open list.
- The open list remains SSOT in graph view state; the table must not keep a local open-state fork.
- The live Record Inspector owner is a neutral graph-inspector surface; it must not be routed back through legacy `graph-table` workspace naming just because it still consumes shared graph-table persistence/helpers.
- The live Record Inspector responsive chrome must also stay neutral: inspector-specific class names, detail-grid constants, and stylesheet imports belong to `graph-inspector`, not `graph-table`.
- The live Record Inspector sync/writeback helpers must also stay neutral: `useGraphRecordDbSync` and `applyRecordCellUpdateToGraphStore` belong to `graph-inspector`, not `graph-table`.

### Column Rearrangement (Drag Header)

- Drag a **data column header** to reorder columns (drop hint line renders in the header band).
- Column order is persisted in local storage per table (`kg:ui:graphTable:columnOrderByTableId`) as an ordered list of `columnId`s. The persisted `GraphColumnDoc.order` remains the base/default order when no user override is present.
- Resize and reorder share the header: resizing is only active near the right edge of a header cell; reordering is active elsewhere.
- Header click selects a column (highlights the full column in the grid body).

---

## Date Cells (Glide-like DateEditor behavior)

- **Kind inference (import)**: property columns whose non-empty values are ISO-like dates are inferred/stored as `kind: 'date'` (and may be upgraded from `text → date`).
- **Rendering**: date cells render as `YYYY-MM-DD` in the canvas grid.
- **Editing**: double-click a date cell to open a text-first editor with a calendar popover; `Enter` commits, `Esc` cancels, picker select commits once, and Clear sets `null`.

Code references:

- `agentic-graph/canvas/src/features/graph-data-table/ui/GraphDataTableFastGrid.tsx`
- `agentic-graph/canvas/src/features/graph-data-table/ui/fast-grid/canvasGridRender.ts`

---

## Failure Modes (What to Avoid)

### 1) ResizeObserver loop → flicker / re-render storm

Anti-pattern:

- ResizeObserver updates React state that affects layout and triggers another resize, creating a render loop.

Guardrails:

- Do not store viewport size in React state if it is only used to compute scroll extents.
- Batch DOM style updates in `requestAnimationFrame` and avoid redundant style writes.

Notes (header overlay):

- If a DOM header overlay is used, it must not create a second scroll owner. Horizontal alignment should be driven by translating the header content by `-scrollLeft` from the single viewport scroll owner.
- Avoid header pointer-event traps that prevent body scrolling. Prefer `pointer-events: none` on the header wrapper and enable `pointer-events: auto` only on header interactive controls (buttons/resizers).

### 2) Scroll/resize feedback loop → vertical scroll breaks

Anti-pattern:

- Using padding on a `border-box` full-size spacer (`w-full h-full`) to “extend” scroll height.

Guardrails:

- Use a spacer element with explicit `style.width/style.height` driven by computed totals.

### 3) Canvas resize jitter → shimmer while scrolling

Anti-pattern:

- Using subpixel `getBoundingClientRect()` dimensions and continuously changing canvas backing store size.

Guardrails:

- Size the canvas from integer `clientWidth/clientHeight` and compute backing store size using DPR rounding.

### 4) Pinned header/columns bleed-through

Anti-pattern:

- Drawing scrollable cells without clipping, so horizontal scroll can draw under pinned bands.

Guardrails:

- Clip drawing for:
  - header scrollable region (`x >= pinnedWidth`)
  - scrollable cell region per row (`x >= pinnedWidth`)
  - entire row pass to exclude header band (`y >= headerHeight`)
- Ensure the background fill is fully opaque for the table surface.
- If a DOM header overlay is used, clip the canvas so it never draws into the header band.

---

## Performance Guardrails

- Cache theme-derived values (fonts/colors) outside the scroll loop; recompute only on theme mutation or viewport resize.
- Snap draw math to integer scroll positions to avoid subpixel text shimmer.
- Keep draw scheduling RAF-throttled and avoid capturing unstable model objects in closures.

---

## Verification Checklist

- Stress vertical + horizontal scroll; confirm smoothness and no visible flicker.
- Confirm `scrollHeight` increases with row count (vertical scroll works).
- Confirm no scrolled text appears under the pinned header row or pinned columns.
- Confirm theme toggles update colors/fonts without triggering render loops.
