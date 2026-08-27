# AgenticGraph — Flow Diagrams: Parser Logic, Routing Keys, Diagram Kinds, and Surfaces

**Version**: 2.1.0
**Date**: 2026-06-12
**Status**: Canonical — supersedes `agenticgraph-compute-integrity-document.md` v1.0.0
**Owner**: AgenticGraph canonical docs
**Scope**: `flow_diagrams` frontmatter entries, parser derivation, surface routing, compute integrity

---

## Parser Logic: `deriveFlowDiagramsWidgets`

`markdownFrontmatterFlowGraph.flowDiagrams.ts` reads every `flow_diagrams` entry and either routes it to diagram panels or derives fallback canvas nodes. The path depends on the diagram kind and whether the entry declares `floatingPanelView` + `bottomPanelTab` routing keys.

### Fallback derivation (only when routing keys are absent)

```
FlowDiagramSource  →  TextGeneration (compute)  →  RichMediaPanel
flow-diagram-{key}-source  flow-diagram-{key}-compute  flow-diagram-{key}-panel
```

Without routing keys, the `TextGeneration` compute node runs a shared inline compute that parses the Mermaid source and emits:
- `output` — fenced Mermaid code block + term summary
- `outputSrcDoc` — HTML panel with parsed terms, chart (gitgraph/gantt), and raw source

### Routed diagram surfaces (all typed diagram kinds, when routing keys are declared)

When a typed diagram entry declares **both** `floatingPanelView` and `bottomPanelTab`, `routedToPanelSurfaces = true`:

```
[no FlowDiagramSource, TextGeneration, RichMediaPanel, or edges derived]
```

The row list and chart are served by the existing FloatingPanel and BottomPanel diagram views instead.

### `routedToPanelSurfaces` guard

```ts
// Universal rule: when both floatingPanelView and bottomPanelTab are declared,
// skip ALL canvas derivation (source + compute + panel + edges) for that entry.
// The FloatingPanel and BottomPanel read directly from raw frontmatter YAML —
// no canvas nodes are needed. There are no kind-specific exceptions.
const routedToPanelSurfaces = !!(floatingPanelView && bottomPanelTab)
```

**Before** (partial skip — source/compute nodes still appeared as canvas widgets):
```ts
if (!spec.routedToPanelSurfaces) {
  appendNodeIfMissing(panelNode)   // panel skipped
  // source + compute still added as canvas nodes ← unwanted widgets
}
```

**After** (full skip — no canvas presence):
```ts
if (spec.routedToPanelSurfaces) continue  // skip all: source, compute, panel, edges
```

**Critical invariant**: `routedToPanelSurfaces` is kind-agnostic. If routing keys are present, Flowchart, GitGraph, Architecture, EventModeling, Gantt, and Timeline all skip derived canvas fallback nodes for that entry.

### Pre-authored node guard

`appendNodeIfMissing` skips any node whose ID already exists in `meta.nodes`. If a `flow-diagram-{key}-source/compute/panel` node is pre-authored in the `flow:` block, the parser never re-derives it — and the `routedToPanelSurfaces` skip logic never fires.

**Consequence**: stale pre-authored `flow-diagram-*` nodes in the `flow:` block bypass routing-key checks and cause typed diagrams to appear in the canvas or Rich Media Panel path. **They must be removed.**

The `doc:sanity` check (`checkRunnableStoryboardWidgetDemoCompliance`) and the Kiro hook enforce this by forbidding authored `flow-diagram-*` nodes in committed documents.

---

## Diagram Kinds and Their Surfaces

