import fs from 'node:fs'
import path from 'node:path'

export function testStoryboardWidgetOverlaysDoNotUseFloatingPanelZIndex() {
  const filePath = path.resolve(process.cwd(), 'src/components/StoryboardWidget/WidgetEditorInner.tsx')
  let text = ''
  try {
    text = fs.readFileSync(filePath, { encoding: 'utf8' })
  } catch {
    throw new Error(`Expected to read ${filePath}`)
  }
  if (text.includes('floatingPanelZIndex') || text.includes('Z_INDEX_FLOATING_PANEL_DEFAULT')) {
    throw new Error('Expected Storyboard widgets to not derive z-index from floating panel z-index')
  }
  if (text.includes('5000') || text.includes('8000')) {
    throw new Error('Expected Storyboard widgets to avoid high hardcoded z-index values')
  }
  if (!text.includes('FLOW_WIDGET_OVERLAY_Z_INDEX_BASE') || !text.includes('FLOW_WIDGET_OVERLAY_Z_INDEX_SELECTED')) {
    throw new Error('Expected Storyboard Widget overlays to use bounded z-index constants')
  }
  const sharedPath = path.resolve(process.cwd(), 'src/components/StoryboardWidget/flowWidgetOverlayShared.ts')
  let sharedText = ''
  try {
    sharedText = fs.readFileSync(sharedPath, { encoding: 'utf8' })
  } catch {
    throw new Error(`Expected to read ${sharedPath}`)
  }
  if (
    !sharedText.includes("from '@/lib/ui/zIndex'")
    || !sharedText.includes('Z_INDEX_GRAPH_OVERLAY_BASE')
    || !sharedText.includes('Z_INDEX_GRAPH_OVERLAY_SELECTED')
  ) {
    throw new Error('Expected Storyboard Widget overlays to reuse shared graph overlay z-index SSOT')
  }
}

export function testStoryboardWidgetOverlaySvgIsBoundedBelowToolbar() {
  const filePath = path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx')
  let text = ''
  try {
    text = fs.readFileSync(filePath, { encoding: 'utf8' })
  } catch {
    throw new Error(`Expected to read ${filePath}`)
  }
  if (text.includes('Z_INDEX_FLOATING_PANEL_DEFAULT) - 100') || text.includes('floatingPanelZIndex') && text.includes('- 100')) {
    throw new Error('Expected Storyboard Widget overlay-only SVG to avoid floating-panel-derived z-index')
  }
  if (!text.includes("from '@/lib/ui/zIndex'") || !text.includes('Z_INDEX_GRAPH_OVERLAY_EDGES')) {
    throw new Error('Expected Storyboard Widget overlay-only SVG to reuse shared graph overlay z-index SSOT')
  }
  if (text.includes('zIndex: 120')) {
    throw new Error('Expected Storyboard Widget overlay-only SVG to avoid hardcoded z-index values')
  }
}

export function testStoryboardWidgetOverlayModeUsesSharedNativeSurfacePolicy() {
  const flowCanvasPath = path.resolve(process.cwd(), 'src/components/FlowCanvas.tsx')
  const flowCanvasSharedPath = path.resolve(process.cwd(), 'src/components/FlowCanvas/shared.ts')
  const nativeRuntimePath = path.resolve(process.cwd(), 'src/components/FlowCanvas/nativeRuntime.ts')
  const surfacePath = path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx')
  const overlayVisibilityPath = path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlaySurfaceVisibility.ts')
  let flowCanvasText = ''
  let flowCanvasSharedText = ''
  let nativeRuntimeText = ''
  let surfaceText = ''
  let overlayVisibilityText = ''
  try {
    flowCanvasText = fs.readFileSync(flowCanvasPath, { encoding: 'utf8' })
    flowCanvasSharedText = fs.readFileSync(flowCanvasSharedPath, { encoding: 'utf8' })
    nativeRuntimeText = fs.readFileSync(nativeRuntimePath, { encoding: 'utf8' })
    surfaceText = fs.readFileSync(surfacePath, { encoding: 'utf8' })
    overlayVisibilityText = fs.readFileSync(overlayVisibilityPath, { encoding: 'utf8' })
  } catch {
    throw new Error(`Expected to read Storyboard renderer isolation files`)
  }
  if (flowCanvasSharedText.includes('runtime-only') || flowCanvasSharedText.includes('overlayOwnsScene')) {
    throw new Error('Expected FlowCanvas shared API to avoid runtime-only or overlay-owned suppression modes')
  }
  if (surfaceText.includes('nativeSurfaceMode') || flowCanvasText.includes('resolveFlowCanvasNativeRenderPolicy')) {
    throw new Error('Expected Storyboard Widget to avoid FlowCanvas native surface suppression passthrough')
  }
  if (
    flowCanvasText.includes('drawArgsRef.current.renderEdges')
    || flowCanvasText.includes('drawArgsRef.current.renderGroups')
    || flowCanvasText.includes('drawArgsRef.current.renderNodes')
    || nativeRuntimeText.includes('if (!renderEdges && !renderGroups && !renderNodes) return')
  ) {
    throw new Error('Expected FlowCanvas native drawing to avoid all-primitives-off suppression')
  }
  const runtimePath = path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas.runtime.tsx')
  const runtimeText = fs.readFileSync(runtimePath, { encoding: 'utf8' })
  if (
    runtimeText.includes('storyboardWidgetOverlayOwnsNativeScene')
    || runtimeText.includes('resolveFlowCanvasNativeSurfaceMode')
    || runtimeText.includes('nativeSurfaceMode={')
  ) {
    throw new Error('Expected Storyboard renderer isolation to avoid native surface suppression from runtime code')
  }
  if (
    !overlayVisibilityText.includes('const frontmatterFlowOwnedNodeIds =')
    || !overlayVisibilityText.includes('excludedNodeIds: frontmatterFlowOwnedNodeIds')
  ) {
    throw new Error('Expected Storyboard renderer isolation to partition Storyboard Widget-owned graph nodes before FlowCanvas receives them')
  }
}

