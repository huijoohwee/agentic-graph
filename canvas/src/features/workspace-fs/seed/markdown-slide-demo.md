---
title: AgenticGraph Canvas Demos · Markdown Parsing + Rendering (All Modes)
graphId: md:markdown-slide-demo
theme: academic
background: /cover.svg
class: text-center
transition: slide-left
layout: cover
aspectRatio: 16/9
lang: en-US
authors:
  - A. Author 1
  - B. Author 2
meeting: "AgenticGraph Demo"
date: "2026-02-23"
venue: "Example City"
institution: "Example Research Group"
url: "https://example.invalid"

mermaid: |
  flowchart TB
    %% Multi-shape node demo (Mermaid Flowchart syntax)
    %% Circle: (( )), Rect: [ ], Diamond: { }, Hex: {{ }}
    subgraph S1["Phase 1: Input (multi-shape)"]
      S1_A([Source A])
      S1_B([Source B])
      S1_Port[(Aggregator DB)]
      S1_A --> S1_Port
      S1_B --> S1_Port
    end
    subgraph S2["Phase 2: Transform (diamond + hex)"]
      S2_Decide{Validate?}
      S2_Model{{Feature Extract}}
      S2_Join[Join]
      S2_Decide -->|yes| S2_Model --> S2_Join
      S2_Decide -->|no| S2_Join
    end
    subgraph S3["Phase 3: Report (circle)"]
      S3_Start((Start))
      S3_Render[Render 2D/3D]
      S3_End((END))
      S3_Start --> S3_Render --> S3_End
    end
    subgraph S4["Phase 4: Output (mix)"]
      S4_Pub[/Publish/]
      S4_Store[(Store)]
      S4_Alert{{Alert}}
      S4_Pub --> S4_Store --> S4_Alert
    end
    S1_Port --> S2_Decide
    click S1_Port "#phase-1-input" "Open Phase 1 Input section"
    click S2_Decide "#phase-2-transform" "Open Phase 2 Transform section"
    click S3_Render "#phase-3-report" "Open Phase 3 Report section"
    click S4_Pub "#phase-4-output" "Open Phase 4 Output section"

nodes:
  - id: NODE_SCRIPT
    type: SourceStrings
    label: "Script + Metadata"
    category: source
    pos: { x: 40, y: 80 }
    properties:
      'doc:anchorId': "node-script"
      title: "Jurassic Park · 5s Demo"
      script: "Life found a way — and now your node graph does too."
    params:
      title: "Jurassic Park · 5s Demo"
      script: "Life found a way — and now your node graph does too."
    inputs: []
    outputs:
      - port: title_out
        type: STRING
      - port: script_out
        type: STRING

  - id: NODE_PROMPT
    type: PromptComposer
    label: "Prompt Composer"
    category: source
    pos: { x: 360, y: 80 }
    properties:
      'doc:anchorId': "node-prompt"
    params:
      style: "cinematic, high-contrast, film-grain"
      negative: "blurry, watermark, low-res"
    inputs:
      - port: script_in
        type: STRING
        from: NODE_SCRIPT.script_out
    outputs:
      - port: prompt_out
        type: STRING

  - id: NODE_KEYFRAME
    type: VideoGeneration
    label: "Generate Keyframe (Image)"
    category: visual
    pos: { x: 680, y: 10 }
    properties:
      'doc:anchorId': "node-keyframe"
      model: generate_image
      prompt: "Cinematic dinosaur silhouette, museum lighting, film grain, title-card: {{title}}"
      aspect_ratio: landscape
      resolution: 1080p
      fast: true
      generate_audio: false
    inputs:
      - port: prompt_in
        type: STRING
        from: NODE_PROMPT.prompt_out
    outputs:
      - port: image_url_out
        type: IMAGE_URL

  - id: NODE_VIDEO
    type: VideoGeneration
    label: "Generate Video (ref image)"
    category: visual
    pos: { x: 680, y: 160 }
    properties:
      'doc:anchorId': "node-video"
      model: generate_video
      prompt: "{{script}}\nStyle: cinematic, high-contrast, film-grain. Camera: slow dolly."
      aspect_ratio: landscape
      duration: 5
      resolution: 1080p
      fast: true
      generate_audio: true
    inputs:
      - port: prompt_in
        type: STRING
        from: NODE_PROMPT.prompt_out
      - port: reference_image_in
        type: IMAGE_URL
        from: NODE_KEYFRAME.image_url_out
    outputs:
      - port: video_url_out
        type: VIDEO_URL

  - id: NODE_CAPTION
    type: CaptionTemplate
    label: "Caption Template"
    category: publish
    pos: { x: 1000, y: 80 }
    properties:
      'doc:anchorId': "node-caption"
      template: |
        {{title}}
        — {{script}}
    inputs:
      - port: title_in
        type: STRING
        from: NODE_SCRIPT.title_out
      - port: script_in
        type: STRING
        from: NODE_SCRIPT.script_out
    outputs:
      - port: caption_out
        type: STRING

  - id: NODE_RENDER
    type: RenderVideo
    label: "Render / Export"
    category: publish
    pos: { x: 1000, y: 220 }
    properties:
      'doc:anchorId': "node-render"
      output: "./out/demo.mp4"
    inputs:
      - port: video_in
        type: VIDEO_URL
        from: NODE_VIDEO.video_url_out
      - port: caption_in
        type: STRING
        from: NODE_CAPTION.caption_out
    outputs:
      - port: file_out
        type: FILE

