import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'

/** Readout only; the scene and controls belong to the existing Canvas viewport. */
export function PythonLearningCanvasStatus({ lesson, scene, documentId, runId }: {
  lesson: LearningLesson; scene?: LearningSceneSnapshot; documentId: string; runId?: string
}) {
  const x = scene?.x || 0, z = scene?.z || 0, heading = scene?.heading || 0
  return <output aria-label="Python lesson position" data-learning-document={documentId} data-learning-run-id={runId}
    className="absolute left-2 top-14 z-[60] rounded px-2 py-1 text-xs text-white pointer-events-none"
    style={{ background: 'rgba(20, 33, 56, .85)' }}>
    Position ({x.toFixed(2)}, {z.toFixed(2)}) m · heading {heading.toFixed(0)}° · goal ({lesson.goal.join(', ')})
    {lesson.vehicle === 'drone' ? ` · altitude ${(scene?.altitude || 0).toFixed(2)} m · ${scene?.landed === false ? 'airborne' : 'landed'} · kinematic model` : ''}
  </output>
}
