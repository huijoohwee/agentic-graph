---
title: "Geo+XR Cinema Aigeddon — Hong Kong SAR"
doc_type: "Workspace Demo"
status: "draft"
runtime_status: "draft"
runtime_claim: "local-preview-implemented; runtime-readiness-unverified"
publish_scope: "local-only"
kgCanvasSurfaceMode: "geo-xr"
kgCanvasRenderMode: "3d"
kgCanvas3dMode: "xr"
kgCanvas2dRenderer: "flow"
kgFloatingPanelOpen: true
kgFloatingPanelView: "media"
kgBottomPanelOpen: true
kgBottomPanelTab: "timeline"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
kgXrMotionReference:
  schema: "agentic-graph-xr-motion-reference/v1"
  stageId: "hong-kong-cinema"
  castSource: "subjects-only"
  durationSeconds: 15
  fps: 24
  appearance: {skyColor: "#0b1324", fogColor: "#1a2238", groundColor: "#20262e", waterColor: "#0e3a4c", lightColor: "#9fb8ff", lightIntensity: 0.7, sunAzimuthDegrees: -120, fogDistanceMeters: 70, detail: "standard", shadows: true}
  subjects:
    - {id: "xr-subject:cinema-performer-a", assetId: "character-bionic-operative", label: "Bionic operative", color: "#2fc4d7", position: [-5.4, 0, 7], rotationYDegrees: 0, scale: 1}
    - {id: "xr-subject:cinema-performer-b", assetId: "character-corporate-executive", label: "Corporate executive", color: "#c4945d", position: [5.4, 0, 7], rotationYDegrees: 180, scale: 1}
    - {id: "xr-subject:cinema-protagonist", assetId: "character-cinema-protagonist", label: "Cinema protagonist", color: "#526777", position: [2.8, 0, 3.2], rotationYDegrees: 180, scale: 1.28}
    - {id: "xr-subject:cinema-mother-body", assetId: "character-bionic-operative", label: "First mother-body", color: "#b5e7eb", position: [4.2, 0, -2.1], rotationYDegrees: 180, scale: 0.96}
    - {id: "xr-subject:cinema-security-android", assetId: "character-security-android", label: "Security android", color: "#62d9e9", position: [-3.8, 0, -5.4], rotationYDegrees: 0, scale: 1}
    - {id: "xr-subject:cinema-sedan", assetId: "vehicle-sedan", label: "Harbor sedan", color: "#203849", position: [0, 0, 8], rotationYDegrees: 0, scale: 1}
    - {id: "xr-subject:cinema-crate", assetId: "prop-crate", label: "Shipping crate", color: "#80694c", position: [-2, 0, 3], rotationYDegrees: 0, scale: 1}
    - {id: "xr-subject:cinema-debris", assetId: "prop-debris-cluster", label: "Metal and masonry debris", color: "#697681", position: [0, 4, -5], rotationYDegrees: 0, scale: 1}
  cast:
    - actorId: "xr-subject:cinema-performer-a"
      label: "Bionic operative"
      animation: {kind: "action-path", presetId: "pursuit-dash", startTimeSeconds: 10.2, loop: false}
      marks:
        - {timeSeconds: 0, position: [-5.4, 0, 7], transition: "ease-in-out", gait: "hold"}
    - actorId: "xr-subject:cinema-performer-b"
      label: "Corporate executive"
      animation: {kind: "character-motion", presetId: "drink", startTimeSeconds: 3.4, loop: true}
      marks:
        - {timeSeconds: 0, position: [5.4, 0, 7], transition: "ease-in-out", gait: "walk"}
        - {timeSeconds: 1.7, position: [5, 0, 5.8], transition: "hold", gait: "hold"}
        - {timeSeconds: 6.8, position: [5, 0, 5.8], transition: "ease-in-out", gait: "walk"}
        - {timeSeconds: 8.5, position: [4.4, 0, 4.6], transition: "hold", gait: "hold"}
        - {timeSeconds: 13.6, position: [4.4, 0, 4.6], transition: "ease-in-out", gait: "walk"}
        - {timeSeconds: 15, position: [3.9, 0, 3.8], transition: "hold", gait: "hold"}
    - actorId: "xr-subject:cinema-protagonist"
      label: "Cinema protagonist"
      animation: {kind: "action-path", presetId: "pursuit-dash", startTimeSeconds: 10.2, loop: false}
      marks:
        - {timeSeconds: 0, position: [2.8, 0, 3.2], transition: "ease-in-out", gait: "hold"}
    - actorId: "xr-subject:cinema-mother-body"
      label: "First mother-body"
      animation: {kind: "character-motion", presetId: "sit", startTimeSeconds: 5.1, loop: false}
      marks:
        - {timeSeconds: 0, position: [4.2, 0, -2.1], transition: "hold", gait: "hold"}
        - {timeSeconds: 5.1, position: [4.2, 0, -2.1], transition: "hold", gait: "hold"}
        - {timeSeconds: 6.8, position: [4.2, 0, -2.1], transition: "hold", gait: "hold"}
        - {timeSeconds: 15, position: [4.2, 0, -2.1], transition: "hold", gait: "hold"}
    - actorId: "xr-subject:cinema-security-android"
      label: "Security android"
      animation: {kind: "action-path", presetId: "patrol-sweep", startTimeSeconds: 0, loop: false}
      marks:
        - {timeSeconds: 0, position: [-3.8, 0, -5.4], transition: "ease-in-out", gait: "walk"}
    - actorId: "xr-subject:cinema-sedan"
      label: "Harbor sedan"
      animation: {kind: "action-path", presetId: "street-cruise", startTimeSeconds: 10.2, loop: false}
      marks:
        - {timeSeconds: 0, position: [0, 0, 8], transition: "ease-in-out", gait: "hold"}
    - actorId: "xr-subject:cinema-crate"
      label: "Shipping crate"
      animation: null
      marks:
        - {timeSeconds: 0, position: [-2, 0, 3], transition: "hold", gait: "hold"}
        - {timeSeconds: 15, position: [-2, 0, 3], transition: "hold", gait: "hold"}
    - actorId: "xr-subject:cinema-debris"
      label: "Metal and masonry debris"
      animation: {kind: "action-path", presetId: "collapsing-debris", startTimeSeconds: 11.9, loop: false}
      marks:
        - {timeSeconds: 0, position: [0, 8, -5], transition: "ease-in", gait: "hold"}
  camera:
    - {timeSeconds: 0, anchorId: "xr-subject:cinema-protagonist", label: "01 · IFC rain terrace", caption: "The dark-coated operator surveys the rain-soaked skyline from the IFC deck; the android holds the rear guard.", moveId: "crane-descend", rig: "crane", easing: "ease-in-out", settings: {angle: "front", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: 0.12, orbitY: -0.28, note: "establishing"}}
    - {timeSeconds: 1.66, anchorId: "xr-subject:cinema-protagonist", label: "01 · out", moveId: "crane-descend", rig: "crane", easing: "hold", settings: {angle: "front", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: 0.04, orbitY: -0.16, note: "establishing"}}
    - {timeSeconds: 1.7, anchorId: "xr-subject:cinema-performer-a", label: "02 · AI control room", caption: "The bionic operator works the AI control console under the blue monitor glow.", moveId: "orbit-clockwise", rig: "steadicam", easing: "ease-in-out", settings: {angle: "left-side", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: -0.5, orbitY: -0.1}}
    - {timeSeconds: 3.36, anchorId: "xr-subject:cinema-performer-a", label: "02 · out", moveId: "orbit-clockwise", rig: "steadicam", easing: "hold", settings: {angle: "left-side", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: -0.3, orbitY: -0.1}}
    - {timeSeconds: 3.4, anchorId: "xr-subject:cinema-performer-b", label: "03 · 108F secret room", caption: "Executive addresses the boardroom, glass in hand, android at his shoulder.", moveId: "vertigo-dolly-zoom", rig: "dolly", easing: "ease-in-out", settings: {angle: "front", level: "low-angle", shot: "medium", focalLengthMm: 35, orbitX: 0.06, orbitY: -0.05}}
    - {timeSeconds: 5.06, anchorId: "xr-subject:cinema-performer-b", label: "03 · out", moveId: "vertigo-dolly-zoom", rig: "dolly", easing: "hold", settings: {angle: "front", level: "low-angle", shot: "close-up", focalLengthMm: 70, orbitX: 0.06, orbitY: -0.05}}
    - {timeSeconds: 5.1, anchorId: "xr-subject:cinema-mother-body", label: "04 · Bionic lab", caption: "The first mother-body rises inside a lit incubation pod while the operative watches.", moveId: "crane-rise", rig: "crane", easing: "ease-in-out", settings: {angle: "front", level: "eye-level", shot: "close-up", focalLengthMm: 85, orbitX: 0, orbitY: -0.04}}
    - {timeSeconds: 6.76, anchorId: "xr-subject:cinema-mother-body", label: "04 · out", moveId: "crane-rise", rig: "crane", easing: "hold", settings: {angle: "front", level: "high-angle", shot: "medium", focalLengthMm: 50, orbitX: 0, orbitY: -0.3}}
    - {timeSeconds: 6.8, anchorId: "xr-subject:cinema-protagonist", label: "05 · Harbour platform", caption: "The dark-coated protagonist places the signal crate on the Victoria Harbour platform.", moveId: "orbit-counterclockwise", rig: "drone", easing: "ease-in-out", settings: {angle: "right-side", level: "high-angle", shot: "wide", focalLengthMm: 28, orbitX: 0.5, orbitY: -0.35}}
    - {timeSeconds: 8.46, anchorId: "xr-subject:cinema-protagonist", label: "05 · out", moveId: "orbit-counterclockwise", rig: "drone", easing: "hold", settings: {angle: "right-side", level: "high-angle", shot: "wide", focalLengthMm: 28, orbitX: 0.28, orbitY: -0.35}}
    - {timeSeconds: 8.5, anchorId: "xr-subject:cinema-protagonist", label: "06 · Undersea base", caption: "The protagonist changes the signal on the undersea cable console.", moveId: "orbit-clockwise", rig: "steadicam", easing: "ease-in-out", settings: {angle: "left-side", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: -0.62, orbitY: -0.08}}
    - {timeSeconds: 10.16, anchorId: "xr-subject:cinema-protagonist", label: "06 · out", moveId: "orbit-clockwise", rig: "steadicam", easing: "hold", settings: {angle: "left-side", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: -0.44, orbitY: -0.08}}
    - {timeSeconds: 10.2, anchorId: "xr-subject:cinema-performer-a", label: "07 · Old town street", caption: "The operative breaks into a run down the neon old-town street as the sedan rolls in.", moveId: "drone-follow", rig: "drone", easing: "linear", settings: {angle: "front", level: "eye-level", shot: "medium", focalLengthMm: 32, orbitX: 0, orbitY: -0.12}}
    - {timeSeconds: 11.86, anchorId: "xr-subject:cinema-performer-a", label: "07 · out", moveId: "drone-follow", rig: "drone", easing: "hold", settings: {angle: "front", level: "eye-level", shot: "medium", focalLengthMm: 32, orbitX: 0.06, orbitY: -0.18}}
    - {timeSeconds: 11.9, anchorId: "xr-subject:cinema-protagonist", label: "08 · Mech cabin", caption: "The protagonist braces against the mechanical cabin impact as debris falls.", moveId: "custom", rig: "handheld", easing: "ease-out", settings: {angle: "right-side", level: "low-angle", shot: "close-up", focalLengthMm: 40, orbitX: 0.36, orbitY: -0.04, note: "impact shake"}}
    - {timeSeconds: 13.56, anchorId: "xr-subject:cinema-protagonist", label: "08 · out", moveId: "custom", rig: "handheld", easing: "hold", settings: {angle: "right-side", level: "low-angle", shot: "medium", focalLengthMm: 40, orbitX: 0.3, orbitY: -0.04, note: "impact shake"}}
    - {timeSeconds: 13.6, anchorId: "xr-subject:cinema-protagonist", label: "09 · City boundary", caption: "The protagonist confronts the executive at the shield blind zone while the ending turns.", moveId: "crane-rise", rig: "crane", easing: "ease-in-out", settings: {angle: "front", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: 0.1, orbitY: -0.1, note: "closing reveal"}}
    - {timeSeconds: 15, anchorId: "xr-subject:cinema-protagonist", label: "09 · out", moveId: "crane-rise", rig: "crane", easing: "hold", settings: {angle: "overhead", level: "high-angle", shot: "wide", focalLengthMm: 24, orbitX: 0.1, orbitY: -0.55, note: "closing reveal"}}
