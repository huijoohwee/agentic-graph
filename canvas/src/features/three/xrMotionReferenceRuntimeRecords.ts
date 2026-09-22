import { serializeXrMotionReferencePlan, type XrMotionReferencePlan } from './xrMotionReferenceModel'

export function xrMotionReferenceSourceSignature(
  sceneKey: string,
  nodes: readonly Readonly<{ id?: unknown; label?: unknown }>[],
  persistedValue: unknown,
): string {
  return JSON.stringify({
    sceneKey: String(sceneKey || ''),
    nodes: nodes.map(node => [node.id, node.label]),
    persistedValue: persistedValue ?? null,
  })
}

export function xrMotionReferencePlanRecord(plan: XrMotionReferencePlan): Record<string, unknown> {
  return serializeXrMotionReferencePlan(plan) as Record<string, unknown>
}

export function xrMotionReferenceCastTrackRecord(track: XrMotionReferencePlan['cast'][number]): Record<string, unknown> {
  return {
    actorId: track.actorId,
    label: track.label,
    animation: track.animation ? { ...track.animation } : null,
    marks: track.marks.map(mark => ({
      timeSeconds: mark.timeSeconds,
      position: [...mark.position],
      transition: mark.transition,
      gait: mark.gait,
      ...(mark.cue ? { cue: mark.cue } : {}),
    })),
  }
}
