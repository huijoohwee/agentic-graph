# AgenticGraph Local Storage Document

**Context**: Persisted UI and workflow settings in the browser  
**Intent**: Provide stable, discoverable storage keys with a single source of truth  
**Directive**: Reference only canonical keys from `canvas/src/lib/config.ls.ts` (no magic strings). For plugin-owned keys, import keys from the plugin package (host must not hardcode).

---

## Source of Truth

- Canonical LocalStorage keys live in `LS_KEYS` in `canvas/src/lib/config.ls.ts`.
- Code should read/write keys via `ls*` helpers in `canvas/src/lib/persistence.ts`.

---

## Graph Data (SSOT)

- Canonical graph data is persisted under `LS_KEYS.graphData`.
- The stored payload includes `GraphData.metadata.graphDataRevision` and `GraphData.metadata.hash` so derived surfaces can detect staleness.
- Writes are intentionally debounced (batched via the history scheduler) to avoid per-keystroke LocalStorage churn while still persisting edits/imports reliably.

- Graph Data Table UI state keys (owned by the curation surface):
  - `LS_KEYS.graphDataTableVisibleColumns`
  - `LS_KEYS.graphDataTableColumnOrder`
  - `LS_KEYS.graphDataTableColumnWidths`
  - `LS_KEYS.graphDataTableFilterState`
  - `LS_KEYS.graphDataTableSortRules`
  - `LS_KEYS.graphDataTableGroupKey`

---

## Markdown Workspace UI

- Explorer workspace keys
  - `LS_KEYS.markdownSidebarWidthPx`
  - `LS_KEYS.markdownExplorerSourceFilesCollapsed`
  - `LS_KEYS.markdownExplorerSourceFilesExpandedPaths`
  - `LS_KEYS.markdownExplorerOutlineCollapsed`
  - `LS_KEYS.markdownExplorerBacklinksCollapsed`

- Legacy markdown-view preference keys retained for compatibility with older workspace/viewer state
  - `LS_KEYS.markdownLayoutMode`
  - `LS_KEYS.markdownWordWrap`
  - `LS_KEYS.markdownViewerWidthMode`
  - `LS_KEYS.markdownPresentationMode`
  - `LS_KEYS.markdownTextHighlight`
  - `LS_KEYS.markdownAnnotateDisplay`
  - `LS_KEYS.markdownSyncScroll`
  - `LS_KEYS.markdownSidebarOpen`
  - `LS_KEYS.markdownCollapsedHeadingIds`
  - `LS_KEYS.jsonMarkdownMode`

---

## Workspace UI (Canvas vs Editor vs Table)

- Workspace view mode and Editor layout state:
  - `LS_KEYS.workspaceViewMode` (Canvas | Editor | Table)
  - `LS_KEYS.documentVersions` (bounded local document snapshots for Editor Workspace, Source Files, and GitGraph CRUD diff/history surfaces)
  - `LS_KEYS.documentStructureBaselineLock` (default on; disables mode switches that can desync surfaces)
  - `LS_KEYS.workspacePreviewWidthPx` (Editor/Table split: Canvas pane width)
  - `LS_KEYS.workspaceCanvasPaneOpen` (Editor/Table split: Canvas pane open/closed)

---

## Canvas Zoom & Viewport (2D)

- Zoom modes (mutually exclusive):
  - `LS_KEYS.viewportPinned`
  - `LS_KEYS.viewportFitToScreen`
  - `LS_KEYS.viewportZoomToSelection`

- Zoom action durations:
  - `LS_KEYS.zoomDurationFitMs`
  - `LS_KEYS.zoomDurationSelectionMs`

- Wheel / trackpad pinch zoom tuning (shared across D3, Flow, Storyboard Widget):
  - `LS_KEYS.wheelZoomCtrlMetaBoostMultiplier`
  - `LS_KEYS.flowWheelZoomSpeedMultiplier`
  - `LS_KEYS.flowWheelZoomIncrementMultiplier`
  - `LS_KEYS.flowWheelZoomSmoothMinDurationMs`
  - `LS_KEYS.flowWheelZoomSmoothMaxDurationMs`

- Interaction speed multipliers (shared across D3, Flow, Storyboard Widget):
  - `LS_KEYS.canvasInteractionSpeedMultiplier` (unified drag/pan/zoom speed)
  - `LS_KEYS.canvasPanSpeedMultiplier` (pan/drag-only speed)

- Defaults migration guard:
  - `LS_KEYS.flowWheelZoomDefaultsVersion` (one-time upgrade for prior default values; does not override custom settings)

---

## Canvas Interaction & Workspace Sync Modes

