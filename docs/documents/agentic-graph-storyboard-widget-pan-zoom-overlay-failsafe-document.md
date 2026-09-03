# agentic-graph Storyboard Widget Pan/Zoom Overlay Failsafe

## Scope

This document describes the interaction contract for restoring pan/zoom when Storyboard Widget overlays are present.

## SSOT Rules

- `viewportControlsPreset` is the single source of truth for pan/zoom/select gating and must be read from store at event time (not captured at mount).
- 2D scale extent safety is centralized in `canvas/src/lib/zoom/scaleExtent.ts` and must be reused by 2D renderers.
- 2D zoom view keys must be built from the same schema-layout JSON across D3/Flow/Design/Storyboard Widget (include `schema.layout.flow`), so keyed zoom state does not drift.
- Flow renderer commit/zoom persistence must avoid callback churn that would cause input handlers to rebind during interaction.
- Storyboard Widget overlay collision resolution must not run on every interaction tick; it should be scheduled on overlay set changes and quantized zoom changes.
- Storyboard Widget camera init must be keyed per dataset when stable (e.g., `path:*`), and must fall back to a per-graph hash when dataset keys collapse to `rev:*`.

## Overlay Contract

- Overlays may be marked as wheel-ignore/pointer-ignore to prevent accidental canvas wheel zoom.
- Storyboard Widget overlays must expose the overlay root via `[data-kg-widget][data-kg-storyboard-widget-mode="1"]` and the active surface id via `data-kg-storyboard-widget-surface` so global capture handlers can reliably proxy wheel/pan/zoom.
- When Space-pan is held, Space+drag pan must remain usable even if the pointerdown starts on an overlay.
- Dragging a widget overlay must never start a canvas pan proxy unless Space-pan is held.
- Pinned overlay drags must update overlay anchor offsets directly (applied collectively to all pinned overlays) and must not route through any pan proxy path.
- When `storyboardWidgetOverlayWheelProxyEnabled=true`, wheel gestures that originate over a Storyboard Widget overlay must be forwarded to the Flow canvas unless the overlay can scroll in that direction (including when the wheel originates over interactive form fields).
- When Safari emits `gesture*` pinch events over the canvas or widget overlays, the app must prevent browser zoom and apply anchored zoom to the Flow canvas.
- Overlay-driven global user-select locks must always unlock on pointer end/cancel and must not leak across unmount.
- Wheel-ignore zones must not be able to “blanket block” canvas zoom when the top-most element under the pointer is still the canvas; in Storyboard Widget, prefer an `elementFromPoint` check to bypass ignore guards in that case.

## Safety Guarantees

- Global user-select lock has a failsafe reset on `window.blur` and `document.visibilitychange` (hidden).
- Node dragging must never early-return before releasing user-select locks.
- Overlay pan proxy must clear its pointer id on `pointerup`, `pointercancel`, and `lostpointercapture` so subsequent interactions cannot be blocked.
- Window capture handlers must be able to end an active canvas drag if the canvas listeners are temporarily unmounted during 2D renderer switches.
- Wheel handling must recover from stale drag state (e.g. capture lost) instead of blocking zoom/pan indefinitely.
- Storyboard Widget must not apply persisted camera transforms until graph bounds are computable (e.g., at least one finite node position); otherwise initial transforms may land offscreen and appear as a "blank" canvas.
- If the current camera transform does not show the graph (bounds guard fails), Storyboard Widget must treat the view as not-initialized yet (invalidate the init gate) and re-apply an initial fit even when the init key matches.
- Viewport settle retry: after workspace-open overlay transitions, the Flow canvas must retry centroid-centered fit if the initial viewport settle produces an offscreen or degenerate transform. The retry uses the same D3 fit SSOT (`fitAllTransform`) and preserves centroid-centered layouts across overlay open/close cycles.
- Interaction-in-progress guard: offscreen overlay recovery and force-fit must not fire while the user is actively panning, zooming, or dragging widgets in Workspace mode; recovery runs only after interaction settles.
- Widget placement authority: frontmatter-flow auto-managed widget nodes (text/image/video generation, rich media panel, video transcriber) use a centralized placement authority (`widgetPlacementAuthority.ts`) that decides auto-placement, pinned-in-canvas defaults, and balanced collective layout preservation.
- Screen authority for floating widgets: frontmatter-flow floating widgets bypass viewport clamping and use raw screen coordinates (`floatingUsesScreenAuthority`); world position stamping is skipped when screen authority is active, and a guard prevents stamping far-offscreen world coordinates during pre-init.
- Per-graph-key widget world positions: widget world positions are stored per graph meta key (`flowWidgetWorldPosByNodeIdByGraphMetaKey`) so positions persist correctly when switching between frontmatter-flow graphs; transient placement authorities are reset on workspace reopen to prevent far-right jumps.
- Frontmatter flow import mode clearing: an explicit frontmatter-flow graph import clears the global and per-graph-key pinned, screen-position, and world-position widget placement caches even during transient workspace mutation gates, so stale Flow Canvas/previous-document placement cannot seed Storyboard Widget. Passive Source Files switches opt out via `resetWidgetLayout: false`.
- Workspace-blocked seed zoom: frontmatter-flow auto-seeding must ignore persisted viewport-offset zoom while workspace graph mutation is blocked; live interaction transforms remain authoritative, and persisted offsets may seed only after the mutation gate is open.
- Rich Media infinite-canvas layout: Storyboard Widget and Flow Canvas Rich Media overlays opt out of viewport collision/clamp relayout so pan/zoom preserves world placement. Bounded callers still use the shared media overlay layout loop with explicit caller clamp margins and obstacle collision.
- Explicit source-authority reapply is also a draft-reset event: when `applyMarkdownDocument(...)` reapplies the active markdown SSOT, Storyboard Widget must invalidate transient draft overlays, drafted edges, and camera/init gates from an incremented markdown apply revision even if the document path and text are identical.
- Fresh draft-graph authority: runtime-scene seeding and overlay topology/layout signatures must prefer `draftGraphDataRef.current` before render-graph or store snapshots so freshly dropped Rich Media panels with authored graph `x/y` never enter collective reseed as if they were unanchored.
- Live-route browser verification depends on that reset boundary: same-path same-text starter-template reapply must restore the clean baseline and remove transient Storyboard Rich Media residue instead of preserving draft state until some unrelated document identity change occurs.

