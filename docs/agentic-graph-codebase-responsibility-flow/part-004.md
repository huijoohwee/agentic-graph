# Settings Registry Responsibility Flow — Part 4

| Area | Responsibility | Modules | Classes/Objects | Functions/Methods | Key | Imports | Notes | Line Range |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Canvas Zoom Actions | Animation duration (ms) for Zoom-to-Selection action | `canvas/src/features/settings/registry-ui.graph-and-orchestrator.part2.ts` | `` | `setZoomDurationSelectionMs` | `zoomDurationSelectionMs` | `zustand` | clamps to [0,2000]. Used by both D3 and Flow 2D renderers. | `canvas/src/features/settings/registry-ui.graph-and-orchestrator.part2.ts:L318` |
| Canvas Zoom Modes | Auto-zoom to current selection (Zoom to Selection mode) | `canvas/src/features/settings/registry-ui.graph-and-orchestrator.part2.ts` | `` | `setZoomToSelectionMode` | `zoomToSelectionMode` | `zustand` | When enabled, Pin View and Fit to Screen modes are disabled. | `canvas/src/features/settings/registry-ui.graph-and-orchestrator.part2.ts:L300` |
