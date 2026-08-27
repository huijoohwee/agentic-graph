# Port Handles and Subgraph Layout

## End-to-end pipeline

- Import: markdown is loaded into the parser registry and parsed via the markdown JSON-LD builder.
- Parse: Markdown → JSON-LD (`buildMarkdownJsonLd`) including Mermaid parsing for nodes/subgraphs.
- Derive: JSON-LD → GraphData (`parseJsonLd`).
- Layout: seeded Mermaid layout + force simulation constraints (16:9 centering, no-overlap forces).
- Render: SVG layers update on simulation ticks with stable X/Y/Z ordering (Groups < Links < Nodes < Port Handles < Labels).
- Parse (non-markdown): the auto parser attempts a worker-based parse first (when available), then falls back to synchronous parsing.

## Node Shape Mode

- Toolbar toggle switches node rendering between circle (default) and rectangular shapes.
- This is schema-driven (`behavior.nodeShapeMode`) and triggers a simulation update to adjust collision boundaries, preventing drift/overlap.
- Node labels remain anchored to node positions across toggles (multi-line labels do not override the parent text anchor).
- Rich Media panels (images/video/iframe) use media-specific sizing (decoupled from rect node sizing) to prevent cross-feature coupling.
- Label viewport adjustment is bounded and only applies near the viewport to prevent “fly-away” offsets when nodes are far offscreen.
- Node/group labels with more than 20 words are clamped (ellipsis) in-canvas and expanded via the shared hover tooltip on hover. Labels are interactive (hover/click) even when truncated.

## Frontmatter Mode

- When enabled, the canvas renders only nodes/edges derived from the frontmatter Mermaid block.
- For the demo markdown slide file, this corresponds to the Mermaid frontmatter lines 19–50 and is validated by tests.

## Port Handles

- Port handles are rendered as cardinal markers when enabled in schema behavior.
- `behavior.portHandles.showAllInputs=true` forces Flow scene-building to inject default in/out handles on nodes that otherwise have no incident edges.
- Border nodes (topology-derived input/output) render handles on border-facing sides (Input: left/top, Output: right/bottom, direction-aware).
- Edge endpoints respect the same role/direction rules so the visible handle placement matches the rendered attachment point.
- Flow edges may optionally bind to explicit port ids via `edge.properties['flow:sourcePortKey'|'flow:targetPortKey']` (for schema-field ports, values are `field:<id>`). When present, Flow scene-building uses these port ids for endpoint attachment.
- Nodes may define stable schema-field ports via `node.properties['schema:fields']` so Flow/StoryboardWidget can render per-field port markers even before any edges exist.
- When schema-field ports are used, edge validation also checks that referenced field ids exist on each node and (when both sides provide `type`) denies incompatible `type` pairs.
- UI surfaces may render a label override for port-bound edges via `edge.properties['flow:displayLabel']` (fallback remains `edge.label`).
- Edge creation uses the same port metadata: dragging from a port dot writes `flow:sourcePortKey` / `flow:targetPortKey`, while non-port edges omit those keys and fall back to `edge.id`.
- When the Storyboard Widget is open, its port dots are the edge-creation surface for the selected node (native Flow handles are suppressed).
- Storyboard Widget KTV rows use normalized schema paths to merge matching functional ports into the editable field row. This prevents a duplicated non-inline row for the same semantic key while preserving the authored `key` / `portKey` used by edges and computing-flow propagation.
- `handles.source` and `handles.target` define which semantic keys are available on each side; they are not port ids themselves and must not appear as replacement handle names in rendered rows or edge metadata.
- Toggling port handles updates rendering only and preserves node positions.
- Group bounds account for port handle extents so handle markers do not protrude beyond their containing group.

## Graph Layers / Subgraphs

- Mermaid subgraphs are parsed and rendered as group containers with an interactive text label.
- Seed layout distributes top-level subgraphs across the available 16:9 space using a grid placement strategy, then recenters the collective subgraph centroid to the canvas center.
- Simulation anchoring respects subgraph membership targets, helping prevent overlap and avoiding single-axis “long line” clustering.
- Group rendering supports `layout.groups.shape`:
  - `rect` (default): rectangular group containers.
  - `geo`: geometry-based outlines computed from member node extents (native implementation; no external geometry libraries).
  - Switching group shape updates the groups overlay layer only (no simulation rebuild / no re-layout).

### Group Label Interactions

- Single-click group label: selects the group only.
- Double-click group label: selects the group plus its member nodes and member-to-member edges.
- Drag group label: drags the entire group by moving all member nodes together.
- Group label positioning uses per-group font sizing and top-left anchoring inside the group container.
- Group labels with more than 20 words are clamped (ellipsis) in-canvas and expanded via the shared hover tooltip on hover.

## Performance

- Presentation toggles update layers in place; schema dependency keys are narrowed to leaf fields to avoid unrelated schema edits triggering a full scene rebuild.
- Radial layout is structured; entering radial recomputes its layout unless a valid radial cache exists, preventing cross-mode cache contamination.
- Radial layout applies a bounded post-relaxation pass using the existing bbox-collide force to reduce overlaps without starting an indefinite simulation.
- Group and edge labels follow the same zoom LOD hide threshold as node labels to reduce clutter when zoomed out.

## Markdown Heading Layers

- Markdown headings (`Section` nodes with `properties.level`) are rendered as nested graph layers (H2 inside H1, H3 inside H2, etc).
- Heading layers are visual-only containers: heading nodes are not rendered as normal nodes on the canvas.
- Heading layer labels ellipsize to avoid overflow and visual overlap; hover tooltip still exposes the full text consistently.
- Membership is derived from existing document structure edges (`hasSection`, `hasBlock`, `hasItem`, `embedsImage`) to avoid duplicated parsing logic.
