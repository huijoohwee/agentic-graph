# Knowgrph Settings Architecture - Schema and Specs Companion

> Continuation from `knowgrph-settings-document.md`.

## Component Responsibility Matrix

| Layer/Subsystem       | Path/Module                                   | Component                   | Interface/Method            | Responsibility (S-V-O)                                                                        | Dependencies                          | Contracts                                         | LOC    |
|-----------------------|-----------------------------------------------|-----------------------------|-----------------------------|-----------------------------------------------------------------------------------------------|---------------------------------------|---------------------------------------------------|--------|
| Settings Extraction   | `canvas/src/cli/extract-settings-schema.ts`   | Settings Flow Builder       | generate, `--check` | Script → derives setting responsibilities and source provenance → renders or verifies three Settings flow projections | `canvas/src/features/settings/registry.ts`, code-owned metadata and source anchors | Outputs `docs/knowgrph-codebase-responsibility-flow.md`, `canvas/public/settings-flow.json`, `canvas/src/features/settings/settings-flow.schema.json` | <600 |
| Settings Registry     | `canvas/src/features/settings/registry.ts`    | Settings Registry           | `settingsRegistry`, `loadFlowDetails` | Registry → enumerates all setting keys → provides flow metadata to Settings UI               | `registry-ui*`, `registry-three`, `registry-presets` | Single settings list used for docs, UI, and JSON-LD export | ~40 |
| Settings Store        | `canvas/src/hooks/useGraphStore.ts`           | Graph Store (Zustand)       | `set*` setters              | Store → owns runtime setting state → persists when needed                                    | Zustand, localStorage helpers         | Stable setting setter APIs consumed by registry and UI | ~800+ |
| Settings UI           | `canvas/src/features/panels/views/SettingsView.tsx` | MainPanel Settings View  | `SettingsView`, `useSettingsView` | UI → renders key/type/value rows → batches updates via Apply/Reset                           | Tooltip builders, registry, flow schema | Hover tooltips + click-to-expand modules/classes/functions | ~300 |
| Theme Mode             | `canvas/src/hooks/store/uiSettingsSlice.ts`, `canvas/src/lib/ui/theme.ts`, `canvas/src/App.tsx` | Theme Mode Sync | `setThemeMode`, `applyThemeMode`, `subscribeToSystemThemeChanges` | Store → persists `themeMode` → applies `data-theme` + `.dark` → syncs with OS when mode=system | Zustand, localStorage, matchMedia | DOM theme aligned for CSS vars + Tailwind `dark:` | ~120 |

---

## Settings Schema Extraction (`build:settings`)

### Build Script Architecture

**Command**: `npm run build:settings`

**Authoritative inputs**: the 593 unique keys in `settingsRegistry` plus code-owned responsibility
metadata and source anchors. The generated Markdown and JSON files are outputs only and are never
parsed as generation inputs.

**Generated outputs**:

- `docs/knowgrph-codebase-responsibility-flow.md`
- `canvas/public/settings-flow.json`
- `canvas/src/features/settings/settings-flow.schema.json`

**Processing Flow**:

| Stage | Input | Output | Responsibility | Performance Consideration |
|---|---|---|---|---|
| Code Derivation | Settings registry + code-owned metadata | Normalized flow rows | Derive areas, responsibilities, modules, functions, and exact source anchors | Bounded deterministic scan of `canvas/src/` |
| Validation | Normalized rows + source files | Validated row set | Reject duplicate keys, empty ownership fields, missing modules, and invalid line anchors | O(settings + referenced files) |
| Rendering | Validated rows | Markdown + two JSON byte strings | Render every projection from the same ordered row set | O(settings) serialization |
| Generate | Rendered bytes | Three disk files | Write all projections together | Three bounded file writes |
| Check | Rendered bytes + committed files | Pass/fail status | Compare all projections without writing | Three bounded file reads; hashes remain unchanged |

**Performance Metrics** (macOS dev machine):

