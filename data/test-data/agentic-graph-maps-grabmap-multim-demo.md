---
title: "agentic-graph · GrabMaps × Rich Media — MainPanel Maps Multimodal Fusion Demo"
graphId: "md:agentic-graph-maps-grabmap-multim-demo"
doc_type: "Demo"
date: "2026-04-24"
lang: en-US

kgCanvasSurfaceMode: "geospatial"
kgCanvas2dRenderer: "storyboard"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false

$schema: "kgc-pipeline/v1"

spec:
  format: kgc-pipeline
  version: "1.0.0"
  parser: yaml-frontmatter
  execution: computing-flow
  topology: DAG
  ssot_surfaces: [widget_bundle, pipeline, flow.nodes, flow.edges, mermaid, runner]

widget_bundle:
  kind: kg:flow:widgetBundle
  version: 1
  registry:
    - id: qer-GrabMapsMap-default-grabmapsMap
      isEnabled: true
      nodeTypeId: GrabMapsMap
      widgetTypeId: default
      formId: grabmapsMap
      fields:
        - {fieldKey: apiKey, fieldType: secret, schemaPath: properties.apiKey}
        - {fieldKey: baseUrl, fieldType: text, schemaPath: properties.baseUrl}
        - {fieldKey: center, fieldType: text, schemaPath: properties.center}
        - {fieldKey: zoom, fieldType: number, schemaPath: properties.zoom}
      ports:
        - {portKey: map_ready, direction: output, schemaPath: properties.map_ready}

    - id: qer-GrabMapsRoute-default-grabmapsRoute
      isEnabled: true
      nodeTypeId: GrabMapsRoute
      widgetTypeId: default
      formId: grabmapsRoute
      fields:
        - {fieldKey: coordinates, fieldType: textarea, schemaPath: properties.coordinates}
        - {fieldKey: profile, fieldType: text, schemaPath: properties.profile}
        - {fieldKey: overview, fieldType: text, schemaPath: properties.overview}
      ports:
        - {portKey: route_geometry, direction: output, schemaPath: properties.route_geometry}
        - {portKey: route_meta, direction: output, schemaPath: properties.route_meta}

    - id: qer-DroneOverlay-default-droneOverlay
      isEnabled: true
      nodeTypeId: DroneOverlay
      widgetTypeId: default
      formId: droneOverlay
      fields:
        - {fieldKey: speed_mps, fieldType: number, schemaPath: properties.speed_mps}
      ports:
        - {portKey: route_geometry, direction: input, schemaPath: properties.route_geometry}
        - {portKey: drone_icon_url, direction: input, schemaPath: properties.drone_icon_url}
        - {portKey: overlay_ready, direction: output, schemaPath: properties.overlay_ready}

    - id: qer-TextGeneration-default-textGeneration.openai
      isEnabled: true
      nodeTypeId: TextGeneration
      widgetTypeId: default
      formId: textGeneration.openai
      fields:
        - {fieldKey: prompt, fieldType: textarea, schemaPath: properties.prompt}
      ports:
        - {portKey: text_out, direction: output, schemaPath: properties.output}
        - {portKey: outputSrcDoc, direction: output, schemaPath: properties.outputSrcDoc}

    - id: qer-ImageGeneration-default-imageGeneration
      isEnabled: true
      nodeTypeId: ImageGeneration
      widgetTypeId: default
      formId: imageGeneration
      fields:
        - {fieldKey: prompt, fieldType: textarea, schemaPath: properties.prompt}
      ports:
        - {portKey: imageUrl, direction: output, schemaPath: properties.imageUrl}

    - id: qer-VideoGeneration-default-videoGeneration
      isEnabled: true
      nodeTypeId: VideoGeneration
      widgetTypeId: default
      formId: videoGeneration
      fields:
        - {fieldKey: prompt, fieldType: textarea, schemaPath: properties.prompt}
      ports:
        - {portKey: videoUrl, direction: output, schemaPath: properties.videoUrl}

    - id: qer-RichMediaPanel-default-richMediaPanel
      isEnabled: true
      nodeTypeId: RichMediaPanel
      widgetTypeId: default
      formId: richMediaPanel
      fields: []
      ports:
        - {portKey: output, direction: input, schemaPath: properties.output}
        - {portKey: imageUrl, direction: input, schemaPath: properties.imageUrl}
        - {portKey: videoUrl, direction: input, schemaPath: properties.videoUrl}
        - {portKey: outputSrcDoc, direction: input, schemaPath: properties.outputSrcDoc}

    - id: qer-MapMediaBinder-default-mapMediaBinder
      isEnabled: true
      nodeTypeId: MapMediaBinder
      widgetTypeId: default
      formId: mapMediaBinder
      fields:
        - {fieldKey: bind_mode, fieldType: text, schemaPath: properties.bind_mode}
      ports:
        - {portKey: mission_brief, direction: input, schemaPath: properties.mission_brief}
        - {portKey: drone_icon_url, direction: input, schemaPath: properties.drone_icon_url}
        - {portKey: flyover_video_url, direction: input, schemaPath: properties.flyover_video_url}
        - {portKey: overlay_ready, direction: input, schemaPath: properties.overlay_ready}
        - {portKey: map_ready, direction: input, schemaPath: properties.map_ready}
        - {portKey: bind_ready, direction: output, schemaPath: properties.bind_ready}

