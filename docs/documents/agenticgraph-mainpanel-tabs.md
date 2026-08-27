# AgenticGraph MainPanel Tabs

Editable MainPanel tab descriptions used by Help KTV rows.

Keep `Key` aligned to `MainPanelTabKey`. Keep `Type` aligned to the shared MainPanel Help Icon Library. Keep `Value` concise for the MainPanel Help KTV row. Put longer explanatory copy in `Details`.

| Key | Type | Value | Details |
| --- | --- | --- | --- |
| collaboration | mainPanel.collaboration | Peer sessions | Manage peer sessions, invites, answers, roster state, and follow mode. |
| integrations | mainPanel.integrations | Provider readiness | Configure model, media, provider, and API readiness rows. |
| mcp | mainPanel.mcp | MCP readiness | Review MCP readiness, local setup notes, and tool-provider routing. |
| maps | mainPanel.maps | Geospatial setup | Configure geospatial providers, map APIs, directions, and discovery defaults. |
| commerce | mainPanel.commerce | Commerce readiness | Review commerce readiness, checkout diagnostics, proofs, and payment traces. |
| research | mainPanel.research | Thesis compiler | Compile selected Source Files into reviewable thesis candidates. |
| design | mainPanel.design | Design inspection | Inspect design surfaces, DOM layers, tokens, and visual structure. |
| workflowManager | mainPanel.workflowManager | Workflow registry | Manage workflow registry, graph fields, shared `/` and `@` command inventory, mappings, and pipeline controls. |
| dashboard | mainPanel.dashboard | Runtime summary | Review runtime status, graph stats, and quick operational summaries. |
| preview | mainPanel.preview | Rendered preview | Preview rendered markdown, media, diagrams, and selected canvas output. |
| settings | mainPanel.settings | Shared settings | Configure shared UI, workspace, storage, parser, renderer, and chat settings. |
| history | mainPanel.history | Activity review | Review panel history, activity, and recent runtime events. |
| help | mainPanel.help | Help reference | Browse shortcuts, behavior references, workflow links, and icon semantics. |

Skills & Commands now lives in the FloatingPanel header as the button immediately beside Props Panel, so slash-invokable skills stay close to widget and node authoring actions without occupying a MainPanel tab or coupling to Props Panel layout.
