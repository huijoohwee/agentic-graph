---
title: "Nezha Panorama Cinema — 哪吒全景图"
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
  stageId: "neutral-volume"
  castSource: "subjects-only"
  durationSeconds: 30
  fps: 24
  appearance: {skyColor: "#0d1b2a", fogColor: "#1b2838", groundColor: "#2a2a35", waterColor: "#1a3a4a", lightColor: "#f0e6c8", lightIntensity: 0.75, sunAzimuthDegrees: -90, fogDistanceMeters: 50, detail: "standard", shadows: true}
  subjects:
    - {id: "xr-subject:nezha", assetId: "character-cinema-protagonist", label: "Nezha 哪吒", color: "#e85d5d", position: [0, 0, 2.7], rotationYDegrees: 0, scale: 1.1}
    - {id: "xr-subject:li-jing", assetId: "character-corporate-executive", label: "Li Jing 李靖", color: "#c4945d", position: [5, 0, 1], rotationYDegrees: 180, scale: 1}
    - {id: "xr-subject:taiyi", assetId: "character-bionic-operative", label: "Taiyi Zhenren 太乙真人", color: "#d4a843", position: [-5, 0, 1], rotationYDegrees: 0, scale: 1}
    - {id: "xr-subject:ao-bing", assetId: "character-security-android", label: "Ao Bing 敖丙", color: "#5fa8d4", position: [-3, 0, -4], rotationYDegrees: 180, scale: 1}
    - {id: "xr-subject:lotus", assetId: "prop-crate", label: "Lotus 莲花", color: "#e8a0bf", position: [0, 0, 4.5], rotationYDegrees: 0, scale: 1.2}
    - {id: "xr-subject:wheels", assetId: "prop-debris-cluster", label: "Wind Fire Wheels 风火轮", color: "#f0a040", position: [2, 0, 2.7], rotationYDegrees: 0, scale: 0.8}
  cast:
    - actorId: "xr-subject:nezha"
      label: "Nezha 哪吒"
      animation: {kind: "action-path", presetId: "pursuit-dash", startTimeSeconds: 1.5, loop: false}
      marks:
        - {timeSeconds: 0, position: [0, 0, 2.7], transition: "ease-in-out", gait: "hold"}
        - {timeSeconds: 1.5, position: [0, 0, 2.7], transition: "ease-in-out", gait: "walk"}
        - {timeSeconds: 6, position: [1, 0, 1], transition: "ease-in-out", gait: "hold"}
        - {timeSeconds: 10.5, position: [0, 0, 4.5], transition: "ease-in-out", gait: "hold"}
        - {timeSeconds: 15, position: [0, 0, 2.7], transition: "ease-in-out", gait: "walk"}
        - {timeSeconds: 21, position: [0, 0, 0], transition: "ease-in-out", gait: "hold"}
        - {timeSeconds: 30, position: [0, 0, 2.7], transition: "hold", gait: "hold"}
    - actorId: "xr-subject:li-jing"
      label: "Li Jing 李靖"
      animation: {kind: "character-motion", presetId: "sit", startTimeSeconds: 4.5, loop: false}
      marks:
        - {timeSeconds: 0, position: [5, 0, 1], transition: "ease-in-out", gait: "hold"}
        - {timeSeconds: 4.5, position: [5, 0, 1], transition: "hold", gait: "hold"}
        - {timeSeconds: 9, position: [4, 0, 0], transition: "ease-in-out", gait: "walk"}
        - {timeSeconds: 19.5, position: [3, 0, 1], transition: "ease-in-out", gait: "hold"}
        - {timeSeconds: 30, position: [4, 0, 1], transition: "hold", gait: "hold"}
    - actorId: "xr-subject:taiyi"
      label: "Taiyi Zhenren 太乙真人"
      animation: {kind: "character-motion", presetId: "drink", startTimeSeconds: 10.5, loop: true}
      marks:
        - {timeSeconds: 0, position: [-5, 0, 1], transition: "ease-in-out", gait: "hold"}
        - {timeSeconds: 10.5, position: [-4, 0, 3], transition: "ease-in-out", gait: "walk"}
        - {timeSeconds: 13.5, position: [-4, 0, 3], transition: "hold", gait: "hold"}
        - {timeSeconds: 30, position: [-5, 0, 1], transition: "ease-in-out", gait: "walk"}
    - actorId: "xr-subject:ao-bing"
      label: "Ao Bing 敖丙"
      animation: {kind: "action-path", presetId: "patrol-sweep", startTimeSeconds: 1.5, loop: false}
      marks:
        - {timeSeconds: 0, position: [-3, 0, -4], transition: "ease-in-out", gait: "hold"}
        - {timeSeconds: 1.5, position: [-3, 0, -4], transition: "ease-in-out", gait: "walk"}
        - {timeSeconds: 9, position: [-2, 0, -2], transition: "hold", gait: "hold"}
        - {timeSeconds: 18, position: [-1, 0, 0], transition: "ease-in-out", gait: "walk"}
        - {timeSeconds: 30, position: [-3, 0, -4], transition: "ease-in-out", gait: "hold"}
    - actorId: "xr-subject:lotus"
      label: "Lotus 莲花"
      animation: null
      marks:
        - {timeSeconds: 0, position: [0, 0, 4.5], transition: "hold", gait: "hold"}
        - {timeSeconds: 10.5, position: [0, 0, 4.5], transition: "hold", gait: "hold"}
        - {timeSeconds: 30, position: [0, 0, 4.5], transition: "hold", gait: "hold"}
    - actorId: "xr-subject:wheels"
      label: "Wind Fire Wheels 风火轮"
      animation: {kind: "action-path", presetId: "collapsing-debris", startTimeSeconds: 13.5, loop: false}
      marks:
        - {timeSeconds: 0, position: [2, 0, 2.7], transition: "hold", gait: "hold"}
        - {timeSeconds: 13.5, position: [2, 0, 2.7], transition: "hold", gait: "hold"}
        - {timeSeconds: 30, position: [1.5, 0, 2.7], transition: "hold", gait: "hold"}
  camera:
    - {timeSeconds: 0, anchorId: "xr-subject:nezha", label: "01 · 灵珠转世", caption: "灵珠降世，怀胎三年六月而生。", moveId: "crane-descend", rig: "crane", easing: "ease-in-out", settings: {angle: "front", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: 0.1, orbitY: -0.2, note: "birth"}}
    - {timeSeconds: 1.5, anchorId: "xr-subject:nezha", label: "02 · 闹海抽鳞", caption: "东海嬉水，打死巡海夜叉李艮。", moveId: "drone-follow", rig: "drone", easing: "linear", settings: {angle: "front", level: "eye-level", shot: "medium", focalLengthMm: 32, orbitX: 0, orbitY: -0.15, note: "sea"}}
    - {timeSeconds: 3, anchorId: "xr-subject:nezha", label: "03 · 射杀碧云", caption: "误射碧云童子，闯下大祸。", moveId: "orbit-clockwise", rig: "steadicam", easing: "ease-in-out", settings: {angle: "left-side", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: -0.4, orbitY: -0.1, note: "accident"}}
    - {timeSeconds: 4.5, anchorId: "xr-subject:li-jing", label: "04 · 龙王问罪", caption: "四海龙王奏告天庭，问罪陈塘关。", moveId: "orbit-counterclockwise", rig: "dolly", easing: "ease-in-out", settings: {angle: "front", level: "low-angle", shot: "medium", focalLengthMm: 35, orbitX: 0.05, orbitY: -0.05, note: "accusation"}}
    - {timeSeconds: 6, anchorId: "xr-subject:nezha", label: "05 · 断臂剖腹", caption: "剔骨还父，割肉还母，以命偿业。", moveId: "vertigo-dolly-zoom", rig: "dolly", easing: "ease-in-out", settings: {angle: "front", level: "eye-level", shot: "close-up", focalLengthMm: 70, orbitX: 0, orbitY: -0.05, note: "sacrifice"}}
    - {timeSeconds: 7.5, anchorId: "xr-subject:nezha", label: "06 · 逐父索命", caption: "魂魄飘荡，寻父索命。", moveId: "drone-follow", rig: "drone", easing: "ease-in-out", settings: {angle: "front", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: 0.1, orbitY: -0.2, note: "ghost"}}
    - {timeSeconds: 9, anchorId: "xr-subject:li-jing", label: "07 · 托塔天王", caption: "李靖托塔镇子，父子化解。", moveId: "crane-rise", rig: "crane", easing: "ease-in-out", settings: {angle: "front", level: "high-angle", shot: "wide", focalLengthMm: 28, orbitX: 0.3, orbitY: -0.3, note: "reconciliation"}}
    - {timeSeconds: 10.5, anchorId: "xr-subject:taiyi", label: "08 · 莲花化身", caption: "太乙真人以莲花为哪吒重塑肉身。", moveId: "crane-descend", rig: "crane", easing: "ease-in-out", settings: {angle: "front", level: "eye-level", shot: "close-up", focalLengthMm: 50, orbitX: 0, orbitY: -0.1, note: "rebirth"}}
    - {timeSeconds: 12, anchorId: "xr-subject:taiyi", label: "09 · 再世为师", caption: "重拜师门，再续仙缘。", moveId: "orbit-clockwise", rig: "steadicam", easing: "ease-in-out", settings: {angle: "left-side", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: -0.3, orbitY: -0.1, note: "mastery"}}
    - {timeSeconds: 13.5, anchorId: "xr-subject:taiyi", label: "10 · 赐赠法宝", caption: "获赐火尖枪、风火轮、混天绫、乾坤圈。", moveId: "orbit-counterclockwise", rig: "steadicam", easing: "ease-in-out", settings: {angle: "right-side", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: 0.4, orbitY: -0.1, note: "artifacts"}}
    - {timeSeconds: 15, anchorId: "xr-subject:nezha", label: "11 · 修炼神通", caption: "修炼三头六臂，神通大成。", moveId: "crane-rise", rig: "crane", easing: "ease-in-out", settings: {angle: "front", level: "high-angle", shot: "medium", focalLengthMm: 35, orbitX: 0.2, orbitY: -0.3, note: "training"}}
    - {timeSeconds: 16.5, anchorId: "xr-subject:nezha", label: "12 · 大战四海", caption: "大战四海龙王，威震东海。", moveId: "drone-follow", rig: "drone", easing: "linear", settings: {angle: "front", level: "eye-level", shot: "wide", focalLengthMm: 28, orbitX: 0, orbitY: -0.2, note: "battle"}}
    - {timeSeconds: 18, anchorId: "xr-subject:nezha", label: "13 · 降龙缚龙", caption: "降服恶龙，护佑苍生。", moveId: "orbit-clockwise", rig: "steadicam", easing: "ease-in-out", settings: {angle: "left-side", level: "low-angle", shot: "medium", focalLengthMm: 35, orbitX: -0.5, orbitY: -0.15, note: "subdue"}}
    - {timeSeconds: 19.5, anchorId: "xr-subject:nezha", label: "14 · 劝父归心", caption: "化解父子恩怨，劝父归心。", moveId: "orbit-counterclockwise", rig: "dolly", easing: "ease-in-out", settings: {angle: "front", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: 0.1, orbitY: -0.1, note: "family"}}
    - {timeSeconds: 21, anchorId: "xr-subject:nezha", label: "15 · 重回陈塘关", caption: "凯旋而归，重回陈塘关。", moveId: "crane-descend", rig: "crane", easing: "ease-in-out", settings: {angle: "front", level: "eye-level", shot: "wide", focalLengthMm: 28, orbitX: 0.1, orbitY: -0.25, note: "return"}}
    - {timeSeconds: 22.5, anchorId: "xr-subject:nezha", label: "16 · 城门立威", caption: "陈塘关前立威，军民归心。", moveId: "crane-rise", rig: "crane", easing: "ease-in-out", settings: {angle: "front", level: "high-angle", shot: "wide", focalLengthMm: 24, orbitX: 0.3, orbitY: -0.4, note: "triumph"}}
    - {timeSeconds: 24, anchorId: "xr-subject:nezha", label: "17 · 助周伐纣", caption: "辅佐周武王，兴兵伐纣。", moveId: "drone-follow", rig: "drone", easing: "linear", settings: {angle: "front", level: "eye-level", shot: "medium", focalLengthMm: 32, orbitX: 0, orbitY: -0.15, note: "crusade"}}
    - {timeSeconds: 25.5, anchorId: "xr-subject:nezha", label: "18 · 战功赫赫", caption: "屡立战功，扫平商纣。", moveId: "orbit-clockwise", rig: "steadicam", easing: "ease-in-out", settings: {angle: "right-side", level: "eye-level", shot: "medium", focalLengthMm: 35, orbitX: 0.5, orbitY: -0.1, note: "valor"}}
    - {timeSeconds: 27, anchorId: "xr-subject:nezha", label: "19 · 肉身成圣", caption: "功德圆满，肉身成圣。", moveId: "crane-rise", rig: "crane", easing: "ease-in-out", settings: {angle: "front", level: "high-angle", shot: "medium", focalLengthMm: 35, orbitX: 0.2, orbitY: -0.35, note: "apotheosis"}}
    - {timeSeconds: 28.5, anchorId: "xr-subject:nezha", label: "20 · 守望人间", caption: "永镇人间，守护太平。", moveId: "crane-descend", rig: "crane", easing: "hold", settings: {angle: "front", level: "eye-level", shot: "wide", focalLengthMm: 28, orbitX: 0.1, orbitY: -0.2, note: "guardian"}}
