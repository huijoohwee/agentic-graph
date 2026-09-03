# Storyboard Widget (2D) + D3 Canvas · Demo

This deck includes a **frontmatter-flow graph** (see the YAML block at the top of this file) to demo:

- **Nodes + node quick editors** (smart fields for rich media generation)
- **Edges/flows** with typed ports and port handles
- **Graph layers** via `category` → `visual:layer`
- **Subgraphs / clusters / groups** via `'kg:subgraphs'`

It also includes a separate **2D (D3) editor-mode** section for generic graph editing gestures.

Hover term: <abbr title="The 2D graph renderer built with D3 + SVG">D3 Canvas</abbr>

> [!info] What this demo covers
> - **Storyboard Widget (2D)**: node quick editors + port handles + groups/clusters
> - **2D → D3 → Editor**: interactive graph editing on the canvas
> - **Schema-driven visuals** + per-node overrides (shapes, grouping)

## Storyboard Widget Quick Start (2 minutes)

- Open this markdown file in agentic-graph
- Switch to **Canvas → 2D → Storyboard Widget**
- Select **NODE_KEYFRAME** or **NODE_VIDEO**, then open the node quick editor and tweak:
  - `model` (`generate_image` / `generate_video`)
  - `prompt`, `aspect_ratio`, `duration`, `resolution`
- Use port handles to connect:
  - `NODE_KEYFRAME.image_url_out → NODE_VIDEO.reference_image_in`
  - `NODE_PROMPT.prompt_out → NODE_VIDEO.prompt_in`
- Open the **Groups** tab to inspect the `AI Generation (Cluster)` and `Publish (Subgraph)` overlays

### Frontmatter Flow Graph ↔ Markdown Links

- [[NODE_SCRIPT]] → “Script + Metadata” source node（anchor: `#node-script`）feeds `{{title}}` / `{{script}}` in the caption template.
- [[NODE_PROMPT]] → “Prompt Composer” node（anchor: `#node-prompt`）builds the generation prompt used by both [[NODE_KEYFRAME]] and [[NODE_VIDEO]].
- [[NODE_KEYFRAME]] → Image keyframe generator（anchor: `#node-keyframe`）produces an image URL for [[NODE_VIDEO]].
- [[NODE_VIDEO]] → Video generator（anchor: `#node-video`）combines prompt + reference image.
- [[NODE_CAPTION]] → Caption builder（anchor: `#node-caption`）formats the text overlay using `{{title}}` and `{{script}}`.
- [[NODE_RENDER]] → Final render node（anchor: `#node-render`）writes the composed mp4 file.

---

## Quick Start (2 minutes)

### 1) Provide dataset URLs (docs-only placeholders)
### 第 1 步：准备数据集 URL（仅在文档/配置中占位）

- Airports: record-style JSON with coordinates (points)
  Airports：带坐标字段的记录型 JSON（点要素）
- Countries: GeoJSON polygons
  Countries：多边形 GeoJSON
- Cities: record-style JSON with coordinates (points)
  Cities：带坐标字段的记录型 JSON（点要素）

### 2) Register layers via Source Files
### 第 2 步：通过 Source Files 注册图层

1. Open **MainPanel Workflow → Step 3 (Ingest) → Source Files**.
   打开 **MainPanel Workflow → Step 3 (Ingest) → Source Files**。
2. Create/select 3 rows labeled **Airports**, **Countries**, **Cities**.
   创建或选择 3 行 Source File，名称分别为 Airports / Countries / Cities。
3. For each row:
   对于每一行：
   - Paste the dataset URL in the URL input and import.
     在 URL 输入框中粘贴该数据集 URL 并执行导入。
   - Enable the Geo toggle/checkbox to register it as a geospatial dataset layer.
     打开 Geo 勾选/开关，将该 Source File 注册为 geospatial 图层。

If the Source File row is this Markdown document itself, enabling the Geo checkbox registers the embedded `geojson` blocks above as separate overlay datasets (uploaded to the local dataset cache).

For the local fixtures, you can paste the same-origin URLs directly:

- `/examples/geospatial-demo/airports.records.json`
- `/examples/geospatial-demo/countries.geojson`
- `/examples/geospatial-demo/cities.records.json`
