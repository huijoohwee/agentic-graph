import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { getNodeMediaSpec } from '@/components/GraphCanvas/helpers'
import { computeFlowHandlesByNode } from '@/components/FlowCanvas/handles'
import { finalizeEdgeAuthoring } from '@/features/edge-creation/authoring'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { ensureDefaultWidgetRegistryEntries } from '@/hooks/store/storyboardWidgetManagerSlice'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import { FLOW_IMAGE_GENERATION_NODE_TYPE_ID, FLOW_TEXT_GENERATION_NODE_TYPE_ID, FLOW_VIDEO_GENERATION_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { buildDataflowWidgetRegistry } from '@/lib/storyboardWidget/widgetRegistryDataflow'
import { defaultSchema } from '@/lib/graph/schema'
import { FLOW_WIDGET_FORM_ID_KEY, FLOW_WIDGET_TYPE_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { applyConnectedValuesToNodeForRender } from '@/lib/render/effectiveMediaNode'
import { listMediaOverlayNodes } from '@/lib/render/mediaOverlayPool'
import { buildRichMediaPanelOverlayState, buildRichMediaPanelPreviewSpec } from '@/lib/render/richMediaSsot'
import {
  normalizeRichMediaPanelInlineSrcDoc,
  RICH_MEDIA_PANEL_SRCDOC_ATTR,
  RICH_MEDIA_PANEL_SRCDOC_RESIZE_SCRIPT_ID,
  RICH_MEDIA_PANEL_SRCDOC_SIZE_MESSAGE,
  RICH_MEDIA_PANEL_SRCDOC_STYLE_ID,
  RICH_MEDIA_PANEL_SRCDOC_THEME_MESSAGE, RICH_MEDIA_PANEL_SRCDOC_THEME_SCRIPT_ID, RICH_MEDIA_PANEL_SRCDOC_TIMELINE_SCRIPT_ID,
} from '@/lib/render/richMediaPanelSrcDoc'
type ParsedGraphData = Parameters<typeof computeFlowConnectedValuesBySchemaPath>[0]['graphData']

function readRichMediaPanelSourceBundle(root: string): string {
  const componentRoot = resolve(root, 'src', 'components')
  const files = [
    'RichMediaPanel.tsx',
    'RichMediaPanel.types.ts',
    'RichMediaPanelSurface.tsx',
    'RichMediaPanelShell.tsx',
    'RichMediaPanelContentSurface.tsx', 'richMediaPanelSurfaceVariant.ts',
    'RichMediaPanelTextSurface.tsx',
    'RichMediaPanelIframeSurface.tsx',
    'RichMediaPanelDirectMediaSurface.tsx',
    'RichMediaPanelResizeHandle.tsx',
    'RichMediaPanelOpenOverlay.tsx',
    'useRichMediaPanelMediaState.ts',
    'useRichMediaPanelSurfaceState.ts',
  ]
  return files.map(file => readFileSync(resolve(componentRoot, file), 'utf8')).join('\n')
}

function buildWidgetRegistryForGraphData(graphData: ParsedGraphData) {
  const documentRegistryRaw = ((graphData?.metadata || {}) as Record<string, unknown>)[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  const documentWidgetRegistry = Array.isArray(documentRegistryRaw) ? documentRegistryRaw : []
  return buildDataflowWidgetRegistry({
    documentWidgetRegistry: documentWidgetRegistry as never,
    effectiveWidgetRegistry: [],
    widgetRegistry: ensureDefaultWidgetRegistryEntries([], '2026-04-22T00:00:00.000Z').entries,
  })
}

async function assertOutputSrcDocPanelsReuseSharedPreview(args: {
  fileName: string
  markdown: string
  expectedSrcDocMarker?: string
}) {
  const parsed = await loadGraphDataFromTextViaParser(args.fileName, args.markdown, {
    applyToStore: false,
    syncMarkdownDocument: false,
  })
  const graphData = parsed?.graphData as ParsedGraphData
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const panelNodes = nodes.filter(node => String(node?.type || '') === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  const panelNodeIds = new Set(panelNodes.map(node => String(node?.id || '')).filter(Boolean))
  const widgetRegistry = buildWidgetRegistryForGraphData(graphData)
  const connectedValuesByNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData,
    registry: widgetRegistry,
    targetNodeIds: panelNodeIds,
  })

  let validatedCount = 0
  let markerMatched = !args.expectedSrcDocMarker
  for (const panelNode of panelNodes) {
    const panelId = String(panelNode.id || '')
    const connectedValuesBySchemaPath = connectedValuesByNodeId.get(panelId)
    const connectedSrcDoc = connectedValuesBySchemaPath?.['properties.outputSrcDoc']
    const connectedSrcDocText = typeof connectedSrcDoc?.value === 'string' ? connectedSrcDoc.value : ''
    const localSrcDoc = typeof ((panelNode.properties || {}) as Record<string, unknown>).outputSrcDoc === 'string'
      ? String(((panelNode.properties || {}) as Record<string, unknown>).outputSrcDoc || '')
      : ''
    if (!localSrcDoc.trim() && !connectedSrcDocText.trim()) continue

    if (localSrcDoc.trim()) {
      const localPanel = buildRichMediaPanelOverlayState({ node: panelNode })
      if (!localPanel) throw new Error(`expected local outputSrcDoc panel ${panelId} to use shared Rich Media Panel state`)
      if (localPanel.text.trim()) {
        throw new Error(`expected local output helper text not to cover outputSrcDoc for panel ${panelId}`)
      }
      const localPreview = buildRichMediaPanelPreviewSpec({ node: panelNode, panel: localPanel })
      if (!localPreview || localPreview.kind !== 'iframe' || !String(localPreview.srcDoc || '').trim()) {
        throw new Error(`expected local outputSrcDoc panel ${panelId} to render through shared iframe preview spec`)
      }
      const localSrcDoc = String(localPreview.srcDoc || '')
      if (!localSrcDoc.includes(`${RICH_MEDIA_PANEL_SRCDOC_ATTR}="1"`)) {
        throw new Error(`expected local outputSrcDoc panel ${panelId} to be normalized by the shared Rich Media Panel srcdoc helper`)
      }
      if (!localSrcDoc.includes(`id="${RICH_MEDIA_PANEL_SRCDOC_STYLE_ID}"`)) {
        throw new Error(`expected local outputSrcDoc panel ${panelId} to include the shared Rich Media Panel srcdoc reset style`)
      }
    }

    const panel = buildRichMediaPanelOverlayState({ node: panelNode, connectedValuesBySchemaPath })
    if (!panel) throw new Error(`expected outputSrcDoc panel ${panelId} to use shared Rich Media Panel state`)
    if (panel.text.trim()) {
      throw new Error(`expected output helper text not to cover outputSrcDoc for panel ${panelId}`)
    }
    const preview = buildRichMediaPanelPreviewSpec({ node: panelNode, connectedValuesBySchemaPath, panel })
    if (!preview || preview.kind !== 'iframe' || !String(preview.srcDoc || '').trim()) {
      throw new Error(`expected outputSrcDoc panel ${panelId} to render through shared iframe preview spec`)
    }
    const previewSrcDoc = String(preview.srcDoc || '')
    if (!previewSrcDoc.includes(`${RICH_MEDIA_PANEL_SRCDOC_ATTR}="1"`)) {
      throw new Error(`expected outputSrcDoc panel ${panelId} to be normalized by the shared Rich Media Panel srcdoc helper`)
    }
    if (!previewSrcDoc.includes(`id="${RICH_MEDIA_PANEL_SRCDOC_STYLE_ID}"`)) {
      throw new Error(`expected outputSrcDoc panel ${panelId} to include the shared Rich Media Panel srcdoc reset style`)
    }
    if (!previewSrcDoc.includes('background:transparent!important')) {
      throw new Error(`expected outputSrcDoc panel ${panelId} to clear nested iframe body backgrounds through the shared reset style`)
    }
    if (!previewSrcDoc.includes('padding:0!important')) {
      throw new Error(`expected outputSrcDoc panel ${panelId} to remove duplicate generated frame padding through the shared reset style`)
    }
    if (!previewSrcDoc.includes('body>:is(main,section,article):first-child')) {
      throw new Error(`expected outputSrcDoc panel ${panelId} to flatten top-level frame wrappers through the shared reset style`)
    }
    if (!previewSrcDoc.includes('body>:is(main,section,article):first-child>:is(main,section,article):first-child')) {
      throw new Error(`expected outputSrcDoc panel ${panelId} to flatten nested root frame wrappers through the shared reset style`)
    }

    const renderNode = applyConnectedValuesToNodeForRender({ node: panelNode, connectedValuesBySchemaPath })
    const spec = getNodeMediaSpec(renderNode)
    if (!spec || spec.kind !== 'iframe' || !String(spec.srcDoc || '').trim()) {
      throw new Error(`expected outputSrcDoc panel ${panelId} to resolve through shared graph media spec`)
    }

    validatedCount += 1
    const renderedSrcDoc = `${String(preview.srcDoc || '')}\n${String(spec.srcDoc || '')}`
    if (args.expectedSrcDocMarker && renderedSrcDoc.includes(args.expectedSrcDocMarker)) markerMatched = true
  }

  if (validatedCount < 1) {
    throw new Error('expected at least one Rich Media Panel with local or connected outputSrcDoc')
  }
  if (!markerMatched) {
    throw new Error('expected outputSrcDoc validation marker to render through shared Rich Media Panel preview/media spec')
  }
}

function readRuntimeRichMediaValidationPath(): string {
  const raw =
    String(process.env.AG_RICH_MEDIA_PANEL_VALIDATION_INPUT || '').trim()
    || String(process.env.AG_TEST_VALIDATION_FORBID_HARDCODE_IN_REPO || '').trim()
  return raw ? resolve(raw) : ''
}

export function testRichMediaPanelRendersConnectedTextWidgetOutput() {
  const node = {
    id: 'rich-media-panel-1',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: 'Rich Media Panel',
    properties: {},
  } as Parameters<typeof getNodeMediaSpec>[0]

  const effectiveNode = applyConnectedValuesToNodeForRender({
    node,
    connectedValuesBySchemaPath: {
      'properties.output': {
        value: '## Hello from widget',
        sources: [],
      },
    },
  })

  const spec = getNodeMediaSpec(effectiveNode)
  if (!spec) throw new Error('expected rich media panel to render connected widget output')
  if (spec.kind !== 'iframe') throw new Error(`expected rich media panel connected text output to render as iframe, got ${String(spec.kind)}`)
  if (!String(spec.srcDoc || '').includes('Hello from widget')) {
    throw new Error('expected rich media panel connected text output to become rich media srcdoc content')
  }
}

export function testRichMediaPanelEmptyPanelIsRenderableOverlayShell() {
  const node = {
    id: 'rich-media-panel-empty',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: 'Rich Media Panel',
    properties: {},
  } as Parameters<typeof getNodeMediaSpec>[0]

  const spec = getNodeMediaSpec(node)
  if (!spec) throw new Error('expected empty rich media panel to stay renderable as overlay shell')
  if (spec.kind !== 'iframe') throw new Error(`expected empty rich media panel to default to iframe shell, got ${String(spec.kind)}`)
  if (String(spec.url || '') !== '') throw new Error('expected empty rich media panel to have no url by default')
}

export function testRichMediaPanelConnectedTextOverridesStaleImageRenderState() {
  const node = {
    id: 'rich-media-panel-stale-image',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: 'Rich Media Panel',
    properties: {
      imageUrl: 'https://example.com/stale-image.png',
      videoUrl: 'https://example.com/stale-video.mp4',
    },
  } as Parameters<typeof getNodeMediaSpec>[0]

  const effectiveNode = applyConnectedValuesToNodeForRender({
    node,
    connectedValuesBySchemaPath: {
      'properties.output': {
        value: 'Connected text wins',
        sources: [],
      },
    },
  })

  const spec = getNodeMediaSpec(effectiveNode)
  if (!spec) throw new Error('expected connected text to keep rich media panel renderable')
  if (spec.kind !== 'iframe') throw new Error(`expected connected text to override stale image/video and render as iframe, got ${String(spec.kind)}`)
  if (!String(spec.srcDoc || '').includes('Connected text wins')) {
    throw new Error('expected connected text output to replace stale image/video render state')
  }
}

export function testRichMediaPanelConnectedVideoOverridesStaleTextRenderState() {
  const node = {
    id: 'rich-media-panel-stale-text',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: 'Rich Media Panel',
    properties: {
      output: 'stale text output',
      outputSrcDoc: '<html><body>stale</body></html>',
    },
  } as Parameters<typeof getNodeMediaSpec>[0]

  const effectiveNode = applyConnectedValuesToNodeForRender({
    node,
    connectedValuesBySchemaPath: {
      'properties.videoUrl': {
        value: 'https://example.com/generated-video.mp4',
        sources: [],
      },
    },
  })

  const spec = getNodeMediaSpec(effectiveNode)
  if (!spec) throw new Error('expected connected video to keep rich media panel renderable')
  if (spec.kind !== 'video') throw new Error(`expected connected video to override stale text render state, got ${String(spec.kind)}`)
  if (String(spec.url || '') !== 'https://example.com/generated-video.mp4') {
    throw new Error('expected connected video url to become the rich media panel render target')
  }
}

export function testRichMediaPanelMapsGenericOutputConnectionFromImageSourcePort() {
  const node = {
    id: 'rich-media-panel-generic-output-image',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: 'Rich Media Panel',
    properties: {},
  } as Parameters<typeof getNodeMediaSpec>[0]

  const effectiveNode = applyConnectedValuesToNodeForRender({
    node,
    connectedValuesBySchemaPath: {
      'properties.output': {
        value: 'https://example.com/generated-image.png',
        sources: [{ edgeId: 'edge-1', nodeId: 'source-image', portKey: 'imageUrl' }],
      },
    },
  })

  const spec = getNodeMediaSpec(effectiveNode)
  if (!spec) throw new Error('expected generic output connection from image source port to stay renderable')
  if (spec.kind !== 'image') throw new Error(`expected generic output connection from image source port to render as image, got ${String(spec.kind)}`)
  if (String(spec.url || '') !== 'https://example.com/generated-image.png') {
    throw new Error('expected generic output connection from image source port to map into rich media image render path')
  }
}

export function testRichMediaPanelMapsGenericOutputConnectionFromVideoSourcePort() {
  const node = {
    id: 'rich-media-panel-generic-output-video',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: 'Rich Media Panel',
    properties: {},
  } as Parameters<typeof getNodeMediaSpec>[0]

  const effectiveNode = applyConnectedValuesToNodeForRender({
    node,
    connectedValuesBySchemaPath: {
      'properties.output': {
        value: 'https://example.com/generated-video.mp4',
        sources: [{ edgeId: 'edge-2', nodeId: 'source-video', portKey: 'videoUrl' }],
      },
    },
  })

  const spec = getNodeMediaSpec(effectiveNode)
  if (!spec) throw new Error('expected generic output connection from video source port to stay renderable')
  if (spec.kind !== 'video') throw new Error(`expected generic output connection from video source port to render as video, got ${String(spec.kind)}`)
  if (String(spec.url || '') !== 'https://example.com/generated-video.mp4') {
    throw new Error('expected generic output connection from video source port to map into rich media video render path')
  }
}

export function testRichMediaPanelReusesMarkdownImageRenderingFromOutputText() {
  const node = {
    id: 'rich-media-panel-output-markdown-image',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: 'Rich Media Panel',
    properties: {
      output: '![Generated image](https://example.com/generated-image.png)',
    },
  } as Parameters<typeof getNodeMediaSpec>[0]

  const spec = getNodeMediaSpec(node)
  if (!spec) throw new Error('expected markdown image output text to render in Rich Media Panel')
  if (spec.kind !== 'image') throw new Error(`expected markdown image output text to reuse image rendering, got ${String(spec.kind)}`)
  if (String(spec.url || '') !== 'https://example.com/generated-image.png') {
    throw new Error('expected markdown image output text to resolve to the image url')
  }
}

export function testRichMediaPanelReusesMarkdownLinkIframeRenderingFromOutputText() {
  const node = {
    id: 'rich-media-panel-output-markdown-link',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: 'Rich Media Panel',
    properties: {
      output: '[Reference](https://example.com/embed)',
    },
  } as Parameters<typeof getNodeMediaSpec>[0]

  const spec = getNodeMediaSpec(node)
  if (!spec) throw new Error('expected markdown link output text to render in Rich Media Panel')
  if (spec.kind !== 'iframe') throw new Error(`expected markdown link output text to reuse iframe rendering, got ${String(spec.kind)}`)
  if (String(spec.url || '') !== 'https://example.com/embed') {
    throw new Error('expected markdown link output text to resolve to the iframe url')
  }
}

export async function testRichMediaPanelChartOutputSrcDocReusesSharedPreviewSpec() {
  const marker = 'data-inline-output="1"'
  const nestedFrameStyle = 'body{margin:0;background:#f8fafc;color:#111827}.wrap{border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 4px 16px rgba(15,23,42,.12);padding:18px}'
  const markdown = [
    '---',
    'flow:',
    '  computed: true',
    '  nodes:',
    '    - id: inline_output_producer',
    '      type: CalculatorWidget',
    '      label: "Inline Output Producer"',
    '      handles:',
    '        source: [outputSrcDoc]',
    '      "flow:widgetFormId": "fm:inline_output_producer"',
    '      "flow:portTypes":',
    '        out:',
    '          outputSrcDoc: rich_media_inline_html',
    '      compute: |',
    '        inputs => ({',
    `          outputSrcDoc: '<!doctype html><html><head><style>${nestedFrameStyle}</style></head><body><main class="wrap" ${marker}><svg viewBox="0 0 120 60"><rect width="100" height="40"></rect></svg></main></body></html>'`,
    '        })',
    '    - id: inline_output_panel',
    '      type: RichMediaPanel',
    '      label: "Reusable Inline Output Surface"',
    '      handles:',
    '        target: [outputSrcDoc]',
    '        source: [outputSrcDoc]',
    '      "flow:widgetFormId": "fm:inline_output_panel"',
    '      "flow:portTypes":',
    '        in:',
    '          outputSrcDoc: rich_media_inline_html',
    '        out:',
    '          outputSrcDoc: rich_media_inline_html',
    '      richMediaActiveTab: "text"',
    '      output: "Helper copy should not cover inline HTML."',
    `      outputSrcDoc: "<!doctype html><html><head><style>${nestedFrameStyle}</style></head><body><main class='wrap'><p>Inline output is pending.</p></main></body></html>"`,
    '  edges:',
    '    - id: e-inline-output',
    '      source: inline_output_producer',
    '      sourceHandle: outputSrcDoc',
    '      target: inline_output_panel',
    '      targetHandle: outputSrcDoc',
    '      label: "outputSrcDoc"',
    '      type: rich_media_inline_html',
    '---',
    '',
    '# Generic Rich Media Output Fixture',
  ].join('\n')

  await assertOutputSrcDocPanelsReuseSharedPreview({
    fileName: 'generic-rich-media-output-flow.md',
    markdown,
    expectedSrcDocMarker: marker,
  })
}

export function testRichMediaPanelInlineSrcDocUsesUnframedSharedSurface() {
  const root = process.cwd()
  const componentText = readRichMediaPanelSourceBundle(root)
  const ssotText = readFileSync(resolve(root, 'src', 'lib', 'render', 'richMediaSsot.ts'), 'utf8')
  const mediaSpecText = readFileSync(resolve(root, 'src', 'lib', 'canvas', 'graph-elements', 'mediaSpec.ts'), 'utf8')
  const srcDocText = readFileSync(resolve(root, 'src', 'lib', 'render', 'richMediaPanelSrcDoc.ts'), 'utf8')
  const richMediaPreviewHookText = readFileSync(resolve(root, 'src', 'components', 'StoryboardWidget', 'useRichMediaWidgetPreview.ts'), 'utf8')
  const widgetOverlaySharedPath = resolve(root, 'src', 'components', 'StoryboardWidget', 'flowWidgetOverlayShared.ts')
  const widgetOverlaySharedText = readFileSync(widgetOverlaySharedPath, 'utf8')
  const widgetOverlayEntrypointText = readFileSync(resolve(root, 'src', 'components', 'StoryboardWidget', 'FlowWidgetOverlay.tsx'), 'utf8')
  const storyboardWidgetCanvasSharedText = readFileSync(resolve(root, 'src', 'components', 'StoryboardWidgetCanvas', 'storyboardWidgetCanvasShared.tsx'), 'utf8')
  const widgetPanelText = readFileSync(resolve(root, 'src', 'components', 'StoryboardWidget', 'WidgetEditorPanel.tsx'), 'utf8')
  const widgetViewText = readFileSync(resolve(root, 'src', 'components', 'StoryboardWidget', 'WidgetEditorView.tsx'), 'utf8')
  const widgetFormText = ['WidgetEditorForm.tsx', 'WidgetEditorFormContent.tsx'].map(file => readFileSync(resolve(root, 'src', 'components', 'StoryboardWidget', file), 'utf8')).join('\n')
  const cardMediaPreviewText = readFileSync(resolve(root, 'src', 'lib', 'cards', 'CardMediaPreview.tsx'), 'utf8')
  const mediaSurfaceSelectionText = readFileSync(resolve(root, 'src', 'lib', 'cards', 'mediaPreviewSurfaceSelection.ts'), 'utf8')
  const zoomPanViewportText = readFileSync(resolve(root, 'src', 'features', 'panels', 'views', 'preview-panel', 'ui', 'ZoomPanViewport.tsx'), 'utf8')
  const widgetInnerPanelScrollText = readFileSync(resolve(root, 'src', 'lib', 'canvas', 'widgetInnerPanelScrolling.ts'), 'utf8')
  const richMediaPanelDefaultsText = readFileSync(resolve(root, 'src', 'lib', 'render', 'richMediaPanelDefaults.ts'), 'utf8')
  const flowCanvasMediaOverlaysText = readFileSync(resolve(root, 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx'), 'utf8')
  const overlaySizingText = readFileSync(resolve(root, 'src', 'lib', 'render', 'overlaySizing2d.ts'), 'utf8')

  for (const [label, text] of [['component', componentText], ['ssot', ssotText], ['mediaSpec', mediaSpecText]] as const) {
    if (!text.includes('normalizeRichMediaPanelInlineSrcDoc')) {
      throw new Error(`expected ${label} to reuse the shared Rich Media Panel inline srcdoc normalizer`)
    }
  }
  if (!componentText.includes('const inlineSrcDocSurfaceStyle = React.useMemo')) {
    throw new Error('expected RichMediaPanel inline srcdoc iframe surface style to be centralized')
  }
  if (
    !componentText.includes('const inlineSrcDocEmbeddedSurfaceStyle = React.useMemo')
    || !componentText.includes('const inlineSrcDocPanelContentHeightCss = inlineSrcDocPanelContentHeight > 0')
    || !componentText.includes('data-kg-rich-media-embedded-preview="1"')
    || !componentText.includes('CARD_MARKDOWN_PREVIEW_MEDIA_SHELL_CLASS_NAME')
    || componentText.includes('CARD_MARKDOWN_PREVIEW_CODE_SURFACE_INSET_CSS_VALUE') || componentText.includes('CARD_MARKDOWN_PREVIEW_EMBEDDED_MEDIA_SURFACE_CLASS_NAME')
    || !componentText.includes("boxSizing: 'border-box'")
  ) {
    throw new Error('expected RichMediaPanel inline srcdoc surfaces to reuse the bounded Card media shell without legacy code-surface padding')
  }
  if (!componentText.includes('borderRadius: 0')) {
    throw new Error('expected inline srcdoc Rich Media Panel iframe to avoid a nested rounded frame')
  }
  if (!componentText.includes('iframeSrcDoc={model.normalizedInlineSrcDoc}')) {
    throw new Error('expected RichMediaPanel iframe srcdoc rendering to consume normalized shared srcdoc')
  }
  if (!srcDocText.includes('buildRichMediaPanelSrcDocTimelineTransportScript')
    || !srcDocText.includes('window.__AGENTICGRAPH_TIMELINE_TRANSPORT_NATIVE_LOOP__')
    || !srcDocText.includes('var raf=0,pending=null,retry=0')
    || !srcDocText.includes('requestAnimationFrame(applyPending)')
    || !srcDocText.includes('RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_MESSAGE')) {
    throw new Error('expected Rich Media Panel srcdoc normalization to inject the shared timeline transport bridge for stored render artifacts')
  }
  if (!componentText.includes('&& !mediaState.effectiveInlineSrcDoc')) {
    throw new Error('expected RichMediaPanel inline srcdoc previews to bypass the empty text editor placeholder')
  }
  if (!widgetFormText.includes('resolveMediaPreviewSurfaceCardProps')
    || !widgetFormText.includes('const compactMediaPreviewSelectionProps = React.useMemo')
    || !widgetFormText.includes('const compactMediaPreviewCardProps = React.useMemo')
    || !widgetFormText.includes('resolveMediaPreviewSurfaceSelectionProps({')
    || !widgetFormText.includes('resolveMediaPreviewSurfaceCardProps({')
    || !widgetFormText.includes('enabled: !!compactPreviewView && compactPreviewView.kind !== \'text\'')
    || !widgetFormText.includes('{...compactMediaPreviewSelectionProps}')
    || !widgetFormText.includes('{...compactMediaPreviewCardProps}')
    || !widgetFormText.includes("setSelectionSource('editor')")
    || !widgetFormText.includes('selectNode(id)')) {
    throw new Error('expected compact Rich Media widget previews to reuse the shared selectable media preview surface helper')
  }
  if (!componentText.includes('resolveMediaPreviewSurfaceCardProps')
    || !componentText.includes('const directMediaPreviewSelectionProps = React.useMemo')
    || !componentText.includes('const directMediaPreviewCardProps = React.useMemo')
    || !componentText.includes('resolveMediaPreviewSurfaceSelectionProps({')
    || !componentText.includes('resolveMediaPreviewSurfaceCardProps({')
    || !componentText.includes('frameSelectionProps={model.directMediaPreviewSelectionProps}')
    || !componentText.includes('iframeSelectableSurfaceDataAttr')
    || !componentText.includes('{...model.directMediaPreviewCardProps}')
    || !zoomPanViewportText.includes('frameSelectionProps?: MediaPreviewSurfaceSelectionProps')
    || !zoomPanViewportText.includes('{...frameSelectionProps}')
    || !zoomPanViewportText.includes("frameSelectionProps?.[MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR]")
    || !zoomPanViewportText.includes('data-kg-rich-media-selectable-surface={selectableSurfaceDataAttr}')) {
    throw new Error('expected expanded Rich Media pan/zoom preview frames to reuse the shared selectable media preview surface helper')
  }
  if (!cardMediaPreviewText.includes('mediaSelectableSurfaceDataAttr?: boolean')
    || !cardMediaPreviewText.includes('resolveMediaPreviewSelectableDataAttr(mediaSelectableSurfaceDataAttr)')
    || !cardMediaPreviewText.includes('data-kg-rich-media-selectable-surface={selectableSurfaceDataAttr}')
    || !mediaSurfaceSelectionText.includes('export function resolveMediaPreviewSurfaceSelectionProps')
    || !mediaSurfaceSelectionText.includes('const claimSurfaceEvent = (event: MediaPreviewSurfaceSelectionEvent) => {')
    || !mediaSurfaceSelectionText.includes('claimPointerDown?: boolean') || !mediaSurfaceSelectionText.includes('const claimPointerDown = args.claimPointerDown !== false')
    || !mediaSurfaceSelectionText.includes('selectableSurface?: boolean') || !mediaSurfaceSelectionText.includes('const selectableSurface = args.selectableSurface !== false')
    || !mediaSurfaceSelectionText.includes('const claimPointerSurfaceEvent = (event: MediaPreviewSurfaceSelectionEvent) => {') || !mediaSurfaceSelectionText.includes('onPointerDownCapture: claimPointerSurfaceEvent') || !mediaSurfaceSelectionText.includes('onMouseDownCapture: claimPointerSurfaceEvent')
    || !mediaSurfaceSelectionText.includes('onClickCapture: claimSurfaceClick')
    || !mediaSurfaceSelectionText.includes('event.preventDefault()')
    || !mediaSurfaceSelectionText.includes('event.stopPropagation()')
    || !mediaSurfaceSelectionText.includes('export function resolveMediaPreviewSurfaceCardProps')
    || !mediaSurfaceSelectionText.includes('mediaSelectableSurfaceDataAttr: args.enabled && args.selectableSurface !== false')
    || !mediaSurfaceSelectionText.includes('interactive: args.enabled ? false : args.interactive === true')
    || !mediaSurfaceSelectionText.includes('export function resolveMediaPreviewSelectableDataAttr')
    || !mediaSurfaceSelectionText.includes("export const MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR = 'data-kg-rich-media-selectable-surface'")) {
    throw new Error('expected shared CardMediaPreview media elements to carry the Rich Media selectable marker when requested')
  }
  if (!widgetViewText.includes('[&_input:disabled]:pointer-events-none')
    || !widgetViewText.includes('[&_select:disabled]:pointer-events-none')
    || !widgetViewText.includes('[&_textarea:disabled]:pointer-events-none')
    || !widgetViewText.includes('onMouseDownCapture={handleRootPointerCapture}')
    || !widgetViewText.includes('onPointerDownCapture={handleRootPointerCapture}')) {
    throw new Error('expected inactive Storyboard Widget fields to pass pointer targeting to the widget root selection handler')
  }
  if (!componentText.includes("frameMode?: 'panel' | 'surface'")) {
    throw new Error('expected RichMediaPanel to expose a shared unframed surface mode')
  }
  if (!componentText.includes("resizeHandlePlacement?: 'root' | 'external'")) {
    throw new Error('expected RichMediaPanel to expose shared resize-handle placement for embedded panel surfaces')
  }
  if (!componentText.includes("scrollOwner?: 'media' | 'panel'")) {
    throw new Error('expected RichMediaPanel to expose shared scroll-owner placement for embedded panel surfaces')
  }
  if (!componentText.includes('RICH_MEDIA_PANEL_SRCDOC_SIZE_MESSAGE') || !componentText.includes('event.source !== frame.contentWindow')) {
    throw new Error('expected RichMediaPanel to consume shared srcdoc size messages without enabling same-origin iframe access')
  }
  if (!componentText.includes('onInlineContentSize?: (size: { width: number; height: number }) => void')) {
    throw new Error('expected RichMediaPanel to expose shared inline srcdoc content-size reporting')
  }
  if (!componentText.includes('onInlineContentSize?.(nextSize)')) {
    throw new Error('expected RichMediaPanel srcdoc size messages to report content size back to the shared panel sizing hook')
  }
  if (!componentText.includes("pointerEvents: 'none'") || !componentText.includes("touchAction: 'pan-y'")) {
    throw new Error('expected panel-owned inline srcdoc surfaces to let the outer panel chrome own vertical scrolling')
  }
  if (!componentText.includes('export function RichMediaPanelResizeHandle') || !componentText.includes('export function beginRichMediaPanelResizeDrag')) {
    throw new Error('expected RichMediaPanel resize handle UI and drag behavior to stay in the shared panel owner')
  }
  for (const snippet of [
    'data-kg-rich-media-resize-handle="1"',
    'data-kg-canvas-wheel-ignore="true"',
    'data-kg-overlay-pan-ignore="true"',
    'data-kg-canvas-overlay-control="true"',
    "targetEl?.closest('[data-kg-rich-media-resize-handle=\"1\"]')",
  ]) {
    if (!componentText.includes(snippet)) {
      throw new Error(`expected shared Rich Media Panel resize handle to be protected from canvas pan forwarding: ${snippet}`)
    }
  }
  if (!componentText.includes('data-kg-rich-media-resize-handle-shape="corner"')) {
    throw new Error('expected shared Rich Media Panel resize handle to render as a bottom-right corner bracket')
  }
  if (!componentText.includes("borderRight: '1px solid var(--kg-text-tertiary") || !componentText.includes("borderBottom: '1px solid var(--kg-text-tertiary")) {
    throw new Error('expected shared Rich Media Panel resize handle to use a subtle inverse L-like corner shape')
  }
  if (
    componentText.includes('borderRadius: 999')
    || componentText.includes("border: '2px solid var(--kg-canvas-accent)'")
    || componentText.includes("borderRight: '2px solid var(--kg-text-secondary")
  ) {
    throw new Error('expected shared Rich Media Panel resize handle not to render as a heavy blue or high-contrast marker')
  }
  if (!ssotText.includes('export function coerceRichMediaPanelChromeSizePx')) {
    throw new Error('expected panel-owned rich media scroll sizing to reuse a shared chrome-size coercion helper')
  }
  if (!richMediaPreviewHookText.includes('RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE') || !richMediaPreviewHookText.includes('coerceRichMediaPanelChromeSizePx')) {
    throw new Error('expected Rich Media Panel widget preview sizing to reuse shared defaults and panel chrome sizing')
  }
  if (!richMediaPreviewHookText.includes('handleRichMediaContentSize')) {
    throw new Error('expected Rich Media Panel widget preview sizing to auto-fit measured inline rich media content')
  }
  if (
    !richMediaPanelDefaultsText.includes("import { WIDGET_BASE_SIZE } from '@/lib/canvas/overlayWidgetZoom'")
    || !richMediaPanelDefaultsText.includes('RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX = WIDGET_BASE_SIZE.width')
    || !widgetOverlaySharedText.includes("from '@/lib/render/richMediaPanelDefaults'")
  ) {
    throw new Error('expected Rich Media Panel default width to be owned by the shared default widget width helper')
  }
  if (
    !flowCanvasMediaOverlaysText.includes("from '@/lib/render/richMediaPanelDefaults'")
    || !flowCanvasMediaOverlaysText.includes('RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width')
    || !flowCanvasMediaOverlaysText.includes('RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height')
    || flowCanvasMediaOverlaysText.includes('stableMediaLayoutItems.length, 360, 240')
    || !overlaySizingText.includes('RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX')
    || overlaySizingText.includes('widthMaxPx: 360')
  ) {
    throw new Error('expected 2D Rich Media Panel default sizing to reuse the shared widget-width default instead of local literals')
  }
  if (
    !widgetOverlaySharedText.includes('handleWidgetInnerPanelWheelCapture')
    || !widgetInnerPanelScrollText.includes('consumeScrollablePanelWheelEvent')
    || !widgetInnerPanelScrollText.includes('shouldKeepWidgetInnerPanelWheel')
    || !widgetInnerPanelScrollText.includes('WIDGET_INNER_PANEL_SCROLL_SURFACE_SELECTOR')
    || !widgetPanelText.includes('handleWidgetInnerPanelWheelCapture')
    || !widgetFormText.includes('handleWidgetInnerPanelWheelCapture')
  ) {
    throw new Error('expected FloatingEditor Rich Media Panel scrolling to reuse the shared widget inner-panel wheel consumer')
  }
  if (
    !widgetOverlayEntrypointText.includes('flowWidgetOverlayShared')
    || !storyboardWidgetCanvasSharedText.includes("import FlowWidgetOverlay from '@/components/StoryboardWidget/FlowWidgetOverlay'")
    || storyboardWidgetCanvasSharedText.includes("from '@/components/StoryboardWidget/WidgetEditor'")
  ) {
    throw new Error('expected Storyboard Widget runtime to use the canonical widget overlay owner without legacy widget duplicates')
  }
  if (!componentText.includes("pointerEvents: 'auto'") || componentText.includes("pointerEvents: allowPanelContentPointerEvents ? 'auto' : 'none'")) {
    throw new Error('expected RichMediaPanel embedded markdown scroll surfaces to stay pointer-targetable instead of falling through to canvas zoom')
  }
  if (!componentText.includes("'data-kg-rich-media-frame-mode': useSurfaceFrame ? 'surface' : undefined")) {
    throw new Error('expected RichMediaPanel unframed surface mode to be observable on the shared root')
  }
  if (!widgetPanelText.includes('frameMode="surface"') || !widgetFormText.includes('frameMode="surface"')) {
    throw new Error('expected FloatingEditor Rich Media Panel bodies to reuse the shared unframed surface mode')
  }
  if (!widgetPanelText.includes('storyboardWidgetInteractionMode={true}') || !widgetFormText.includes('storyboardWidgetInteractionMode={true}')) {
    throw new Error('expected FloatingEditor Rich Media Panel bodies to enter Storyboard Widget layout mode from the first render')
  }
  if (!widgetPanelText.includes('storyboardWidgetFrontmatterDocumentMode={isFrontmatterFlow}') || !widgetFormText.includes('storyboardWidgetFrontmatterDocumentMode={isFrontmatterFlow}')) {
    throw new Error('expected FloatingEditor Rich Media Panel bodies to receive frontmatter document mode from the Storyboard Widget owner instead of store hydration')
  }
  if (!widgetPanelText.includes('resizeHandlePlacement="external"') || !widgetPanelText.includes('<RichMediaPanelResizeHandle placement="panel"')) {
    throw new Error('expected FloatingEditor Chart Panel to place the shared resize handle on the outer panel bottom-right')
  }
  if (!widgetPanelText.includes('data-kg-rich-media-scroll-owner="panel"') || !widgetPanelText.includes('scrollOwner="panel"')) {
    throw new Error('expected FloatingEditor Chart Panel to place scrolling on the panel chrome instead of the embedded media surface')
  }
  if (!widgetPanelText.includes('data-kg-media-scroll-surface="1"') || !widgetPanelText.includes('overflow-y-auto overflow-x-hidden')) {
    throw new Error('expected FloatingEditor Chart Panel scroll chrome to allow vertical scrolling only')
  }
  if (!widgetPanelText.includes("pointerEvents: 'auto'")) {
    throw new Error('expected FloatingEditor Chart Panel scroll chrome to stay pointer-targetable while the widget shell passes canvas input through')
  }
  if (!widgetPanelText.includes('RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE') || widgetPanelText.includes('{ width: 280, height: 180 }')) {
    throw new Error('expected FloatingEditor Chart Panel fallback sizing to reuse the shared Rich Media Panel default size')
  }
  if (!widgetPanelText.includes('onInlineContentSize={handleRichMediaContentSize}')) {
    throw new Error('expected FloatingEditor Chart Panel to auto-fit measured inline rich media content at the panel chrome')
  }
  if (!widgetFormText.includes('data-kg-rich-media-scroll-owner="panel"') || !widgetFormText.includes('scrollOwner="panel"')) {
    throw new Error('expected Rich Media Panel form preview to reuse the shared panel-owned scroll surface')
  }
  if (!widgetFormText.includes('data-kg-media-scroll-surface="1"') || !widgetFormText.includes('overflow-y-auto overflow-x-hidden')) {
    throw new Error('expected Rich Media Panel form preview scroll chrome to allow vertical scrolling only')
  }
  if (!widgetFormText.includes("pointerEvents: 'auto'")) {
    throw new Error('expected Rich Media Panel form preview scroll chrome to stay pointer-targetable while the widget shell passes canvas input through')
  }
  if (!widgetFormText.includes('RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE') || widgetFormText.includes('{ width: 280, height: 180 }')) {
    throw new Error('expected Rich Media Panel form preview fallback sizing to reuse the shared default size')
  }
  if (!widgetFormText.includes('onInlineContentSize={handleRichMediaContentSize}')) {
    throw new Error('expected Rich Media Panel form preview to auto-fit measured inline rich media content at the panel chrome')
  }
  if (!srcDocText.includes('body>:is(main,section,article):first-child') || !srcDocText.includes('[data-kg-rich-media-markdown-srcdoc="1"] img{display:block;width:100%;height:auto;object-fit:contain}')) {
    throw new Error('expected shared Rich Media Panel srcdoc reset to flatten semantic frames and scale Markdown images with the responsive viewport')
  }
  if (srcDocText.includes('body>:is(main,section,article,div)')) {
    throw new Error('expected shared Rich Media Panel srcdoc reset to avoid generic HTML division element selectors')
  }
  if (!srcDocText.includes(RICH_MEDIA_PANEL_SRCDOC_SIZE_MESSAGE) || !srcDocText.includes(RICH_MEDIA_PANEL_SRCDOC_RESIZE_SCRIPT_ID)) {
    throw new Error('expected shared Rich Media Panel srcdoc reset to include a sandbox-safe content-size bridge')
  }
  if (!srcDocText.includes('existingResetStylePattern')) {
    throw new Error('expected shared Rich Media Panel srcdoc normalizer to replace its own stale reset style')
  }
}

export function testRichMediaPanelInlineSrcDocRefreshesSharedResetStyle() {
  const staleNormalizedSrcDoc = [
    '<!doctype html>',
    `<html ${RICH_MEDIA_PANEL_SRCDOC_ATTR}="1">`,
    '<head>',
    `<style id="${RICH_MEDIA_PANEL_SRCDOC_STYLE_ID}">body>.wrap:first-child{border:0!important}</style>`,
    '<style>.chart-card{border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 4px 16px rgba(15,23,42,.12);padding:18px}</style>',
    '</head>',
    '<body><section><main class="chart-card"><h1>Generated output</h1></main></section></body>',
    '</html>',
  ].join('')

  const normalized = normalizeRichMediaPanelInlineSrcDoc({
    srcDoc: staleNormalizedSrcDoc,
    title: 'Generated Rich Media Output',
  })
  if (!normalized.includes(`${RICH_MEDIA_PANEL_SRCDOC_ATTR}="1"`)) {
    throw new Error('expected stale normalized Rich Media Panel srcdoc to keep the shared marker')
  }
  const resetStyleCount = normalized.split(`id="${RICH_MEDIA_PANEL_SRCDOC_STYLE_ID}"`).length - 1
  if (resetStyleCount !== 1) {
    throw new Error(`expected Rich Media Panel srcdoc normalization to keep exactly one shared reset style, got ${resetStyleCount}`)
  }
  const resizeScriptCount = normalized.split(`id="${RICH_MEDIA_PANEL_SRCDOC_RESIZE_SCRIPT_ID}"`).length - 1
  if (resizeScriptCount !== 1) {
    throw new Error(`expected Rich Media Panel srcdoc normalization to keep exactly one shared resize script, got ${resizeScriptCount}`)
  }
  const timelineScriptCount = normalized.split(`id="${RICH_MEDIA_PANEL_SRCDOC_TIMELINE_SCRIPT_ID}"`).length - 1
  if (timelineScriptCount !== 1) {
    throw new Error(`expected Rich Media Panel srcdoc normalization to keep exactly one shared timeline transport script, got ${timelineScriptCount}`)
  }
  const themeScriptCount = normalized.split(`id="${RICH_MEDIA_PANEL_SRCDOC_THEME_SCRIPT_ID}"`).length - 1; if (themeScriptCount !== 1 || !normalized.includes(RICH_MEDIA_PANEL_SRCDOC_THEME_MESSAGE)) throw new Error(`expected Rich Media Panel srcdoc normalization to keep exactly one shared theme bridge, got ${themeScriptCount}`)
  if (!normalized.includes(RICH_MEDIA_PANEL_SRCDOC_SIZE_MESSAGE)) {
    throw new Error('expected Rich Media Panel srcdoc resize script to publish the shared size message type')
  }
  const chartStyleIndex = normalized.indexOf('.chart-card{')
  const resetStyleIndex = normalized.indexOf(`id="${RICH_MEDIA_PANEL_SRCDOC_STYLE_ID}"`)
  if (!(chartStyleIndex >= 0 && resetStyleIndex > chartStyleIndex)) {
    throw new Error('expected Rich Media Panel srcdoc reset to be injected after chart-authored styles so the shared panel frame wins')
  }
  if (!normalized.includes('body>:is(main,section,article):first-child')) {
    throw new Error('expected refreshed Rich Media Panel srcdoc reset to flatten top-level semantic frame wrappers')
  }
  if (!normalized.includes('body>:is(main,section,article):first-child>:is(main,section,article):first-child')) {
    throw new Error('expected refreshed Rich Media Panel srcdoc reset to flatten nested semantic frame wrappers')
  }
  if (/<div\b|<\/div>/i.test(normalized)) {
    throw new Error(`expected Rich Media Panel srcdoc normalization to replace generic HTML division element containers, got: ${normalized}`)
  }
  if (normalized.includes('body>:is(main,section,article,div)')) {
    throw new Error('expected Rich Media Panel srcdoc reset to avoid generic HTML division element selectors')
  }
  for (const resetRule of [
    'border:0!important',
    'border-radius:0!important',
    'box-shadow:none!important',
    'background:transparent!important',
    'padding:0!important',
  ]) {
    if (!normalized.includes(resetRule)) {
      throw new Error(`expected Rich Media Panel srcdoc reset to remove nested chart frame styling: ${resetRule}`)
    }
  }
  if (normalized.includes('body>.wrap:first-child{border:0!important}')) {
    throw new Error('expected Rich Media Panel srcdoc normalization to replace stale shared reset content')
  }
}

export async function testRichMediaPanelRuntimeInputOutputSrcDocReusesSharedPreviewSpec() {
  const inputPath = readRuntimeRichMediaValidationPath()
  if (!inputPath) return
  const markdown = readFileSync(inputPath, 'utf8')
  if (!markdown.trim()) {
    return
  }
  await assertOutputSrcDocPanelsReuseSharedPreview({
    fileName: basename(inputPath),
    markdown,
  })
}

function runWidgetToRichMediaPanelPipeline(args: {
  sourceNodeTypeId: string
  sourceFormId: string
  sourceOutputPortKey: string
  sourceOutputValue: unknown
}): ReturnType<typeof getNodeMediaSpec> {
  const seeded = ensureDefaultWidgetRegistryEntries([], '2026-04-22T00:00:00.000Z').entries
  const graphData = {
    type: 'GraphData',
    nodes: [
      {
        id: 'source-widget',
        type: args.sourceNodeTypeId,
        label: 'Source Widget',
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: args.sourceFormId,
          'flow:portTypes': {
            in: {},
            out: {
              [args.sourceOutputPortKey]:
                args.sourceOutputPortKey === 'text_out'
                  ? 'TEXT'
                  : args.sourceOutputPortKey === 'imageUrl'
                    ? 'IMAGE_URL'
                    : 'VIDEO_URL',
            },
          },
          ...(args.sourceOutputPortKey === 'text_out'
            ? { output: args.sourceOutputValue }
            : args.sourceOutputPortKey === 'imageUrl'
              ? { imageUrl: args.sourceOutputValue }
              : { videoUrl: args.sourceOutputValue }),
        },
      },
      {
        id: 'rich-media-panel',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        label: 'Rich Media Panel',
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: 'richMediaPanel',
          'flow:portTypes': {
            in: {
              output: 'TEXT',
              imageUrl: 'IMAGE_URL',
              videoUrl: 'VIDEO_URL',
              outputSrcDoc: 'HTML',
            },
            out: {
              output: 'TEXT',
              imageUrl: 'IMAGE_URL',
              videoUrl: 'VIDEO_URL',
              outputSrcDoc: 'HTML',
            },
          },
        },
      },
    ],
    edges: [],
    metadata: {},
  } as any

  const edgeResult = finalizeEdgeAuthoring({
    mode: 'create',
    data: graphData,
    schema: defaultSchema,
    label: 'linksTo',
    selectedEdgeId: null,
    from: { nodeId: 'source-widget', portKey: null },
    to: { nodeId: 'rich-media-panel', portKey: null },
  })
  if (edgeResult.kind !== 'create') throw new Error(`expected widget pipeline edge creation, got ${edgeResult.kind}`)

  const edgeProps = (edgeResult.edge.properties || {}) as Record<string, unknown>
  if (String(edgeProps['flow:sourcePortKey'] || '') !== args.sourceOutputPortKey) {
    throw new Error(`expected default source port ${args.sourceOutputPortKey}, got ${String(edgeProps['flow:sourcePortKey'] || '')}`)
  }
  const expectedTargetPortKey =
    args.sourceOutputPortKey === 'text_out'
      ? 'output'
      : args.sourceOutputPortKey === 'imageUrl'
        ? 'imageUrl'
        : 'videoUrl'
  if (String(edgeProps['flow:targetPortKey'] || '') !== expectedTargetPortKey) {
    throw new Error(`expected default rich media target port ${expectedTargetPortKey}, got ${String(edgeProps['flow:targetPortKey'] || '')}`)
  }

  const connectedByNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData: {
      ...graphData,
      edges: [edgeResult.edge],
    } as any,
    registry: seeded,
  })
  const panelConnectedValues = connectedByNodeId.get('rich-media-panel')
  if (!panelConnectedValues) throw new Error('expected rich media panel connected values')

  const panelNode = (graphData.nodes as any[]).find(node => String(node.id || '') === 'rich-media-panel')
  const effectivePanelNode = applyConnectedValuesToNodeForRender({
    node: panelNode,
    connectedValuesBySchemaPath: panelConnectedValues,
  })
  return getNodeMediaSpec(effectivePanelNode)
}