## References

- `agentic-graph/canvas/src/components/FlowCanvas/bindNativeInteractions.ts`
- `agentic-graph/canvas/src/components/FlowCanvas.tsx`
- `agentic-graph/canvas/src/components/FlowCanvas/useFlowCanvasRuntime.ts`
- `agentic-graph/canvas/src/components/StoryboardWidget/FlowWidgetOverlay.tsx` (thin barrel → `WidgetEditorInner`)
- `agentic-graph/canvas/src/components/StoryboardWidget/WidgetEditorInner.tsx` (orchestrator: placement + drag + toolbar + view)
- `agentic-graph/canvas/src/components/StoryboardWidget/WidgetEditorView.tsx` (pure presentational view)
- `agentic-graph/canvas/src/components/StoryboardWidget/flowWidgetOverlayShared.ts` (types + constants SSOT)
- `agentic-graph/canvas/src/components/StoryboardWidget/useWidgetPlacementRuntime.ts` (position/scale/clamp)
- `agentic-graph/canvas/src/components/StoryboardWidget/useWidgetDragHandlers.ts` (pointer-drag interaction)
- `agentic-graph/canvas/src/components/StoryboardWidget/useWidgetRichMediaToolbar.ts` (rich-media toolbar state)
- `agentic-graph/canvas/src/lib/canvas/storyboard-widget-overlay-proxy.ts`
- `agentic-graph/canvas/src/lib/canvas/active-2d-zoom-view-key.ts`
- `agentic-graph/canvas/src/lib/canvas/storyboard-widget-init-key.ts`
- `agentic-graph/canvas/src/lib/canvas/schema-layout-engine-json.ts`
- `agentic-graph/canvas/src/lib/canvas/interaction-user-select.ts`
- `agentic-graph/canvas/src/lib/storyboardWidget/widgetPlacementAuthority.ts` (widget auto-placement + screen authority + balanced collective)
- `agentic-graph/canvas/src/features/parsers/frontmatterFlowImportMode.ts` (import mode clearing)
- `agentic-graph/canvas/src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetRuntimeScene.ts` (workspace-blocked seed zoom)
- `agentic-graph/canvas/src/components/FlowCanvas/FlowCanvasMediaOverlays.tsx` (Flow Rich Media infinite-canvas layout policy)
- `agentic-graph/canvas/src/lib/render/mediaOverlayLayoutLoop2d.ts` (bounded media layout collision and caller clamp margins)
- `agentic-graph/canvas/src/hooks/store/canvasSlice.ts`
- `agentic-graph/canvas/src/features/settings/registry-ui.graph-and-orchestrator.ts`