edges:
  - { id: e01, from_node: NODE_SCRIPT, from_port: script_out, to_node: NODE_PROMPT, to_port: script_in, type: STRING }
  - { id: e02, from_node: NODE_PROMPT, from_port: prompt_out, to_node: NODE_KEYFRAME, to_port: prompt_in, type: STRING }
  - { id: e03, from_node: NODE_KEYFRAME, from_port: image_url_out, to_node: NODE_VIDEO, to_port: reference_image_in, type: IMAGE_URL }
  - { id: e04, from_node: NODE_PROMPT, from_port: prompt_out, to_node: NODE_VIDEO, to_port: prompt_in, type: STRING }
  - { id: e05, from_node: NODE_VIDEO, from_port: video_url_out, to_node: NODE_RENDER, to_port: video_in, type: VIDEO_URL }
  - { id: e06, from_node: NODE_CAPTION, from_port: caption_out, to_node: NODE_RENDER, to_port: caption_in, type: STRING }

'kg:subgraphs':
  - id: gen
    label: "AI Generation (Cluster)"
    kind: cluster
    parentId: null
    memberNodeIds: [NODE_PROMPT, NODE_KEYFRAME, NODE_VIDEO]
  - id: pub
    label: "Publish (Subgraph)"
    kind: subgraph
    parentId: null
    memberNodeIds: [NODE_CAPTION, NODE_RENDER]

socket_types:
  STRING: { color: "#AED6F1", accepts: [STRING] }
  IMAGE_URL: { color: "#93C5FD", accepts: [IMAGE_URL, STRING] }
  VIDEO_URL: { color: "#5DADE2", accepts: [VIDEO_URL, STRING] }
  FILE: { color: "#FDFEFE", accepts: [FILE] }
---

# Markdown Parsing + Rendering (All Modes)

Use this single file to validate end-to-end behavior across Infinite Canvas + all renderers/modes.

> [!tip] One-file SSOT
> This markdown is intentionally dense: headings, callouts, tables, lists, code fences, mermaid, HTML, media, GeoJSON, and internal links.

---

## Mode Matrix

| Mode | What to verify (from this markdown) |
| --- | --- |
| Infinite Canvas | Markdown blocks become nodes (Document/Section/Paragraph/Table/Code) |
| 2D (D3) | Mermaid diagram nodes/edges + internal links navigation |
| 2D (Flow) | Frontmatter Flow nodes/ports/typed edges |
| 2D (Design) | Layers by `category` and overlays by `'kg:subgraphs'` |
| 2D (Storyboard Widget) | Overlay-first Widgets + port handles (ComfyUI-like) |
| 3D | Shape parity (diamond/hex + media nodes) |
| Frontmatter On/Off | Mermaid-in-frontmatter + Flow overlay vs body-only |
| Geospatial On/Off | `geojson` fences become map layers |
| Structure / Keywords | Headings/tree + tag clusters |

---

## Quick Checklist (by mode)

### Infinite Canvas

- Pan/zoom across this document's block-nodes.
- Confirm these blocks become distinct nodes: this callout, tables, mermaid fences, code fences, GeoJSON.

### 2D Renderer (D3)

- Confirm Mermaid nodes/edges appear and are selectable.
- Click internal links in this markdown and verify navigation.

### 2D Renderer (Flow)

- Confirm frontmatter nodes/edges render as a typed flow graph.
- Confirm `category` creates layer/depth differences.

### 2D Renderer (Design)

- Toggle layers/subgraphs: `AI Generation (Cluster)` and `Publish (Subgraph)`.
- Confirm groups/clusters have visible boundaries.

### 2D Renderer (Storyboard) - Widget

- You should see Widgets (not node glyphs) for Flow nodes.
- Connect ports using the overlay handle dots.
- Try ComfyUI-like workflow in the section below.

### 3D Mode

- Confirm the same graph is rendered in 3D and preserves selection.

### Frontmatter Mode On/Off

- Off: only the markdown body graph.
- On: includes frontmatter Mermaid + frontmatter Flow graph overlays.

### Geospatial Mode On/Off

- On: GeoJSON renders as map layers.
- Off: GeoJSON stays as a fenced block and does not affect the canvas.

### Document Structure / Keyword Mode

- Structure mode shows a heading tree.
- Keyword mode clusters tags like `#canvas`, `#flow`, `#geo`.

## Flow (Frontmatter) ↔ Markdown Links + Template Vars