export function testOpenAiTextWidgetPipelineRendersInRichMediaPanel() {
  const spec = runWidgetToRichMediaPanelPipeline({
    sourceNodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    sourceFormId: 'textGeneration.openai',
    sourceOutputPortKey: 'text_out',
    sourceOutputValue: '## OpenAI output',
  })
  if (!spec) throw new Error('expected OpenAI text widget pipeline to render in Rich Media Panel')
  if (spec.kind !== 'iframe') throw new Error(`expected OpenAI text widget pipeline to render as iframe text, got ${String(spec.kind)}`)
  if (!String(spec.srcDoc || '').includes('OpenAI output')) {
    throw new Error('expected OpenAI text widget pipeline to expose generated text in Rich Media Panel')
  }
}

export function testTextWidgetOutputDoesNotCompeteWithRichMediaPanelOverlay() {
  const graphData = {
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      {
        id: 'w-openai-text',
        type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
        label: 'OpenAI Text Widget',
        properties: {
          output: '## OpenAI output',
          outputSrcDoc: '<html><body>OpenAI output</body></html>',
          'flow:widgetFormId': 'textGeneration.openai',
        },
      },
      {
        id: 'p-rich-media',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        label: 'Rich Media Panel',
        properties: {
          'flow:widgetFormId': 'richMediaPanel',
        },
      },
    ],
    edges: [
      {
        id: 'e-1',
        source: 'w-openai-text',
        target: 'p-rich-media',
        properties: {
          'flow:sourcePortKey': 'text_out',
          'flow:targetPortKey': 'output',
        },
      },
    ],
    metadata: {},
  } as any
  const seeded = ensureDefaultWidgetRegistryEntries([]).entries
  const connectedByNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData,
    registry: seeded,
  })
  const renderNodes = (graphData.nodes || []).map((node: any) => {
    const nodeId = String(node.id || '')
    return applyConnectedValuesToNodeForRender({
      node,
      connectedValuesBySchemaPath: connectedByNodeId.get(nodeId),
    })
  })
  const overlays = listMediaOverlayNodes({
    enabled: true,
    nodes: renderNodes,
    poolMax: 24,
    connectedValuesByNodeId: connectedByNodeId,
  })
  if (overlays.length !== 1) throw new Error(`expected only one overlay renderer for connected text output, got ${overlays.length}`)
  if (String(overlays[0]?.id || '') !== 'p-rich-media') {
    throw new Error(`expected Rich Media Panel to remain the single text overlay renderer, got ${String(overlays[0]?.id || '<none>')}`)
  }
}