links:
  yaml_anchor: "#computing-flow-definition"
  body_anchor: "#flow-graph"
  self_ref: "agentic-graph-maps-grabmap-multim-demo.md"

canvas:
  auto_layout: true
  layout_algo: dagre-LR
  snap_to_grid: true
  grid_size: 20
  minimap: true
  controls: true
  node_defaults: {width: 260, height: 92}
  edge_defaults: {type: smoothstep, animated: true}

runtime:
  entry: {key: entry, type: string, value: "m-grabmaps-map"}
  exit: {key: exit, type: string, value: "b-map-media"}
  maxRetry: {key: maxRetry, type: number, value: 0}

graph_meta:
  node_count: 8
  edge_count: 9
  phase_count: 3
  entry_node: m-grabmaps-map
  exit_node: b-map-media
  phases:
    - id: P1
      label: "Map + Route"
      seq_range: "M01–M03"
      nodes: [m-grabmaps-map, m-grabmaps-route, m-drone-overlay]
    - id: P2
      label: "Widgets"
      seq_range: "W01–W03"
      nodes: [w-text, w-image, w-video]
    - id: P3
      label: "Fuse"
      seq_range: "F01–F02"
      nodes: [p-rich-media, b-map-media]
  forward_edges:
    - {edge: e-map-ready, from: m-grabmaps-map, to: b-map-media, handle: map_ready→map_ready}
    - {edge: e-route-geom, from: m-grabmaps-route, to: m-drone-overlay, handle: route_geometry→route_geometry}
    - {edge: e-image-to-drone, from: w-image, to: m-drone-overlay, handle: imageUrl→drone_icon_url}
    - {edge: e-overlay-ready, from: m-drone-overlay, to: b-map-media, handle: overlay_ready→overlay_ready}
    - {edge: e-text-to-panel, from: w-text, to: p-rich-media, handle: text_out→output}
    - {edge: e-srcdoc-to-panel, from: w-text, to: p-rich-media, handle: outputSrcDoc→outputSrcDoc}
    - {edge: e-image-to-panel, from: w-image, to: p-rich-media, handle: imageUrl→imageUrl}
    - {edge: e-video-to-panel, from: w-video, to: p-rich-media, handle: videoUrl→videoUrl}
    - {edge: e-panel-to-binder, from: p-rich-media, to: b-map-media, handle: output/imageUrl/videoUrl→mission_brief/drone_icon_url/flyover_video_url}