| Metric                  | Typical Value | Notes                                                  |
|-------------------------|---------------|--------------------------------------------------------|
| Total Execution Time    | ≤10s reference ceiling | Linked-package preparation plus bounded local source scan and Node/TSX startup |
| Row Derivation Time     | Bounded       | One deterministic pass over declared source scope       |
| Projection Render Time  | Bounded       | One ordered row set renders all three projections       |
| Check Write Count       | 0             | `--check` is non-mutating                               |

**Configuration Schema**:

```yaml
buildSettings.authoritativeInputs:
  scope: build_global
  type: settings registry plus code-owned metadata
  mutability: source_owned
  validation: unique keys and valid ownership provenance
  impact: single source of truth for all responsibility-flow projections

buildSettings.outputs:
  scope: build_global
  type: fixed path list
  mutability: source_owned
  validation: exactly the three declared generated outputs
  impact: committed Markdown and Settings UI JSON projections

buildSettings.mode:
  scope: build_global
  type: string (enum: "generate" | "check")
  mutability: invocation_configurable
  validation: check mode performs no writes
  impact: generate refreshes all outputs; check fails on any stale output
```

**Design Compliance**:

| Context | Intent | Directive | Module/Component | Interface | Input | Output | Decision Logic |
|---|---|---|---|---|---|---|---|
| Source Derivation | Build canonical rows | - [ ] Read registry and code metadata; forbid generated-output input | Settings builder | derive | authoritative source | normalized rows | unique registry key per row |
| Provenance Validation | Guarantee traceability | - [ ] Require non-empty ownership and valid `file:line`; forbid dangling anchors | Settings builder | validate | normalized rows + source | validated rows | fail before render/write |
| Projection Rendering | Keep outputs in lockstep | - [ ] Render all three outputs from one ordered row set; forbid hand-merged output | Settings builder | render | validated rows | three byte strings | stable key/path ordering |
| Stale Check | Detect drift without healing it | - [ ] Compare in memory and exit non-zero; forbid writes in `--check` | Settings builder | `--check` | rendered + committed bytes | pass/fail | exact byte comparison |

---

## Core Settings Specifications

### `themeMode`

**Area**: UI Appearance

**Responsibility**: Global color theme (Light, Dark, or System)

**Configuration Schema**:

```yaml
themeMode:
  scope: ui_global
  type: string (enum: "light" | "dark" | "system")
  mutability: runtime_configurable
  validation: must be valid theme mode
  impact: controls `data-theme` ("light" | "dark") and `.dark` class for Tailwind variants

themeMode.light:
  css: :root[data-theme='light']
  tokens: --kg-* CSS variables resolve to light palette

themeMode.dark:
  css: :root[data-theme='dark']
  tokens: --kg-* CSS variables resolve to dark palette

themeMode.system:
  css: resolved via matchMedia('(prefers-color-scheme: dark)')
  tokens: updates by listening to matchMedia "change" events (no polling)
```

**UI Control**: Toolbar `Theme` is one button that cycles through the shared `THEME_MODE_OPTIONS` order: System, Light, Dark. Direct settings/design-system selectors must use the same option source.

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Theme Application     | Apply color palette           | - [ ] Read `themeMode`; apply `data-theme` + `.dark`; forbid per-component overrides      | Theme utilities + store   | `applyThemeMode`, `setThemeMode` | theme mode string | DOM + store update  | `data-theme` drives CSS vars + Tailwind `dark:` |
| System Sync           | Match OS preference           | - [ ] Listen for OS theme changes; update when `system` active; forbid polling            | App bootstrap             | `subscribeToSystemThemeChanges` | media query change | theme refresh | `matchMedia` change → re-apply system theme |
| Toolbar Theme Control | Cycle all modes in one button | - [ ] Toggle System/Light/Dark from `THEME_MODE_OPTIONS`; forbid segmented toolbar groups or local mode maps | Toolbar + theme helper    | `getNextThemeMode`, `handleToggleTheme` | theme click | next mode update | shared option order |

---

### `canvasInteractionSpeedMultiplier`

**Area**: Canvas Interaction (2D Speed)

**Responsibility**: Unified 2D interaction speed multiplier (drag/pan/zoom) for D3/Flow/StoryboardWidget

