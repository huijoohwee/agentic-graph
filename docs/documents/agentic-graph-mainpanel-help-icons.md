# agentic-graph MainPanel Help Icons

Editable MainPanel Help Icon Library Values used by KTV rows.

Keep `Key` aligned to the Help icon text key in source. Keep `Type` aligned to the shared MainPanel Help Icon Library semantic icon key. Update `Value` and optional semicolon-separated `Details` here when Help icon row text should change.

| Key | Type | Value | Details |
| --- | --- | --- | --- |
| iconLegend.header | mainPanel.help | Shared icon legend | Shows the semantic icon library used by MainPanel tabs, FloatingPanel views, Workflow Manager graph fields, and shared KTV rows. |
| iconDensity.settings | mainPanel.settings | UI density setting | Icons in toolbars, headers, and this legend follow UI Density: Icons in Panel Settings. |
| reuse.contract | ktv.type.static | One icon source | MainPanel and FloatingPanel icon semantics stay shared across Help, Workflow Manager, Command Menu, and KTV-driven panel rows. |
| graphDataTable.mapping | mainPanel.workflowManager | Graph Data Table mapping | Workflow Manager graph field icons map node and edge fields to table visibility, scope, origin, and value kinds. |
| collaboration.peer | collaboration.peer | Remote actor | Identifies participants, peer count, ownership rows, and local/remote presence. |
| collaboration.session | collaboration.session | Shared runtime state | Marks the active host/guest session, role, phase, and session identifiers. |
| collaboration.runtime | collaboration.runtime | Connected operation | Marks live runtime status, successful handshakes, and connected transport paths. |
| collaboration.transport | collaboration.transport | Disconnected operation | Marks transport rows before the peer channel is connected. |
| collaboration.follow | collaboration.follow | Attention routing | Marks cursor-follow and peer-target selection rows. |
| collaboration.connection | collaboration.connection | Bidirectional transfer | Marks host, join, answer, and peer connection actions. |
| collaboration.link | collaboration.link | Shareable reference | Marks invite URLs, endpoints, and external reference values. |
| collaboration.copy | collaboration.copy | Portable payload | Marks copyable invite and answer tokens. |
| collaboration.removePeer | collaboration.removePeer | Roster mutation | Marks owner-only peer removal actions. |
| setting.text | setting.text | String scalar | Marks plain text, provider names, model names, prompts, and enum-like values. |
| setting.number | setting.number | Numeric scalar | Marks integer, decimal, duration, limit, and ratio settings. |
| setting.boolean | setting.boolean | Binary flag | Marks on/off controls, readiness flags, and confirmation toggles. |
| setting.object | setting.object | Structured payload | Marks JSON, object, request body, response format, and config-map settings. |
| setting.list | setting.list | Ordered values | Marks arrays, multi-select options, and route/tool collections. |
| setting.dateTime | setting.dateTime | Temporal scalar | Marks timestamp, schedule, and expiry values. |
| setting.url | setting.url | External reference | Marks endpoint URLs, docs URLs, routes, and hosted asset references. |
| action.clear | action.clear | Non-destructive erase | Marks reset and clear actions that do not remove underlying graph data. |
| ktv.type.static | ktv.type.static | Local static value | Marks rows whose value is built in and does not require a live provider. |
| ktv.type.preset | ktv.type.preset | Reusable preset | Marks rows that apply a named preset or reusable configuration. |
| ktv.type.tiles | ktv.type.tiles | Map tile source | Marks rows backed by tiled map or spatial data sources. |
| ktv.type.style | ktv.type.style | Visual style source | Marks rows that choose or edit visual styling, style URLs, and renderer appearance. |
| ktv.type.globe | ktv.type.globe | Globe projection | Marks rows that switch projection, globe, or geospatial rendering modes. |
| ktv.type.color | ktv.type.color | Visual token | Marks color and palette controls. |
| ktv.type.scale | ktv.type.scale | Numeric visual tuning | Marks scale, radius, multiplier, and sizing controls. |
| ktv.type.action | ktv.type.action | Operator command | Marks rows that trigger an immediate command or request. |
| ktv.type.toggle | ktv.type.toggle | Binary control | Marks on/off row controls. |
| ktv.type.browser | ktv.type.browser | Browser capability | Marks rows that use browser APIs, location, navigation, or external references. |
| ktv.type.duration | ktv.type.duration | Time-bound value | Marks timeout, duration, TTL, and millisecond values. |
| ktv.type.size | ktv.type.size | Capacity limit | Marks byte, memory, and payload-size limits. |
| mainPanel.collaboration | mainPanel.collaboration | Peer session surface | MainPanel tab for owner/guest peer sessions, invites, and roster state. |
| mainPanel.integrations | mainPanel.integrations | Provider configuration | MainPanel tab for chat, model, image, video, and provider API settings. |
| mainPanel.mcp | mainPanel.mcp | Tool configuration | MainPanel tab for browser, crawler, provider, and payment MCP readiness. |
| mainPanel.maps | mainPanel.maps | Geospatial configuration | MainPanel tab for map providers, directions, and GeoJSON settings. |
| mainPanel.commerce | mainPanel.commerce | Commerce operations | MainPanel tab for ACP, Stripe, Web3, OpenBOX, proof, and trace readiness. |
| mainPanel.research | mainPanel.research | Thesis compiler | MainPanel tab for compiling selected Source Files into reviewable thesis candidates. |
| mainPanel.design | mainPanel.design | Design surface | MainPanel tab for design renderer and page/component inspection. |
| mainPanel.workflowManager | mainPanel.workflowManager | Workflow curation | MainPanel tab for graph fields, mappings, and workflow registry management. |
| mainPanel.dashboard | mainPanel.dashboard | Surface summary | MainPanel tab for runtime status and dashboard metrics. |
| mainPanel.preview | mainPanel.preview | Rendered preview | MainPanel tab for previewing rendered output. |
| mainPanel.settings | mainPanel.settings | Shared settings | MainPanel tab for all settings rows and settings-derived hub views. |
| mainPanel.history | mainPanel.history | Event review | MainPanel tab for history and log review. |
| mainPanel.help | mainPanel.help | Operator reference | MainPanel tab for shortcuts, Command Menu catalog, workflow links, panel tour, and icon library. |
| floatingPanel.propsPanel | floatingPanel.propsPanel | Selection properties | FloatingPanel view for node, edge, widget, and media properties. |
| floatingPanel.skillsCommands | floatingPanel.skillsCommands | Skills and commands | FloatingPanel view for skill discovery, command references, and guided operator actions. |
| floatingPanel.view | floatingPanel.view | Data view controls | FloatingPanel view for workspace data-view settings. |
| floatingPanel.media | floatingPanel.media | Media list | FloatingPanel view and SSOT for current `@` image, audio, video, webpage, iframe, YouTube, and graph rich-media candidates; the full `/`, `@`, and `#` command catalog lives in MainPanel Help → Command Menu. |
| floatingPanel.animation | floatingPanel.animation | XR choreography | FloatingPanel view for native character motions, action paths, shared Timeline transport, upstream `/animation.control` invocation, and deterministic motion-reference export. |
| floatingPanel.motionControl | floatingPanel.motionControl | Local pose control | FloatingPanel view for explicit browser camera capture, official LiteRT pose inference, confidence and backend telemetry, `/motion.control @canvas #pose`, and local XR motion projection. |
| floatingPanel.camera | floatingPanel.camera | Camera framing | The sole FloatingPanel camera editor over the shared storyboard and live Three camera owner; it owns no duplicate board model or graph update path. |
| floatingPanel.interaction | floatingPanel.interaction | Canvas controls | FloatingPanel view for pointer, pan, zoom, and interaction settings. |
| floatingPanel.design | floatingPanel.design | Design controls | FloatingPanel view for design layers, inspector, tokens, and DOM views. |
| floatingPanel.chat | floatingPanel.chat | Assistant interface | FloatingPanel view for chat runs and AGENTIC_OS output creation. |
| floatingPanel.geo | floatingPanel.geo | Map interaction | FloatingPanel view for geospatial inspection and map interaction. |
| floatingPanel.renderer | floatingPanel.renderer | Rendering controls | FloatingPanel view for renderer presets and visualization controls. |
| floatingPanel.storyboardWidget | floatingPanel.storyboardWidget | Flow editing | FloatingPanel view for Storyboard Widget field and graph editing controls. |
| floatingPanel.flowchart | floatingPanel.flowchart | Flowchart inspection | FloatingPanel view for flowchart-oriented diagram controls and inspection. |
| floatingPanel.gitGraph | floatingPanel.gitGraph | Git history graph | FloatingPanel view for GitGraph history, branch topology, and commit inspection. |
| floatingPanel.gantt | floatingPanel.gantt | Gantt planning | FloatingPanel view for Gantt-timeline inspection and planning controls. |
| floatingPanel.timeline | floatingPanel.timeline | Timeline playback | FloatingPanel view for timeline playback and review controls. |
| floatingPanel.architecture | floatingPanel.architecture | Architecture diagram | FloatingPanel view for architecture diagram inspection and structured rows. |
| floatingPanel.eventModeling | floatingPanel.eventModeling | Event modeling | FloatingPanel view for event-modeling diagram inspection and structured rows. |
| floatingPanel.strybldr | floatingPanel.strybldr | Image storyboard orchestration | FloatingPanel view for image reverse engineering, element cards, and video handoff. |
| floatingPanel.graphTraversal | floatingPanel.graphTraversal | Path reasoning | FloatingPanel view for graph traversal and orchestrator workflow controls. |
| invocation.prefix.slash | invocation.prefix.slash | Slash command fallback | Default icon for slash commands when no narrower subject applies. |
| invocation.prefix.hash | invocation.prefix.hash | Semantic keyword fallback | Default icon for `#` semantic invocations when no narrower subject applies. |
| invocation.prefix.at | invocation.prefix.at | Binding reference fallback | Default icon for `@` binding invocations when no narrower subject applies. |
| invocation.subject.agent | invocation.subject.agent | Agent command | Robot icon for Chat skills and slash commands whose label or token identifies an agent. |
| invocation.subject.story | invocation.subject.story | Story command | Subject icon for storybuilding, storyboard, script, and narrative invocations. |
| invocation.subject.video | invocation.subject.video | Video command | Subject icon for video, film, camera, media, animatic, and render invocations. |
| invocation.subject.research | invocation.subject.research | Research command | Subject icon for research, thesis, search, query, and evidence invocations. |
| invocation.subject.memory | invocation.subject.memory | Memory command | Subject icon for memory, session, soul, remember, and compaction invocations. |
| invocation.subject.profile | invocation.subject.profile | Profile command | Subject icon for profile, personality, persona, user, and MoA invocations. |
| invocation.subject.care | invocation.subject.care | Care command | Subject icon for care, health, medical, and clinical invocations. |
| field.scope.node | field.scope.node | Node-level property | Field attached to nodes; use for node attributes such as title or type. |
| field.scope.edge | field.scope.edge | Edge-level property | Field attached to edges; use for relationship attributes such as weight or labels. |
| field.origin.custom | field.origin.custom | User-defined property | Schema-defined field created by the user; stored alongside node or edge properties. |
| field.origin.derived | field.origin.derived | Computed metadata | Field computed from graph data; treated as derived metadata for nodes or edges. |
| field.visibility.show | field.visibility.show | Visible column | Field is visible as a column in the Graph Data Table view. |
| field.visibility.hide | field.visibility.hide | Hidden column | Field remains available but is hidden from the Graph Data Table view. |
| field.type.singleLineText | field.type.singleLineText | Short string property | Short, single-line text values such as titles, names, or labels. |
| field.type.longText | field.type.longText | Long string property | Longer freeform text such as descriptions, notes, or documents. |
| field.type.number | field.type.number | Numeric scalar | Whole-number numeric values such as counts or discrete scores. |
| field.type.decimal | field.type.decimal | Numeric scalar decimal | Numeric values with decimals such as probabilities or ratios. |
| field.type.checkbox | field.type.checkbox | Boolean flag | True/false flags representing toggles, switches, or binary states. |
| field.type.multiSelect | field.type.multiSelect | List of categorical values | Array of selected options such as tags or multi-label categories. |
| field.type.singleSelect | field.type.singleSelect | Categorical value | Single selected option from a fixed set such as status or type. |
| field.type.dateTime | field.type.dateTime | Temporal value | Timestamp or date-time string used for temporal reasoning or filtering. |
| field.type.url | field.type.url | URI string | Link or URL string pointing to external resources or documents. |
| field.type.currency | field.type.currency | Monetary numeric | Numeric values representing currency amounts such as prices or balances. |
| field.type.json | field.type.json | Structured JSON payload | Structured JSON objects used for nested metadata or model outputs. |