runner:
  entry: R01
  exit: R06
  steps:
    - {seq: R01, action: ingest, input: "raw file bytes", output: "parsed YAML object", description: "Parse YAML frontmatter; validate $schema == kgc-pipeline/v1; expose __doc."}
    - {seq: R02, action: resolve, input: "__doc", output: "__doc_resolved", description: "Resolve {{key}} interpolation for body and tables; expose __doc_resolved."}
    - {seq: R03, action: build-graph, input: "__doc_resolved", output: "graph { nodes[], edges[] }", description: "Build flow graph from flow: and mermaid:. Renderers MAY treat widget_bundle as node registry metadata."}
    - {seq: R04, action: compile-compute, input: "graph", output: "graph (compiled)", description: "Compile compute fns if present; this demo uses widget nodes and static binding only."}
    - {seq: R05, action: traverse, input: "graph (compiled)", output: "graph (executed)", description: "Materialize map+route+overlay + widget outputs + fused render nodes; no feedback arcs."}
    - {seq: R06, action: render, input: "graph (executed) + mermaid + body", output: "rendered Knowledge Graph Canvas", description: "Render Flow Graph + Pipeline; apply parseSigil() to table cells; auto-layout dagre-LR."}

pipeline:
  - seq: M01
    node: m-grabmaps-map
    label: "initialize GrabMaps map"
    actor: ["system"]
    edge_in: "apiKey + baseUrl"
    edge_out: "map_ready"
    user_action: "Open MainPanel Maps; select GrabMaps provider; view base map"
    sys_event: "Initialize GrabMaps map surface (GrabMaps Library or MapLibre style.json mode); enable attribution + navigation"
    data_in: "properties.apiKey + properties.baseUrl + properties.center + properties.zoom"
    data_out: "properties.map_ready=true"
    trigger: "page mount"
    on_fail: "`#D85A30:Unauthorized` or blank tiles; keep UI interactive"
    kanban: "bg#FAEEDA:in-flight"
    confidence: high
    status: TBD

  - seq: M02
    node: m-grabmaps-route
    label: "route & navigate"
    actor: ["system"]
    edge_in: "waypoints"
    edge_out: "route_geometry + route_meta"
    user_action: "Set origin + destination; request route"
    sys_event: "Call Directions API with `overview=full` to obtain `polyline6` geometry + distance/duration"
    data_in: "coordinates[] + profile + overview"
    data_out: "route_geometry (polyline6) + route_meta {distance_m,duration_s}"
    trigger: "waypoints change"
    on_fail: "show error in route panel; keep last good route visible"
    kanban: "bg#FAEEDA:in-flight"
    confidence: high
    status: TBD

  - seq: M03
    node: m-drone-overlay
    label: "drone flight-path overlay"
    actor: ["system"]
    edge_in: "route_geometry + drone_icon_url"
    edge_out: "overlay_ready"
    user_action: "Toggle `bg#E6F1FB:Drone overlay` on"
    sys_event: "Decode polyline6; render route line; animate drone marker along geometry (requestAnimationFrame) using speed_mps"
    data_in: "route_geometry + drone_icon_url + speed_mps"
    data_out: "overlay_ready=true"
    trigger: "route_geometry received"
    on_fail: "disable animation; keep static route line"
    kanban: "bg#E6F1FB:review"
    confidence: high
    status: TBD

  - seq: W01
    node: w-text
    label: "text widget"
    actor: ["user", "AI"]
    edge_in: "prompt"
    edge_out: "text_out + outputSrcDoc"
    user_action: "Run TextGeneration widget: generate mission brief"
    sys_event: "LLM returns mission brief (Markdown) + optional outputSrcDoc for rich rendering"
    data_in: "properties.prompt"
    data_out: "properties.output + properties.outputSrcDoc"
    trigger: "run"
    on_fail: "show last text_out"
    kanban: "bg#FAEEDA:in-flight"
    confidence: high
    status: TBD

  - seq: W02
    node: w-image
    label: "image widget"
    actor: ["user", "AI"]
    edge_in: "prompt"
    edge_out: "imageUrl"
    user_action: "Run ImageGeneration widget: generate drone icon/sprite"
    sys_event: "Image generator returns a stable URL"
    data_in: "properties.prompt"
    data_out: "properties.imageUrl"
    trigger: "run"
    on_fail: "show last imageUrl"
    kanban: "bg#FAEEDA:in-flight"
    confidence: high
    status: TBD

  - seq: W03
    node: w-video
    label: "video widget"
    actor: ["user", "AI"]
    edge_in: "prompt"
    edge_out: "videoUrl"
    user_action: "Run VideoGeneration widget: generate flyover clip"
    sys_event: "Video generator returns a stable URL"
    data_in: "properties.prompt"
    data_out: "properties.videoUrl"
    trigger: "run"
    on_fail: "show last videoUrl"
    kanban: "bg#FAEEDA:in-flight"
    confidence: high
    status: TBD

  - seq: F01
    node: p-rich-media
    label: "rich media panel"
    actor: ["system", "user"]
    edge_in: "output + imageUrl + videoUrl"
    edge_out: "mission_brief + drone_icon_url + flyover_video_url"
    user_action: "Inspect fused content; optionally edit mission brief"
    sys_event: "Render single surface for text/image/video; canonicalize media URLs for dedupe"
    data_in: "connected widget outputs"
    data_out: "rendered panel (single SSOT surface)"
    trigger: "connected value change"
    on_fail: "keep last render"
    kanban: "bg#E6F1FB:review"
    confidence: high
    status: TBD

  - seq: F02
    node: b-map-media
    label: "bind media → map overlay"
    actor: ["system"]
    edge_in: "map_ready + overlay_ready + mission_brief + drone_icon_url + flyover_video_url"
    edge_out: "bind_ready"
    user_action: "Click drone marker; view mission brief + flyover video"
    sys_event: "Bind mission brief to map popup; bind drone icon to marker symbol; pin flyover video as corner overlay widget"
    data_in: "panel outputs + overlay state"
    data_out: "bind_ready=true"
    trigger: "map_ready && overlay_ready && at least one media output available"
    on_fail: "skip missing media; keep map usable"
    kanban: "bg#FBEAF0:backlog"
    confidence: high
    status: TBD

