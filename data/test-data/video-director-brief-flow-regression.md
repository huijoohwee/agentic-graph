---
title: "Knowgrph · Video Demo — Three Skies (RoboDrone X1 · Frontier · Tempest · RoboTown)"
graphId: "md:knowgrph-video-robodrone-demo-v1"
doc_type: "Video Script — Director Brief"
date: "2026-05-01"
lang: en-US

kgCanvasSurfaceMode: "2d"
kgCanvas2dRenderer: "flowEditor"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true

$schema: "kgc-pipeline/v1"

inputs:
  text_provider_id: "deerflow"
  # Keep endpoint runtime-resolved from MainPanel Integrations (Dev localhost or Prod Cloudflare Tunnel).
  text_endpoint_url: ""
  text_model: "seed-2-0-lite-260228"
  image_model: "seedream-4-0-250828"
  video_model: "seedance-1-0-pro-fast-251015"
  vibe: "vivid, photorealistic, magic-realist, warm cinematic light cross-cutting to surreal multiverse glow, 9:16 vertical, TikTok-native"
  duration_seconds: 8
  duration_label: "8s"
  theme: "a RoboDrone X1 lifts off in three worlds — a Wild West frontier mesa at sunrise, a Caribbean island in a turquoise tempest, a Singapore city skyline at dusk — each world dissolving into its own surreal multiverse the moment the drone clears the horizon; a parent watches proudly from the ground while a child crosses into the world above"
  script: |
    US — Sunrise. A boy on a mesa cliff edge launches the drone into an amber sky. It clears the canyon rim. The desert below morphs — ghost herd of mustangs charges across a sky-plain above the mesas, a spectral frontier town floats inverted from the clouds, and the drone leads the stampede through canyon arches of light.
    CARIBBEAN — Noon storm. A girl on a turquoise island beach launches into the tempest. The drone punches through a wall of rain. Below the surface — a mermaid queen rises, crown of coral, commanding the waves. The girl steers the drone as the mermaid's herald through a cathedral of lightning-lit underwater spires.
    SG — Dusk. A girl on the Marina Bay promenade launches before Marina Bay Sands. The Merlion morphs — stone to chrome, 100 metres, AI sentinel. Singapore becomes RoboTown — sensor arrays, drone corridors, neural grid bay. The girl ascends to the command position. She pilots the city.
    Cut back: three parents, three phones, three proud faces. Three worlds. One drone.
    Text fades in: "One brief. Three multiverses. The drone opens the portal."
    "airvio.co/knowgrph — Write it. See it. Ship it."
  location:
    name: "US Wild West mesa → Caribbean turquoise island → Singapore Marina Bay Sands / RoboTown"
    short_label: "3-locale-frontier-tempest-robotown"
    label: "Three-locale traversal: US Wild West canyon mesa · Caribbean island tempest · Singapore MBS / RoboTown"

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
  registry: []
  graph:
    type: Graph
    context: frontmatter-flow
    metadata: {kind: frontmatter-flow}
    nodes_ref: [w-text-script, p-text-script, w-img-scene, p-img-scene, w-video-scene, p-video-scene]
    edges_ref: [e-text-script, e-text-script-srcdoc, e-scene-image, e-scene-to-video-ref, e-video]
    display:
      direction: LR
      edgeType: bezier
    behavior:
      drag_pan_zoom_owner: flowEditor-frontmatter-only
      rich_media_overlay_handlers: flowEditor-frontmatter-only
      forbid_cross_renderer_proxy: true

canvas:
  auto_layout: true
  layout_algo: dagre-LR
  snap_to_grid: true
  grid_size: 20
  minimap: true
  controls: true
  node_defaults:
    width: 240
    height: 90
  edge_defaults:
    type: smoothstep
    animated: true