planned_run_ready_demo:
  id: "geo-xr-cinema-aigeddon"
  activation: "disabled-until-runtime-ready"
  identity_authority: "future source-authored run_ready_demo.id after runtime-readiness approval"
  imported_path_alias_required: false
  identity_conflict: "fail closed when path and source identity disagree"
  dev_command: "npm run dev"
  canonical_source_file: "/docs/workspace-seeds/agentic-graph-geo-xr-cinema-aigeddon.md"
  validation_seed_path: "/agentic-graph-geo-xr-cinema-aigeddon.md"
  source_root: "agentic-graph/docs"
  source_backed: true
  clean_canvas_recommended: true
  native_runtime: false
  presentation: "local-geo-xr-cinema-preview"
  document_presentation: "workspace-design-record"
  auto_start: false
  external_dependencies: []
  forbid_external_copy_or_dependency: true
planned_cinema_demo:
  title: "Hong Kong SAR · Cinema"
  setting: "Hong Kong SAR, fictionalized cinematic context from supplied concept art"
  geospatial_accuracy: "not claimed; concept images contain no verified coordinate source"
  environment_kit_id: "hong-kong-cinema"
  regional_viewport_context:
    purpose: "SAR extent is context; midpoint preview anchor frames fictional local blocking only"
    bounds_wgs84: [113.8167, 22.1333, 114.5167, 22.5833]
    preview_anchor_wgs84: [114.1720, 22.29328]
    preview_anchor_authority: "derived midpoint for presentation; not a real scene coordinate"
    boundary_source: "Hong Kong Lands Department geographic extent; https://www.landsd.gov.hk/en/resources/mapping-information/hk-geographic-data.html"
  existing_environment_blockout: "hong-kong-cinema"
  planned_environment_kit: "hong-kong-cinema, optional fictionalized regional blockout in the shared catalog"
  existing_subject_proxies: ["character-bionic-operative", "character-corporate-executive", "character-security-android"]
  existing_props: ["vehicle-sedan", "prop-streetlight", "prop-crate", "prop-debris-cluster"]
  planned_image_subjects: "still-image references in the shot timeline; not 3D models"
  timeline:
    target_owner: "shared BottomPanel Timeline"
    duration_seconds: 15
    source_contact_sheet: "港岛仿生局-01.jpeg"
    contact_sheet_layout: {columns: 3, rows: 3, cell_inset_x: 1, cell_inset_y: 0.85}
    shot_markers:
      - {id: "shot-01", start: "00.0", end: "01.7", label: "IFC rain terrace", panel_index: 1, location_index: 1, subject: "Capital operator", line: "The game was settled long ago.", foreshadow: "Capital steers the city's fate", cast: ["xr-subject:cinema-protagonist", "xr-subject:cinema-security-android"], acting: "survey"}
      - {id: "shot-02", start: "01.7", end: "03.4", label: "AI control room", panel_index: 2, location_index: 2, subject: "Core operations officer", line: "Every human trace, erased.", foreshadow: "Citywide identity can be reset", cast: ["xr-subject:cinema-performer-a", "xr-subject:cinema-protagonist"], acting: "operate"}
      - {id: "shot-03", start: "03.4", end: "05.1", label: "Boardroom secret room", panel_index: 3, location_index: 3, subject: "Top-floor autocrat", line: "Remake the island, real and fake alike.", foreshadow: "Replacement is the rule", cast: ["xr-subject:cinema-performer-b", "xr-subject:cinema-security-android"], acting: "address"}
      - {id: "shot-04", start: "05.1", end: "06.8", label: "Mother-body laboratory", panel_index: 4, location_index: 7, subject: "Scientist and first mother-body", line: "Between real and virtual, all is my making.", foreshadow: "The mother-body holds override rights", cast: ["xr-subject:cinema-mother-body", "xr-subject:cinema-performer-a", "xr-subject:cinema-crate"], acting: "reveal"}
      - {id: "shot-05", start: "06.8", end: "08.5", label: "Victoria Harbour floating platform", panel_index: 5, location_index: 11, subject: "Offshore intelligence broker", line: "Between black and white, I stir the whole board.", foreshadow: "Bionic technology comes from offshore", cast: ["xr-subject:cinema-protagonist", "xr-subject:cinema-crate"], acting: "survey"}
      - {id: "shot-06", start: "08.5", end: "10.2", label: "Undersea base station", panel_index: 6, location_index: 12, subject: "Signal dispatcher", line: "Mortal lives, rewritten in one keystroke.", foreshadow: "Every identity is tampered at once", cast: ["xr-subject:cinema-protagonist", "xr-subject:cinema-security-android"], acting: "operate"}
      - {id: "shot-07", start: "10.2", end: "11.9", label: "Old town street", panel_index: 7, location_index: 19, subject: "Street-level sleeper bionic", line: "The people beside you are no longer real.", foreshadow: "Everyone was silently replaced", cast: ["xr-subject:cinema-performer-a", "xr-subject:cinema-sedan", "xr-subject:cinema-security-android"], acting: "stride"}
      - {id: "shot-08", start: "11.9", end: "13.6", label: "Mechanical cabin", panel_index: 8, location_index: 23, subject: "The only real human", line: "A mortal body can still break the game.", foreshadow: "The lead is the only hope", cast: ["xr-subject:cinema-protagonist", "xr-subject:cinema-sedan", "xr-subject:cinema-debris"], acting: "brace"}
      - {id: "shot-09", start: "13.6", end: "15.0", label: "Boundary blind spot", panel_index: 9, location_index: 25, subject: "First observer", line: "The final truth is mine to rule.", foreshadow: "The creator enters; the ending flips", cast: ["xr-subject:cinema-performer-b", "xr-subject:cinema-protagonist", "xr-subject:cinema-debris"], acting: "reveal"}
  asset_intake:
    source_root_from_canonical_checkout: "../joohwee/undocumented-draft/cinema-draft/image"
    source_revision: "8633afb4f14e25278ca5fe27d127bc92bfaa2591"
    source_state: "dirty source checkout; all listed images are untracked inputs"
    import_required: true
    browser_path_fetch: false
    preserve_original_bytes: true
    detect_content_type_from_bytes: true
    redistribution: "blocked until rights and attribution are recorded"
    asset_manifest:
      - {id: "bionic-person", file: "人物图-仿生人-01.png", sha256: "141748f7dbbfe4ae77661d2916d2b88815ad42060864c13bb8fbd2919e32647e", role: "character reference"}
      - {id: "security-robot", file: "人物图-安保机器人-01.png", sha256: "5507d8af5cfb1ad233baacb515473bc67ea521cf5d3bec02f3a4bc293e7995ce", role: "character reference"}
      - {id: "antagonist", file: "人物图-黑霸-01.png", sha256: "4fa5a13d5269180a290613df627f6f7e143e3ed889c3eacde8ec5692d1f0b6b2", role: "character reference"}
      - {id: "incubator-scene", file: "场景图-孵化器-01.png", sha256: "2c43c62c5eec26cb50daf46a091a600f66488f5d789ece8bcb00c290768eb312", role: "scene reference"}
      - {id: "headquarters-scene", file: "场景图-总部-01.png", sha256: "f637e640a16ed3bc9e1f056ba08d77574a796d2374eadc82e3f6daed5edc243f", role: "scene reference"}
      - {id: "hong-kong-island", file: "场景图-港岛-01.jpeg", sha256: "5a45a17a83b58965307a5e9b16a4fbcd8fe25ea77f6958598c6f435308e43a07", role: "regional reference"}
      - {id: "location-board-01", file: "场景图-港岛仿生局-每个地点标注场景小图-01.jpeg", sha256: "198b2ce822ed74bc6b3c54919739ff506e58c100f4a5c5fdac7ae76ed1b2ecfd", role: "location reference"}
      - {id: "location-board-02", file: "场景图-港岛仿生局-每个地点标注场景小图-02.jpeg", sha256: "abf0f101fb222551aca76fe5ce0781ce0ee678c8ab94c26d9fece49c1d824ed6", role: "location reference"}
      - {id: "contact-sheet", file: "港岛仿生局-01.jpeg", sha256: "26a19be24e9a475ee4eb6380256140b3e176f21bce8463ae793046ade637e9b9", role: "nine-panel shot contact sheet"}