export function testSeedreamImageWidgetPipelineRendersInRichMediaPanel() {
  const spec = runWidgetToRichMediaPanelPipeline({
    sourceNodeTypeId: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
    sourceFormId: 'imageGeneration',
    sourceOutputPortKey: 'imageUrl',
    sourceOutputValue: 'https://example.com/seedream-image.png',
  })
  if (!spec) throw new Error('expected Seedream image widget pipeline to render in Rich Media Panel')
  if (spec.kind !== 'image') throw new Error(`expected Seedream image widget pipeline to render as image, got ${String(spec.kind)}`)
  if (String(spec.url || '') !== 'https://example.com/seedream-image.png') {
    throw new Error('expected Seedream image widget pipeline to expose generated image in Rich Media Panel')
  }
}

export function testBytePlusVideoWidgetPipelineRendersInRichMediaPanel() {
  const spec = runWidgetToRichMediaPanelPipeline({
    sourceNodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
    sourceFormId: 'videoGeneration',
    sourceOutputPortKey: 'videoUrl',
    sourceOutputValue: 'https://example.com/byteplus-video.mp4',
  })
  if (!spec) throw new Error('expected BytePlus video widget pipeline to render in Rich Media Panel')
  if (spec.kind !== 'video') throw new Error(`expected BytePlus video widget pipeline to render as video, got ${String(spec.kind)}`)
  if (String(spec.url || '') !== 'https://example.com/byteplus-video.mp4') {
    throw new Error('expected BytePlus video widget pipeline to expose generated video in Rich Media Panel')
  }
}

