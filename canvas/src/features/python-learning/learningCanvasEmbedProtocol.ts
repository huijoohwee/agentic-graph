import type { LearningSceneSnapshot } from './learningLessons'

export const LEARNING_CANVAS_PROTOCOL = 'agentic-graph/learning-canvas/v1'
export type LearningCanvasPose = readonly [number, number, number, number, number]

/** Render-only boundary: no source, commands, URLs, model edits or control authority. */
export function readLearningCanvasPose(value: unknown, channel: string): LearningCanvasPose | null {
  if (!/^[a-f0-9]{32}$/u.test(channel) || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (Object.keys(data).sort().join(',') !== 'channel,kind,pose,protocol'
    || data.protocol !== LEARNING_CANVAS_PROTOCOL || data.channel !== channel || data.kind !== 'pose') return null
  const p = data.pose
  if (!Array.isArray(p) || p.length !== 5 || !p.every(n => typeof n === 'number' && Number.isFinite(n))
    || !Number.isSafeInteger(p[0]) || p[0] < 0 || p[0] > 7200 || Math.abs(p[1]) > 8 || Math.abs(p[2]) > 8
    || p[3] < 0 || p[3] >= 360 || p[4] < 0 || p[4] > 4) return null
  return [...p] as unknown as LearningCanvasPose
}

export function learningCanvasScene(pose: LearningCanvasPose): LearningSceneSnapshot {
  const [ticks, x, z, heading, altitude] = pose
  return { ticks, x, z, heading, altitude, landed: altitude === 0, collisions: 0, atGoal: false, distance: 0 }
}
