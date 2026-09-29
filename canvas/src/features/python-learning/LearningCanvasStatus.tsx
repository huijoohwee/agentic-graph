import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cancelLearningPlacement, openLearningActivity, spatialNotice, toggleWarehouseDoor } from './learningSpatialActions'
import { requestFloatingPanelOpen } from '@/features/toolbar/floatingPanelBridge'
import { WAREHOUSE_DOORS } from './learningSpatialEditing'
import { useWarehouseInspection } from './useWarehouseInspection'
import { type CSSProperties } from 'react'
import { resolveFloatingPanelRightClearanceCss } from '@/lib/ui/floatingPanelGeometry'
import './learningSpatialView.css'
import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'
import { useGraphStore } from '@/hooks/useGraphStore'
import { learningAssets, useLearningSpatialView, useLearningViewportLeft } from './learningSpatialView'

const actionClass = `${UI_THEME_TOKENS.control.singleLine} ${UI_THEME_TOKENS.border.outline} rounded text-xs disabled:opacity-40`

/** Surface switching belongs exclusively to the native Canvas View menu and WebMCP. */
export function PythonLearningCanvasStatus({ lesson, scene, documentId, runId, editorOpen = false }: {
  lesson: LearningLesson; scene?: LearningSceneSnapshot; documentId: string; runId?: string; editorOpen?: boolean
}) {
  const inspection = useWarehouseInspection()
  const x = scene?.x || 0, z = scene?.z || 0, heading = scene?.heading || 0
  const { ref, left } = useLearningViewportLeft(editorOpen)
  const panelOpen = useGraphStore(state => state.floatingPanelOpen)
  const panelRatio = useGraphStore(state => state.floatingPanelWidthRatio)
  const { view, update } = useLearningSpatialView()
  const renderMode = useGraphStore(state => state.canvasRenderMode)
  const selected = learningAssets(lesson, scene, inspection.active ? inspection.sample : undefined).find(asset => asset.id === view.selectedId)
  const drone = lesson.vehicle === 'drone'
  return <section ref={ref} style={{ left: left + 8, ...(panelOpen ? { '--learning-panel-clearance': resolveFloatingPanelRightClearanceCss(panelRatio) } : {}) } as CSSProperties} className="learning-spatial-ui learning-scene-controls absolute left-2 right-2 top-14 z-[60] flex flex-col items-start gap-1 pointer-events-none" aria-label="Lesson scene controls">
    {drone && <nav className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-lg border bg-[var(--kg-panel-bg)] p-1 shadow-sm" aria-label="Lesson scene options">
      <button type="button" className={actionClass} aria-pressed={view.dimensions} onClick={() => update({ dimensions: !view.dimensions })}>Dimensions</button>
      <button type="button" className={actionClass} disabled={!inspection.active && !inspection.canEnable} aria-pressed={inspection.active} onClick={inspection.active ? inspection.disable : inspection.enable}>{inspection.active ? 'Return to Python flight' : 'Warehouse rehearsal'}</button>
      <button type="button" className={actionClass} onClick={() => {
        requestFloatingPanelOpen({ tab: 'media', open: true })
      }}>Scene assets</button>
      {renderMode !== '2d' && <button type="button" className={actionClass} aria-pressed={view.walk} onClick={() => {
        update({ walk: !view.walk, placement: null }); spatialNotice(view.walk ? 'Orbit viewpoint restored.' : 'Walk review · focus Canvas; WASD / arrows move; drag to look; Esc returns to orbit.')
      }}>{view.walk ? 'Exit walk' : 'Walk'}</button>}
      <button type="button" className={actionClass} onClick={openLearningActivity}>Activity / checks</button>
      {view.placement && <button type="button" className={actionClass} onClick={cancelLearningPlacement}>Cancel placement</button>}
      <details className="relative text-xs"><summary className={`${actionClass} cursor-pointer content-center`}>Doors</summary>
        <nav aria-label="Warehouse doors" className="absolute left-0 top-full z-10 grid min-w-48 gap-1 rounded border bg-[var(--kg-panel-bg)] p-2 shadow-lg">{WAREHOUSE_DOORS.map(door => <button key={door.id} type="button" aria-pressed={view.doors.includes(door.id)} className={actionClass} onClick={() => toggleWarehouseDoor(door.id)}>{view.doors.includes(door.id) ? 'Close' : 'Open'} {door.name}</button>)}</nav>
      </details>
    </nav>}
    {drone && view.walk && renderMode !== '2d' && <nav className="pointer-events-auto flex max-w-full flex-wrap gap-1 rounded border bg-[var(--kg-panel-bg)] p-1" aria-label="Walk touch controls">
      {(['left', 'forward', 'back', 'right'] as const).map(direction => <button key={direction} type="button" className={actionClass} onClick={() => update({ walkCommand: { direction, sequence: (view.walkCommand?.sequence ?? 0) + 1 } })}>{direction === 'left' ? 'Turn left' : direction === 'right' ? 'Turn right' : direction === 'forward' ? 'Step forward' : 'Step back'}</button>)}
      <span className="self-center px-2 text-xs">WASD / arrows · drag to look · click doors</span>
    </nav>}
    {drone && view.message && <output role="status" aria-label="Warehouse interaction status" className="pointer-events-auto max-w-full rounded border bg-[var(--kg-panel-bg)] px-2 py-1 text-xs">{view.message}</output>}
    <output aria-label="Python lesson position" data-learning-document={documentId} data-learning-run-id={runId}
      className="pointer-events-auto max-w-full rounded px-2 py-1 text-xs text-white" style={{ background: 'rgba(20, 33, 56, .85)' }}>
      {inspection.active ? `Facility rehearsal · ${inspection.seconds.toFixed(1)} s · ${inspection.sample.coverage.rackVisited}/${inspection.sample.coverage.rackTotal} rack stations · ${inspection.sample.phase}` : <>Position ({x.toFixed(2)}, {z.toFixed(2)}) m · heading {heading.toFixed(0)}° · goal ({lesson.goal.join(', ')})
      {drone ? ` · altitude ${(scene?.altitude || 0).toFixed(2)} m · ${scene?.landed === false ? 'airborne' : 'landed'} · kinematic model` : ''}</>}
    </output>
    {drone && view.dimensions && selected && <output aria-label="Warehouse selected dimensions" className="pointer-events-auto max-w-full rounded border bg-[var(--kg-panel-bg)] px-2 py-1 text-xs">{selected.name} · {selected.size[0].toFixed(2)} × {selected.size[2].toFixed(2)} m · {selected.kind === 'space' ? 'ceiling' : 'height'} {selected.size[1].toFixed(2)} m</output>}
  </section>
}