mermaid: |
  %%{init: {"theme": "base", "themeVariables": {"primaryColor":"#E1F5EE","primaryTextColor":"#085041","primaryBorderColor":"#1D9E75","lineColor":"#5F5E5A","secondaryColor":"#E6F1FB","tertiaryColor":"#FAEEDA"}}}%%
  flowchart LR
    classDef map    fill:#E6F1FB,stroke:#378ADD,color:#0C447C,stroke-width:1.5px
    classDef widget fill:#E1F5EE,stroke:#1D9E75,color:#085041,stroke-width:1.5px
    classDef fuse   fill:#EAF3DE,stroke:#639922,color:#27500A,stroke-width:1.5px
    classDef store  fill:#F1EFE8,stroke:#888780,color:#444441,stroke-width:1px

    User([user])
    Store[(media_store JSONB)]

    m1["GrabMaps Map\nm-grabmaps-map"]
    m2["Directions API\nm-grabmaps-route"]
    m3["Drone Overlay\nm-drone-overlay"]

    w1["Text Widget\nw-text"]
    w2["Image Widget\nw-image"]
    w3["Video Widget\nw-video"]

    p1["Rich Media Panel\np-rich-media"]
    b1["Map Media Binder\nb-map-media"]

    User -->|waypoints| m2
    m1 -->|map_ready| b1
    m2 -->|route_geometry| m3
    w2 -->|imageUrl → drone_icon_url| m3
    m3 -->|overlay_ready| b1

    User -->|run| w1
    User -->|run| w2
    User -->|run| w3

    w1 -->|text_out| p1
    w2 -->|imageUrl| p1
    w3 -->|videoUrl| p1

    p1 -->|mission_brief + media URLs| b1
    b1 -->|upsert| Store
    Store -.->|rehydrate| p1

    class m1,m2,m3 map
    class w1,w2,w3 widget
    class p1,b1 fuse
    class Store store

