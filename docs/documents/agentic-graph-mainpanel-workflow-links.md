# agentic-graph MainPanel Workflow Links

Editable MainPanel Help workflow-link Values used by KTV rows.

Keep `Key` aligned to the Help workflow-link text key in source. Keep `Type` aligned to the shared MainPanel Help Icon Library. Keep `Value` concise for the MainPanel Help KTV row. Put longer explanatory copy in semicolon-separated `Details`.

| Key | Type | Value | Details |
| --- | --- | --- | --- |
| workflow.open | mainPanel.workflowManager | Graph Fields | Includes Graph Fields. |
| pipeline.ingestValidate | ktv.type.preset | Ingest / validate | Ingest -> load inputs via Loader, Parser, and Validator -> produce canonical GraphData with stable IDs and preserved provenance. |
| pipeline.renderInspect | ktv.type.preset | Render / inspect | Render -> visualize in 2D/3D/map without mutating GraphData -> keep appearance a late, replaceable decision. |
| pipeline.agenticReasoning | ktv.type.preset | Agentic reasoning | Orchestrator -> run traversal presets and inspect AgenticRAG context -> keep multi-hop graphRAGPath reasoning grounded in schema and provenance. |
| cluster.layers | ktv.type.style | Cluster layers | Phases render on the canvas as soft grouped outlines around owned steps.; Any JSON-LD node with an array property of node ids or compact IRIs creates a cluster layer surface around its members.; Appearance comes from schema.metadata["canvas:graphLayers"], exposed as editable Graph Fields presets. |
| agentic.labels | ktv.type.static | Shared labels | Shared labels explain each reasoning stage without adding renderer-specific aliases. |
| markdown.entryPoints | ktv.type.browser | Index entry points | Run codebase indexing from any listed surface. |
| workflow.entry.mainPanel | mainPanel.workflowManager | MainPanel entry | Workflow Manager tab -> Step 6 (Agentic reasoning) -> Run codebase index pipeline. |
| workflow.entry.bottomPanel | floatingPanel.renderer | Bottom panel entry | Render tab -> Markdown pipeline helper section -> Run codebase index pipeline. |
| workflow.entry.workspace | mainPanel.dashboard | Workspace entry | Toolbar -> Floating Panel -> Run pipeline. |
| graphrag.metadata | ktv.type.browser | graphRAGPath metadata | Path metadata traces canvas, pipeline, stores, and workflow entry points into the rendered graph. |
| graphrag.canvasEntry | ktv.type.browser | Canvas path | canvas/src/pages/Canvas.tsx -> canvas/src/components/GraphCanvas.tsx -> canvas/src/workers/graphParser.worker.ts -> rendered graph. |
| graphrag.markdownPipeline | ktv.type.action | Markdown pipeline | npm run codebase:index -> codebase-index/graph.jsonl plus schema and orchestrator config. |
| graphrag.storesWorkflow | ktv.type.static | Stores workflow | canvas/src/hooks/store/schemaSlice.ts and canvas/src/hooks/store/historySlice.ts -> Main Panel Workflow Manager tab -> python -m agentic_graph_parser markdown -> Agentic GraphRAG-ready markdown graph snapshot. |