- Canvas Interaction mode:
  - `LS_KEYS.infiniteCanvasInteractionMode` (`'static' | 'interactive'`)
    - `static` (default) runs 2D D3 force layout to a bounded stable state and then freezes the simulation; rich-media/markdown overlays forward wheel/pan to Canvas to keep pan/zoom primary and avoid per-frame overlay recomputation; Graph Data Table and GraphRecordDb ignore pure position-only updates and only sync on content changes or explicit commands.
    - `interactive` keeps D3 force simulation running and allows full embedded overlay interactivity (iframes/images/videos/markdown blocks accept wheel/pointer events and do not forward to Canvas when safe) while still using revision+viewKey-gated sync and SSOT GraphData/layout keys.

- Workspace↔Canvas sync mode:
  - `LS_KEYS.canvasWorkspaceSyncMode` (`'manual' | 'realtime'`)
    - `manual` (default) disables automatic GraphRecordDb sync from Canvas; the Graph Table header exposes a single **Sync now** action that runs a bounded GraphData→GraphRecordDb sync keyed by viewKey and revision.
    - `realtime` enables automatic sync on relevant revision changes: in static mode the sync key is `graphContentRevision` (structure-only), in interactive mode the sync key is `graphDataRevision` (includes position-only changes). Sync remains deduped via `lastGraphWriteRevision` and `lastSyncedRevision` to prevent loops and background churn.

---

## Floating Panels (Tool Menu)

- Floating panel shell and layout state:
  - `LS_KEYS.floatingPanelPinned`
  - `LS_KEYS.floatingPanelWidthRatio`
  - `LS_KEYS.floatingPanelZIndex`

- Pin semantics (SSOT):
  - Pinned: header drag disabled (panel is locked)
  - Unpinned: header drag enabled (panel is floating)

---

## MainPanel (Floating)

- MainPanel shell and layout state:
  - `LS_KEYS.mainPanelPinned`
  - `LS_KEYS.mainPanelCollapsed`
  - `LS_KEYS.mainPanelTop`
  - `LS_KEYS.mainPanelLeft`

- Pin semantics (SSOT):
  - Pinned: header drag disabled (panel is locked)
  - Unpinned: header drag enabled (panel is floating)

---

## Storyboard Widget Widgets

- Storyboard Widget overlay state:
  - `LS_KEYS.flowWidgetPinnedByNodeId` (per-node pinned-to-node state; pinned anchors to node and disables drag, unpinned detaches and enables drag)
  - `LS_KEYS.flowWidgetPinnedSemanticsVersion` (migration/version marker for pinned widget semantics)
  - `LS_KEYS.flowWidgetMinimized`
  - `LS_KEYS.flowWidgetHideFields`
  - `LS_KEYS.flowWidgetPosByNodeId` (per-node detached position)
  - `LS_KEYS.flowWidgetWorldPosByNodeId` (per-node pinned world position)
  - `LS_KEYS.flowWidgetPinnedByGraphMetaKey`
  - `LS_KEYS.flowWidgetPosByGraphMetaKey`
  - `LS_KEYS.flowWidgetWorldPosByGraphMetaKey`
  - `LS_KEYS.storyboardWidgetManagerWidgetRegistry`

---

## Geospatial Mode (Extracted)

- AgenticGraph keeps Geospatial Mode keys out of `canvas/src/lib/config.ls.ts` to preserve a geospatial-free core.
- The Geospatial Mode implementation (including its persistence design) lives in the sibling repo `gympgrph` and owns its LocalStorage keys.

---

## State-Sync + Scheduler Keys

- Coalesced scheduler keys are structural contracts for state-sync/indexing; production code must use these keys with revision/viewKey gating, not ad-hoc `setTimeout` chains.
- `markdown-workspace:refresh` coalesces workspace FS→Markdown Workspace refresh runs; it does not replace LS keys (it only schedules `refresh()`/`mergeWorkspaceEntriesIntoSourceFiles`).
- `source-files:persist` and `source-files:workspace` coalesce sourceFiles snapshots and workspace metadata local-storage plus persisted-cache writes while preserving equality checks and revision-based gating.
- `per-document-ui` coalesces per-document UI LS writes; document-level LS keys remain the SSOT for viewport/selection/mode state.
- `graph-table:view-state` coalesces host GraphTable/Multi-dimensional Table view-state LS writes (visibility/order/filters/sort/row heights/widths) keyed by table id.
- `markdown-editor:ssot:<documentKey>` coalesces markdown editor→GraphData SSOT pushes per document and must be reused by features that write document text back into the SSOT graph.
