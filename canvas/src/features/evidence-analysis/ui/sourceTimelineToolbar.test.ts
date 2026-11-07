import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCanvasViewOptions, getCanvasViewRendererOptions } from '@/components/toolbar/canvasViewMenu'
import { applyCanvasViewSelection } from '@/components/toolbar/canvasViewActions'
import type { CanvasViewModelState } from '@/components/toolbar/canvasViewTypes'

const model = (geospatialEnabled: boolean, xr: boolean): CanvasViewModelState => ({
  canvas2dRenderer: 'storyboard', canvasRenderMode: xr ? '3d' : '2d', canvas3dMode: xr ? 'xr' : '3d',
  documentSemanticMode: 'document', frontmatterModeEnabled: true, multiDimTableModeEnabled: false,
  renderMediaAsNodes: false, timelineEnabled: false, bottomSurfaceCollapsed: true,
  bottomSurfaceTab: 'stats', geospatialEnabled, layoutMode: 'block',
  schema: { layout: { mode: 'block' }, behavior: {}, nodeStyles: {}, edgeStyles: {}, rules: [] } as CanvasViewModelState['schema'],
  frontmatterOnlyAllowed: false, isD3Like2dLayoutToggle: true,
})
const timelineRow = (state: CanvasViewModelState) => buildCanvasViewOptions(state, getCanvasViewRendererOptions())
  .find(row => row.id === 'control:menu')!.children!.find(row => row.id === 'control:timeline')!

for (const [name, geo, xr] of [['2D', false, false], ['XR', false, true], ['Geospatial', true, false], ['Geo+XR', true, true]] as const) {
  test(`shared Timeline toggles in ${name} without changing surface or document state`, () => {
    const state = model(geo, xr), calls: string[] = []
    assert.notEqual(timelineRow(state).disabled, true)
    assert.equal(timelineRow(state).isActive, false)
    const unexpected = () => { throw new Error('Timeline must not mutate renderer, document, map or legacy clock state') }
    const run = (unlocked = true) => applyCanvasViewSelection({
      ...state, id: 'control:timeline', ensureBaselineUnlocked: () => unlocked,
      onOpenGeospatialMode: unexpected, onExitGeospatialMode: unexpected,
      setCanvas2dRenderer: unexpected, setCanvasRenderMode: unexpected, setCanvas3dMode: unexpected,
      setSchema: unexpected, setBehavior: unexpected, setRenderMediaAsNodes: unexpected,
      setTimelineEnabled: unexpected, setDocumentSemanticMode: unexpected,
      setFrontmatterModeEnabled: unexpected, setMultiDimTableModeEnabled: unexpected,
      setBottomSurfaceTab: tab => { state.bottomSurfaceTab = tab; calls.push(`tab:${tab}`) },
      setBottomSurfaceCollapsed: collapsed => { state.bottomSurfaceCollapsed = collapsed; calls.push(`collapsed:${collapsed}`) },
    })
    run(false); assert.deepEqual(calls, [], 'baseline editing lock remains enforced')
    run(); assert.deepEqual(calls, ['tab:timeline', 'collapsed:false'])
    assert.equal(timelineRow(state).isActive, true)
    calls.length = 0
    run(); assert.deepEqual(calls, ['collapsed:true'])
    assert.equal(timelineRow(state).isActive, false)
    state.bottomSurfaceCollapsed = false; state.bottomSurfaceTab = 'gitGraph'; calls.length = 0
    run(); assert.deepEqual(calls, ['tab:timeline', 'collapsed:false'])
    assert.equal(timelineRow(state).isActive, true)
  })
}