planned_runtime_validation:
  mode_activation: ["3d renderer", "XR scene stage"]
  required_states: ["ready", "paused", "resume", "exit"]
  image_sequence: "nine source-linked stills and shot markers remain aligned"
  local_assets_only: true
  offline_after_import: true
  camera_or_sensor_permission: "not required"
  external_calls: 0
  runtime_claim: "local image timeline, environment kit, subject/prop tracks, and shared browser playback observed; native runtime readiness and device/offline proof remain unverified"
flow:
  direction: {key: direction, type: string, value: "LR"}
  edgeType: {key: edgeType, type: string, value: "smoothstep"}
  balancedViewportPreset: {key: balancedViewportPreset, type: string, value: "widgetFrontmatter"}
  computed: {key: computed, type: boolean, value: false}
  snapToGrid: {key: snapToGrid, type: boolean, value: true}
  nodes:
    - id: {key: id, type: string, value: "cinema_source"}
      type: {key: type, type: string, value: "InputWidget"}
      label: {key: label, type: string, value: "Local Image Sources"}
      position: {key: position, type: object, value: {"x":0,"y":0}}
      handles: {key: handles, type: object, value: {"source":["artifact"]}}
      "flow:portTypes": {key: "flow:portTypes", type: object, value: {"out":{"artifact":"artifact_signal"}}}
      output: {key: output, type: string, value: "Nine user-supplied stills; import locally, verify bytes and rights, and preserve originals."}
    - id: {key: id, type: string, value: "cinema_environment"}
      type: {key: type, type: string, value: "InputWidget"}
      label: {key: label, type: string, value: "Environment Kit"}
      position: {key: position, type: object, value: {"x":280,"y":-120}}
      handles: {key: handles, type: object, value: {"target":["artifact"],"source":["artifact"]}}
      "flow:portTypes": {key: "flow:portTypes", type: object, value: {"in":{"artifact":"artifact_signal"},"out":{"artifact":"artifact_signal"}}}
      output: {key: output, type: string, value: "Optional Hong Kong SAR fictionalized cinema blockout is registered in the shared environment catalog; it is not geospatially accurate."}
    - id: {key: id, type: string, value: "cinema_cast"}
      type: {key: type, type: string, value: "InputWidget"}
      label: {key: label, type: string, value: "Subjects and Props"}
      position: {key: position, type: object, value: {"x":560,"y":-120}}
      handles: {key: handles, type: object, value: {"target":["artifact"],"source":["artifact"]}}
      "flow:portTypes": {key: "flow:portTypes", type: object, value: {"in":{"artifact":"artifact_signal"},"out":{"artifact":"artifact_signal"}}}
      output: {key: output, type: string, value: "Animate neutral performer and prop proxies with shared source-authored XR marks; imported character sheets stay 2D references."}
    - id: {key: id, type: string, value: "cinema_timeline"}
      type: {key: type, type: string, value: "InputWidget"}
      label: {key: label, type: string, value: "15-second Shot Timeline"}
      position: {key: position, type: object, value: {"x":840,"y":0}}
      handles: {key: handles, type: object, value: {"target":["artifact"]}}
      "flow:portTypes": {key: "flow:portTypes", type: object, value: {"in":{"artifact":"artifact_signal"}}}
      output: {key: output, type: string, value: "Nine source-linked stills share one clock with animatable subject and prop tracks; saved shot-to-actor joins remain a separate gate."}
  edges:
    - {"id":"cinema_source_to_environment","source":"cinema_source","sourceHandle":"artifact","target":"cinema_environment","targetHandle":"artifact","type":"artifact_signal"}
    - {"id":"cinema_environment_to_cast","source":"cinema_environment","sourceHandle":"artifact","target":"cinema_cast","targetHandle":"artifact","type":"artifact_signal"}
    - {"id":"cinema_cast_to_timeline","source":"cinema_cast","sourceHandle":"artifact","target":"cinema_timeline","targetHandle":"artifact","type":"artifact_signal"}