**Configuration Schema**:

```yaml
canvasInteractionSpeedMultiplier:
  scope: ui_global
  type: number
  mutability: runtime_configurable
  validation: clamped to [0.25, 3.0]
  default: 1
  impact: multiplies schema-driven panSpeed/zoomSpeed at interaction points (wheel/pinch/pan)
```

**Implementation anchors**
- Store + persistence: `canvas/src/hooks/store/canvasSlice.ts` (`setCanvasInteractionSpeedMultiplier`)
- D3 interaction application: `canvas/src/components/GraphCanvas/zoom.ts` (wheel/pinch zoom, wheel/pointer/touch pan)
- Flow/StoryboardWidget interaction application: `canvas/src/components/FlowCanvas/bindNativeInteractions.ts` (wheel/pinch zoom, wheel/pointer pan)
---
### `canvasPanSpeedMultiplier`

**Area**: Canvas Interaction (Pan/Drag)

**Responsibility**: Pan/drag-only speed multiplier for 2D renderers

**Configuration Schema**:

```yaml
canvasPanSpeedMultiplier:
  scope: ui_global
  type: number
  mutability: runtime_configurable
  validation: clamped to [0.25, 3.0]
  default: 1
  impact: multiplies schema-driven panSpeed for wheel pan and pointer/touch panning (does not affect wheel/pinch zoom)
```

**Implementation anchors**
- Store + persistence: `canvas/src/hooks/store/canvasSlice.ts` (`setCanvasPanSpeedMultiplier`)
- D3 interaction application: `canvas/src/components/GraphCanvas/zoom.ts` (wheel pan, pointer/touch pan)
- Flow/StoryboardWidget interaction application: `canvas/src/components/FlowCanvas/bindNativeInteractions.ts` (wheel pan, pointer pan)

---

### `selectionFlashDurationMs`

**Area**: Selection Flash

**Responsibility**: Duration of canvas-driven selection flash highlights in milliseconds

**Configuration Schema**:

```yaml
selectionFlashDurationMs:
  scope: ui_global
  type: number
  mutability: runtime_configurable
  validation: clamped between 100ms and 2000ms
  impact: controls flash duration for canvas → panel synchronization

flashTargets:
  - Markdown gutter highlights in the markdown workspace
  - Markdown Preview selection flashes
  - Graph Data Table row flashes
```

**Value Bounds**: [100, 2000] milliseconds

**UX Impact**:
- Lower values (100-500ms): Subtle, responsive flashes
- Medium values (500-1000ms): Balanced visibility and responsiveness
- Higher values (1000-2000ms): Extended dwell for accessibility

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Duration Clamping     | Enforce valid range           | - [ ] Clamp input to [100, 2000]; forbid values outside bounds                             | Settings validator        | `clampFlashDuration` | duration input            | clamped duration      | Math.max(100, Math.min(2000, duration)) |
| Flash Triggering      | Synchronize flash timing      | - [ ] Trigger flash with configured duration; clear after timeout; forbid stuck highlights | Flash controller          | `triggerFlash`       | target element, duration  | void (DOM update)     | setTimeout-based highlight removal      |

---

### `selectionFlashOpacity`

**Area**: Selection Flash

**Responsibility**: Opacity of canvas-driven selection flash overlays

**Configuration Schema**:

```yaml
selectionFlashOpacity:
  scope: ui_global
  type: number
  mutability: runtime_configurable
  validation: clamped between 0.0 and 1.0
  impact: alpha for overlay-based flashes instead of native selection colors

flashTargets:
  - Markdown editor gutter flashes
  - Markdown Preview block flashes
  - Graph Data Table row flashes
```

**Value Bounds**: [0.0, 1.0] (alpha transparency)

**Default**: 0.18 (subtle overlay)

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Opacity Clamping      | Enforce valid alpha range     | - [ ] Clamp input to [0.0, 1.0]; forbid negative or >1.0 values                            | Settings validator        | `clampOpacity`       | opacity input             | clamped opacity       | Math.max(0.0, Math.min(1.0, opacity))   |
| Overlay Application   | Apply alpha to flash overlays | - [ ] Set CSS background with configured opacity; forbid solid color overlays               | Flash renderer            | `applyFlashOverlay`  | element, opacity          | void (CSS update)     | `rgba(r, g, b, opacity)` background     |

