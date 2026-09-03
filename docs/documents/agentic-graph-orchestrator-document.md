
# agentic-graph Orchestrator (Graph Traversal)

## SSOT UI Surface

- The Orchestrator UI lives only in the Canvas Floating Panel **Graph Traversal** view.
- Legacy bottom-surface Orchestrator UI/Text editors are removed and must not be reintroduced.

## Configuration Editing

- Freeform Orchestrator configuration text editing happens in the **Editor workspace** (Markdown Workspace shell) via workspace files.
- Canonical workflow file path: `orchestrator/graphrag-workflow.jsonld`.

## Runtime Behavior

- The Graph Traversal view is responsible for running traversal presets/sequence and writing traversal summaries back into GraphData metadata.
- The workflow JSON-LD text is synchronized into host state (`graphRagWorkflowJsonText`) so traversal runs and indexing remain consistent.
