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

/** Render-only admission; it never imports source, executes a program or sends receiver commands. */
export async function readLearningCanvasShare(hash: string, signal: AbortSignal): Promise<LearningCanvasPose[]> {
  signal.throwIfAborted()
  if (hash.length > 16016) throw new Error('Canvas snapshot link is too large.')
  const fields = new URLSearchParams(hash.replace(/^#/, '')), encoded = fields.get('flight') || ''
  if ([...fields.keys()].join(',') !== 'flight' || !/^[A-Za-z0-9_-]{1,16000}$/u.test(encoded))
    throw new Error('Canvas snapshot link is invalid.')
  const bytes = Uint8Array.from(atob(encoded.replace(/-/gu, '+').replace(/_/gu, '/')), char => char.charCodeAt(0))
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const row = await reader.read()
      if (row.done) break
      size += row.value.byteLength
      if (size > 500000) throw new Error('Canvas snapshot exceeds 500 kB.')
      chunks.push(row.value)
    }
  } finally { await reader.cancel().catch(() => void 0) }
  signal.throwIfAborted()
  const path = JSON.parse(await new Blob(chunks).text())
  if (!path || !['agentic-drone-flight-path/v1', 'agentic-drone-flight-path/v2'].includes(path.schema)
    || path.model !== 'kinematic' || path.physicalAircraft !== false || path.tickRate !== 60
    || path.coordinateFrame !== 'local-xz-altitude-m-heading-deg'
    || !Array.isArray(path.samples) || path.samples.length < 2 || path.samples.length > 7201)
    throw new Error('Unsupported Canvas snapshot.')
  const channel = '0'.repeat(32), poses: LearningCanvasPose[] = []
  for (let tick = 0; tick < path.samples.length; tick++) {
    const pose = readLearningCanvasPose({ protocol: LEARNING_CANVAS_PROTOCOL, kind: 'pose', channel, pose: path.samples[tick] }, channel)
    const previous = poses[tick - 1]
    if (!pose || pose[0] !== tick || (!tick && pose.some(n => n !== 0))
      || (previous && Math.hypot(pose[1] - previous[1], pose[2] - previous[2], pose[4] - previous[4]) > 0.050002))
      throw new Error('Canvas snapshot contains an invalid pose.')
    poses.push(pose)
  }
  if (poses[poses.length - 1][4] !== 0) throw new Error('Canvas snapshot must end landed.')
  return poses
}