export function testFlowCanvasUsesConnectedValuesForRichMediaPanelOverlays() {
  const overlayPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const overlayElementsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetOverlaySurfaceElements.tsx')
  const overlay = `${readFileSync(overlayPath, 'utf8')}\n${readFileSync(overlayElementsPath, 'utf8')}`
  const dataflowPath = resolve(process.cwd(), 'src', 'lib', 'storyboardWidget', 'flowDataflow.ts')
  const dataflow = readFileSync(dataflowPath, 'utf8')
  const mediaNodePath = resolve(process.cwd(), 'src', 'lib', 'render', 'effectiveMediaNode.ts')
  const mediaNode = readFileSync(mediaNodePath, 'utf8')

  const requiredOverlaySnippets = [
    'computeFlowConnectedValuesBySchemaPath',
    'overlayEditorNodeIdsKey',
    'connectedValueTargetNodeIds',
    'connectedValuesByNodeId',
    'connectedValuesBySchemaPath={connectedValuesBySchemaPath}',
  ]
  for (const snippet of requiredOverlaySnippets) {
    if (!overlay.includes(snippet)) {
      throw new Error(`expected Storyboard Widget overlay connected-values snippet: ${snippet}`)
    }
  }

  const requiredCacheSnippets = [
    'connectedValuesResultCache',
    'buildConnectedValuesTargetKey',
    'readConnectedValuesResultCache',
    'writeConnectedValuesResultCache',
  ]
  for (const snippet of requiredCacheSnippets) {
    if (!dataflow.includes(snippet)) {
      throw new Error(`expected flow dataflow cache snippet: ${snippet}`)
    }
  }

  const requiredMediaNodeSnippets = [
    'connectedRenderNodeCacheByNode',
    'readConnectedRenderNodeCache',
    'writeConnectedRenderNodeCache',
    'applyConnectedValuesToNodeForRender',
  ]
  for (const snippet of requiredMediaNodeSnippets) {
    if (!mediaNode.includes(snippet)) {
      throw new Error(`expected cached connected media render-node snippet: ${snippet}`)
    }
  }
}

