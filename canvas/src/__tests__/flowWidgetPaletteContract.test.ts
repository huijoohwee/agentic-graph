import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensureDefaultWidgetRegistryEntries } from '@/hooks/store/storyboardWidgetManagerSlice'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { isStoryboardFixedCardOwnedNode } from '@/components/StoryboardWidgetCanvas/storyboardCardOwnership2d'
import {
  getWidgetRegistryEntryLabel,
  isPropsPanelWidgetPaletteEntry,
} from '@/features/storyboard-widget-manager/registryTemplates'
import {
  PROBE_TREE_TYPE_ONE_LAYOUT_ID,
  PROBE_TREE_TYPE_TWO_LAYOUT_ID,
  RICH_MEDIA_DELIVERABLES_LAYOUT_ID,
  WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS,
  WIDGET_CARD_TYPE_ZERO_LAYOUT_ID,
  buildWidgetCardLayoutSeed,
} from '@/lib/storyboardWidget/widgetCardLayoutVariants'
import { listWidgetPaletteLayoutVariants } from '@/features/toolbar/widgetPaletteLayoutVariants'
import { readResolvedStoryboardWidgetDropTransform } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { useGraphStore } from '@/hooks/useGraphStore'

export function testFlowWidgetPaletteConsolidatesMediaWidgetsIntoRichMediaPanel() {
  const paletteText = readFileSync(resolve(process.cwd(), 'src/features/toolbar/WidgetPalette.tsx'), 'utf8')
  const palettePreviewText = readFileSync(resolve(process.cwd(), 'src/features/toolbar/WidgetPaletteCardLayoutPreview.tsx'), 'utf8')
  const floatingPanelText = readFileSync(resolve(process.cwd(), 'src/features/toolbar/FloatingPropsPanel.tsx'), 'utf8')
  const floatingPanelAddNodeText = readFileSync(resolve(process.cwd(), 'src/lib/toolbar/floatingPropsPanelAddNode.ts'), 'utf8')
  const canvasViewportText = readFileSync(resolve(process.cwd(), 'src/components/CanvasViewport.tsx'), 'utf8')
  const canvasRuntimeText = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas.runtime.tsx'), 'utf8')
  const widgetDropBridgeText = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetDropBridge.ts'), 'utf8')
  const widgetGraphActionsText = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetGraphActions.ts'), 'utf8')
  const widgetSurfaceText = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx'), 'utf8')
  const widgetSharedText = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared.tsx'), 'utf8')
  const bridgeOnlyText = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetDropBridge.tsx'), 'utf8')
  const storyboardWidgetConfigText = readFileSync(resolve(process.cwd(), 'src/lib/config.storyboard-widget.ts'), 'utf8')
  const copyText = readFileSync(resolve(process.cwd(), 'src/lib/config-copy/uiMeta.ts'), 'utf8')

  const previousZoomState = useGraphStore.getState().zoomState
  const previousZoomStateByKey = useGraphStore.getState().zoomStateByKey
  try {
    useGraphStore.setState({ zoomState: null, zoomStateByKey: {} })
    const unresolvedEmptyCanvasTransform = readResolvedStoryboardWidgetDropTransform({
      getLiveZoomTransform: () => null,
      zoomViewKeyRef: { current: null },
      draftGraphDataRef: { current: null },
      baseGraphData: null,
      allowNeutralFallback: false,
    })
    if (unresolvedEmptyCanvasTransform !== null) {
      throw new Error(`expected an empty canvas to defer before its fallback frame, got ${JSON.stringify(unresolvedEmptyCanvasTransform)}`)
    }
    const emptyCanvasFallbackTransform = readResolvedStoryboardWidgetDropTransform({
      getLiveZoomTransform: () => null,
      zoomViewKeyRef: { current: null },
      draftGraphDataRef: { current: null },
      baseGraphData: null,
      allowNeutralFallback: true,
    })
    if (emptyCanvasFallbackTransform?.k !== 1 || emptyCanvasFallbackTransform.x !== 0 || emptyCanvasFallbackTransform.y !== 0) {
      throw new Error(`expected empty-canvas widget drops to resolve through an identity transform, got ${JSON.stringify(emptyCanvasFallbackTransform)}`)
    }
  } finally {
    useGraphStore.setState({ zoomState: previousZoomState, zoomStateByKey: previousZoomStateByKey })
  }

  const paletteSnippets = [
    'listWidgetPaletteLayoutVariants',
    '<WidgetPaletteCardLayoutPreview variant={variant} />',
    'beginFlowWidgetPointerDragSession',
    'nodeTypeId: entry.nodeTypeId',
    'widgetTypeId: entry.widgetTypeId',
    'formId: entry.formId',
    'layoutVariantId: variant.id',
    'markFlowWidgetPointerDragNativeStart',
    'dispatchFlowWidgetPointerDragDropFromSession',
    'eventType: ev.type',
    'clearActiveFlowWidgetPointerDragSession',
    'aria-label="Widget palette"',
    '>Widgets<',
    'Drag a widget, card, or flow-editor layout into the canvas.',
  ]
  for (const snippet of paletteSnippets) {
    if (!paletteText.includes(snippet)) {
      throw new Error(`expected widget palette contract snippet: ${snippet}`)
    }
  }
  if (paletteText.includes('{entry.widgetTypeId}/{entry.formId}')) {
    throw new Error('expected widget palette entries to render card layouts instead of registry metadata descriptions')
  }
  for (const snippet of [
    'data-kg-widget-palette-layout={variant.id}',
    'data-kg-widget-palette-aspect-ratio={variant.aspectRatio}',
    "data-kg-widget-palette-layout-slot={props.output ? 'output' : 'media'}",
    "props.output ? 'Add output'",
    '<RichMediaLayout />',
    '<VideoLayout />',
    '<FlowEditorLayout />',
    '<MultiSelectCardLayout />',
  ]) {
    if (!palettePreviewText.includes(snippet)) throw new Error(`expected widget palette layout preview snippet: ${snippet}`)
  }
  if (!floatingPanelText.includes("const storyboardRendererActive = canvasRenderMode === '2d' && canvas2dRenderer === 'storyboard'")
    || !floatingPanelText.includes('const widgetDragEnabled = storyboardRendererActive && widgetPaletteEntries.length > 0')
    || !floatingPanelText.includes('Switch Canvas View Mode to 2D Renderer: Storyboard to drag widgets onto the canvas.')) {
    throw new Error('expected floating props panel widget drag to be available only on the 2D Storyboard renderer with explicit guidance elsewhere')
  }
  if (!floatingPanelText.includes('filter(isPropsPanelWidgetPaletteEntry)')) {
    throw new Error('expected FloatingPanel Props Panel to filter palette entries through the shared neutral palette helper')
  }
  if (!floatingPanelText.includes('<WidgetPalette entries={widgetPaletteEntries} dragEnabled={widgetDragEnabled} />')
    || !floatingPanelText.includes('data-kg-props-panel-surface="widget-palette"')) {
    throw new Error('expected FloatingPanel Props Panel to delegate to the shared WidgetPalette as a palette-only surface')
  }
  for (const staleSnippet of [
    'CollapsibleSection',
    'title="Add"',
    'title="Node"',
    'title="Media"',
    'title="Layout"',
    'title="Edge"',
    'useFloatingPropsPanelModel',
    'FloatingPropsPanelProbeTreeButton',
    'PanelRangeInput',
    'PanelSelect',
    'PanelTextInput',
    'readPanelBooleanChoiceButtonClassName',
    'UI_COPY.propsPanel',
  ]) {
    if (floatingPanelText.includes(staleSnippet)) {
      throw new Error(`expected FloatingPanel Props Panel to omit stale section/control snippet: ${staleSnippet}`)
    }
  }
  const sharedAddNodeSnippets = [
    [floatingPanelAddNodeText, 'export function buildFloatingPropsPanelAddedNode', 'shared add-node builder'],
    [floatingPanelAddNodeText, 'export function commitFloatingPropsPanelAddedNode', 'shared add-node commit'],
    [widgetGraphActionsText, 'buildFloatingPropsPanelAddedNode({', 'storyboard widget builder reuse'],
    [widgetGraphActionsText, 'commitFloatingPropsPanelAddedNode({', 'storyboard widget commit reuse'],
    [bridgeOnlyText, 'buildFloatingPropsPanelAddedNode({', 'bridge-only widget builder reuse'],
    [bridgeOnlyText, 'commitFloatingPropsPanelAddedNode({', 'bridge-only widget commit reuse'],
  ] as const
  for (const [text, snippet, label] of sharedAddNodeSnippets) {
    if (!text.includes(snippet)) {
      throw new Error(`expected ${label}: ${snippet}`)
    }
  }
  if (!canvasViewportText.includes('const bridgeOnlyWidgetDropActive = !documentSwitchOwnsViewport')
    || !canvasViewportText.includes("active2dSurface !== 'storyboard'")
    || !canvasViewportText.includes('<StoryboardWidgetDropBridgeLazy active={false} widgetDropCaptureEnabled />')) {
    throw new Error('expected normal 2D canvas surfaces to mount the lightweight widget drop bridge used by media drops')
  }
  const defaultRegistryEntries = ensureDefaultWidgetRegistryEntries([], '2026-07-09T00:00:00.000Z').entries
  const seededPalette = defaultRegistryEntries
    .filter(isPropsPanelWidgetPaletteEntry)
  const registryLabels = seededPalette.map(entry => getWidgetRegistryEntryLabel(entry))
  const layoutVariants = listWidgetPaletteLayoutVariants(seededPalette, '16:9')
  const layoutLabels = layoutVariants.map(variant => variant.label)
  if (layoutLabels.join('|') !== 'Widget Card Type 0|Probe-Tree Type 1|Probe-Tree Type 2|Deliverables Widget Card|Rich Media Panel') {
    throw new Error(`expected Image/Video creation to consolidate into Rich Media Panel, got ${layoutLabels.join(', ')}`)
  }
  const unfilteredLayoutLabels = listWidgetPaletteLayoutVariants(defaultRegistryEntries, '16:9')
    .map(variant => variant.label)
  if (unfilteredLayoutLabels.join('|') !== layoutLabels.join('|')) {
    throw new Error(`expected the shared layout mapper to reject raw Image/Video duplicates, got ${unfilteredLayoutLabels.join(', ')}`)
  }
  if (layoutVariants[0]?.id !== WIDGET_CARD_TYPE_ZERO_LAYOUT_ID
    || layoutVariants[1]?.id !== PROBE_TREE_TYPE_ONE_LAYOUT_ID
    || layoutVariants[2]?.id !== PROBE_TREE_TYPE_TWO_LAYOUT_ID
    || layoutVariants[3]?.id !== RICH_MEDIA_DELIVERABLES_LAYOUT_ID) {
    throw new Error(`expected stable Type 0/Type 1/Type 2/Deliverables layout identities, got ${layoutVariants.map(variant => variant.id).join(', ')}`)
  }
  const sharedCardLayouts = layoutVariants.slice(0, WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS.length)
    .map(variant => ({ id: variant.id, label: variant.label, layoutKind: variant.layoutKind }))
  const sharedCardDescriptors = WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS
    .map(descriptor => ({ id: descriptor.id, label: descriptor.label, layoutKind: descriptor.layoutKind }))
  if (JSON.stringify(sharedCardLayouts) !== JSON.stringify(sharedCardDescriptors)) {
    throw new Error(`expected Props Panel palette to reuse shared Widget Card descriptors, got ${JSON.stringify(sharedCardLayouts)}`)
  }
  if (!layoutVariants.every(variant => variant.aspectRatio === '16:9')) {
    throw new Error(`expected palette layouts to preserve the selected 16:9 aspect, got ${layoutVariants.map(variant => variant.aspectRatio).join(', ')}`)
  }
  const portraitVariants = listWidgetPaletteLayoutVariants(seededPalette, '9:16')
  if (!portraitVariants.every(variant => variant.aspectRatio === '9:16')) {
    throw new Error(`expected palette layouts to preserve the selected 9:16 aspect, got ${portraitVariants.map(variant => variant.aspectRatio).join(', ')}`)
  }
  const customFlowEntry: typeof seededPalette[number] = {
    id: 'custom-flow-editor',
    isEnabled: true,
    nodeTypeId: 'CustomFlowEditor',
    widgetTypeId: 'custom',
    formId: 'customFlowEditor',
    fields: [],
    ports: [],
    updatedAt: '2026-07-09T00:00:00.000Z',
  }
  const customFlowVariant = listWidgetPaletteLayoutVariants([...seededPalette, customFlowEntry], '16:9')
    .find(variant => variant.entry.id === customFlowEntry.id)
  if (customFlowVariant?.label !== 'CustomFlowEditor' || customFlowVariant.layoutKind !== 'flow-editor') {
    throw new Error(`expected the palette traversal to retain custom enabled flow editors, got ${JSON.stringify(customFlowVariant)}`)
  }
  const legacyWidgetAlias: typeof seededPalette[number] = {
    ...customFlowEntry,
    id: 'legacy-widget-card-alias',
    nodeTypeId: 'TextGeneration',
    widgetTypeId: 'default',
    formId: 'textGeneration.openai',
  }
  if (isPropsPanelWidgetPaletteEntry(legacyWidgetAlias)) {
    throw new Error('expected provider-specific Widget Card compatibility aliases to stay out of the palette')
  }
  const layoutsWithLegacyAlias = listWidgetPaletteLayoutVariants([...seededPalette, legacyWidgetAlias], '16:9')
  if (layoutsWithLegacyAlias.some(variant => variant.entry.id === legacyWidgetAlias.id)) {
    throw new Error('expected the shared layout mapper to remove legacy Widget Card aliases even before palette filtering')
  }
  const mediaPanelEntry = seededPalette.find(entry => getWidgetRegistryEntryLabel(entry) === 'Rich Media Panel')
  if (!mediaPanelEntry) throw new Error('expected the shared registry to retain Rich Media Panel for media materialization')
  if (registryLabels.includes('Text Widget')) throw new Error(`expected registry to remove the legacy Text Widget label, got ${registryLabels.join(', ')}`)
  const textWidgetEntry = seededPalette.find(entry => getWidgetRegistryEntryLabel(entry) === 'Widget Card')
  if (!textWidgetEntry) throw new Error('expected neutral Props Panel palette to expose Widget Card')
  const probeTreeSeed = buildWidgetCardLayoutSeed(PROBE_TREE_TYPE_ONE_LAYOUT_ID)
  if (probeTreeSeed?.label !== 'Probe-Tree Card'
    || probeTreeSeed.properties.cardTypeLabel !== 'Probe-Tree Card'
    || probeTreeSeed.properties.prompt !== '/knowgrph.probe-tree') {
    throw new Error(`expected Probe-Tree Type 1 drag to seed the executable card contract, got ${JSON.stringify(probeTreeSeed)}`)
  }
  const probeTreeMultiSelectSeed = buildWidgetCardLayoutSeed(PROBE_TREE_TYPE_TWO_LAYOUT_ID)
  if (probeTreeMultiSelectSeed?.properties.probeTreeCardVariant !== PROBE_TREE_TYPE_TWO_LAYOUT_ID
    || probeTreeMultiSelectSeed.properties.selectionMode !== 'multiple'
    || probeTreeMultiSelectSeed.properties.allowOther !== true
    || !Array.isArray(probeTreeMultiSelectSeed.properties.selectionOptions)
    || probeTreeMultiSelectSeed.properties.selectionOptions.length !== 2) {
    throw new Error(`expected Probe-Tree Type 2 drag to seed bounded multi-select plus Other, got ${JSON.stringify(probeTreeMultiSelectSeed)}`)
  }
  const deliverablesSeed = buildWidgetCardLayoutSeed(RICH_MEDIA_DELIVERABLES_LAYOUT_ID)
  if (deliverablesSeed?.label !== 'Deliverables Widget Card'
    || deliverablesSeed.properties.richMediaDeliverablesMode !== true
    || deliverablesSeed.properties.externalMcpCreateArtifacts !== true
    || deliverablesSeed.properties.externalSlidesMcpCapability !== 'auto'
    || deliverablesSeed.properties.externalSheetsMcpCapability !== 'auto'
    || !String(deliverablesSeed.properties.prompt || '').includes('/investment-research-agent')
    || !String(deliverablesSeed.properties.prompt || '').includes('XLSX companion workbook')) {
    throw new Error(`expected Deliverables Widget Card to seed the typed MCP-backed two-output route, got ${JSON.stringify(deliverablesSeed)}`)
  }
  const droppedTextWidgetNode = {
    id: 'dropped-text-widget',
    type: textWidgetEntry.nodeTypeId,
    label: 'Widget Card',
    properties: {
      'flow:widgetTypeId': textWidgetEntry.widgetTypeId,
      'flow:widgetFormId': textWidgetEntry.formId,
      prompt: 'Generate a text response for the active request.',
      output: '',
      title: 'Widget Card',
      lane: 'Text Generation',
      typeLabel: 'Text Generation',
    },
  }
  const cardBoard = buildStoryboardBoardModel({
    graphData: {
      type: 'application/json',
      nodes: [
        { id: 'source-card', type: 'RuntimeProofGate', label: 'Source', properties: { lane: 'Source', summary: 'Reference source card.' } },
        droppedTextWidgetNode,
      ],
      edges: [{ id: 'source-to-text', source: 'source-card', target: 'dropped-text-widget', label: 'creates', properties: {} }],
    },
    graphRevision: 1,
    widgetRegistry: seededPalette,
  })
  const textWidgetCard = cardBoard.lanes.flatMap(lane => lane.cards).find(card => card.id === 'dropped-text-widget') || null
  if (!isStoryboardFixedCardOwnedNode(droppedTextWidgetNode)) {
    throw new Error('expected dropped Widget Card to be owned by the Storyboard Card overlay, not the Rich Media overlay path')
  }
  if (!textWidgetCard) throw new Error('expected dropped Widget Card to project into the Storyboard Card board')
  if (textWidgetCard.title !== 'Widget Card') throw new Error(`expected dropped Widget Card title, got ${textWidgetCard.title}`)
  if (textWidgetCard.lane !== 'Widget Card' || textWidgetCard.typeLabel !== 'Widget Card') {
    throw new Error(`expected legacy Text Generation projection to normalize to Widget Card, got ${JSON.stringify({ lane: textWidgetCard.lane, typeLabel: textWidgetCard.typeLabel })}`)
  }

  const canvasRuntimeSnippets = [
    'useStoryboardWidgetDropBridge',
    'const pendingOpenWidgetNodeIdRef = React.useRef<string | null>(null)',
    'addNodeFromRegistryAtWorld',
    'useStoryboardWidgetDropBridge({',
    'pendingOpenWidgetNodeIdRef,',
  ]
  for (const snippet of canvasRuntimeSnippets) {
    if (!canvasRuntimeText.includes(snippet)) {
      throw new Error(`expected ready-to-Run widget runtime bridge snippet: ${snippet}`)
    }
  }
  if (!canvasRuntimeText.includes('if (storyboardCardDisplayActive) return []')) {
    throw new Error('expected Storyboard Card display to suppress explicit open widget shell ids after Props Panel widget drops')
  }
  if (!widgetSurfaceText.includes('props.storyboardWidgetMode === true && Array.isArray(props.openWidgetNodeIds)')) {
    throw new Error('expected Storyboard surface to honor explicit open widget ids only in Widget display mode')
  }

  const widgetDropBridgeSnippets = [
    'readActiveFlowWidgetPointerDragSession',
    'resolveFlowWidgetDragEventReleaseClientPoint',
    'resolveFlowWidgetPointerReleaseClientPoint',
    "document.addEventListener('pointerup', onPointerUpCapture, true)",
    'FLOW_WIDGET_POINTER_DRAG_DROP_EVENT',
    'window.addEventListener(FLOW_WIDGET_POINTER_DRAG_DROP_EVENT, onFlowWidgetPointerDragDropCapture, true)',
    'commitFlowWidgetPointerDrop',
    'isFlowWidgetPointerDropDistanceAccepted',
    'readResolvedStoryboardWidgetDropTransform',
    'useProjectedRichMediaShell: true',
    'readStoryboardWidgetDropRect({',
    'resolveWidgetRegistryEntryForDrop(args.widgetRegistryRef.current || [], payload)',
    'resolveWidgetRegistryEntryForDrop(args.widgetRegistryRef.current || [], session)',
    'appendDraftNode: (args: {',
    'args.appendDraftNode({ id: requestedId',
    'pendingOpenWidgetNodeIdRef.current = actualId',
    'FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID',
    "outputSrcDoc: ''",
    'FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID',
    "sourceUrl: ''",
    'const providerFamily = inferTextGenerationProviderFamily({',
    'const nextTextProperties = resolveTextGenerationGlobalDefaultsForProviderFamily({',
    'readGrabMapsDiscoveryWidgetProperties()',
    'readGeospatialCursorLngLat()',
    'syncGrabMapsDiscoveryGeoFromDropCursor',
    'requestGeospatialCurrentLocation',
    'readFiniteGeoLatLng',
    'properties.geo = {',
    'setGeospatialModeEnabled(true)',
    'getWidgetRegistryEntryLabel(entry)',
    'prompt: getFlowTextGenerationSeedPrompt(entry.formId)',
    'buildWidgetCardLayoutSeed(payload.layoutVariantId)',
    'if (layoutSeed) Object.assign(properties, layoutSeed.properties)',
    "output: ''",
  ]
  for (const snippet of widgetDropBridgeSnippets) {
    if (!widgetDropBridgeText.includes(snippet)) {
      throw new Error(`expected ready-to-Run widget drop default snippet: ${snippet}`)
    }
  }
  if (widgetDropBridgeText.includes('if (session.nativeDragStarted) return')) {
    throw new Error('expected widget pointer fallback to materialize native drag releases instead of returning before drop creation')
  }
  const pointerUpStart = widgetDropBridgeText.indexOf('const onPointerUpCapture =')
  const pointerDistanceCheck = widgetDropBridgeText.indexOf('if (!isFlowWidgetPointerDropDistanceAccepted(session, release.clientX, release.clientY))', pointerUpStart)
  const pointerNativeAwaitReturn = widgetDropBridgeText.indexOf('if (session.nativeDragStarted === true) return', pointerUpStart)
  const pointerPostNativeClear = widgetDropBridgeText.indexOf('clearActiveFlowWidgetPointerDragSession(ev.pointerId)', pointerNativeAwaitReturn)
  if (pointerUpStart < 0 || pointerDistanceCheck < 0 || pointerNativeAwaitReturn < pointerDistanceCheck || pointerPostNativeClear < pointerNativeAwaitReturn) {
    throw new Error('expected widget pointer fallback not to clear the active session before native dragend can commit the drop')
  }
  if (!widgetDropBridgeText.includes('if (session.nativeDragStarted === true) return')) {
    throw new Error('expected unresolved native drags to keep the pointer session alive for dragend commit')
  }
  const deferredWidgetDropStart = widgetDropBridgeText.indexOf('const appendDeferredWidgetAtClientPoint =')
  const deferredWidgetDropAwait = widgetDropBridgeText.indexOf("if (!pos) return 'await-transform'", deferredWidgetDropStart)
  const deferredWidgetDropDedupe = widgetDropBridgeText.indexOf('if (args.shouldDedupeWidgetDrop(dropKey))', deferredWidgetDropStart)
  if (deferredWidgetDropStart < 0 || deferredWidgetDropAwait < deferredWidgetDropStart || deferredWidgetDropDedupe < deferredWidgetDropAwait) {
    throw new Error('expected native widget drops to await an empty-canvas transform before recording the committed drop dedupe key')
  }
  const pointerWidgetDropStart = widgetDropBridgeText.indexOf('const commitFlowWidgetPointerDrop =')
  const pointerWidgetDropAwait = widgetDropBridgeText.indexOf("if (!pos) return 'await-transform'", pointerWidgetDropStart)
  const pointerWidgetDropDedupe = widgetDropBridgeText.indexOf('if (args.shouldDedupeWidgetDrop(dropKey))', pointerWidgetDropStart)
  if (pointerWidgetDropStart < 0 || pointerWidgetDropAwait < pointerWidgetDropStart || pointerWidgetDropDedupe < pointerWidgetDropAwait) {
    throw new Error('expected pointer widget drops to await an empty-canvas transform before recording the committed drop dedupe key')
  }
  const surfaceWidgetDropStart = widgetSurfaceText.indexOf('const payload = readFlowWidgetDragPayloadFromDataTransfer')
  const surfaceWidgetDropPosition = widgetSurfaceText.indexOf('const pos = readSurfaceDrop(release.clientX, release.clientY)', surfaceWidgetDropStart)
  const surfaceWidgetDropDedupe = widgetSurfaceText.indexOf('if (props.shouldDedupeWidgetDrop(dropKey))', surfaceWidgetDropStart)
  if (surfaceWidgetDropStart < 0 || surfaceWidgetDropPosition < surfaceWidgetDropStart || surfaceWidgetDropDedupe < surfaceWidgetDropPosition) {
    throw new Error('expected the Storyboard surface to resolve an empty-canvas drop position before recording the committed drop dedupe key')
  }
  const nativeDropStart = widgetDropBridgeText.indexOf('const onDropCapture = (ev: DragEvent) => {')
  const nativeWidgetPayloadRead = widgetDropBridgeText.indexOf('const payload = readFlowWidgetDragPayloadFromDataTransfer', nativeDropStart)
  const nativeMediaFallback = widgetDropBridgeText.indexOf('if (hasMediaDragPayload(dt)) {', nativeDropStart)
  if (nativeDropStart < 0 || nativeWidgetPayloadRead < nativeDropStart || nativeMediaFallback < nativeWidgetPayloadRead) {
    throw new Error('expected native Storyboard drops to resolve a valid widget payload before the generic media fallback')
  }
  if (!widgetSharedText.includes('export function readProjectedRichMediaShellTransform')
    || !widgetSharedText.includes('export function readResolvedStoryboardWidgetDropTransform')) {
    throw new Error('expected Storyboard widget drops to share Rich Media shell transform fallback from the shared surface owner')
  }
  if (!widgetSurfaceText.includes('readResolvedStoryboardWidgetDropTransform')
    || !widgetSurfaceText.includes('resolveFlowWidgetDragEventReleaseClientPoint(ev.nativeEvent)')
    || !widgetSurfaceText.includes('const pos = readSurfaceDrop(release.clientX, release.clientY)')) {
    throw new Error('expected Storyboard surface native widget drops to reuse the shared drop transform path')
  }

  const defaultHelperSnippets = [
    [storyboardWidgetConfigText, "FLOW_TEXT_GENERATION_SEED_PROMPT_DEFAULT = 'Generate a text response for the active request.'", 'text seed default'],
    [storyboardWidgetConfigText, 'export function getFlowTextGenerationSeedPrompt', 'text seed helper'],
  ] as const
  for (const [text, snippet, label] of defaultHelperSnippets) {
    if (!text.includes(snippet)) {
      throw new Error(`expected ready-to-Run widget ${label} snippet: ${snippet}`)
    }
  }

  if (!copyText.includes("flowWidget: 'Widget'")) {
    throw new Error('expected shared UI metadata to rename Widget to Widget')
  }
}