---

# Geo+XR Cinema Aigeddon

This remains a non-activating design seed. Opening it renders the local Geo+XR preview with Media and
the shared Timeline available; authored subject and prop tracks do not start a simulation. The local
preview parses nine source-linked shot markers and exposes explicit local image import plus the
optional shared environment catalog. It does not read the sibling source path, request capture
permissions, activate `planned_run_ready_demo`, or make a native runtime-readiness claim. The joined
planning record defines the remaining evidence gates.

## Scene brief

Build a short, fictionalized Hong Kong SAR cinema previz from the supplied image set. Use stills
as reference plates and timecoded shot markers. The artwork is not a verified map, survey, or claim
about real people or locations. Each shot marker carries an optional `location_index` that joins it
to a numbered scene on the annotated location sheet. The procedural Hong Kong Island kit places
those numbered scenes at approximate, hand-chosen WGS84 positions for previz framing only; they
are not survey data.

## Supplied local image inputs

The inspected source root was ../joohwee/undocumented-draft/cinema-draft/image, relative to the
canonical agentic-graph checkout in the GitHub workspace. That sibling path does not resolve from
this managed worktree and is never fetched by browser code. The source checkout was dirty at
revision 8633afb4f14e25278ca5fe27d127bc92bfaa2591; the files below were untracked inputs. The local
browser import used those exact selected files for UI verification; it did not modify, commit, or
publish the source originals. Imported bytes remain in the browser's local media store. Rights and
attribution remain unverified and public distribution remains blocked.