export function testRichMediaPanelRegistryPortsExposeWidgetConnectionHandles() {
  const seeded = ensureDefaultWidgetRegistryEntries([], '2026-04-22T00:00:00.000Z').entries
  const handlesByNode = computeFlowHandlesByNode({
    nodes: [
      {
        id: 'rich-media-panel-ports',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: 'richMediaPanel',
        },
      },
    ],
    edges: [],
    widgetRegistry: seeded,
  })

  const handles = handlesByNode['rich-media-panel-ports']
  if (!handles) throw new Error('expected rich media panel handles to be computed')
  const inIds = new Set((handles.in || []).map(handle => handle.id))
  const outIds = new Set((handles.out || []).map(handle => handle.id))

  ;['in:output', 'in:imageUrl', 'in:videoUrl', 'in:audioUrl', 'in:outputSrcDoc'].forEach(id => {
    if (!inIds.has(id as never)) throw new Error(`expected rich media panel input handle ${id}`)
  })
  ;['out:output', 'out:imageUrl', 'out:videoUrl', 'out:audioUrl', 'out:outputSrcDoc'].forEach(id => {
    if (!outIds.has(id as never)) throw new Error(`expected rich media panel output handle ${id}`)
  })
}

export function testRichMediaPanelCanvasOverlayProxyAttrsAlignWithFlowWidget() {
  const filePath = resolve(process.cwd(), 'src', 'components', 'useRichMediaPanelSurfaceState.ts')
  const text = readFileSync(filePath, 'utf8')
  const requiredSnippets = [
    `const storyboardWidgetRichMediaOverlayRoot = storyboardWidgetInteractionMode || canvasOverlayProxyEnabled`,
    `'data-kg-rich-media-overlay': storyboardWidgetRichMediaOverlayRoot ? '1' : undefined`,
    `'data-kg-canvas-overlay-pinned': canvasOverlayProxyEnabled ? (props.canvasOverlayPinned === false ? '0' : '1') : undefined`,
    `'data-kg-canvas-wheel-ignore': canvasOverlayProxyEnabled ? 'true' : undefined`,
    `'data-kg-canvas-overlay-drag-handle': installHeaderDrag ? 'true' : undefined`,
  ]
  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) {
      throw new Error(`expected RichMediaPanel overlay proxy attr snippet: ${snippet}`)
    }
  }
  if (text.includes(`data-kg-canvas-pointer-ignore={canvasOverlayProxyEnabled ? 'true' : undefined}`)) {
    throw new Error('expected RichMediaPanel root overlay proxy attrs to avoid blanket canvas pointer-ignore and keep pointer routing owned by FlowCanvas drag/resize handlers')
  }
}

