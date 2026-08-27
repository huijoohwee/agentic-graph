# AgenticGraph HTML Canvas Export Call Graph

This document is a file → function call graph of the **exact data flow** for:

- Editor workspace → Export → HTML Canvas (`.canvas-2d.html`)
- Standalone export CLI (`src/cli/export-canvas-html.ts`) used for fixtures

## 1. Data Flow (Workspace Export)

```mermaid
flowchart TD
  A[GraphStore state\nuseGraphStore.getState()] --> B[exportHtmlCanvasFromWorkspace\nexportHtmlCanvas.ts]

  B --> C{2D vs 3D?\ngeospatialEnabled?}

  C -->|2D + no geospatial| D[captureCanvasSvgSnapshot('2d')\ncanvasSlice.ts]
  D --> E[buildViewportSvgMarkupFromElement\nsvgSnapshot.ts]
  E --> E1[inlineComputedStylesIntoClone\nsvgSnapshot.ts]
  E --> E2[DOM overlay capture\n[data-kg-markdown-design-block] → <foreignObject>\nsvgSnapshot.ts]

  C -->|2D fallback/offscreen| F[renderGraphCanvasSvgForHtmlExport\nhtmlCanvasSvgExport.ts]
  F --> F1[setupGraphScene\nscene.ts]
  F --> F2[simulation.tick + beforeRenderFrame\nscene.ts]
  F --> F3[applyGraphCanvasStyles2d\nuseGraphCanvasStyles.ts]
  F --> F4[injectMarkdownDesignBlocksIntoSvgEl\nmarkdownDesignSvgOverlay.ts]

  D --> G[normalizeInteractiveSvgForHtmlViewer\nnormalizeInteractiveSvg.ts]
  F --> G
  G --> H[rewriteSvgMarkupForStandaloneHtmlExport\nrewriteSvgMarkupForStandaloneHtmlExport.ts]
  H --> I[buildGraphHtmlViewerMarkup\ngraphHtmlViewer.ts]
  I --> J[Standalone HTML\n*.canvas-2d.html]
```

### Key parity invariants (Workspace)

- **Zoom/pan parity**: Markdown overlays are injected under the same zoom root `<g>` as the GraphCanvas layers so they pan/zoom with the graph.
- **Visual parity**: `applyGraphCanvasStyles2d` is applied to the SVG DOM before serialization, so exported strokes/colors/animations match live 2D.
- **Standalone correctness**: `rewriteSvgMarkupForStandaloneHtmlExport` resolves proxy URLs and inlines bounded repo-file media.

## 2. Data Flow (Standalone CLI Export)

```mermaid
flowchart TD
  A[Read markdown\nfs.readFile] --> B[loadGraphDataFromTextViaParser\nloader.ts]
  B --> C[graphData + defaultSchema]
  A --> D[lexMarkdown + deriveMarkdownDesignLayout\nmarkdownPreviewLex.ts + markdownDesignLayout.ts]
  D --> D1[markdownDesignBlocks[]]
  C --> E[renderGraphCanvasSvgForHtmlExport\nhtmlCanvasSvgExport.ts]
  D1 --> E
  E --> F[normalizeInteractiveSvgForHtmlViewer\nnormalizeInteractiveSvg.ts]
  F --> G[inlineMissingEdgeGeometry\nsrc/cli/export-canvas-html.ts]
  G --> H[buildGraphHtmlViewerMarkup\ngraphHtmlViewer.ts]
  H --> I[Write output HTML\nfs.writeFile]
```

## 3. Runtime Hydration (Standalone HTML)

```mermaid
flowchart TD
  A[Standalone HTML opens] --> B[SVG injected into #kg-svgWrap]
  A --> C[Serialized graphData + mediaNodes JSON]
  B --> D[Viewer runtime JS\n(zoom/pan, HUD buttons)]
  C --> E[Overlay runtime\n(media overlay pool, iframe/img/video)]
  D --> F[User interactions\npan/zoom/fit/reset]
  E --> F
```

## Code References

- Workspace export entrypoint: [exportHtmlCanvasFromWorkspace](file://${AG_GITHUB_ROOT}/agenticgraph/canvas/src/features/markdown-workspace/main/exports/exportHtmlCanvas.ts)
- SVG snapshot + DOM overlay capture: [svgSnapshot.ts](file://${AG_GITHUB_ROOT}/agenticgraph/canvas/src/lib/graph/svgSnapshot.ts)
- Offscreen 2D SVG renderer: [renderGraphCanvasSvgForHtmlExport](file://${AG_GITHUB_ROOT}/agenticgraph/canvas/src/lib/graph/htmlCanvasSvgExport.ts)
- 2D style parity applicator: [useGraphCanvasStyles.ts](file://${AG_GITHUB_ROOT}/agenticgraph/canvas/src/components/GraphCanvas/useGraphCanvasStyles.ts)
- Markdown block SVG overlay injector: [markdownDesignSvgOverlay.ts](file://${AG_GITHUB_ROOT}/agenticgraph/canvas/src/lib/graph/htmlViewer/markdownDesignSvgOverlay.ts)
- Standalone SVG rewrite: [rewriteSvgMarkupForStandaloneHtmlExport.ts](file://${AG_GITHUB_ROOT}/agenticgraph/canvas/src/lib/graph/htmlViewer/rewriteSvgMarkupForStandaloneHtmlExport.ts)
- HTML viewer builder: [graphHtmlViewer.ts](file://${AG_GITHUB_ROOT}/agenticgraph/canvas/src/lib/graph/graphHtmlViewer.ts)
- Standalone export CLI: [export-canvas-html.ts](file://${AG_GITHUB_ROOT}/agenticgraph/canvas/src/cli/export-canvas-html.ts)