runner:
  entry: R01
  exit: R06
  steps:
    - seq: R01
      action: ingest
      input: "raw file bytes"
      output: "parsed YAML object"
      description: "Parse YAML frontmatter; validate $schema == kgc-pipeline/v1; expose __doc."
    - seq: R02
      action: resolve
      input: "__doc"
      output: "__doc_resolved"
      description: "Resolve {{key}} interpolation for body and tables; expose __doc_resolved."
    - seq: R03
      action: build-graph
      input: "__doc_resolved"
      output: "graph { nodes[], edges[] }"
      description: "Cross-validate SSOT: pipeline[*].node == flow.nodes[*].id.value == mermaid IDs; halt on mismatch."
    - seq: R04
      action: compile-compute
      input: "graph"
      output: "graph (compiled)"
      description: "Compile flow.nodes[*].compute.value to functions; mark nodes async if needed."
    - seq: R05
      action: traverse
      input: "graph (compiled)"
      output: "graph (executed)"
      description: "Materialize widget nodes + edges; connected values resolve into Rich Media Panel render drivers; no feedback arcs."
    - seq: R06
      action: render
      input: "graph (executed) + mermaid + body"
      output: "rendered Knowledge Graph Canvas"
      description: "Render Flow Graph + Pipeline table; apply parseSigil() to cells; auto-layout dagre-LR."

pipeline:
  - seq: W01
    node: w-text-script
    label: "script to prompt breakdown — 3 locale variants"
    actor: ["user", "AI"]
    edge_in: "prompt_in"
    edge_out: "text_out"
    user_action: "Edit locale variant field and run"
    sys_event: "TextGeneration returns dual-layer prompts (parent trust + child multiverse) per locale for scene image + final video"
    data_in: "properties.prompt"
    data_out: "properties.output + properties.outputSrcDoc"
    trigger: "run"
    on_fail: "output unchanged"
    confidence: high
    status: TBD
  - seq: W02
    node: w-img-scene
    label: "image generation — hero locale reference frame"
    actor: ["user", "AI"]
    edge_in: "prompt_in"
    edge_out: "imageUrl"
    user_action: "Run the scene reference image widget for selected locale"
    sys_event: "ImageGeneration writes imageUrl for hero multiverse frame"
    data_in: "properties.prompt + properties.model"
    data_out: "properties.imageUrl"
    trigger: "run"
    on_fail: "imageUrl unchanged"
    confidence: high
    status: TBD
  - seq: W03
    node: w-video-scene
    label: "video generation — locale clip"
    actor: ["user", "AI"]
    edge_in: "reference_image"
    edge_out: "videoUrl"
    user_action: "Run the video widget after reference image exists"
    sys_event: "VideoGeneration writes videoUrl for 9:16 TikTok-ready locale clip"
    data_in: "properties.prompt + properties.model + properties.duration + properties.reference_image"
    data_out: "properties.videoUrl"
    trigger: "run"
    on_fail: "videoUrl unchanged"
    confidence: high
    status: TBD

mermaid: |
  %%{init: {"theme": "base", "themeVariables": {"primaryColor":"#E1F5EE","primaryTextColor":"#085041","primaryBorderColor":"#1D9E75","lineColor":"#5F5E5A","secondaryColor":"#E6F1FB","tertiaryColor":"#FAEEDA"}}}%%
  flowchart LR
    classDef widget fill:#E1F5EE,stroke:#1D9E75,color:#085041,stroke-width:1.5px
    classDef panel  fill:#EAF3DE,stroke:#639922,color:#27500A,stroke-width:1.5px

    w-text-script["Text Script Widget\nTextGeneration\n{{inputs.text_model}}"]
    p-text-script["Rich Media Panel\nText · Script"]
    w-img-scene["Image Widget\nScene Reference\n{{inputs.image_model}}"]
    p-img-scene["Rich Media Panel\nImage · Scene"]
    w-video-scene["Video Widget\nVideoGeneration\n{{inputs.video_model}}\n{{inputs.duration_label}}"]
    p-video-scene["Rich Media Panel\nVideo · Scene"]

    w-text-script -->|text_out → output| p-text-script
    w-img-scene -->|imageUrl → imageUrl| p-img-scene
    w-img-scene -->|imageUrl → reference_image| w-video-scene
    w-video-scene -->|videoUrl → videoUrl| p-video-scene

    class w-text-script,w-img-scene,w-video-scene widget
    class p-text-script,p-img-scene,p-video-scene panel