flow:
  direction: {key: direction, type: string, value: LR}
  edgeType: {key: edgeType, type: string, value: smoothstep}
  snapToGrid: {key: snapToGrid, type: boolean, value: true}
  computed: {key: computed, type: boolean, value: true}

  nodes:
    - id: {key: id, type: string, value: "m-grabmaps-map"}
      type: {key: type, type: string, value: "GrabMapsMap"}
      label: {key: label, type: string, value: "GrabMaps Map"}
      phase: {key: phase, type: string, value: "map"}
      actor: {key: actor, type: array, value: ["system"]}
      handles: {key: handles, type: object, value: {source: ["map_ready"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "grabmapsMap"}
      baseUrl: {key: baseUrl, type: string, value: "https://maps.grab.com"}
      center: {key: center, type: string, value: "[103.8198, 1.3521]"}
      zoom: {key: zoom, type: number, value: 12}
      attribution: {key: attribution, type: boolean, value: true}
      navigation: {key: navigation, type: boolean, value: true}
      applies_rules: {key: applies_rules, type: array, value: []}
      db_writes: {key: db_writes, type: string, value: "—"}
      retry_arc: {key: retry_arc, type: string, value: "—"}
      confidence: {key: confidence, type: string, value: "high"}
      status: {key: status, type: string, value: "TBD"}
      kanban: {key: kanban, type: string, value: "bg#FAEEDA:in-flight"}

    - id: {key: id, type: string, value: "m-grabmaps-route"}
      type: {key: type, type: string, value: "GrabMapsRoute"}
      label: {key: label, type: string, value: "GrabMaps Route & Navigate"}
      phase: {key: phase, type: string, value: "route"}
      actor: {key: actor, type: array, value: ["system"]}
      handles: {key: handles, type: object, value: {target: ["waypoints"], source: ["route_geometry", "route_meta"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "grabmapsRoute"}
      endpoint: {key: endpoint, type: string, value: "/api/v1/maps/eta/v1/direction"}
      overview: {key: overview, type: string, value: "full"}
      geometries: {key: geometries, type: string, value: "polyline6"}
      profile: {key: profile, type: string, value: "driving"}
      applies_rules: {key: applies_rules, type: array, value: []}
      db_writes: {key: db_writes, type: string, value: "—"}
      retry_arc: {key: retry_arc, type: string, value: "—"}
      confidence: {key: confidence, type: string, value: "high"}
      status: {key: status, type: string, value: "TBD"}
      kanban: {key: kanban, type: string, value: "bg#FAEEDA:in-flight"}

    - id: {key: id, type: string, value: "m-drone-overlay"}
      type: {key: type, type: string, value: "DroneOverlay"}
      label: {key: label, type: string, value: "Drone Flight Path Overlay"}
      phase: {key: phase, type: string, value: "overlay"}
      actor: {key: actor, type: array, value: ["system"]}
      handles: {key: handles, type: object, value: {target: ["route_geometry", "drone_icon_url"], source: ["overlay_ready"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "droneOverlay"}
      speed_mps: {key: speed_mps, type: number, value: 12}
      render_mode: {key: render_mode, type: string, value: "maplibre-layer"}
      applies_rules: {key: applies_rules, type: array, value: []}
      db_writes: {key: db_writes, type: string, value: "—"}
      retry_arc: {key: retry_arc, type: string, value: "—"}
      confidence: {key: confidence, type: string, value: "high"}
      status: {key: status, type: string, value: "TBD"}
      kanban: {key: kanban, type: string, value: "bg#E6F1FB:review"}

    - id: {key: id, type: string, value: "w-text"}
      type: {key: type, type: string, value: "TextGeneration"}
      label: {key: label, type: string, value: "Text Widget (Mission Brief)"}
      phase: {key: phase, type: string, value: "generate"}
      actor: {key: actor, type: array, value: ["user", "AI"]}
      handles: {key: handles, type: object, value: {target: ["prompt_in"], source: ["text_out", "outputSrcDoc"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "textGeneration.openai"}
      prompt: {key: prompt, type: string, value: "Write a mission brief for a drone route demo. Include: objective, safety notes, and expected duration."}
      applies_rules: {key: applies_rules, type: array, value: []}
      db_writes: {key: db_writes, type: string, value: "—"}
      retry_arc: {key: retry_arc, type: string, value: "—"}
      confidence: {key: confidence, type: string, value: "high"}
      status: {key: status, type: string, value: "TBD"}
      kanban: {key: kanban, type: string, value: "bg#FAEEDA:in-flight"}

    - id: {key: id, type: string, value: "w-image"}
      type: {key: type, type: string, value: "ImageGeneration"}
      label: {key: label, type: string, value: "Image Widget (Drone Icon)"}
      phase: {key: phase, type: string, value: "generate"}
      actor: {key: actor, type: array, value: ["user", "AI"]}
      handles: {key: handles, type: object, value: {target: ["prompt_in"], source: ["imageUrl"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "imageGeneration"}
      prompt: {key: prompt, type: string, value: "Create a top-down drone icon, minimalist, high-contrast, transparent background, 256x256."}
      applies_rules: {key: applies_rules, type: array, value: []}
      db_writes: {key: db_writes, type: string, value: "—"}
      retry_arc: {key: retry_arc, type: string, value: "—"}
      confidence: {key: confidence, type: string, value: "high"}
      status: {key: status, type: string, value: "TBD"}
      kanban: {key: kanban, type: string, value: "bg#FAEEDA:in-flight"}

    - id: {key: id, type: string, value: "w-video"}
      type: {key: type, type: string, value: "VideoGeneration"}
      label: {key: label, type: string, value: "Video Widget (Flyover Clip)"}
      phase: {key: phase, type: string, value: "generate"}
      actor: {key: actor, type: array, value: ["user", "AI"]}
      handles: {key: handles, type: object, value: {target: ["prompt_in"], source: ["videoUrl"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "videoGeneration"}
      prompt: {key: prompt, type: string, value: "Generate an 8s flyover demo clip: drone icon follows a glowing path over a clean city map; cinematic but minimal UI."}
      applies_rules: {key: applies_rules, type: array, value: []}
      db_writes: {key: db_writes, type: string, value: "—"}
      retry_arc: {key: retry_arc, type: string, value: "—"}
      confidence: {key: confidence, type: string, value: "high"}
      status: {key: status, type: string, value: "TBD"}
      kanban: {key: kanban, type: string, value: "bg#FAEEDA:in-flight"}

    - id: {key: id, type: string, value: "p-rich-media"}
      type: {key: type, type: string, value: "RichMediaPanel"}
      label: {key: label, type: string, value: "Rich Media Panel (Single Surface)"}
      phase: {key: phase, type: string, value: "fuse"}
      actor: {key: actor, type: array, value: ["system", "user"]}
      handles: {key: handles, type: object, value: {target: ["output", "imageUrl", "videoUrl", "outputSrcDoc"], source: ["output", "imageUrl", "videoUrl", "outputSrcDoc"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "richMediaPanel"}
      applies_rules: {key: applies_rules, type: array, value: []}
      db_writes: {key: db_writes, type: string, value: "media_store"}
      retry_arc: {key: retry_arc, type: string, value: "—"}
      confidence: {key: confidence, type: string, value: "high"}
      status: {key: status, type: string, value: "TBD"}
      kanban: {key: kanban, type: string, value: "bg#E6F1FB:review"}

    - id: {key: id, type: string, value: "b-map-media"}
      type: {key: type, type: string, value: "MapMediaBinder"}
      label: {key: label, type: string, value: "Bind Media to Map UI"}
      phase: {key: phase, type: string, value: "bind"}
      actor: {key: actor, type: array, value: ["system"]}
      handles: {key: handles, type: object, value: {target: ["map_ready", "overlay_ready", "mission_brief", "drone_icon_url", "flyover_video_url"], source: ["bind_ready"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "mapMediaBinder"}
      bind_mode: {key: bind_mode, type: string, value: "popup+cornerOverlay+symbol"}
      applies_rules: {key: applies_rules, type: array, value: []}
      db_writes: {key: db_writes, type: string, value: "media_store"}
      retry_arc: {key: retry_arc, type: string, value: "—"}
      confidence: {key: confidence, type: string, value: "high"}
      status: {key: status, type: string, value: "TBD"}
      kanban: {key: kanban, type: string, value: "bg#FBEAF0:backlog"}

  edges:
    - {id: e-map-ready, source: m-grabmaps-map, sourceHandle: map_ready, target: b-map-media, targetHandle: map_ready, label: "map_ready", animated: true}
    - {id: e-route-geom, source: m-grabmaps-route, sourceHandle: route_geometry, target: m-drone-overlay, targetHandle: route_geometry, label: "route_geometry", animated: true}
    - {id: e-image-to-drone, source: w-image, sourceHandle: imageUrl, target: m-drone-overlay, targetHandle: drone_icon_url, label: "imageUrl → drone_icon_url", animated: true}
    - {id: e-overlay-ready, source: m-drone-overlay, sourceHandle: overlay_ready, target: b-map-media, targetHandle: overlay_ready, label: "overlay_ready", animated: true}
    - {id: e-text-to-panel, source: w-text, sourceHandle: text_out, target: p-rich-media, targetHandle: output, label: "text_out → output", animated: true}
    - {id: e-srcdoc-to-panel, source: w-text, sourceHandle: outputSrcDoc, target: p-rich-media, targetHandle: outputSrcDoc, label: "outputSrcDoc → outputSrcDoc", animated: true}
    - {id: e-image-to-panel, source: w-image, sourceHandle: imageUrl, target: p-rich-media, targetHandle: imageUrl, label: "imageUrl → imageUrl", animated: true}
    - {id: e-video-to-panel, source: w-video, sourceHandle: videoUrl, target: p-rich-media, targetHandle: videoUrl, label: "videoUrl → videoUrl", animated: true}
    - {id: e-panel-to-binder, source: p-rich-media, sourceHandle: output, target: b-map-media, targetHandle: mission_brief, label: "output → mission_brief", animated: true}
    - {id: e-panel-image-to-binder, source: p-rich-media, sourceHandle: imageUrl, target: b-map-media, targetHandle: drone_icon_url, label: "imageUrl → drone_icon_url", animated: true}
    - {id: e-panel-video-to-binder, source: p-rich-media, sourceHandle: videoUrl, target: b-map-media, targetHandle: flyover_video_url, label: "videoUrl → flyover_video_url", animated: true}
---

# agentic-graph · GrabMaps × Rich Media (Demo)

## Demo intent

Fusion/integration demo for:

- **GrabMaps** (map surface + Directions API route geometry)
- **Drone flight-path overlay** (animated marker over route)
- **Widgets** (Text/Image/Video generation)
- **Rich Media Panel** (single fused surface)
- **Map Media Binder** (bind mission brief + media into map UI)

Dev → Prod → Cloudflare context:

| Environment | Repo / Deploy | Role |
|---|---|---|
| Dev | `$GITHUB_ROOT/agentic-graph` (MainPanel Maps) | iterate UI + integration |
| Prod | `$GITHUB_ROOT/huijoohwee/content/agentic-graph` | release-ready build |
| Cloudflare | `airvio.co/agentic-graph` | deploy + serve |

---

## Computing Flow Definition

> **Machine source:** YAML frontmatter above the `---` delimiter. · [↓ Flow Graph](#flow-graph) · [↓ Pipeline](#pipeline)

This document is a runnable demo specification: map + route → overlay + widgets → fuse into Rich Media Panel → bind into map UI.

---

## Flow Graph

[↑ Computing Flow Definition](#computing-flow-definition)

```mermaid
{{mermaid}}
```

---

## Pipeline

[↑ Computing Flow Definition](#computing-flow-definition)

| seq | `@node:id` | pipeline step | `bg#E1F5EE:UF` user action | `bg#E6F1FB:WF` system event | `bg#EAF3DE:DF` data in | `bg#EAF3DE:DF` data out | edge | actor | trigger | on fail | kanban | confidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `M01` | `@node:m-grabmaps-map` | map init | open MainPanel Maps | init GrabMaps surface + attribution | apiKey/baseUrl/center/zoom | map_ready | `@edge:m-grabmaps-map:map_ready→b-map-media:map_ready` | `["system"]` | mount | show error banner | `bg#FAEEDA:in-flight` | high |
| `M02` | `@node:m-grabmaps-route` | route & navigate | pick origin/destination | call Directions API (overview=full) | waypoints + profile | polyline6 + meta | `@edge:m-grabmaps-route:route_geometry→m-drone-overlay:route_geometry` | `["system"]` | waypoints change | keep last route | `bg#FAEEDA:in-flight` | high |
| `M03` | `@node:m-drone-overlay` | overlay | toggle drone overlay | decode polyline6; animate drone | route_geometry + iconUrl | overlay_ready | `@edge:m-drone-overlay:overlay_ready→b-map-media:overlay_ready` | `["system"]` | route_geometry | disable animation | `bg#E6F1FB:review` | high |
| `W01` | `@node:w-text` | text | run Text widget | generate mission brief | prompt | text_out + srcdoc | `@edge:w-text:text_out→p-rich-media:output` | `["user","AI"]` | run | keep last text | `bg#FAEEDA:in-flight` | high |
| `W02` | `@node:w-image` | image | run Image widget | generate drone icon | prompt | imageUrl | `@edge:w-image:imageUrl→m-drone-overlay:drone_icon_url` | `["user","AI"]` | run | keep last image | `bg#FAEEDA:in-flight` | high |
| `W03` | `@node:w-video` | video | run Video widget | generate flyover clip | prompt | videoUrl | `@edge:w-video:videoUrl→p-rich-media:videoUrl` | `["user","AI"]` | run | keep last video | `bg#FAEEDA:in-flight` | high |
| `F01` | `@node:p-rich-media` | fuse | inspect/edit content | render single media surface | connected widget outputs | panel render | `@edge:p-rich-media:output→b-map-media:mission_brief` | `["system","user"]` | connected change | keep last render | `bg#E6F1FB:review` | high |
| `F02` | `@node:b-map-media` | bind to map | click drone marker | bind popup + corner overlay | map_ready + overlay_ready + media | bind_ready | — | `["system"]` | readiness gates | skip missing media | `bg#FBEAF0:backlog` | high |

---

## Demo script (operator checklist)

1. Map initializes with attribution enabled.
2. Set 2 waypoints; route line appears.
3. Run Image widget; generated drone icon is used for the moving marker.
4. Toggle drone overlay; drone animates along route.
5. Run Text widget; mission brief appears in Rich Media Panel.
6. Run Video widget; flyover clip appears in Rich Media Panel.
7. Click drone marker:
   - popup shows mission brief (text)
   - corner overlay shows flyover video (video)

---

## TAD — Integration contracts (minimal)

### GrabMaps routing SSOT

- Directions endpoint: `GET /api/v1/maps/eta/v1/direction`
- Require `overview=full` to obtain `routes[0].geometry` (polyline6).
- Route geometry is SSOT for:
  - route polyline layer
  - drone animation path

### Rich media SSOT (single surface)

All widget outputs must converge into **one** display surface (`@node:p-rich-media`) before any gallery/preview rendering:

| Widget output | RichMediaPanel input | Used by |
|---|---|---|
| text (`text_out`) | `output` | map popup content |
| image (`imageUrl`) | `imageUrl` | drone marker icon |
| video (`videoUrl`) | `videoUrl` | corner overlay |

### Canonical media identity

Transport/proxy URLs must not be treated as identity. Dedupe and persistence use canonical URLs only:

- `__fetch_remote?url=...` is a transport wrapper, not SSOT.
- Canonical rule: unwrap to the underlying `url` before dedupe/persist.