- [[NODE_SCRIPT]] provides `{{title}}` + `{{script}}`.
- [[NODE_PROMPT]] builds the prompt consumed by [[NODE_KEYFRAME]] and [[NODE_VIDEO]].
- [[NODE_CAPTION]] formats a caption using `{{title}}` / `{{script}}`.
- [[NODE_RENDER]] is the final output node.

### Storyboard Widget: ComfyUI-like Video Generation

This section is designed to look and feel like a ComfyUI workflow in **2D Renderer (Storyboard) - Widget**.

1. Open Storyboard Widget.
2. You should immediately see Widgets for:
   - [[NODE_KEYFRAME]] (model `generate_image`)
   - [[NODE_VIDEO]] (model `generate_video`)
3. Inspect these fields in the Widget UI:
   - `model`, `prompt`, `aspect_ratio`, `duration`, `resolution`, `fast`, `generate_audio`, `reference_image`
4. Use port handles to connect:
   - `NODE_KEYFRAME.image_url_out → NODE_VIDEO.reference_image_in`
   - `NODE_PROMPT.prompt_out → NODE_VIDEO.prompt_in`

| Node | Purpose | Key property fields you should see |
| --- | --- | --- |
| `NODE_KEYFRAME` | Create a reference image | `model=generate_image`, `prompt`, `aspect_ratio`, `resolution` |
| `NODE_VIDEO` | Generate a 5-second clip | `model=generate_video`, `prompt`, `duration=5`, `resolution`, `generate_audio` |

> [!info] Template vars inside a blockquote
> Caption preview: **{{title}}** — {{script}}

| Field | Source | Example |
| --- | --- | --- |
| Title | `NODE_SCRIPT.title_out` | {{title}} |
| Script | `NODE_SCRIPT.script_out` | {{script}} |

---

## Mermaid ↔ Markdown Jump Targets

**Mermaid → Markdown jump targets (click directives in frontmatter):**
- Phase 1 Input → [[#Phase 1 Input (Mermaid S1)]]
- Phase 2 Transform → [[#Phase 2 Transform (Mermaid S2)]]
- Phase 3 Report → [[#Phase 3 Report (Mermaid S3)]]
- Phase 4 Output → [[#Phase 4 Output (Mermaid S4)]]

<a id="phase-1-input"></a>
#### Phase 1 Input (Mermaid S1)

Aggregator DB represents an ingest junction. ^mermaid-s1-port

<a id="phase-2-transform"></a>
#### Phase 2 Transform (Mermaid S2)

This paragraph is a block-link target: decision point “Validate?” ^mermaid-s2-decide

<a id="phase-3-report"></a>
#### Phase 3 Report (Mermaid S3)

Block-link target: render surface “Render 2D/3D”. ^mermaid-s3-render

<a id="phase-4-output"></a>
#### Phase 4 Output (Mermaid S4)

Block-link target: publish/store step. ^mermaid-s4-pub

**Block link examples (same note):**
- Jump to decision block: [[#^mermaid-s2-decide]]
- Jump to render block: [[#^mermaid-s3-render]]

---

## Rich Media (Image / Video / Iframe / YouTube)

![](https://example.com/a.png)

[![Clickable thumb](https://example.com/a.jpg "Click-through image")](https://example.com/)

YouTube (provider embed): https://www.youtube.com/watch?v=dQw4w9WgXcQ

Short link variant: https://youtu.be/dQw4w9WgXcQ

![iframe](https://example.com/)

<iframe src="https://example.com/" title="Example iframe"></iframe>

---

## Code Blocks + Mermaid Fence

```ts
export type DemoMode = 'infinite-canvas' | 'd3' | 'flow' | 'design' | 'storyboard-widget' | '3d'
```

```mermaid
flowchart LR
  A[Markdown] --> B{Parse}
  B --> C{{Graph}}
  C --> D[Render]
```

---

## Geospatial Mode (Embedded GeoJSON)

Turn **Geospatial Mode ON** to render these layers.

```geojson
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Demo Point", "kind": "poi", "tag": "#geo" },
      "geometry": { "type": "Point", "coordinates": [103.8198, 1.3521] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Demo Line", "kind": "route", "tag": "#geo" },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [103.8198, 1.3521],
          [103.851959, 1.290270]
        ]
      }
    }
  ]
}
```

---

## Multi-dimensional Table

| Task | Status | Date | Category    |
| --- | --- | --- | --- |
| Try the Infinite Canvas    | Done  | 2023-08-01 | A,1 |
| Observe what airvio can do | Doing | 2023-08-02 | B,2   |
| Visit airvio               | Done  | 2023-08-03 | 1,Y   |
| Invite and collaborate     | Todo  | 2023-08-08 | 2,Z   |

---

## Document Structure + Keyword Mode

### Keywords

- #canvas #flow #design #storyboard-widget #d3 #3d #geo

### Section Tags

- Flow + editing: #flow #storyboard-widget
- Renderers: #d3 #design #3d
- Geospatial: #geo

### Notes

- Use **Document Structure Mode** to inspect heading/tree derivation.
- Use **Keyword Mode** to cluster/tag-filter.
- Toggle **Frontmatter Mode** on/off to compare overlays.
