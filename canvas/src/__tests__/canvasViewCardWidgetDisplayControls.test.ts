import { applyCanvasViewSelection } from '@/components/toolbar/canvasViewActions'
import { buildCanvasViewOptions, getCanvasViewRendererOptions, getCanvasViewTriggerState } from '@/components/toolbar/canvasViewMenu'
import { BLOCK_SCHEMA } from '@/__tests__/canvas3dMode.test'
import {
  CANVAS_CARD_DISPLAY_CONTROL_ID,
  CANVAS_WIDGET_DISPLAY_CONTROL_ID,
} from '@/lib/canvas/canvasCardWidgetDisplayControls'

const STORYBOARD_STATE = {
  canvas2dRenderer: 'storyboard',
  canvas3dMode: '3d',
  canvasRenderMode: '2d',
  documentSemanticMode: 'document',
  frontmatterModeEnabled: false,
  multiDimTableModeEnabled: false,
  renderMediaAsNodes: false,
  timelineEnabled: false,
  bottomSurfaceCollapsed: true,
  bottomSurfaceTab: 'stats',
  minimapCollapsed: false,
  storyboardDisplayMode: 'card',
  geospatialEnabled: false,
  layoutMode: 'block',
  schema: BLOCK_SCHEMA,
  frontmatterOnlyAllowed: false,
  isD3Like2dLayoutToggle: false,
} as const

const collectSelectionCalls = () => {
  const calls: string[] = []
  const markCall = (name: string) => (...args: unknown[]) => {
    calls.push(`${name}:${args.map(arg => String(arg)).join(',')}`)
  }
  return { calls, markCall }
}

const baseSelectionParams = (markCall: (name: string) => (...args: unknown[]) => void) => ({
  ensureBaselineUnlocked: () => true,
  geospatialEnabled: false,
  onOpenGeospatialMode: () => { throw new Error('Expected Storyboard display control to avoid Geospatial Mode') },
  ...STORYBOARD_STATE,
  setCanvas2dRenderer: markCall('renderer') as any,
  setCanvasRenderMode: markCall('renderMode') as any,
  setCanvas3dMode: markCall('canvas3dMode') as any,
  setSchema: markCall('schema') as any,
  setBehavior: markCall('behavior') as any,
  setRenderMediaAsNodes: markCall('media') as any,
  setTimelineEnabled: markCall('timeline') as any,
  setBottomSurfaceCollapsed: markCall('bottomCollapsed') as any,
  setBottomSurfaceTab: markCall('bottomTab') as any,
  setMinimapCollapsed: markCall('minimap') as any,
  setStoryboardDisplayMode: markCall('storyboardDisplay') as any,
  setDocumentSemanticMode: markCall('documentMode') as any,
  setFrontmatterModeEnabled: markCall('frontmatter') as any,
  setMultiDimTableModeEnabled: markCall('multiTable') as any,
})

export function testCardWidgetDisplayControlsAreRendererNeutral() {
  const rendererOptions = getCanvasViewRendererOptions()
  if (rendererOptions.filter(option => option.id === 'storyboard').length !== 1) {
    throw new Error('Expected one canonical Storyboard renderer option')
  }
  if (getCanvasViewTriggerState(STORYBOARD_STATE, rendererOptions).title !== '2D Renderer: Storyboard') {
    throw new Error('Expected Card and Widget modes to retain the Storyboard renderer trigger')
  }

  const displayControls = buildCanvasViewOptions(STORYBOARD_STATE, rendererOptions).find(option => option.id === 'control:menu')
  const cardControl = displayControls?.children?.find(child => child.id === CANVAS_CARD_DISPLAY_CONTROL_ID)
  const widgetControl = displayControls?.children?.find(child => child.id === CANVAS_WIDGET_DISPLAY_CONTROL_ID)
  if (!cardControl || !widgetControl || cardControl.isActive !== true || widgetControl.isActive === true) {
    throw new Error('Expected Display Controls to expose active Card and inactive Widget modes')
  }
  const d3DisplayControls = buildCanvasViewOptions(
    {
      ...STORYBOARD_STATE,
      canvas2dRenderer: 'd3',
      isD3Like2dLayoutToggle: true,
    },
    rendererOptions,
  ).find(option => option.id === 'control:menu')
  const d3CardControl = d3DisplayControls?.children?.find(child => child.id === CANVAS_CARD_DISPLAY_CONTROL_ID)
  const d3WidgetControl = d3DisplayControls?.children?.find(child => child.id === CANVAS_WIDGET_DISPLAY_CONTROL_ID)
  if (!d3CardControl || !d3WidgetControl || d3CardControl.isActive !== true || d3WidgetControl.isActive === true) {
    throw new Error('Expected Display Controls to expose the same Card and Widget modes under every 2D renderer')
  }
  if (
    cardControl.title !== 'Display: Card (Default)'
    || cardControl.rowLabel !== 'Display'
    || cardControl.valueLabel !== 'Card (Default)'
    || cardControl.label !== 'Card'
    || cardControl.description !== 'Card presentation'
  ) {
    throw new Error('Expected card display control to keep Card wording')
  }
  if (
    widgetControl.title !== 'Display: Widget'
    || widgetControl.rowLabel !== 'Display'
    || widgetControl.valueLabel !== 'Widget'
    || widgetControl.label !== 'Widget'
    || widgetControl.description !== 'Widget presentation'
  ) {
    throw new Error('Expected widget display control to keep Widget wording')
  }

  const widget = collectSelectionCalls()
  applyCanvasViewSelection({
    id: CANVAS_WIDGET_DISPLAY_CONTROL_ID,
    ...baseSelectionParams(widget.markCall),
  })
  if (widget.calls.join('|') !== 'storyboardDisplay:widget') {
    throw new Error(`Expected Widget display control to keep the current renderer and switch presentation only, got ${widget.calls.join('|')}`)
  }
  const d3Widget = collectSelectionCalls()
  applyCanvasViewSelection({
    id: CANVAS_WIDGET_DISPLAY_CONTROL_ID,
    ...baseSelectionParams(d3Widget.markCall),
    canvas2dRenderer: 'd3',
  })
  if (d3Widget.calls.join('|') !== 'storyboardDisplay:widget') {
    throw new Error(`Expected Widget display control to avoid renderer rewrites under D3, got ${d3Widget.calls.join('|')}`)
  }

  const card = collectSelectionCalls()
  applyCanvasViewSelection({
    id: CANVAS_CARD_DISPLAY_CONTROL_ID,
    ...baseSelectionParams(card.markCall),
    storyboardDisplayMode: 'widget',
  })
  if (card.calls.join('|') !== 'storyboardDisplay:card') {
    throw new Error(`Expected Card display control to keep the current renderer and switch presentation only, got ${card.calls.join('|')}`)
  }
}