---

### `graphHoverPreview`

**Area**: Graph Interaction

**Responsibility**: Configures visibility of information in graph hover tooltip

**Configuration Schema**:

```yaml
graphHoverPreview.showNodeId:
  scope: graph_interaction
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: show Node ID in hover tooltip (default: false)

graphHoverPreview.showNodeName:
  scope: graph_interaction
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: show Node Name/Label (default: true)

graphHoverPreview.showNodeLabel:
  scope: graph_interaction
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: show Node Type/Category (default: true)

graphHoverPreview.showNodeDescription:
  scope: graph_interaction
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: show Node Description (default: true)

graphHoverPreview.showNodeProperties:
  scope: graph_interaction
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: show Node Properties (default: true)

graphHoverPreview.showEdgeId:
  scope: graph_interaction
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: show Edge ID in hover tooltip (default: false)

graphHoverPreview.showEdgeLabel:
  scope: graph_interaction
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: show Edge Label (default: true)

graphHoverPreview.showEdgeWeight:
  scope: graph_interaction
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: show Edge Weight (default: true)

graphHoverPreview.showEdgeProperties:
  scope: graph_interaction
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: show Edge Properties (default: true)
```

**Use Cases**:
- Reduce clutter during presentation mode (hide IDs, properties)
- Focus on specific attributes during analysis (show only labels, weights)
- Debugging mode (show all fields including IDs)

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Tooltip Content Generation | Build hover tooltip      | - [ ] Read `graphHoverPreview` settings; conditionally include fields; forbid missing checks| Hover controller          | `buildTooltipContent` | node/edge, settings      | tooltip HTML          | conditional field inclusion based on flags|
| Settings Persistence  | Save hover preferences        | - [ ] Persist settings to localStorage; restore on load; forbid session-only storage        | Settings store            | `persistSettings`    | settings object           | void (localStorage write)| JSON.stringify + localStorage.setItem   |

---

## Settings Extraction Flow

### Source Owners → Generated Projections Pipeline

The registry key set and code-owned metadata form the only generation input. The builder produces
one normalized row per unique setting and renders the Markdown and JSON projections from that
same in-memory row set.

**Normalized responsibility row**:

```text
Area | Responsibility | Modules | Classes/Objects | Functions/Methods |
Key | Imports | Notes | Line Range
```

`SettingMeta.source` remains the runtime state/persistence owner. Optional
`SettingMeta.backingImports` records additional typed build-time backing without replacing that
owner. The closed backing taxonomy is `zustand`, `localStorage`, `import.meta.env`,
`window.__ENV__`, `eslint`, and `tailwindcss`; generated Imports are the stable, deduplicated union
of the source-derived backing and explicit backing metadata. `htmx` is intentionally absent.

**Projection contract**:

| Projection | Consumer | Contract |
|---|---|---|
| `docs/knowgrph-codebase-responsibility-flow.md` | Maintainers, reviewers, agents | Deterministic Markdown table with one row per unique key |
| `canvas/public/settings-flow.json` | Public Settings UI route | Deterministic JSON serialization of the normalized rows |
| `canvas/src/features/settings/settings-flow.schema.json` | Source-owned Settings UI import | Byte-equivalent JSON data to the public projection |

**Design Compliance**:

| Context | Intent | Directive | Module/Component | Input | Output | Decision Logic |
|---|---|---|---|---|---|---|
| Unique Keys | Preserve registry cardinality | - [ ] Emit exactly 593 unique rows at the current baseline; forbid duplicate or missing keys | Settings builder | registry entries | normalized rows | reject duplicate keys before rendering |
| Ownership | Keep every row actionable | - [ ] Require Area, Responsibility, Modules, Key, and Line Range; forbid placeholders that hide missing ownership | Settings builder | code metadata + anchors | validated row | fail with setting-specific diagnostic |
| Styling Backing | Attribute CSS-first appearance dependencies without changing persistence ownership | - [ ] Emit `tailwindcss` only from typed `backingImports`; forbid inferred or free-form backing names | Settings builder | `SettingMeta.source` + `backingImports` | normalized Imports | stable deduplicated union |
| Determinism | Make diffs trustworthy | - [ ] Sort keys, paths, and references consistently; forbid filesystem-order dependence | Settings builder | validated rows | ordered rows | stable code-point ordering |
---