export function testRichMediaPanelPanDragUsesFlowCanvasRafLatestScheduler() {
  const flowCanvasPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas.tsx')
  const mediaOverlaysPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx')
  const flowCanvas = `${readFileSync(flowCanvasPath, 'utf8')}\n${readFileSync(mediaOverlaysPath, 'utf8')}`
  const panelPath = resolve(process.cwd(), 'src', 'components', 'RichMediaPanel.tsx')
  const panel = readFileSync(panelPath, 'utf8')
  const requiredSnippets = [
    'createRafLatestScheduler',
    'mediaOverlayPanMoveSchedulerRef',
    'mediaOverlayHeaderMoveSchedulerRef',
    'mediaOverlayPanMoveSchedulerRef.current.schedule(payload)',
    'mediaOverlayHeaderMoveSchedulerRef.current.schedule(queued)',
    'mediaOverlayPanMoveSchedulerRef.current?.cancel()',
    'mediaOverlayHeaderMoveSchedulerRef.current?.cancel()',
  ]
  for (const snippet of requiredSnippets) {
    if (!flowCanvas.includes(snippet)) {
      throw new Error(`expected FlowCanvas drag/pan RAF scheduler snippet: ${snippet}`)
    }
  }
  if (panel.includes('createRafLatestScheduler')) {
    throw new Error('expected RichMediaPanel not to own drag/pan scheduler; scheduler SSOT must stay in FlowCanvas')
  }
}