| Diagram type | `kind` | FloatingPanel (`renderMode="list"`) | BottomPanel (`renderMode="diagram"`) | RichMediaPanel |
|---|---|---|---|---|
| `mermaid_architecture` | `architecture` | ✓ `ArchitectureFloatingPanelView` | ✓ `ArchitectureBottomPanelView` | ✗ skipped when routing keys set |
| `mermaid_eventmodeling` | `eventmodeling` | ✓ `EventModelingFloatingPanelView` | ✓ `EventModelingBottomPanelView` | ✗ skipped when routing keys set |
| `mermaid_flowchart` | `flowchart` | ✓ `FlowchartFloatingPanelView` | ✓ `FlowchartBottomPanelView` | ✗ skipped when routing keys set |
| `mermaid_gitgraph` | `gitgraph` | ✓ `GitGraphFloatingPanelView` | ✓ `GitGraphBottomPanelView` | ✗ skipped when routing keys set |
| `mermaid_gantt` | `gantt` | ✓ `GanttBottomPanelView` (row list) | ✓ `GanttBottomPanelView` (chart) | ✗ skipped when routing keys set |
| `mermaid_timeline` | `timeline` | ✓ `TimelineBottomPanelView` | ✓ `TimelineBottomPanelView` | ✗ skipped when routing keys set |
| any type (no routing keys) | — | — | — | ✓ always derived |

**Universal rule**: routing keys present → zero canvas nodes (source, compute, panel, edges all skipped). No routing keys → standard derivation. **No kind-specific exceptions.**

**FloatingPanel surface**: `renderMode="list"` — shows parsed row list only. Never shows the chart.

**BottomPanel surface**: `renderMode="diagram"` — shows the Mermaid-rendered chart only. Never shows the row list.

---

## Routing Key Contract

Every `flow_diagrams` entry that should appear in FloatingPanel/BottomPanel must declare:

```yaml
flow_diagrams:
  value:
    my_diagram:
      type: mermaid_architecture       # or mermaid_eventmodeling / mermaid_flowchart / mermaid_gitgraph / mermaid_gantt
      floatingPanelView: "architecture" # exact string from BottomSurfaceTab / FloatingPanelView type
      floatingPanelOpen: true           # open FloatingPanel on load
      bottomPanelTab: "architecture"    # exact string from BottomSurfaceTab type
      bottomPanelOpen: true             # open BottomPanel on load
      value: |-
        architecture-beta
        ...
```

Valid values per diagram type:

| `type` | `floatingPanelView` | `bottomPanelTab` |
|---|---|---|
| `mermaid_architecture` | `"architecture"` | `"architecture"` |
| `mermaid_eventmodeling` | `"eventModeling"` | `"eventModeling"` |
| `mermaid_flowchart` | `"flowchart"` | `"flowchart"` |
| `mermaid_gitgraph` | `"gitGraph"` | `"gitGraph"` |
| `mermaid_gantt` | `"gantt"` | `"gantt"` |
| `mermaid_timeline` | `"timeline"` | `"timeline"` |

These strings must exactly match the `BottomSurfaceTab` and `FloatingPanelView` union types in `src/hooks/store/store-types/core.ts` and `graph-state-chat-import.ts`.

### Doc-level panel open keys

The document should also carry doc-level keys that control which panel is open on load. Typically set to the most informative diagram type in the document:

```yaml
kgBottomPanelOpen: true
kgBottomPanelTab: "eventModeling"   # or "architecture", "flowchart", "gitGraph", "gantt"
kgFloatingPanelOpen: true
kgFloatingPanelView: "eventModeling"
```

---

## Stale Pre-Authored Node Prohibition

The parser's `appendNodeIfMissing` call means any `flow-diagram-*` node that already exists in the `flow:` block **blocks** the parser from re-deriving that node. This permanently freezes the routing-skip logic for that entry.

**Forbidden**: committing any of these node IDs to the `flow:` block:
- `flow-diagram-{key}-source`
- `flow-diagram-{key}-compute`
- `flow-diagram-{key}-panel`

**Correct**: keep `flow:` nodes clean of `flow-diagram-*` entries. The parser derives them at load time. Only the `flow_diagrams:` frontmatter entries (with routing keys) need to be authored.

---

## Compute Function Integrity

Every inline compute function must produce correct, deterministic output from its declared inputs.

### Forbidden: `* 1000` scaling multipliers

Input fields store real dollar amounts. No secondary scaling:

```js
// FORBIDDEN
const rev0 = rn('input_initial_revenue', 42) * 1000;
const thr  = mt * 1000;

// CORRECT
const rev0 = rn('input_initial_revenue', 420000);
const thr  = mt;
```

### Forbidden: stale frozen materialized output

Commit output fields in idle state (empty) or exactly matching a fresh compute run:

```yaml
output: {key: output, type: markdown, value: ""}
imageUrl: {key: imageUrl, type: svg_data_uri, value: ""}
outputSrcDoc: {key: outputSrcDoc, type: html_srcdoc, value: ""}
run_status: {key: run_status, type: string, value: "idle"}
```

Forbidden hardcoded inflated values: `$150,529,352`, `$350,000,000`, `$360,944,612`, `$1,061,546 at 37%`.

---

## Enforcement Layers

| Layer | What it checks | Trigger |
|---|---|---|
| `doc:sanity` `checkComputeIntegrity()` | `* 1000` bugs, inflated output values, frozen `run_status:done` output | Every `prebuild` |
| `doc:sanity` `checkRunnableStoryboardWidgetDemoCompliance()` | Required template keys, diagram routing keys per entry | Every `prebuild` |
| `test:ci` `testStoryboardWidgetComputeIntegrity()` | Same as `checkComputeIntegrity` | Every CI run |
| `test:ci` `testStoryboardWidgetDemoRunnableStructure()` | InputWidget, compute nodes, typed handles, routing keys | Every CI run |
| `test:ci` `testMarkdownFrontmatterFlowDiagramsDeriveDynamicRichMediaPanels()` | Parser derives source/compute/panel fallback only for unrouted kinds | Every CI run |
| `test:ci` `testMarkdownFrontmatterFlowGraphPublishedAgenticCanvasOsDemoArchitectureAndEventModeling()` | Typed diagram routing keys present; no derived fallback nodes for routed entries | Every CI run |
| Kiro hook `runnable-demo-compliance-check` | Runs `doc:sanity` on every `*-demo.md` save | File save |

---

## Companion References

| Document | Scope |
|---|---|
| `src/features/parsers/markdownFrontmatterFlowGraph.flowDiagrams.ts` | Parser implementation — `deriveFlowDiagramsWidgets`, `readDiagramSpecs`, `routedToPanelSurfaces` |
| `src/features/gitgraph/ArchitectureFloatingPanelView.tsx` | FloatingPanel row-list view (`renderMode="list"`) |
| `src/features/gitgraph/ArchitectureBottomPanelView.tsx` | BottomPanel chart view (`renderMode="diagram"`) |
| `src/features/gitgraph/EventModelingFloatingPanelView.tsx` | FloatingPanel row-list view (`renderMode="list"`) |
| `src/features/gitgraph/EventModelingBottomPanelView.tsx` | BottomPanel chart view (`renderMode="diagram"`) |
| `src/features/gitgraph/FlowchartFloatingPanelView.tsx` | FloatingPanel row-list view (`renderMode="list"`) |
| `src/features/gitgraph/FlowchartBottomPanelView.tsx` | BottomPanel chart view (`renderMode="diagram"`) |
| `src/hooks/store/store-types/core.ts` | `BottomSurfaceTab` union type — all valid `bottomPanelTab` values |
| `src/hooks/store/store-types/graph-state-chat-import.ts` | `FloatingPanelView` union type — all valid `floatingPanelView` values |
| `huijoohwee.github.io/guidelines/yaml-frontmatter-guidelines.md` | Full authoring contract, routing table, compute integrity rules |
| `agenticgraph-artifact-media-storage-architecture.md` | Storage, replay, Cloudflare + BytePlus + Stripe |

---

## Cache, Memory, and Loading Performance

### Large document threshold

The parser uses summary-graph mode when a document exceeds `500,000 chars` or `8,000 lines` AND does not contain a `flow:` / `flow_diagrams:` declaration. Documents with `flow:` frontmatter are always fully parsed regardless of size — the canvas needs the full graph to render widgets and edges.

The token economics demo is ~2250 lines and ~130k chars — well under both thresholds. It always receives a full parse.