| File | Observed bytes | Dimensions | SHA-256 | Use |
|---|---|---:|---|---|
| 人物图-仿生人-01.png | PNG | 1088 × 608 | 141748f7dbbfe4ae77661d2916d2b88815ad42060864c13bb8fbd2919e32647e | Bionic-person concept sheet |
| 人物图-安保机器人-01.png | PNG | 1088 × 608 | 5507d8af5cfb1ad233baacb515473bc67ea521cf5d3bec02f3a4bc293e7995ce | Security-robot concept sheet |
| 人物图-黑霸-01.png | PNG | 1088 × 608 | 4fa5a13d5269180a290613df627f6f7e143e3ed889c3eacde8ec5692d1f0b6b2 | Antagonist concept sheet |
| 场景图-孵化器-01.png | PNG | 1088 × 608 | 2c43c62c5eec26cb50daf46a091a600f66488f5d789ece8bcb00c290768eb312 | Incubator scene plate |
| 场景图-总部-01.png | PNG | 1088 × 608 | f637e640a16ed3bc9e1f056ba08d77574a796d2374eadc82e3f6daed5edc243f | Headquarters scene plate |
| 场景图-港岛-01.jpeg | PNG bytes, .jpeg suffix | 2048 × 1152 | 5a45a17a83b58965307a5e9b16a4fbcd8fe25ea77f6958598c6f435308e43a07 | Hong Kong Island night panorama concept |
| 场景图-港岛仿生局-每个地点标注场景小图-01.jpeg | PNG bytes, .jpeg suffix | 2048 × 1152 | 198b2ce822ed74bc6b3c54919739ff506e58c100f4a5c5fdac7ae76ed1b2ecfd | Location-reference board 1 |
| 场景图-港岛仿生局-每个地点标注场景小图-02.jpeg | PNG bytes, .jpeg suffix | 2048 × 1152 | abf0f101fb222551aca76fe5ce0781ce0ee678c8ab94c26d9fece49c1d824ed6 | Location-reference board 2 |
| 港岛仿生局-01.jpeg | PNG bytes, .jpeg suffix | 2048 × 1152 | 26a19be24e9a475ee4eb6380256140b3e176f21bce8463ae793046ade637e9b9 | Nine-panel, 15-second shot reference sheet |