export function testStoryboardWidgetOverlayOnlyModeDoesNotBlankCanvasWhenNoOverlaysOpen() {
  const surfacePath = path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx')
  const overlaySurfacePath = path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetOverlaySurface.tsx')
  const overlayVisibilityPath = path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlaySurfaceVisibility.ts')
  let surfaceText = ''
  let overlaySurfaceText = ''
  try {
    surfaceText = fs.readFileSync(surfacePath, { encoding: 'utf8' })
    overlaySurfaceText = `${fs.readFileSync(overlaySurfacePath, { encoding: 'utf8' })}\n${fs.readFileSync(overlayVisibilityPath, { encoding: 'utf8' })}`
  } catch {
    throw new Error(`Expected to read ${surfacePath}, ${overlaySurfacePath}, and ${overlayVisibilityPath}`)
  }
  if (!overlaySurfaceText.includes('const overlayOnlyActive =')) {
    throw new Error('Expected Storyboard Widget overlay-only rendering to be gated by whether overlays exist')
  }
  if (!overlaySurfaceText.includes('hasOverlayEditors || Boolean(geospatialWidgetPanelMode)')) {
    throw new Error('Expected Storyboard Widget overlay-only mode to require visible overlays or geospatial panel mode')
  }
  if (surfaceText.includes('renderEdges=') || surfaceText.includes('renderNodes=')) {
    throw new Error('Expected Storyboard Widget surface to avoid owning native FlowCanvas edge/node visibility')
  }
  if (surfaceText.includes('nativeSurfaceMode') || overlaySurfaceText.includes('overlayOwnsScene')) {
    throw new Error('Expected Storyboard Widget overlay-only mode to avoid native surface suppression controls')
  }
  if (!surfaceText.includes('{(props.overlayOnlyActive || props.hasOverlayEditors || storyboardCardsActive) && (')) {
    throw new Error('Expected overlay edge host to stay mounted while Storyboard Widget overlay editors are visible')
  }
}

export function testWorkspacePanesOutrankStoryboardWidgetOverlays() {
  const filePath = path.resolve(process.cwd(), 'src/pages/Canvas.tsx')
  let text = ''
  try {
    text = fs.readFileSync(filePath, { encoding: 'utf8' })
  } catch {
    throw new Error(`Expected to read ${filePath}`)
  }
  const layer = text.match(/toolbarHeaderLayerClassName = toolbarHeaderElevated \? 'z-\[(\d+)\]' : 'z-\[(\d+)\]'/)
  const editor = text.match(/className="absolute inset-0 z-\[(\d+)\] pointer-events-none"/)
  if (!text.includes('Workspace Toolbar Header') || !text.includes('${toolbarHeaderLayerClassName}') || !layer || !editor || !(Number(layer[2]) < Number(editor[1]) && Number(editor[1]) < Number(layer[1]))) {
    throw new Error('Expected the editor to outrank the resting workspace header and the elevated toolbar to outrank the editor')
  }
}

export function testGraphRichMediaOverlayLayersUseSharedLowZIndex() {
  const flowMediaPath = path.resolve(process.cwd(), 'src/components/FlowCanvas/FlowCanvasMediaOverlays.tsx')
  const d3MediaPath = path.resolve(process.cwd(), 'src/components/GraphCanvasRoot/components/RichMediaOverlayLayer2d.tsx')
  let flowMediaText = ''
  let d3MediaText = ''
  try {
    flowMediaText = fs.readFileSync(flowMediaPath, { encoding: 'utf8' })
    d3MediaText = fs.readFileSync(d3MediaPath, { encoding: 'utf8' })
  } catch {
    throw new Error(`Expected to read ${flowMediaPath} and ${d3MediaPath}`)
  }
  if (flowMediaText.includes('2200') || flowMediaText.includes('1400')) {
    throw new Error('Expected Flow rich media overlays to avoid high per-item z-index hardcodes')
  }
  if (!flowMediaText.includes('Z_INDEX_GRAPH_MEDIA_LAYER') || !flowMediaText.includes('Z_INDEX_GRAPH_OVERLAY_SELECTED') || !flowMediaText.includes('UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME')) {
    throw new Error('Expected Flow rich media overlays to reuse shared graph overlay z-index SSOT')
  }
  if (d3MediaText.includes('z-[80]')) {
    throw new Error('Expected D3 rich media overlays to avoid hardcoded z-[80] layer value')
  }
  if (!d3MediaText.includes('Z_INDEX_GRAPH_MEDIA_LAYER') || !d3MediaText.includes('UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME')) {
    throw new Error('Expected D3 rich media overlays to reuse shared graph overlay z-index SSOT')
  }
}
