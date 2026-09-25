import type { AssetPart, AssetPrimitive, AssetVector } from './proceduralAssetContract'

export const PROCEDURAL_TRANSPORT_SUBJECTS = ['aircraft', 'ship', 'car'] as const
/** Compact authored transport recipes for the shared CPU builder and GLB exporter. */
export function createTransportParts(subject: string, color: string): AssetPart[] {
  const parts: AssetPart[] = []
  const add = (id: string, primitive: AssetPrimitive, position: AssetVector, size: AssetVector,
    tint = color, rotation: AssetVector = [0, 0, 0]) => parts.push({
    id, primitive, position, size, color: tint, rotation, pivot: [0, 0, 0], visible: true, parentId: null,
  })
  if (subject === 'aircraft') {
    add('fuselage', 'sphere', [0, 0.3, 0], [0.38, 0.4, 2.4])
    add('wings', 'box', [0, 0.3, -0.15], [2.8, 0.07, 0.55])
    add('tailplane', 'box', [0, 0.36, 0.88], [1.1, 0.06, 0.32])
    add('tail-fin', 'box', [0, 0.57, 0.88], [0.07, 0.48, 0.35], '#94a3b8')
  } else if (subject === 'ship') {
    add('hull', 'sphere', [0, 0.2, 0], [1, 0.4, 2.6])
    add('deckhouse', 'box', [0, 0.54, 0.2], [0.68, 0.5, 1.1], '#d4dde4')
    add('bridge', 'box', [0, 0.88, -0.1], [0.55, 0.2, 0.35], '#62798c')
  } else if (subject === 'car') {
    add('chassis', 'box', [0, 0.34, 0], [1.1, 0.35, 2])
    add('cabin', 'box', [0, 0.65, 0.05], [0.85, 0.4, 1], '#324d63')
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      add(`wheel-${side < 0 ? 'left' : 'right'}-${end < 0 ? 'front' : 'rear'}`,
        'cylinder', [side * 0.55, 0.2, end * 0.65], [0.4, 0.16, 0.4], '#202731', [0, 0, Math.PI / 2])
    }
  } else throw Error('Unsupported procedural transport subject')
  return parts
}