The four .jpeg-suffixed files contain PNG bytes. Intake trusts the file signature, not the suffix;
the importer preserves original names and bytes and verifies each manifest digest. The timeline
currently uses the contact sheet as a local background crop; the Media gallery lazily decodes imported
reference previews. Original files are roughly 0.9–4.0 MiB, below the 12 MiB per-file import cap.
Mobile memory and preview-size behavior remain unverified. Do not fetch these repository-relative
paths from a browser.

## Existing owners and implemented reuse

The shared environment catalog now includes an optional `hong-kong-cinema` fictionalized blockout
through its existing stage contract. It supplies grey-box harbourfront towers, street channel,
walkways, and pier deck; none of those structures are geolocated. The Timeline action selects this
kit and composes it over MapLibre in Geo+XR. The map uses the Hong Kong SAR extent as context, then
fits a small local preview around its presentation-only midpoint anchor so actors remain visible at
stage scale. The anchor is not a scene coordinate. The extent source is Hong Kong Lands Department
geographic data; no image geotag or match to real structures is claimed. The kit stays optional and
adds no regional assumption to universal scene or Geo+XR behavior.

The existing Subjects & Props catalog supplies neutral adult, sedan, crate, and debris proxies for
this seed; the streetlight remains available in the catalog. The supplied bionic-person,
security-robot, and antagonist sheets remain still-image references; there is no matching 3D asset
in the inspected catalog. Do not relabel a generic proxy as a faithful character model.