## Generate and Check Behavior

| Mode | Filesystem behavior | Result |
|---|---|---|
| Generate | Refresh the three declared projections from authoritative code | Outputs stay synchronized |
| `--check` | Derive and render in memory; read committed outputs; write nothing | Exit 0 only when all three outputs match exactly |
| CI | Build linked package prerequisites, then run `--check` before any projection-generating step | Stale outputs fail instead of being silently healed |
---

Release/publish parity treats all three files as generated projections.
`canvas/public/settings-flow.json` can feed the downstream public-route compatibility surface,
while `canvas/src/features/settings/settings-flow.schema.json` remains the source-repository
companion. Refresh them through the code-derived builder only; never hand-patch a projection or a
downstream publish copy. This increment stops at Dev review and does not publish or deploy.

## Testing & Quality Standards

**Test Coverage Metrics**
| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Source Derivation    | Validate authoritative inputs   | - [ ] Test unique registry keys and complete ownership; forbid generated-output input      |
| Provenance           | Validate source anchors         | - [ ] Test module paths and line bounds; forbid missing or dangling references              |
| Determinism          | Validate stable rendering       | - [ ] Generate twice in memory; require byte-identical Markdown and JSON                    |
| Stale Check          | Validate non-mutation           | - [ ] Test fresh/stale cases and unchanged output hashes; forbid check-time writes          |
**Test Categories**:
- **Unit Tests**: row derivation, validation, stable ordering, and projection rendering.
- **Integration Tests**: authoritative code → three projections → non-mutating stale check.
**Quality Gates**:
| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Projection Completeness | Ensure all settings are emitted | - [ ] Verify each output includes all 593 unique registry keys; forbid partial extraction |
| Performance Bounds   | Keep build fast                 | - [ ] Measure bounded completion against the ≤10s reference ceiling; forbid unbounded source scans |
| CI Ordering          | Detect drift before mutation    | - [ ] Run `--check` before generating builds; forbid pre-check regeneration                 |
---

**Build Health**:
| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Authoritative Inputs | ☐      | - [ ] Registry and code-owned metadata validate; forbid generated files as source          |
| Projection Output    | ☐      | - [ ] Markdown and both JSON projections are present and fresh; forbid missing output       |
| Non-mutating Check   | ☐      | - [ ] `--check` leaves all file hashes unchanged; forbid stale-output healing               |
| Build Performance    | ☐      | - [ ] The root responsibility-flow command remains within the ≤10s reference ceiling; forbid unbounded extraction |
**Settings Quality**:
| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Type Safety          | ☐      | - [ ] All settings have valid JSON Schema types; forbid `any` types                        |
| Bounds Validation    | ☐      | - [ ] Numeric settings have min/max; enums have valid values; forbid unbounded inputs      |
| Documentation        | ☐      | - [ ] All settings have `description` field; forbid undocumented settings                  |
---

## Anti-Patterns (Forbidden)
| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Manual Projection Sync | Automate projection generation | - [ ] Prefer build output; forbid hand-editing Markdown or JSON projections                 |
| Hardcoded Settings   | Externalize configuration       | - [ ] Keep settings in registry + store setters; forbid ad-hoc settings in random modules  |
| Unbounded Values     | Enforce validation              | - [ ] Apply min/max/enum constraints; forbid accepting arbitrary values                     |
| Generated Input      | Preserve source authority       | - [ ] Derive from code and metadata; forbid parsing a generated projection as input          |
| Check-time Mutation  | Preserve drift evidence         | - [ ] Compare only in `--check`; forbid writing or invoking a generating prerequisite        |