planned_cinema_demo:
  title: "哪吒全景图 · Cinema"
  setting: "Chinese mythology, the legend of Nezha across four narrative journeys"
  geospatial_accuracy: "not claimed; mythological panorama contains no verified coordinate source"
  environment_kit_id: "neutral-volume"
  existing_environment_blockout: "neutral-volume"
  planned_environment_kit: "neutral-volume rehearsal floor with framing flats and focus deck"
  existing_subject_proxies: ["character-cinema-protagonist", "character-corporate-executive", "character-bionic-operative", "character-security-android"]
  existing_props: ["prop-crate", "prop-debris-cluster"]
  planned_image_subjects: "still-image contact sheet; not 3D models"
  timeline:
    target_owner: "shared BottomPanel Timeline"
    duration_seconds: 30
    source_contact_sheet: "nezha-panorama.png"
    contact_sheet_layout: {columns: 5, rows: 4, cell_inset_x: 1, cell_inset_y: 1}
    shot_markers:
      - {id: "shot-01", start: "00.0", end: "01.5", label: "灵珠转世", panel_index: 1, subject: "灵珠子", line: "灵珠降世，怀胎三年六月而生。", foreshadow: "天命之子降临陈塘关", cast: ["xr-subject:nezha"], acting: "reveal"}
      - {id: "shot-02", start: "01.5", end: "03.0", label: "闹海抽鳞", panel_index: 2, subject: "哪吒", line: "东海嬉水，打死巡海夜叉李艮。", foreshadow: "龙宫震怒，祸及陈塘", cast: ["xr-subject:nezha"], acting: "stride"}
      - {id: "shot-03", start: "03.0", end: "04.5", label: "射杀碧云", panel_index: 3, subject: "哪吒", line: "误射碧云童子，闯下大祸。", foreshadow: "师门之谊横遭变故", cast: ["xr-subject:nezha"], acting: "operate"}
      - {id: "shot-04", start: "04.5", end: "06.0", label: "龙王问罪", panel_index: 4, subject: "四海龙王", line: "四海龙王奏告天庭，问罪陈塘关。", foreshadow: "天威降临，家国安危系于一身", cast: ["xr-subject:li-jing"], acting: "address"}
      - {id: "shot-05", start: "06.0", end: "07.5", label: "断臂剖腹", panel_index: 5, subject: "哪吒", line: "剔骨还父，割肉还母，以命偿业。", foreshadow: "肉身虽灭，魂魄不散", cast: ["xr-subject:nezha"], acting: "brace"}
      - {id: "shot-06", start: "07.5", end: "09.0", label: "逐父索命", panel_index: 6, subject: "哪吒魂魄", line: "魂魄飘荡，寻父索命。", foreshadow: "父子情仇未了", cast: ["xr-subject:nezha", "xr-subject:li-jing"], acting: "stride"}
      - {id: "shot-07", start: "09.0", end: "10.5", label: "托塔天王", panel_index: 7, subject: "李靖", line: "李靖托塔镇子，父子化解。", foreshadow: "佛塔镇怨，恩义重修", cast: ["xr-subject:li-jing"], acting: "address"}
      - {id: "shot-08", start: "10.5", end: "12.0", label: "莲花化身", panel_index: 8, subject: "太乙真人", line: "太乙真人以莲花为哪吒重塑肉身。", foreshadow: "莲花塑体，脱胎换骨", cast: ["xr-subject:taiyi", "xr-subject:nezha", "xr-subject:lotus"], acting: "reveal"}
      - {id: "shot-09", start: "12.0", end: "13.5", label: "再世为师", panel_index: 9, subject: "太乙真人", line: "重拜师门，再续仙缘。", foreshadow: "师承正统，道法再续", cast: ["xr-subject:taiyi", "xr-subject:nezha"], acting: "address"}
      - {id: "shot-10", start: "13.5", end: "15.0", label: "赐赠法宝", panel_index: 10, subject: "太乙真人", line: "获赐火尖枪、风火轮、混天绫、乾坤圈。", foreshadow: "神兵加身，威能倍增", cast: ["xr-subject:taiyi", "xr-subject:nezha", "xr-subject:wheels"], acting: "reveal"}
      - {id: "shot-11", start: "15.0", end: "16.5", label: "修炼神通", panel_index: 11, subject: "哪吒", line: "修炼三头六臂，神通大成。", foreshadow: "法相天地，所向披靡", cast: ["xr-subject:nezha", "xr-subject:wheels"], acting: "operate"}
      - {id: "shot-12", start: "16.5", end: "18.0", label: "大战四海", panel_index: 12, subject: "哪吒", line: "大战四海龙王，威震东海。", foreshadow: "龙族俯首，海疆平靖", cast: ["xr-subject:nezha", "xr-subject:ao-bing"], acting: "stride"}
      - {id: "shot-13", start: "18.0", end: "19.5", label: "降龙缚龙", panel_index: 13, subject: "哪吒", line: "降服恶龙，护佑苍生。", foreshadow: "以力证道，守护人间", cast: ["xr-subject:nezha", "xr-subject:ao-bing"], acting: "brace"}
      - {id: "shot-14", start: "19.5", end: "21.0", label: "劝父归心", panel_index: 14, subject: "哪吒", line: "化解父子恩怨，劝父归心。", foreshadow: "天伦重续，父子同心", cast: ["xr-subject:nezha", "xr-subject:li-jing"], acting: "address"}
      - {id: "shot-15", start: "21.0", end: "22.5", label: "重回陈塘关", panel_index: 15, subject: "哪吒", line: "凯旋而归，重回陈塘关。", foreshadow: "故土重归，军民欢腾", cast: ["xr-subject:nezha"], acting: "survey"}
      - {id: "shot-16", start: "22.5", end: "24.0", label: "城门立威", panel_index: 16, subject: "哪吒", line: "陈塘关前立威，军民归心。", foreshadow: "少年英雄，名震天下", cast: ["xr-subject:nezha"], acting: "survey"}
      - {id: "shot-17", start: "24.0", end: "25.5", label: "助周伐纣", panel_index: 17, subject: "哪吒", line: "辅佐周武王，兴兵伐纣。", foreshadow: "顺应天命，扶周灭商", cast: ["xr-subject:nezha"], acting: "stride"}
      - {id: "shot-18", start: "25.5", end: "27.0", label: "战功赫赫", panel_index: 18, subject: "哪吒", line: "屡立战功，扫平商纣。", foreshadow: "杀伐决断，功业彪炳", cast: ["xr-subject:nezha"], acting: "brace"}
      - {id: "shot-19", start: "27.0", end: "28.5", label: "肉身成圣", panel_index: 19, subject: "哪吒", line: "功德圆满，肉身成圣。", foreshadow: "超越轮回，永享仙班", cast: ["xr-subject:nezha", "xr-subject:lotus"], acting: "reveal"}
      - {id: "shot-20", start: "28.5", end: "30.0", label: "守望人间", panel_index: 20, subject: "哪吒", line: "永镇人间，守护太平。", foreshadow: "圣躯常在，护佑苍生", cast: ["xr-subject:nezha"], acting: "survey"}
  asset_intake:
    import_required: true
    browser_path_fetch: false
    preserve_original_bytes: true
    detect_content_type_from_bytes: true
    redistribution: "blocked until rights and attribution are recorded"
    asset_manifest:
      - {id: "nezha-panorama", file: "nezha-panorama.png", sha256: "61233df0beae8c6c597cf2d55ce1e68ab81722b8b80f431c2be9d42281713926", role: "contact sheet"}
