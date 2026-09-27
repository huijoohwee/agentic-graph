import { type CSSProperties } from 'react'
import { resolveFloatingPanelRightClearanceCss } from '@/lib/ui/floatingPanelGeometry'
import './learningSpatialView.css'
import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'
import { useGraphStore } from '@/hooks/useGraphStore'
import { learningAssets, useLearningSpatialView, useLearningViewportLeft } from './learningSpatialView'

/** Surface switching belongs exclusively to the native Canvas View menu and WebMCP. */
export function PythonLearningCanvasStatus({ lesson, scene, documentId, runId, editorOpen = false }: {
  lesson: LearningLesson; scene?: LearningSceneSnapshot; documentId: string; runId?: string; editorOpen?: boolean
}) {
  const x = scene?.x || 0, z = scene?.z || 0, heading = scene?.heading || 0
  const { ref, left } = useLearningViewportLeft(editorOpen)
  const panelOpen = useGraphStore(state => state.floatingPanelOpen)
  const panelRatio = useGraphStore(state => state.floatingPanelWidthRatio)
  const { view, update } = useLearningSpatialView()
  const selected = learningAssets(lesson, scene).find(asset => asset.id === view.selectedId)
  const drone = lesson.vehicle === 'drone'
  return <section ref={ref} style={{ left: left + 8, ...(panelOpen ? { '--learning-panel-clearance': resolveFloatingPanelRightClearanceCss(panelRatio) } : {}) } as CSSProperties} className="learning-spatial-ui learning-scene-controls absolute left-2 right-2 top-14 z-[60] flex flex-col items-start gap-1 pointer-events-none" aria-label="Lesson scene controls">
    {drone && <nav className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-lg border bg-[var(--kg-panel-bg)] p-1 shadow-sm" aria-label="Lesson scene options">
      <button type="button" className="min-h-11 rounded border px-3 text-xs" aria-pressed={view.dimensions} onClick={() => update({ dimensions: !view.dimensions })}>Dimensions</button>
      <button type="button" className="min-h-11 rounded border px-3 text-xs" onClick={() => {
        const store = useGraphStore.getState(); store.setFloatingPanelView('media'); store.setFloatingPanelOpen(true)
      }}>Scene assets</button>
    </nav>}
    <output aria-label="Python lesson position" data-learning-document={documentId} data-learning-run-id={runId}
      className="max-w-full rounded px-2 py-1 text-xs text-white" style={{ background: 'rgba(20, 33, 56, .85)' }}>
      Position ({x.toFixed(2)}, {z.toFixed(2)}) m · heading {heading.toFixed(0)}° · goal ({lesson.goal.join(', ')})
      {drone ? ` · altitude ${(scene?.altitude || 0).toFixed(2)} m · ${scene?.landed === false ? 'airborne' : 'landed'} · kinematic model` : ''}
    </output>
    {drone && view.dimensions && selected && <span className="rounded border bg-[var(--kg-panel-bg)] px-2 py-1 text-xs">{selected.name} · {selected.size[0].toFixed(2)} × {selected.size[2].toFixed(2)} m · {selected.kind === 'space' ? 'ceiling' : 'height'} {selected.size[1].toFixed(2)} m</span>}
  </section>
}
