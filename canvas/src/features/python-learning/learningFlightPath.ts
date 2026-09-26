import { validLearningSnapshot, type LearningWorkerSnapshot } from './learningProtocol'

/** Portable data contract only. GameXR owns import admission and explicit bench execution. */
export function createLearningFlightPath(result: LearningWorkerSnapshot, pageUrl?: string): string {
  if (!validLearningSnapshot(result) || result.identity.lessonId !== 'drone' || result.state !== 'completed'
    || result.error || !result.scene.landed || result.scene.collisions !== 0 || !result.trace?.length
    || result.trace.length !== result.scene.ticks) throw new Error('Finish a collision-free drone run and land before exporting.')
  const samples = [[0, 0, 0, 0, 0], ...result.trace.map(row => row.map(value => Number(value.toFixed(6))))]
  for (let i = 1; i < samples.length; i++) {
    const [tick, x, z, heading, altitude] = samples[i], previous = samples[i - 1]
    if (tick !== i || Math.abs(x) > 8 || Math.abs(z) > 8 || heading < 0 || heading >= 360
      || altitude < 0 || altitude > 4 || Math.hypot(x - previous[1], z - previous[2], altitude - previous[4]) > 0.050002)
      throw new Error('Flight trace is incomplete or exceeds the bench path bounds.')
  }
  const last = samples[samples.length - 1]
  if (last[4] !== 0 || Math.abs(last[1] - result.scene.x) > 0.000001
    || Math.abs(last[2] - result.scene.z) > 0.000001 || Math.abs(last[3] - result.scene.heading) > 0.000001)
    throw new Error('Flight trace does not match the completed scene.')
  const sourceUrl = pageUrl ? learningFlightSourceUrl(pageUrl, result.identity.documentId) : undefined
  const text = JSON.stringify({ schema: sourceUrl ? 'agentic-drone-flight-path/v2' : 'agentic-drone-flight-path/v1', model: 'kinematic', physicalAircraft: false,
    tickRate: 60, coordinateFrame: 'local-xz-altitude-m-heading-deg',
    sourceDigest: result.identity.sourceDigest, sceneDigest: result.identity.sceneDigest, ...(sourceUrl ? { sourceUrl } : {}), samples })
  if (new TextEncoder().encode(text).byteLength > 500000) throw new Error('Flight path exceeds 500 kB. Shorten the program.')
  return text
}

/** Reuse Graph's native file route; never carry page tokens or unrelated query state. */
export function learningFlightSourceUrl(pageUrl: string, documentId: string): string {
  const url = new URL(pageUrl), file = documentId.replace(/^\/+/, '')
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !file
    || file.length > 2048 || file.split('/').some(part => part === '..') || /[\\\x00-\x1f]/u.test(file))
    throw new Error('Cannot link this Graph source file.')
  url.search = ''; url.hash = ''; url.searchParams.set('kgDoc', file)
  return url.href
}