export function testFlowCanvasRichMediaOverlayDragHandlersAreRendererScoped() {
  const flowCanvasPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas.tsx')
  const mediaOverlaysPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx')
  const text = `${readFileSync(flowCanvasPath, 'utf8')}\n${readFileSync(mediaOverlaysPath, 'utf8')}`
  const requiredSnippets = [
    'storyboardWidgetOverlayInteractionMode={storyboardWidgetOverlayInteractionMode}',
    'const storyboardWidgetSurfaceRendererMode = isStoryboardWidgetSurfaceRenderer(canvas2dRenderer)', "const mediaOverlayDragInteractionMode = storyboardWidgetSurfaceRendererMode || storyboardSharedSurfaceRendererMode || canvas2dRenderer === 'flowCanvas'",
    'resolveFlowCanvasMediaOverlayInteractionPolicy',
    'const overlayInteractionEnabled = mediaOverlayInteractionPolicy.overlayPanActive',
    'const headerDragInteractionActive = mediaOverlayInteractionPolicy.headerDragActive',
    'const resizeInteractionActive = mediaOverlayInteractionPolicy.resizeActive',
    'const richMediaPanelPinAllowsMovement = isFlowWidgetHeaderDragAllowedByPin({',
    'pinnedInCanvas: richMediaPanelPinned',
    'const richMediaPanelMoveEnabled = headerDragInteractionActive && richMediaPanelPinAllowsMovement',
    'const richMediaPanelOverlayPanEnabled = overlayInteractionEnabled && richMediaPanelPinAllowsMovement',
    'onOverlayPanStart={richMediaPanelOverlayPanEnabled ?',
    'onOverlayPan={richMediaPanelOverlayPanEnabled ?',
    'onOverlayPanEnd={richMediaPanelOverlayPanEnabled ?',
    'onHeaderDragStart={richMediaPanelMoveEnabled ?',
    'onHeaderDrag={richMediaPanelMoveEnabled ?',
    'onHeaderDragEnd={richMediaPanelMoveEnabled ?',
    'const resizeHandleVisible = isSelected',
    'onResizeStart={resizeInteractionActive ?',
    'onResize={resizeInteractionActive ?',
    'onResizeEnd={resizeInteractionActive ?',
    'if (mediaOverlayDragInteractionMode) return',
  ]
  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) {
      throw new Error(`expected FlowCanvas Rich Media drag/pan renderer guard snippet: ${snippet}`)
    }
  }
  if (text.includes('isStoryboardWidgetFrontmatterInteractionMode')) {
    throw new Error('expected FlowCanvas Rich Media overlay drag runtime to remove stale frontmatter-only gate alias')
  }
}