## Subject and prop animation

`kgXrMotionReference/v1` now source-authors the operative, executive and security android, a sedan,
a crate, and a debris proxy. Cast follow the storyline beats through cued action paths: the android
runs `patrol-sweep` from 0 s, the operative runs `pursuit-dash` and the sedan runs `street-cruise`
from shot 07 (10.2 s), and debris runs `collapsing-debris` from shot 08 (11.9 s). The executive walks
between shots 01, 05 and 09 with a `drink` motion. The camera track authors an 18-mark shot list
(an in and a held out mark per shot), using each shot's rig, move and focal length; held marks are
cuts, not travel. Placement uses the existing time-second cast marks and linear/hold/eased transitions. These
marks appear in the shared BottomPanel Gantt Timeline and sample on its single 15-second, 24-fps XR
clock. Coordinates are local to the fictional blockout stage, never Hong Kong map coordinates. This
is procedural proxy blocking; it does not animate or reconstruct the supplied reference images.
Scene selection remains explicit and no capture permission is needed. Live browser playback advanced
the shared clock and sampled performer marks with the Hong Kong map focus active. Run-ready activation
stays closed pending save/reload, offline, and device proof.

`/docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md` inspires the source-authored
marks and motion assignments; this seed reuses their existing contract without inheriting that
seed's story, assets, or readiness claims.