flow:
  direction: {key: direction, type: string, value: LR}
  edgeType: {key: edgeType, type: string, value: bezier}
  snapToGrid: {key: snapToGrid, type: boolean, value: true}
  computed: {key: computed, type: boolean, value: true}

  nodes:
    - id: {key: id, type: string, value: "w-text-script"}
      type: {key: type, type: string, value: "TextGeneration"}
      label: {key: label, type: string, value: "Text Script Widget"}
      phase: {key: phase, type: string, value: "generate"}
      actor: {key: actor, type: array, value: ["user", "AI"]}
      handles: {key: handles, type: object, value: {target: ["prompt_in"], source: ["text_out", "outputSrcDoc"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "videoScript"}
      chatProvider: {key: chatProvider, type: string, value: "{{inputs.text_provider_id}}"}
      chatAuthMode: {key: chatAuthMode, type: string, value: "serverManaged"}
      chatEndpointUrl: {key: chatEndpointUrl, type: string, value: "{{inputs.text_endpoint_url}}"}
      chatModel: {key: chatModel, type: select, value: "{{inputs.text_model}}"}
      chatThinkingType: {key: chatThinkingType, type: select, value: "disabled"}
      chatReasoningEffort: {key: chatReasoningEffort, type: select, value: "minimal"}
      chatStream: {key: chatStream, type: boolean, value: true}
      prompt: {key: prompt, type: string, value: "Generate dual-layer prompts for (1) one hero locale scene reference image and (2) the final video. Parent trust layer: safety badges, crash-proof shell, obstacle-sense, 20-min flight time. Child multiverse layer: locale-specific adventure scene. Use: vibe={{inputs.vibe}}, duration={{inputs.duration_label}}, location={{inputs.location.name}}, theme={{inputs.theme}}. Script: {{inputs.script}}. Output as markdown with explicit sections: Scene Image Prompt, Video Prompt."}

    - id: {key: id, type: string, value: "p-text-script"}
      type: {key: type, type: string, value: "RichMediaPanel"}
      label: {key: label, type: string, value: "Rich Media Panel — Text (Script)"}
      phase: {key: phase, type: string, value: "render"}
      actor: {key: actor, type: array, value: ["system", "user"]}
      handles: {key: handles, type: object, value: {target: ["output", "outputSrcDoc"], source: ["output", "outputSrcDoc"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "richMediaPanel"}
      richMediaActiveTab: {key: richMediaActiveTab, type: string, value: "text"}
      output: {key: output, type: string, value: ""}
      outputSrcDoc: {key: outputSrcDoc, type: string, value: ""}
      media_interactive: {key: media_interactive, type: boolean, value: true}

    - id: {key: id, type: string, value: "w-img-scene"}
      type: {key: type, type: string, value: "ImageGeneration"}
      label: {key: label, type: string, value: "Image Widget — Scene Reference"}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "imageGeneration"}
      model: {key: model, type: select, value: "{{inputs.image_model}}"}
      prompt: {key: prompt, type: textarea, value: "{{inputs.vibe}}, {{inputs.duration_label}}; {{inputs.location.label}}; {{inputs.theme}}. Script: {{inputs.script}}. Hero frame: CARIBBEAN locale — girl on turquoise island beach launching RoboDrone X1 into storm, mermaid queen rising from churning sea below, coral spire cathedral lit by lightning, 9:16 vertical."}
      size: {key: size, type: select, value: "2K"}
      output_format: {key: output_format, type: select, value: "jpeg"}
      response_format: {key: response_format, type: select, value: "b64_json"}
      optimize_prompt_options: {key: optimize_prompt_options, type: select, value: "fast"}
      aspect_ratio: {key: aspect_ratio, type: number, value: 0.5625}
      stream: {key: stream, type: boolean, value: true}
      watermark: {key: watermark, type: boolean, value: false}
      seed: {key: seed, type: number, value: 0}
      guidance_scale: {key: guidance_scale, type: number, value: 0}
      reference_image: {key: reference_image, type: string, value: ""}
      handles: {key: handles, type: object, value: {target: ["reference_image"], source: ["imageUrl"]}}
      phase: {key: phase, type: string, value: "generate"}
      actor: {key: actor, type: array, value: ["user", "AI"]}

    - id: {key: id, type: string, value: "p-img-scene"}
      type: {key: type, type: string, value: "RichMediaPanel"}
      label: {key: label, type: string, value: "Rich Media Panel — Image (Scene)"}
      phase: {key: phase, type: string, value: "render"}
      actor: {key: actor, type: array, value: ["system", "user"]}
      handles: {key: handles, type: object, value: {target: ["imageUrl", "outputSrcDoc"], source: ["imageUrl", "outputSrcDoc"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "richMediaPanel"}
      richMediaActiveTab: {key: richMediaActiveTab, type: string, value: "image"}
      imageUrl: {key: imageUrl, type: string, value: ""}
      outputSrcDoc: {key: outputSrcDoc, type: string, value: ""}
      media_interactive: {key: media_interactive, type: boolean, value: true}

    - id: {key: id, type: string, value: "w-video-scene"}
      type: {key: type, type: string, value: "VideoGeneration"}
      label: {key: label, type: string, value: "Video Widget — Scene"}
      phase: {key: phase, type: string, value: "generate"}
      actor: {key: actor, type: array, value: ["user", "AI"]}
      handles: {key: handles, type: object, value: {target: ["reference_image"], source: ["videoUrl"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "videoGeneration"}
      model: {key: model, type: select, value: "{{inputs.video_model}}"}
      prompt: {key: prompt, type: string, value: "{{inputs.vibe}}, {{inputs.duration_label}}; {{inputs.location.name}}; {{inputs.theme}}. Script: {{inputs.script}}"}
      ratio: {key: ratio, type: select, value: "9:16"}
      resolution: {key: resolution, type: select, value: "480p"}
      duration: {key: duration, type: number, value: "{{inputs.duration_seconds}}"}
      generate_audio: {key: generate_audio, type: boolean, value: false}
      draft: {key: draft, type: boolean, value: true}
      camera_fixed: {key: camera_fixed, type: boolean, value: false}
      image_url_url: {key: image_url_url, type: select, value: "base64"}
      reference_image: {key: reference_image, type: string, value: ""}

    - id: {key: id, type: string, value: "p-video-scene"}
      type: {key: type, type: string, value: "RichMediaPanel"}
      label: {key: label, type: string, value: "Rich Media Panel — Video (Scene)"}
      phase: {key: phase, type: string, value: "render"}
      actor: {key: actor, type: array, value: ["system", "user"]}
      handles: {key: handles, type: object, value: {target: ["videoUrl", "outputSrcDoc"], source: ["videoUrl", "outputSrcDoc"]}}
      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "richMediaPanel"}
      richMediaActiveTab: {key: richMediaActiveTab, type: string, value: "video"}
      videoUrl: {key: videoUrl, type: string, value: ""}
      outputSrcDoc: {key: outputSrcDoc, type: string, value: ""}
      media_interactive: {key: media_interactive, type: boolean, value: true}

  edges:
    - {id: e-text-script, source: w-text-script, sourceHandle: text_out, target: p-text-script, targetHandle: output, label: "text_out → output", animated: true}
    - {id: e-text-script-srcdoc, source: w-text-script, sourceHandle: outputSrcDoc, target: p-text-script, targetHandle: outputSrcDoc, label: "outputSrcDoc → outputSrcDoc", animated: true}
    - {id: e-scene-image, source: w-img-scene, sourceHandle: imageUrl, target: p-img-scene, targetHandle: imageUrl, label: "imageUrl → imageUrl", animated: true}
    - {id: e-scene-to-video-ref, source: w-img-scene, sourceHandle: imageUrl, target: w-video-scene, targetHandle: reference_image, label: "imageUrl → reference_image", animated: true}
    - {id: e-video, source: w-video-scene, sourceHandle: videoUrl, target: p-video-scene, targetHandle: videoUrl, label: "videoUrl → videoUrl", animated: true}

director_brief:
  title: "Three Skies"
  runtime: "30 seconds"
  format: "9:16 vertical · 1080p · no dialogue · no voiceover · no subtitles"
  score: "Slide-guitar Americana lo-fi (0–10s) → steel-drum tempest swell (10–20s) → cold synth ascent (20–27s) → silence (27–28s) → single warm resolution chord (28–30s)"
  score_note: "Score transitions with each world-shift — not with the drone launch. The music crosses the portal, not the child."
  conceptual_spine: "Three children in three worlds each launch the same RoboDrone X1. The moment each drone clears its horizon — mesa rim, storm wall, city skyline — reality folds into a private multiverse. The parent on the ground sees the sky. The child in the sky enters another world. The recursive reveal: every world was always a node on a canvas. The brief was always building them."

  shots:
    - shot: S01
      timecode: "00:00–00:10"
      locale: "US · Wild West canyon mesa, sunrise"
      frame_label: "LAUNCH — The Ghost Herd Rides"
      description: "Amber sunrise. A boy, 11, stands at the edge of a sandstone mesa cliff. The canyon drops away below him — ochre walls, sage, the silence before heat. He holds the controller in both hands, squints into the light, and launches the RoboDrone X1. It clears the mesa rim. And the moment it does — the desert below transforms. A ghost herd of wild mustangs materialises on a sky-plain above the canyon, translucent and silver, charging through air. A spectral frontier town — water tower, saloon, dirt main street — hangs inverted from the clouds above, its windows glowing amber. The drone banks hard and leads the stampede through cathedral arches of canyon light, the boy leaning into every turn."
      prompt: "Write the Text Widget output for S01. Produce a concise markdown scene brief with sections: Scene Image Prompt, Video Prompt, Parent Trust Beat, Adventure Hook, Rich Media Panel Summary. Use the US Wild West mesa details, ghost herd multiverse transformation, parent trust proof, and 9:16 vertical magic-realist style. No cultural sensitivities."
      camera:
        shot_type: "Wide Establishing → Low Drone POV → Tracking Follow"
        lens: "28mm"
        movement: "wide on child silhouetted against sunrise canyon, push in as drone launches, cut to low drone POV tracking through ghost herd stampede, banking through canyon light arches"
        aperture: "T2"
        lighting: "amber sunrise backlight on mesa rim; silver-ghost translucency on mustang herd; warm gold bloom through canyon arch formations; inverted frontier town glows amber from above"
        vfx: "ghost mustang herd — translucent silver particle mane trails; terrain-sky plane inversion for frontier town; canyon arch light beam composites; drone banking physics with motion blur; mesa rim edge horizon fold transition"
      image_prompt: "Boy on sandstone mesa cliff edge at amber sunrise launching small consumer drone, Wild West canyon below with ochre walls, ghost herd of translucent silver wild mustangs charging across sky-plain above canyon, inverted spectral frontier town hanging from clouds with glowing amber windows, drone banking through cathedral canyon light arches, magic-realist, photorealistic, 9:16 vertical"
      video_prompt: "Wide shot boy silhouetted on mesa cliff at sunrise, drone launches and clears rim, cut to low drone POV — translucent silver ghost mustang herd materialises charging across sky-plain above the canyon, inverted frontier town glows amber from overhead clouds, drone banks hard leading the stampede through canyon arch light beams, boy leans into controller, amber cinematic backlight, 9:16 vertical, magic-realist"
      duration: "10s"
      adventure_hook: "Lead the ghost herd. Own the frontier."
      parent_trust: "obstacle-sense · 20-min flight · crash-proof shell"

    - shot: S02
      timecode: "00:10–00:20"
      locale: "Caribbean · turquoise island, noon tempest"
      frame_label: "PIERCE — The Mermaid Queen Commands"
      description: "Noon storm. A Caribbean girl, 10, stands barefoot on a white-sand beach as a wall of tropical rain sweeps in from the turquoise sea. Palm trees bend. The water churns jade and white. She launches the RoboDrone X1 directly into the storm wall — the drone punches through the curtain of rain and emerges above the tempest, bright sky above, chaos below. And in the churning water below the surface — visible through a momentary clearing in the waves — a mermaid queen rises: coral crown, bioluminescent scales, commanding. She raises one hand and the waves part. The drone descends as the queen's herald, weaving through a cathedral of lightning-lit underwater spires of coral that erupt from the seafloor, scales catching each bolt."
      prompt: "Write the Text Widget output for S02. Produce a concise markdown scene brief with sections: Scene Image Prompt, Video Prompt, Parent Trust Beat, Adventure Hook, Rich Media Panel Summary. Use the Caribbean island tempest details, mermaid queen multiverse transformation, parent trust proof, and 9:16 vertical magic-realist style."
      camera:
        shot_type: "Eye-Level Rain Wall → Drone POV Punch-Through → Subsurface Reveal"
        lens: "35mm"
        movement: "eye-level on girl facing storm wall, drone launches into rain, cut to drone POV punching through rain curtain into clear sky, tilt down to subsurface reveal of mermaid queen rising, tracking through coral spire cathedral"
        aperture: "T2"
        lighting: "flat storm-diffuse on beach; bright turquoise sky above rain wall after punch-through; deep bioluminescent blue-green below surface; lightning strobe on coral spire cathedral"
        vfx: "rain wall particle curtain with drone punch-through dynamic; subsurface caustic shimmer; mermaid queen composite — bioluminescent scale shader; coral spire cathedral environment; lightning bolt composites with scale reflection; wave surface clearing animation"
      image_prompt: "Caribbean girl on white sand beach launching drone into approaching tropical storm wall, turquoise sea churning jade and white, drone punching through rain curtain into clear sky above, below the storm waves a mermaid queen rises from the deep — coral crown, bioluminescent blue-green scales, commanding arms raised — cathedral of lightning-lit coral spires erupting from seafloor, magic-realist, photorealistic, 9:16 vertical"
      video_prompt: "Eye-level shot girl launching drone into tropical storm wall on Caribbean beach, drone punches through rain curtain — bright sky above, chaos below — camera tilts down below surface to reveal mermaid queen rising from seafloor bioluminescent scales and coral crown, waves part at her command, drone descends as herald weaving through coral spire cathedral lit by lightning bolts, 9:16 vertical, cinematic, vivid magic-realist"
      duration: "10s"
      adventure_hook: "Fly the tempest. Serve the queen."
      parent_trust: "obstacle-sense · 20-min flight · crash-proof shell"

    - shot: S03
      timecode: "00:20–00:27"
      locale: "SG · Marina Bay Sands / RoboTown"
      frame_label: "ASCEND — The Merlion Becomes a Sentinel"
      description: "Dusk. A Singaporean girl, 13, stands on the Marina Bay promenade. City lights just kindling. She launches the RoboDrone X1. It rises before Marina Bay Sands — the three towers, the sky park, the bay. Then: the Merlion shifts. Stone becomes chrome. It stands taller — 100 metres, articulated, AI-sentinel, eyes scanning slow arcs across the bay. The skyline morphs: towers grow sensor arrays, drone corridors materialise between buildings, the bay surface becomes a neural grid of pulsing light. This is RoboTown. The girl's drone ascends to the command position at the apex of the grid. The city's systems align to her heading. She is the pilot. The city waits."
      prompt: "Write the Text Widget output for S03. Produce a concise markdown scene brief with sections: Scene Image Prompt, Video Prompt, Parent Trust Beat, Adventure Hook, Rich Media Panel Summary. Use the SG Marina Bay RoboTown details, Merlion AI sentinel transformation, parent trust proof, and 9:16 vertical futurist magic-realist style."
      camera:
        shot_type: "Low Angle Rise → Wide City Transform"
        lens: "35mm"
        movement: "low angle on girl with MBS behind, drone rises past child eyeline, camera cranes up to reveal full city transform — Merlion morph, tower arrays, neural grid bay"
        aperture: "T1.8"
        lighting: "blue-hour Singapore dusk on real city; cold chrome-white and electric blue on RoboTown reveal; pulsing neural grid bay surface light emission; Merlion eyes — amber scanning sweep"
        vfx: "Merlion morph — stone-to-chrome particle transition, height exaggeration ×5; MBS tower sensor array extension composites; drone corridor network materialise between buildings; bay surface neural grid light pulse animation; city scale exaggeration — towers grow 30%; girl's drone apex glow — command position indicator"
      image_prompt: "Singaporean girl launching drone on Marina Bay promenade at dusk, Marina Bay Sands towers behind her, Merlion transforming from stone to chrome 100m AI sentinel with amber scanning eyes, Singapore skyline morphing into RoboTown with sensor arrays on towers and drone corridors between buildings, Marina Bay surface becoming pulsing neural grid of light, girl's drone ascending to command position apex above grid, blue-hour cold chrome and electric blue tones, futurist magic-realist, photorealistic, 9:16 vertical"
      video_prompt: "Low angle crane-up following drone rising before Marina Bay Sands at blue-hour dusk, Merlion begins morphing from stone to towering chrome AI sentinel with amber scanning eyes, Singapore skyline transforms into RoboTown — sensor arrays grow on towers, drone corridors materialise, bay surface becomes pulsing neural grid, girl's drone ascends to command apex above the city, city systems align to her heading, cold chrome and electric blue tones, 9:16 vertical, cinematic, futurist magic-realist"
      duration: "7s"
      adventure_hook: "Command the future. Your city. Your drone."
      parent_trust: "obstacle-sense · 20-min flight · crash-proof shell"

    - shot: S04
      timecode: "00:27–00:29"
      epoch: "The Canvas Reveal"
      frame_label: "REVERSE ZOOM — Three Worlds, One Brief"
      description: "From the SG drone's command apex — exponential pull-back. RoboTown shrinks. Then: three locale scenes appear as glowing nodes on a dark canvas, connected by luminous bezier threads. US frontier mesa node — amber glow. Caribbean tempest node — turquoise glow. SG RoboTown node — electric blue glow. Three parents visible as silhouettes at the base of each node, phones raised. A cursor materialises above the canvas, hovers. The canvas pulses once."
      prompt: "Write the Text Widget output for S04. Produce a concise markdown scene brief with sections: Canvas Reveal Beat, Edge/Node Summary, Video Prompt, Rich Media Panel Summary. Use the three-world reverse zoom, luminous bezier edges in locale colours amber/turquoise/electric-blue, parent silhouettes, cursor reveal, and dark canvas aesthetic."
      camera:
        shot_type: "Rapid Reverse Zoom — Practical→Digital"
        lens: "transition from 35mm to screen-space CG camera"
        movement: "exponential pull-back, 0→8m/s"
        aperture: "N/A (CG transition)"
        lighting: "screen glow — dark canvas; three node halos: amber (US) · turquoise (Caribbean) · electric blue (SG)"
        vfx: "full CG canvas environment; three locale nodes materialise with locale-colour halos; luminous bezier edges between nodes; cursor materialise animation; parent silhouettes at node bases; canvas pulse once"
      image_prompt: "Extreme pull-back zoom revealing three glowing locale nodes on dark creative canvas flow graph — US Wild West mesa amber, Caribbean island turquoise, Singapore RoboTown electric blue — connected by luminous bezier curves, cursor hovering above canvas, parent silhouettes at base of each node, 9:16 vertical, dark canvas aesthetic"
      video_prompt: "Rapid exponential reverse zoom from Singapore drone command apex to reveal three locale scenes as glowing nodes on dark canvas flow graph, luminous bezier edges in amber turquoise electric-blue, cursor materialises and hovers, three parent silhouettes glow at node bases, canvas pulses once, 9:16 vertical, cinematic, 2s"
      duration: "2s"

    - shot: S05
      timecode: "00:29–00:30"
      epoch: "CTA — Canvas Hold"
      frame_label: "HOLD — Text Materialises"
      description: "Canvas holds. Subtle parallax drift across three nodes. Two lines of text fade in over one second. Held for one second. Warm resolution chord sounds."
      prompt: "Write the Text Widget output for S05. Produce a concise markdown scene brief with sections: CTA Copy, Video Prompt, Canvas Hold Beat, Rich Media Panel Summary. Use the final text materialisation, warm resolution chord, three glowing locale nodes, and airvio.co/knowgrph call to action."
      camera:
        shot_type: "Static Hold (CG)"
        lens: "N/A"
        movement: "subtle parallax 0.05m/s drift"
        aperture: "N/A"
        lighting: "canvas ambient only; three node halos maintain locale colours"
        vfx: "text fade-in; parallax depth pass; warm chord audio"
      cta:
        line_1: "One brief. Three multiverses. The drone opens the portal."
        line_2: "airvio.co/knowgrph — Write it. See it. Ship it."
        font: "Cormorant Garamond · Light · tracked +80"
        colour: "#FFFFFF"
        fade_in: "1s"
        hold: "1s"
      duration: "1s"
---

# Director brief flow regression input

Source: `huijoohwee` commit `b7e57d8fac04452824aa4be61ff3e4cd9c52b288`,
`docs/knowgrph-video-demo.md`. Original SHA-256: `efedabbd09206f5867590f3c2fc3dccc655a56ff35308f8acc5a38d517ba66e6`.

Complete parsed frontmatter is preserved; historical body prose is omitted.
This source-owned fixture tests shot geometry and import behavior, not published or runtime readiness.
