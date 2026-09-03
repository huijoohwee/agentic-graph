# agentic-graph Computing Data Flows: Reference Abstraction

**Context**: External node-editor computing-flow references.
**Intent**: Capture the transferable contract for agentic-graph Storyboard Widget without copying external tutorial code, component names, sample routes, or library dependencies.
**Directive**: Treat external examples as inspiration only. Runtime behavior must remain native Canvas/Storyboard Widget, project-agnostic, and source-driven by GraphData, registry ports, and frontmatter flow settings.

---

## Transferable Concepts

The relevant pattern is not a vendor component tree. The reusable model is:

- Node-local user input may update a node data/property field.
- Edges bind a source handle/port to a target handle/port.
- Target nodes read connected upstream values by handle/port key.
- Nodes with multiple handles require stable per-handle ids so values do not collapse into one generic input.
- Transform nodes may compute new values from connected inputs and expose those values through output ports.
- Branch nodes may route data by setting one output port to a value and leaving other branch ports empty.
- Empty branch values are stop signals and must not be interpreted as meaningful downstream data.

This maps to agentic-graph as:

| Reference Concept | agentic-graph Owner | Contract |
| --- | --- | --- |
| Node data update | GraphData node `properties` | Values are stored as typed node properties, not renderer-local UI state. |
| Handle/port identity | `edge.properties['flow:sourcePortKey']` / `edge.properties['flow:targetPortKey']` | Edges are port-bound structurally. |
| Connected-value lookup | `computeFlowConnectedValuesBySchemaPath()` | Connected values derive from graph + registry, not from DOM state. |
| Multi-handle node | Widget registry `ports[]` | Input/output ports carry stable `portKey`, `direction`, and `schemaPath`. |
| Transform node | Registry `schemaMappings[]` or node `properties['flow:compute']` | Computation is graph-authored and guarded by frontmatter flow settings. |
| Conditional branch | Empty output value | `null` / `undefined` output is a route stop, not a propagated payload. |

---

## Storyboard Widget Requirements

1. Storyboard Widget must not import, bundle, or depend on external flow-rendering libraries for computing-flow behavior.
2. Storyboard Widget must render the same GraphData contract as Flow Canvas while keeping Storyboard Widget overlay/runtime state isolated from Flow Canvas view state.
3. Computed data propagation must be owned by shared flow dataflow helpers, not by widget components.
4. Storyboard Widget fields may display connected values, but field display must not recompute the graph or mutate upstream nodes.
5. Runtime compute is enabled only through frontmatter flow settings and must remain bounded, cached, and deterministic.
6. Branch-stop semantics must apply by value, not by node id, label, filename, or demo route.
7. Repeated visible labels such as `Value` must not become repeated control identities: Field rows and port rows must derive DOM ids and accessible names from the row role, schema path, occurrence, and semantic port key while preserving the authored `portKey` used by edges.
8. When a field row and a port row resolve to the same normalized schema path, the Storyboard Widget must render one inline-editable KTV row with the port handle on that row and suppress the duplicate read-only row. This is UI consolidation only; edge and compute identity remains the semantic `key` / `portKey`.

---

## Demo Shape

A computing-flow demo should be authored as a neutral graph:

- source nodes with numeric/string/object properties,
- transform nodes that declare input/output ports,
- an aggregation node that computes a derived payload,
- a branch node that writes to one of several output ports and leaves inactive ports empty,
- sink/debug nodes that show propagated results.

When several nodes expose a visible `Value` row, each row must still carry a distinct schema path and each handle must carry a distinct semantic port key for its role. The demo should prove that changing a source `Value` row through the Storyboard Widget updates downstream connected values without renderer-local state or filename-specific branching.

When a value is both editable and connectable, the demo should show the functional port on the editable KTV row itself. It should not create a second non-inline port row or depend on declaration-container names such as `handles.source` / `handles.target` as rendered handle keys.

The demo must avoid copied external component names, exact external sample URLs, vendor package imports, and route ids. It should prove the pattern by changing generic node values and observing downstream connected values through the existing Storyboard Widget panels.

---

## Validation

Validation should prove:

- the document parses as `frontmatter-flow` when supplied as a runtime validation input,
- at least one compute node output propagates to a downstream node,
- duplicate visible `Value` labels remain editable because control identity is schema-path scoped,
- matching editable field rows and functional port rows consolidate into one inline KTV row,
- multi-handle rows have unique accessible names without changing the structural port keys used by edges,
- copied external tutorial names/routes/packages are absent from validation inputs,
- empty runtime validation files are treated as absent inputs rather than backfilled fixtures,
- repo code stays native and does not import external flow-rendering packages.