## 15-second reference timeline

The contact sheet itself contains nine consecutive timecoded panels. The rows below are shot
markers referencing regions of that single source image, not nine separate footage files. The sheet
location column joins each panel to the annotated location sheet by its printed label (verified by
reading both sheets' text). Subject, line and foreshadow fields are English glosses of each panel's
printed beat. In the Geo+XR Timeline, the active shot owns the map camera with a slow in-shot dolly
at that location and lights its kit beacon.

| Shot | Start–end | Source panel label | Sheet location |
|---|---:|---|---|
| 01 | 00.0–01.7 s | IFC rain terrace | 1 · Rainy-night observation deck |
| 02 | 01.7–03.4 s | AI control room | 2 · AI control room |
| 03 | 03.4–05.1 s | Boardroom secret room | 3 · 108F secret room |
| 04 | 05.1–06.8 s | Mother-body laboratory | 7 · Matrix lab |
| 05 | 06.8–08.5 s | Victoria Harbour floating platform | 11 · Mist signal platform |
| 06 | 08.5–10.2 s | Undersea base station | 12 · Submarine cable base |
| 07 | 10.2–11.9 s | Old town street | 19 · Power-cut neon streets |
| 08 | 11.9–13.6 s | Mechanical cabin | 23 · Smart parking mechanical cabin |
| 09 | 13.6–15.0 s | Boundary blind spot | 25 · Border shield blind zone |

## Timeline boundary

The shared BottomPanel Timeline now recognizes this seed's `planned_cinema_demo` frontmatter and
renders nine ordered, timecoded shot markers plus source-authored subject and prop motion lanes.
The local importer stores the nine user-selected
originals in the existing IndexedDB media store after signature and SHA-256 checks; the contact sheet
is cropped into the nine visible timeline markers, and the Media Assets gallery exposes the full
reference set. In 2D, selecting a marker updates the local selected-shot state. In an XR stage with
document stage authority, the schedule joins each shot to its location, camera, and staged cast on
the existing playhead; delayed map mounting and preview fitting reassert the selected shot. Save/reload
alignment, offline operation, mobile layout, and persisted camera/actor joins are not yet proven.

## Readiness and activation

The planned runtime must stay local-first and work after explicit asset import with network access
off. It needs no camera, microphone, model call, remote map, or paid service. The explicit Timeline
action selects the local Hong Kong blockout, fits the map to its local preview anchor inside the SAR
extent, then hands the selected shot camera back to the shared Geo+XR owner. That authoring action
does not activate this seed's
`planned_run_ready_demo`, which remains disabled. Planned demo activation remains
disabled until image and rights provenance are complete, persisted camera/actor joins and save/reload
are proven, accessibility and 375 × 812 behavior are checked, offline replay is
verified, and the exact candidate's runtime gates pass. Workspace save,
Git commit, publication, deployment, and production readiness remain separate outcomes.