planned_runtime_validation:
  mode_activation: ["3d renderer", "XR scene stage"]
  required_states: ["ready", "paused", "resume", "exit"]
  image_sequence: "twenty source-linked stills and shot markers remain aligned"
  local_assets_only: true
  offline_after_import: true
  camera_or_sensor_permission: "not required"
  external_calls: 0
  runtime_claim: "local image timeline, neutral environment kit, and shared browser playback observed; native runtime readiness and device/offline proof remain unverified"
flow:
  direction: {key: direction, type: string, value: "LR"}
  edgeType: {key: edgeType, type: string, value: "smoothstep"}
  balancedViewportPreset: {key: balancedViewportPreset, type: string, value: "widgetFrontmatter"}
  computed: {key: computed, type: boolean, value: false}
  snapToGrid: {key: snapToGrid, type: boolean, value: true}
  nodes:
    - id: {key: id, type: string, value: "cinema_source"}
      type: {key: type, type: string, value: "InputWidget"}
      label: {key: label, type: string, value: "Contact Sheet"}
      position: {key: position, type: object, value: {"x":0,"y":0}}
      handles: {key: handles, type: object, value: {"source":["artifact"]}}
      "flow:portTypes": {key: "flow:portTypes", type: object, value: {"out":{"artifact":"artifact_signal"}}}
      output: {key: output, type: string, value: "Twenty-panel Nezha panorama contact sheet; import locally, verify bytes and rights, and preserve originals."}
    - id: {key: id, type: string, value: "cinema_environment"}
      type: {key: type, type: string, value: "InputWidget"}
      label: {key: label, type: string, value: "Environment Kit"}
      position: {key: position, type: object, value: {"x":280,"y":-120}}
      handles: {key: handles, type: object, value: {"target":["artifact"],"source":["artifact"]}}
      "flow:portTypes": {key: "flow:portTypes", type: object, value: {"in":{"artifact":"artifact_signal"},"out":{"artifact":"artifact_signal"}}}
      output: {key: output, type: string, value: "Neutral-volume rehearsal floor from the shared environment catalog; no geospatial claim."}
    - id: {key: id, type: string, value: "cinema_timeline"}
      type: {key: type, type: string, value: "InputWidget"}
      label: {key: label, type: string, value: "30-second Shot Timeline"}
      position: {key: position, type: object, value: {"x":560,"y":0}}
      handles: {key: handles, type: object, value: {"target":["artifact"]}}
      "flow:portTypes": {key: "flow:portTypes", type: object, value: {"in":{"artifact":"artifact_signal"}}}
      output: {key: output, type: string, value: "Twenty source-linked panels share one clock; saved shot joins remain a separate gate."}
  edges:
    - {"id":"cinema_source_to_environment","source":"cinema_source","sourceHandle":"artifact","target":"cinema_environment","targetHandle":"artifact","type":"artifact_signal"}
    - {"id":"cinema_environment_to_timeline","source":"cinema_environment","sourceHandle":"artifact","target":"cinema_timeline","targetHandle":"artifact","type":"artifact_signal"}
