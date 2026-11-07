import type { AssetPart, AssetPrimitive, AssetVector } from './proceduralAssetContract'

export const PROCEDURAL_ENVIRONMENT_SUBJECTS = ['building', 'sea', 'river', 'sky', 'cloud', 'moon', 'sun', 'landscape'] as const
/** Bounded authored assemblies, shared with native text recipes. No inferred scene identity. */
export function createEnvironmentParts(subject: string, color: string): AssetPart[] {
  const parts: AssetPart[] = []
  const add = (id: string, primitive: AssetPrimitive, position: AssetVector, size: AssetVector,
    tint = color, rotation: AssetVector = [0, 0, 0]) => parts.push({ id, primitive, position, size, color: tint,
    rotation, pivot: [0, 0, 0], visible: true, parentId: parts.length ? parts[0].id : null })
  if (subject === 'building') {
    add('facade', 'box', [0, 1.5, 0], [1.4, 3, 1])
    add('roof', 'box', [0, 1.55, 0], [1.52, 0.12, 1.12], '#64748b')
    for (let i = 0; i < 4; i++) add(`windows-${i}`, 'box', [-0.48 + i * 0.32, 0, 0.51], [0.16, 2.5, 0.025], '#abcbd8')
  } else if (subject === 'sea') {
    add('water', 'box', [0, 0.04, 0], [3, 0.08, 2], color)
    for (let i = 0; i < 2; i++) add(`wave-${i}`, 'sphere', [i * 0.5 - 0.25, 0.04, i * 0.7 - 0.35], [2, 0.05, 0.16], '#95cbd7')
  } else if (subject === 'river') {
    add('channel', 'box', [0, 0.04, 0], [0.85, 0.08, 1.3])
    add('bend-north', 'box', [0.15, 0, -1], [0.85, 0.08, 1.3], color, [0, -0.28, 0])
    add('bend-south', 'box', [-0.15, 0, 1], [0.85, 0.08, 1.3], color, [0, -0.28, 0])
  } else if (subject === 'cloud') {
    add('cloud-center', 'sphere', [0, 0.6, 0], [1.4, 1.2, 1], color)
    add('cloud-left', 'sphere', [-0.75, -0.15, 0], [1.25, 0.85, 0.9])
    add('cloud-right', 'sphere', [0.75, -0.1, 0], [1.1, 0.95, 0.85])
  } else if (subject === 'landscape') {
    // Ground the assembly at its root; child offsets keep the authored hill profile.
    add('hill-center', 'sphere', [0, 0.65, 0], [2.5, 1.3, 2])
    add('hill-left', 'sphere', [-1.25, -0.15, 0.25], [2, 0.9, 1.75])
    add('hill-right', 'cone', [1.1, 0.3, -0.25], [1.8, 1.9, 1.8])
  } else if (subject === 'sky') {
    add('sky-backdrop', 'sphere', [0, 1, 0], [4, 2, 0.2])
  } else if (subject === 'moon' || subject === 'sun') {
    add(subject, 'sphere', [0, 0.5, 0], [1, 1, 1])
  }
  return parts
}