### Render budget (D3 and 3D surfaces only)

`applyCanvasRenderBudget` in `src/lib/graph/canvasRenderBudget.ts` compacts large graphs for D3 and 3D surfaces:

| Surface | Max nodes | Max edges | Max incident edges/node |
|---|---|---|---|
| `d3Graph` (2D D3 renderer) | 420 | 1800 | 10 |
| `surface3d` (3D renderer) | 320 | 1200 | 8 |
| `storyboardWidget` (Storyboard Widget) | **no budget applied** | **no budget applied** | — |

Storyboard Widget canvas never has its render budget compacted. The 69 nodes in the token economics demo render without pruning.

### Schema derive cache

`schemaDeriveCacheCapacity` (localStorage key `kg:ui:schemaDeriveCache:capacity`, default 16, max 1024) controls how many derived schema computations are LRU-cached. For large multi-node documents with many port types, increasing this reduces re-computation on node selection. The token economics demo has ~14 socket types — the default capacity of 16 is sufficient.

### Render budget cache

`applyCanvasRenderBudget` uses a `WeakMap<GraphData, Map<string, GraphData>>` with LRU eviction at 16 entries (`RENDER_BUDGET_CACHE_LIMIT`). The cache key includes the semantic graph key, surface, document mode, and budget parameters. A cache hit returns the budgeted graph without re-scoring all nodes and edges — O(1) on repeated renders of the same graph revision.

### Render pipeline chain

The `useActiveGraphRenderData` hook chains five `useMemo` calls, each invalidated by `graphDataRevision`:

```
graphData
  → deriveGraphDataForActiveView       (view projection, ~O(nodes))
  → withGraphTopologyMetadata          (topology annotation, ~O(nodes + edges))
  → applyCanvasRenderBudget            (node/edge pruning — d3/3d only; no-op for storyboardWidget)
  → applyMarkdownSigilHighlights       (sigil annotation)
  → withGraphTopologyMetadata (final)  (final topology stamp)
```

For StoryboardWidget (`budgetSurface = 'none'`), `applyCanvasRenderBudget` is a no-op. The cost is dominated by `withGraphTopologyMetadata` running twice on every `graphDataRevision` increment. Every node edit, run completion, or approval triggers one increment.

### StoryboardWidget performance patterns

For StoryboardWidget documents with many nodes (>40):

1. **Use `visual:importance`** — `scoreNode` uses it to rank nodes; higher importance = retained first if budget ever applies
2. **Use `visual:nodeSize`** — larger nodes signal higher render priority  
3. **Keep edges typed with `"flow:portTypes"`** — O(1) dataflow port lookups vs O(edges) scan during `computeFlowConnectedValuesBySchemaPath`
4. **Use `kgDocumentStructureBaselineLock: false`** while authoring; once layout is stable, set `true` to skip re-derivation on every revision
5. **Use `balancedViewportPreset: "widgetFrontmatter"`** — pre-computed widget positions used by layout engine; avoids force-simulation work
6. **Set `kgAutoSaveDebounceMs: 1500`** — prevents parse-on-every-keystroke; batches edits before triggering `graphDataRevision` increment
7. **Minimize `graphDataRevision` increments** — each increment triggers the full 5-stage memoization chain; use `kgAutoSaveOn` to limit triggers to meaningful events

### Document-level performance keys (valid frontmatter)

Only these keys are read by the canvas runtime:

```yaml
kgDocumentStructureBaselineLock: false   # allow layout re-derive (set true when layout is stable)
kgWorkflowManagerModeEnabled: true       # enable workflow section nav
kgAutoSaveEnabled: true                  # debounced saves, avoid re-parse on every keystroke
kgAutoSaveDebounceMs: 1500               # 1.5s debounce (default)
kgAutoSaveOn: ["nodeEdit", "runComplete", "approval", "assetReady"]  # trigger list
```

Keys like `kgGraphCachingEnabled`, `kgLargeDocumentMode`, `kgNodeRenderBudget`, and `kgEdgeCullThreshold` are **not read by the canvas** and should not be authored.