---

# Nezha Panorama Cinema

This remains a non-activating design seed. Opening it renders the local Geo+XR preview with Media
and the shared Timeline available. The local preview parses twenty source-linked shot markers from the
Nezha panorama contact sheet and exposes explicit local image import plus the shared neutral-volume
environment kit. It does not request capture permissions or make a native runtime-readiness claim.

## Scene brief

Build a short, mythological Nezha cinema previz from the supplied twenty-panel panorama. The image is a
4-row × 5-column contact sheet of twenty scenes spanning four narrative journeys: 降世·灵珠子 (Birth),
劫难·剔骨还父 (Tribulation), 重生·莲花化身 (Return), and 封神·肉身成圣 (Ascension). Each row is one
journey; each panel is one scene. Use stills as reference plates and timecoded shot markers. The
artwork is not a verified map, survey, or claim about real people or locations. The neutral-volume
environment kit provides a rehearsal floor with framing flats and a focus deck; it carries no
geospatial data.

## Supplied local image input

The contact sheet `nezha-panorama.png` is a 2048 × 1152 PNG placed in the canvas public assets for
local preview convenience. The cinema reference importer stores the user-selected original in the
browser's local media store after signature and SHA-256 checks; it does not modify, commit, or
publish the source bytes. Rights and attribution remain unverified and public distribution remains
blocked.

