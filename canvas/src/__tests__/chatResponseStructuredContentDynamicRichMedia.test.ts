import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { appendChatHistoryWorkspaceFile } from '@/features/chat/chatHistoryWorkspace'
import { applyChatKgcWorkspaceDocumentToCanvas } from '@/features/chat/chatKgcCanvasApply'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { buildDashboardCanvasModel } from '@/components/DashboardCanvas/dashboardModel'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_WIDGET_REGISTRY_METADATA_KEY,
} from '@/lib/config.storyboard-widget'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { parseCanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'
import { applyCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
import { GLTF_ASSET_MIME_TYPE, parseGlbAssetDocument } from '@/lib/assets/glbAssetDocument'
import type { GraphSchema } from '@/lib/graph/schema'

const STRUCTURED_DYNAMIC_TEST_SCHEMA = {
  layout: { mode: 'block' },
  behavior: {
    allowEdgeCreation: true,
    allowNodeDrag: true,
  },
  nodeStyles: {},
  edgeStyles: {},
  rules: [],
} as unknown as GraphSchema

export async function testChatResponseStructuredContentAppliesDynamicRichMediaPanelHandles() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().clearGraphData()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const assistantText = [
      '```yaml',
      'response:',
      '  structuredContent:',
      '    widgets:',
      '      - id: compute-widget',
      '        label: Inline Compute Widget',
      '        nodeTypeId: TextGeneration',
      '        formId: textGeneration.openai',
      '        widgetTypeId: default',
      '        "flow:compute": |',
      '          inputs => {',
      '            const text = String(inputs.prompt_in || \'\').trim();',
      '            const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, \'-\').replace(/^-+|-+$/g, \'\') || \'empty\';',
      '            return {',
      '              outputSrcDoc: `<section><h1>${text}</h1><p>dynamic chart</p></section>`,',
      '              imageUrl: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><text>${slug}</text></svg>`,',
      '            };',
      '          }',
      '    cards:',
      '      - id: apply-card',
      '        label: Apply Card',
      '        kind: text',
      '        output: "Editable card output from the applied chat response."',
      '    panels:',
      '      - id: computed-chart',
      '        label: Computed Chart Panel',
      '        kind: html',
      '      - id: computed-image',
      '        label: Computed Image Panel',
      '        kind: image',
      '    edges:',
      '      - id: card-to-compute',
      '        source: apply-card.output',
      '        target: compute-widget.prompt_in',
      '      - id: compute-to-chart',
      '        source: compute-widget.outputSrcDoc',
      '        target: computed-chart.outputSrcDoc',
      '      - id: compute-to-image',
      '        source: compute-widget.imageUrl',
      '        target: computed-image.imageUrl',
      '```',
    ].join('\n')

    const workspacePath = await appendChatHistoryWorkspaceFile({
      requestedPath: '/chat-log/20260605T044500Z/kgc_20260605T044500Z.md',
      timestampMs: Date.UTC(2026, 5, 5, 4, 45, 0),
      providerSummary: 'structured test',
      userText: 'Finalize dynamic rich-media structured content.',
      assistantText,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-structured-dynamic-media',
      title: 'Dynamic Rich Media',
    })

    const fs = await getWorkspaceFs()
    const canonicalText = await fs.readFileText(workspacePath)
    for (const snippet of ['mcp-response-compute-widget', 'mcp-response-computed-chart', 'mcp-response-computed-image']) {
      if (!canonicalText.includes(snippet)) throw new Error(`Expected finalized KGC workspace file to include ${snippet}`)
    }

    const applied = await applyChatKgcWorkspaceDocumentToCanvas(workspacePath)
    if (!applied) throw new Error('Expected dynamic rich-media structured response to apply to canvas graph')

    const graphData = useGraphStore.getState().graphData
    if (!graphData || graphData.context !== 'frontmatter-flow') {
      throw new Error(`Expected active canvas graph to be frontmatter-flow, got: ${JSON.stringify(graphData?.metadata || null)}`)
    }
    const byId = new Map((graphData.nodes || []).map(node => [String(node.id || ''), node]))
    const computeWidget = byId.get('mcp-response-compute-widget')
    const computedChart = byId.get('mcp-response-computed-chart')
    const computedImage = byId.get('mcp-response-computed-image')
    if (!computeWidget || computeWidget.type !== FLOW_TEXT_GENERATION_NODE_TYPE_ID) throw new Error('Expected inline compute widget node')
    if (!computedChart || computedChart.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) throw new Error('Expected computed chart Rich Media Panel')
    if (!computedImage || computedImage.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) throw new Error('Expected computed image Rich Media Panel')

    const computeToChartEdge = graphData.edges.find(edge => edge.id === 'e-mcp-response-compute-to-chart')
    const computeToImageEdge = graphData.edges.find(edge => edge.id === 'e-mcp-response-compute-to-image')
    if (
      !computeToChartEdge
      || computeToChartEdge.properties?.['flow:sourcePortKey'] !== 'outputSrcDoc'
      || computeToChartEdge.properties?.['flow:targetPortKey'] !== 'outputSrcDoc'
    ) throw new Error(`Expected outputSrcDoc edge, got: ${JSON.stringify(computeToChartEdge)}`)
    if (
      !computeToImageEdge
      || computeToImageEdge.properties?.['flow:sourcePortKey'] !== 'imageUrl'
      || computeToImageEdge.properties?.['flow:targetPortKey'] !== 'imageUrl'
    ) throw new Error(`Expected imageUrl edge, got: ${JSON.stringify(computeToImageEdge)}`)

    const registry = Array.isArray(graphData.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
      ? graphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
      : []
    const connectedValues = computeFlowConnectedValuesBySchemaPath({
      graphData,
      registry,
      targetNodeIds: new Set(['mcp-response-computed-chart', 'mcp-response-computed-image']),
    })
    const chartSrcDoc = connectedValues.get('mcp-response-computed-chart')?.['properties.outputSrcDoc']
    const imageUrl = connectedValues.get('mcp-response-computed-image')?.['properties.imageUrl']
    if (
      typeof chartSrcDoc?.value !== 'string'
      || !chartSrcDoc.value.includes('<h1>Editable card output from the applied chat response.</h1>')
      || !chartSrcDoc.sources.some(source => source.nodeId === 'mcp-response-compute-widget' && source.portKey === 'outputSrcDoc')
    ) throw new Error(`Expected computed outputSrcDoc to reach chart panel, got: ${JSON.stringify(chartSrcDoc)}`)
    if (
      imageUrl?.value !== 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><text>editable-card-output-from-the-applied-chat-response</text></svg>'
      || !imageUrl.sources.some(source => source.nodeId === 'mcp-response-compute-widget' && source.portKey === 'imageUrl')
    ) throw new Error(`Expected computed imageUrl to reach image panel, got: ${JSON.stringify(imageUrl)}`)

    const updatedGraphData = {
      ...graphData,
      nodes: graphData.nodes.map(node => String(node.id || '') === 'mcp-response-apply-card'
        ? { ...node, properties: { ...(node.properties || {}), output: 'live recompute input' } }
        : node),
    }
    const recomputedChartSrcDoc = computeFlowConnectedValuesBySchemaPath({
      graphData: updatedGraphData,
      registry,
      targetNodeIds: new Set(['mcp-response-computed-chart']),
    }).get('mcp-response-computed-chart')?.['properties.outputSrcDoc']?.value
    if (typeof recomputedChartSrcDoc !== 'string' || !recomputedChartSrcDoc.includes('<h1>live recompute input</h1>')) {
      throw new Error(`Expected outputSrcDoc to refresh after upstream edit, got: ${String(recomputedChartSrcDoc)}`)
    }
  } finally {
    useGraphStore.getState().clearGraphData()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testChatResponseStructuredContentProjectsRendererPresetsToShared2dSurfaces() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch
    const cases = [
      { rawRenderer: '2D Renderer: D3 Graph', expectedRenderer: 'd3' },
      { rawRenderer: '2D Renderer: Flow Canvas', expectedRenderer: 'flow' },
      { rawRenderer: '2D Renderer: Dashboard', expectedRenderer: 'dashboard' },
    ] as const

    for (let index = 0; index < cases.length; index += 1) {
      const { rawRenderer, expectedRenderer } = cases[index]!
      resetWorkspaceFsForTests()
      useGraphStore.getState().clearGraphData()
      useGraphStore.getState().setCanvasRenderMode('2d')
      useGraphStore.getState().setCanvas2dRenderer('storyboard')

      const assistantText = [
        '```yaml',
        'response:',
        '  structuredContent:',
        '    canvas:',
        '      renderMode: "2D Mode"',
        `      renderer: "${rawRenderer}"`,
        '    cards:',
        `      - id: renderer-source-${expectedRenderer}`,
        `        label: ${JSON.stringify(`${rawRenderer} Source`)}`,
        '        kind: text',
        `        output: "Shared graph data for ${rawRenderer}."`,
        '        score: 7',
        '    panels:',
        `      - id: renderer-panel-${expectedRenderer}`,
        `        label: ${JSON.stringify(`${rawRenderer} Rich Media Panel`)}`,
        '        kind: html',
        '```',
      ].join('\n')

      const workspacePath = await appendChatHistoryWorkspaceFile({
        requestedPath: `/chat-log/20260605T060${index}00Z/kgc_20260605T060${index}00Z.md`,
        timestampMs: Date.UTC(2026, 5, 5, 6, index, 0),
        providerSummary: `structured ${expectedRenderer} renderer test`,
        userText: `Render ${rawRenderer} from neutral structured content.`,
        assistantText,
        storageType: 'chatAgenticGraph',
        traceId: `trace-structured-renderer-${expectedRenderer}`,
        title: `Structured ${expectedRenderer} Renderer`,
      })

      const fs = await getWorkspaceFs()
      const canonicalText = await fs.readFileText(workspacePath)
      if (!canonicalText.includes(`kgCanvas2dRenderer: "${expectedRenderer}"`)) {
        throw new Error(`Expected structured renderer preset ${expectedRenderer} in KGC frontmatter, got:\n${canonicalText}`)
      }
      const preset = parseCanvasWorkspaceFrontmatterPreset(canonicalText)
      if (preset?.canvasRenderMode !== '2d' || preset.canvas2dRenderer !== expectedRenderer) {
        throw new Error(`Expected shared canvas preset for ${expectedRenderer}, got ${JSON.stringify(preset)}`)
      }

      const changed = applyCanvasFrontmatterPreset({ rawText: canonicalText })
      const store = useGraphStore.getState()
      if (!changed || store.canvasRenderMode !== '2d' || store.canvas2dRenderer !== expectedRenderer) {
        throw new Error(`Expected frontmatter preset to select ${expectedRenderer}, got ${JSON.stringify({ changed, canvasRenderMode: store.canvasRenderMode, canvas2dRenderer: store.canvas2dRenderer })}`)
      }

      const applied = await applyChatKgcWorkspaceDocumentToCanvas(workspacePath)
      if (!applied) throw new Error(`Expected ${expectedRenderer} renderer structured response to apply to canvas graph`)
      const graphData = useGraphStore.getState().graphData
      if (!graphData || graphData.context !== 'frontmatter-flow') {
        throw new Error(`Expected ${expectedRenderer} graph to stay on frontmatter-flow, got: ${JSON.stringify(graphData?.metadata || null)}`)
      }

      const registry = Array.isArray(graphData.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
        ? graphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
        : []
      const connected = computeFlowConnectedValuesBySchemaPath({
        graphData,
        registry,
        targetNodeIds: new Set([`mcp-response-renderer-panel-${expectedRenderer}`]),
      }).get(`mcp-response-renderer-panel-${expectedRenderer}`)?.['properties.outputSrcDoc']
      if (
        typeof connected?.value !== 'string'
        || !connected.value.includes(`Shared graph data for ${rawRenderer}.`)
        || !connected.sources.some(source => source.nodeId === 'mcp-response-structured-compute' && source.portKey === 'outputSrcDoc')
      ) throw new Error(`Expected ${expectedRenderer} Rich Media output to remain compute-backed, got ${JSON.stringify(connected)}`)

      if (expectedRenderer === 'dashboard') {
        const dashboard = buildDashboardCanvasModel(graphData, STRUCTURED_DYNAMIC_TEST_SCHEMA)
        const nodesMetric = dashboard.metrics.find(metric => metric.id === 'nodes')
        const edgesMetric = dashboard.metrics.find(metric => metric.id === 'edges')
        if (nodesMetric?.value !== String(graphData.nodes.length) || edgesMetric?.value !== String(graphData.edges.length)) {
          throw new Error(`Expected Dashboard to derive from shared graph data, got ${JSON.stringify({ nodesMetric, edgesMetric, nodeCount: graphData.nodes.length, edgeCount: graphData.edges.length })}`)
        }
      }
    }
  } finally {
    useGraphStore.getState().clearGraphData()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testChatResponseStructuredContentProjectsXrModelFrontmatter() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().clearGraphData()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const gltfDataUrl = `${GLTF_ASSET_MIME_TYPE};base64,eyJhc3NldCI6eyJ2ZXJzaW9uIjoiMi4wIn19`
    const assistantText = [
      '```yaml',
      'response:',
      '  structuredContent:',
      '    canvas:',
      '      surfaceMode: "XR Mode"',
      '      renderMode: "3D Mode"',
      '      canvas3dMode: "XR Mode"',
      '    model:',
      '      type: model',
      '      format: gltf',
      '      name: neutral-scene.gltf',
      `      mimeType: ${GLTF_ASSET_MIME_TYPE}`,
      `      dataUrl: data:${gltfDataUrl}`,
      '    cards:',
      '      - id: xr-source',
      '        label: XR Source',
      '        kind: text',
      '        output: "XR model scene summary."',
      '    panels:',
      '      - id: xr-panel',
      '        label: XR Rich Media Panel',
      '        kind: html',
      '```',
    ].join('\n')

    const workspacePath = await appendChatHistoryWorkspaceFile({
      requestedPath: '/chat-log/20260605T061500Z/kgc_20260605T061500Z.md',
      timestampMs: Date.UTC(2026, 5, 5, 6, 15, 0),
      providerSummary: 'structured xr model test',
      userText: 'Render XR model payload from neutral structured content.',
      assistantText,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-structured-xr-model',
      title: 'Structured XR Model',
    })

    const fs = await getWorkspaceFs()
    const canonicalText = await fs.readFileText(workspacePath)
    for (const snippet of [
      'kgCanvasSurfaceMode: "xr"',
      'kgCanvasRenderMode: "3d"',
      'kgCanvas3dMode: "xr"',
      'kgAssetType: "model"',
      'kgAssetFormat: "gltf"',
      'kgAssetName: "neutral-scene.gltf"',
      `kgAssetMimeType: "${GLTF_ASSET_MIME_TYPE}"`,
      'kgAssetDataUrl: "data:model/gltf+json;base64,eyJhc3NldCI6eyJ2ZXJzaW9uIjoiMi4wIn19"',
    ]) {
      if (!canonicalText.includes(snippet)) throw new Error(`Expected structured XR/model frontmatter snippet ${snippet}`)
    }

    const preset = parseCanvasWorkspaceFrontmatterPreset(canonicalText)
    if (preset?.canvasSurfaceMode !== 'xr' || preset.canvasRenderMode !== '3d' || preset.canvas3dMode !== 'xr') {
      throw new Error(`Expected XR surface preset from structured content, got ${JSON.stringify(preset)}`)
    }
    const asset = parseGlbAssetDocument(canonicalText)
    if (!asset || asset.format !== 'gltf' || asset.name !== 'neutral-scene.gltf' || asset.mimeType !== GLTF_ASSET_MIME_TYPE) {
      throw new Error(`Expected GLTF asset document from structured content, got ${JSON.stringify(asset)}`)
    }

    useGraphStore.getState().setCanvasRenderMode('2d')
    useGraphStore.getState().setCanvas3dMode('3d')
    const changed = applyCanvasFrontmatterPreset({ rawText: canonicalText })
    const store = useGraphStore.getState()
    if (!changed || store.canvasRenderMode !== '3d' || store.canvas3dMode !== 'xr') {
      throw new Error(`Expected structured XR frontmatter to activate XR canvas mode, got ${JSON.stringify({ changed, canvasRenderMode: store.canvasRenderMode, canvas3dMode: store.canvas3dMode })}`)
    }
  } finally {
    useGraphStore.getState().clearGraphData()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testChatResponseStructuredContentSynthesizesGeospatialDataflow() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().clearGraphData()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const assistantText = [
      '```yaml',
      'response:',
      '  structuredContent:',
      '    cards:',
      '      - id: geo-source',
      '        label: Geospatial Source',
      '        kind: geospatial',
      '        geoJson:',
      '          type: FeatureCollection',
      '          features:',
      '            - type: Feature',
      '              properties: { name: Harbor Point }',
      '              geometry: { type: Point, coordinates: [103.851959, 1.29027] }',
      '            - type: Feature',
      '              properties: { name: River Point }',
      '              geometry: { type: Point, coordinates: [103.8429, 1.3006] }',
      '    panels:',
      '      - id: geo-panel',
      '        label: Geospatial Rich Media Panel',
      '        kind: html',
      '```',
    ].join('\n')

    const workspacePath = await appendChatHistoryWorkspaceFile({
      requestedPath: '/chat-log/20260605T051500Z/kgc_20260605T051500Z.md',
      timestampMs: Date.UTC(2026, 5, 5, 5, 15, 0),
      providerSummary: 'structured geospatial test',
      userText: 'Render geospatial structured content as dynamic Rich Media output.',
      assistantText,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-structured-geospatial-media',
      title: 'Geospatial Rich Media',
    })

    const fs = await getWorkspaceFs()
    const canonicalText = await fs.readFileText(workspacePath)
    for (const snippet of ['mcp-response-geo-source', 'mcp-response-geo-panel', 'mcp-response-structured-compute', 'geoJson']) {
      if (!canonicalText.includes(snippet)) throw new Error(`Expected finalized geospatial KGC workspace file to include ${snippet}`)
    }

    const applied = await applyChatKgcWorkspaceDocumentToCanvas(workspacePath)
    if (!applied) throw new Error('Expected synthesized geospatial structured response to apply to canvas graph')

    const graphData = useGraphStore.getState().graphData
    if (!graphData || graphData.context !== 'frontmatter-flow') {
      throw new Error(`Expected synthesized geospatial canvas graph to be frontmatter-flow, got: ${JSON.stringify(graphData?.metadata || null)}`)
    }
    const byId = new Map((graphData.nodes || []).map(node => [String(node.id || ''), node]))
    const source = byId.get('mcp-response-geo-source')
    const compute = byId.get('mcp-response-structured-compute')
    const panel = byId.get('mcp-response-geo-panel')
    if (!source || !source.properties?.geoJson) throw new Error(`Expected geospatial source node with canonical geoJson payload, got: ${JSON.stringify(source)}`)
    if (!compute || compute.type !== FLOW_TEXT_GENERATION_NODE_TYPE_ID) throw new Error('Expected synthesized geospatial compute widget')
    if (!panel || panel.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) throw new Error('Expected geospatial Rich Media Panel target')

    const sourceToCompute = graphData.edges.find(edge => edge.source === 'mcp-response-geo-source' && edge.target === 'mcp-response-structured-compute')
    if (
      !sourceToCompute
      || sourceToCompute.properties?.['flow:sourcePortKey'] !== 'geoJson'
      || sourceToCompute.properties?.['flow:targetPortKey'] !== 'geoJson'
    ) throw new Error(`Expected geospatial source edge to preserve geoJson handle, got: ${JSON.stringify(sourceToCompute)}`)

    const registry = Array.isArray(graphData.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
      ? graphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
      : []
    const connected = computeFlowConnectedValuesBySchemaPath({
      graphData,
      registry,
      targetNodeIds: new Set(['mcp-response-geo-panel']),
    }).get('mcp-response-geo-panel')?.['properties.outputSrcDoc']
    if (
      typeof connected?.value !== 'string'
      || !connected.value.includes('data-kg-structured-geospatial="1"')
      || !connected.value.includes('Geospatial features: 2')
      || !connected.value.includes('Harbor Point')
      || !connected.sources.some(item => item.nodeId === 'mcp-response-structured-compute' && item.portKey === 'outputSrcDoc')
    ) throw new Error(`Expected computed geospatial outputSrcDoc to reach Rich Media Panel, got: ${JSON.stringify(connected)}`)

    const updatedGraphData = {
      ...graphData,
      nodes: graphData.nodes.map(node => String(node.id || '') === 'mcp-response-geo-source'
        ? {
            ...node,
            properties: {
              ...(node.properties || {}),
              geoJson: {
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    properties: { name: 'Ridge Point' },
                    geometry: { type: 'Point', coordinates: [103.92, 1.35] },
                  },
                ],
              },
            },
          }
        : node),
    }
    const recomputed = computeFlowConnectedValuesBySchemaPath({
      graphData: updatedGraphData,
      registry,
      targetNodeIds: new Set(['mcp-response-geo-panel']),
    }).get('mcp-response-geo-panel')?.['properties.outputSrcDoc']?.value
    if (typeof recomputed !== 'string' || !recomputed.includes('Ridge Point') || !recomputed.includes('Geospatial features: 1')) {
      throw new Error(`Expected geospatial outputSrcDoc to refresh after upstream edit, got: ${String(recomputed)}`)
    }

    const storyboard = buildStoryboardBoardModel({ graphData: updatedGraphData, graphRevision: 1, widgetRegistry: registry })
    const storyboardCard = storyboard.lanes.flatMap(lane => lane.cards).find(card => card.id === 'mcp-response-geo-panel') || null
    if (!storyboardCard || storyboardCard.media?.kind !== 'iframe' || !storyboardCard.media.srcDoc?.includes('data-kg-structured-geospatial')) {
      throw new Error(`Expected Storyboard card to reuse computed geospatial Rich Media Panel srcdoc, got ${JSON.stringify(storyboardCard)}`)
    }
  } finally {
    useGraphStore.getState().clearGraphData()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testChatResponseStructuredContentSynthesizesNeutralCardPanelDataflow() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().clearGraphData()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const assistantText = [
      '```yaml',
      'response:',
      '  structuredContent:',
      '    cards:',
      '      - id: storyboard-card',
      '        label: Storyboard Card',
      '        kind: text',
      '        output: "Storyboard card value from neutral structured content."',
      '    panels:',
      '      - id: card-panel',
      '        label: Card Rich Media Panel',
      '        kind: html',
      '```',
    ].join('\n')

    const workspacePath = await appendChatHistoryWorkspaceFile({
      requestedPath: '/chat-log/20260605T045500Z/kgc_20260605T045500Z.md',
      timestampMs: Date.UTC(2026, 5, 5, 4, 55, 0),
      providerSummary: 'structured test',
      userText: 'Render a Storyboard card into a dynamic Rich Media Panel without explicit edges.',
      assistantText,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-structured-neutral-card-panel',
      title: 'Neutral Card Panel',
    })

    const fs = await getWorkspaceFs()
    const canonicalText = await fs.readFileText(workspacePath)
    for (const snippet of ['mcp-response-storyboard-card', 'mcp-response-card-panel', 'mcp-response-structured-compute']) {
      if (!canonicalText.includes(snippet)) throw new Error(`Expected synthesized KGC workspace file to include ${snippet}`)
    }

    const applied = await applyChatKgcWorkspaceDocumentToCanvas(workspacePath)
    if (!applied) throw new Error('Expected synthesized structured response to apply to canvas graph')

    const graphData = useGraphStore.getState().graphData
    if (!graphData || graphData.context !== 'frontmatter-flow') {
      throw new Error(`Expected synthesized canvas graph to be frontmatter-flow, got: ${JSON.stringify(graphData?.metadata || null)}`)
    }
    const byId = new Map((graphData.nodes || []).map(node => [String(node.id || ''), node]))
    const sourceCard = byId.get('mcp-response-storyboard-card')
    const computeWidget = byId.get('mcp-response-structured-compute')
    const panel = byId.get('mcp-response-card-panel')
    if (!sourceCard) throw new Error('Expected neutral Storyboard card source node')
    if (!computeWidget || computeWidget.type !== FLOW_TEXT_GENERATION_NODE_TYPE_ID) throw new Error('Expected synthesized inline compute widget node')
    if (!panel || panel.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) throw new Error('Expected synthesized Rich Media Panel target')

    const registry = Array.isArray(graphData.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
      ? graphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
      : []
    const connected = computeFlowConnectedValuesBySchemaPath({
      graphData,
      registry,
      targetNodeIds: new Set(['mcp-response-card-panel']),
    }).get('mcp-response-card-panel')?.['properties.output']
    if (
      typeof connected?.value !== 'string'
      || !connected.value.includes('Storyboard card value from neutral structured content.')
      || !connected.sources.some(source => source.nodeId === 'mcp-response-structured-compute' && source.portKey === 'output')
    ) throw new Error(`Expected synthesized Markdown output to source from inline compute, got: ${JSON.stringify(connected)}`)

    const updatedGraphData = {
      ...graphData,
      nodes: graphData.nodes.map(node => String(node.id || '') === 'mcp-response-storyboard-card'
        ? { ...node, properties: { ...(node.properties || {}), output: 'updated card value' } }
        : node),
    }
    const recomputed = computeFlowConnectedValuesBySchemaPath({
      graphData: updatedGraphData,
      registry,
      targetNodeIds: new Set(['mcp-response-card-panel']),
    }).get('mcp-response-card-panel')?.['properties.output']?.value
    if (typeof recomputed !== 'string' || !recomputed.includes('updated card value')) {
      throw new Error(`Expected synthesized dataflow to recompute from card edits, got: ${String(recomputed)}`)
    }
  } finally {
    useGraphStore.getState().clearGraphData()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}
