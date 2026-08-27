
# AgenticGraph Parser + Schema Config (Workflow SSOT)

## SSOT UI Surfaces

- Parser and Schema Configurator UI live only in **MainPanel → Workflow**.
- The bottom surface does not own Parser/Schema tabs and must not embed any Monaco text editors for these concerns.
- Parser routing metadata for runtime-ready Markdown lives in the source document frontmatter as `kgParserRoutingContract`. MainPanel Workflow may inspect or validate this contract, but it must not create duplicate routing aliases or rewrite renderer ownership downstream.

## File-Based Editing (Editor Workspace)

- Parser script text is edited only via the Editor workspace file: `/parser/parser.py`.
- Schema configuration is edited only via the Editor workspace file: `/schema/schema.json`.

## Sync Rules

- Workspace autosave propagates:
  - `/parser/parser.py` → `useParserUIState.scriptText`
  - `/schema/schema.json` → `useGraphStore.schema` (only when JSON parses; otherwise schema op status reports parse failure)
- Source-owned graph topology propagates from explicit fields only: `flow.edges`, workflow edges, Mermaid diagram edges, and Strybldr storyboard edges. Parser/schema surfaces must preserve fork, branch, review, runtime, and publish relationships as graph edges rather than reclassifying them through filename or renderer-specific rules.

## Spotlight / Discoverability

- Workflow tool buttons retain `data-kg-spotlight-tab="parser"` and `data-kg-spotlight-tab="schema"` anchors.