| File | Observed bytes | Dimensions | SHA-256 | Use |
|---|---|---:|---|---|
| nezha-panorama.png | PNG | 2048 × 1152 | 61233df0beae8c6c597cf2d55ce1e68ab81722b8b80f431c2be9d42281713926 | Twenty-panel Nezha panorama contact sheet |

## Existing owners and implemented reuse

The shared environment catalog supplies the `neutral-volume` stage through its existing contract: an
open rehearsal floor with left/right framing flats, a back flat, and a raised focus deck. No
geospatial context is attached, so the Geo+XR composite renders the stage without a map layer. The
Timeline action selects this kit and composes it on the shared XR surface. The contact sheet is
cropped into twenty visible timeline markers by the shared `contact_sheet_layout` (5 columns × 4
rows, row-major panel indexing). No 3D character or prop proxies are assigned; the supplied panorama
stays a 2D reference.

## 30-second reference timeline

The contact sheet itself contains twenty consecutive panels arranged as four journey rows of five
scenes. The rows below are shot markers referencing regions of that single source image. Subject,
line and foreshadow fields are concise Chinese glosses of each panel's printed beat. In the Geo+XR
Timeline, the active shot owns the shared playhead and lights the selected panel crop.

| Shot | Start–end | Panel | Journey | Scene |
|---|---:|---:|---|---|
| 01 | 00.0–01.5 s | 1 | 降世·灵珠子 | 灵珠转世 |
| 02 | 01.5–03.0 s | 2 | 降世·灵珠子 | 闹海抽鳞 |
| 03 | 03.0–04.5 s | 3 | 降世·灵珠子 | 射杀碧云 |
| 04 | 04.5–06.0 s | 4 | 降世·灵珠子 | 龙王问罪 |
| 05 | 06.0–07.5 s | 5 | 降世·灵珠子 | 断臂剖腹 |
| 06 | 07.5–09.0 s | 6 | 劫难·剔骨还父 | 逐父索命 |
| 07 | 09.0–10.5 s | 7 | 劫难·剔骨还父 | 托塔天王 |
| 08 | 10.5–12.0 s | 8 | 劫难·剔骨还父 | 莲花化身 |
| 09 | 12.0–13.5 s | 9 | 劫难·剔骨还父 | 再世为师 |
| 10 | 13.5–15.0 s | 10 | 劫难·剔骨还父 | 赐赠法宝 |
| 11 | 15.0–16.5 s | 11 | 重生·莲花化身 | 修炼神通 |
| 12 | 16.5–18.0 s | 12 | 重生·莲花化身 | 大战四海 |
| 13 | 18.0–19.5 s | 13 | 重生·莲花化身 | 降龙缚龙 |
| 14 | 19.5–21.0 s | 14 | 重生·莲花化身 | 劝父归心 |
| 15 | 21.0–22.5 s | 15 | 重生·莲花化身 | 重回陈塘关 |
| 16 | 22.5–24.0 s | 16 | 封神·肉身成圣 | 城门立威 |
| 17 | 24.0–25.5 s | 17 | 封神·肉身成圣 | 助周伐纣 |
| 18 | 25.5–27.0 s | 18 | 封神·肉身成圣 | 战功赫赫 |
| 19 | 27.0–28.5 s | 19 | 封神·肉身成圣 | 肉身成圣 |
| 20 | 28.5–30.0 s | 20 | 封神·肉身成圣 | 守望人间 |

## Timeline boundary

The shared BottomPanel Timeline recognizes this seed's `planned_cinema_demo` frontmatter and renders
twenty ordered, timecoded shot markers. The local importer stores the user-selected contact sheet in
the existing IndexedDB media store after signature and SHA-256 checks; the sheet is cropped into the
twenty visible timeline markers, and the Media Assets gallery exposes the full reference. In 2D,
selecting a marker updates the local selected-shot state. In the XR stage, the schedule joins each
shot to its panel crop on the existing playhead. Save/reload alignment, offline operation, mobile
layout, and persisted camera joins are not yet proven.

## Readiness and activation

The planned runtime stays local-first and works after explicit asset import with network access off.
It needs no camera, microphone, model call, remote map, or paid service. The explicit Timeline action
selects the local neutral-volume kit and hands the selected shot back to the shared Geo+XR owner.
Workspace save, Git commit, publication, deployment, and production readiness remain separate
outcomes.
