export const XR_CHOREOGRAPHY_EASINGS = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'hold',
] as const

export const XR_CHOREOGRAPHY_GAITS = [
  'hold',
  'walk',
  'jog',
  'run',
  'wheeled',
  'flight',
  'drop',
] as const

export type XrChoreographyEasing = (typeof XR_CHOREOGRAPHY_EASINGS)[number]
export type XrChoreographyGait = (typeof XR_CHOREOGRAPHY_GAITS)[number]

type XrDefaultGaitInput =
  | string
  | Readonly<{
      category?: string
      assetId?: string
      shape?: string
    }>

export function readXrChoreographyEasing(value: unknown): XrChoreographyEasing {
  const normalized = String(value || '').trim().toLowerCase()
  return XR_CHOREOGRAPHY_EASINGS.includes(normalized as XrChoreographyEasing)
    ? normalized as XrChoreographyEasing
    : 'linear'
}

export function readXrChoreographyGait(value: unknown, fallback: XrChoreographyGait = 'walk'): XrChoreographyGait {
  const normalized = String(value || '').trim().toLowerCase()
  return XR_CHOREOGRAPHY_GAITS.includes(normalized as XrChoreographyGait)
    ? normalized as XrChoreographyGait
    : fallback
}

export function defaultXrChoreographyGait(input?: XrDefaultGaitInput): XrChoreographyGait {
  const category = typeof input === 'string' ? input : String(input?.category || '').trim()
  const assetId = typeof input === 'string' ? '' : String(input?.assetId || '').trim()
  const shape = typeof input === 'string' ? '' : String(input?.shape || '').trim()
  if (assetId === 'vehicle-helicopter' || shape === 'helicopter') return 'flight'
  if (category === 'vehicles') return 'wheeled'
  if (assetId === 'prop-ball' || shape === 'ball') return 'wheeled'
  if (category === 'props') return 'hold'
  return 'walk'
}

export function defaultXrCameraEasing(rig: string): XrChoreographyEasing {
  return rig === 'drone' || rig === 'steadicam' || rig === 'crane' || rig === 'car-mount'
    ? 'ease-in-out'
    : 'linear'
}

export function sampleXrChoreographyEasing(easing: XrChoreographyEasing, progress: number): number {
  const value = Math.min(1, Math.max(0, Number(progress) || 0))
  if (easing === 'hold') return 0
  if (easing === 'ease-in') return value * value
  if (easing === 'ease-out') return 1 - (1 - value) * (1 - value)
  if (easing === 'ease-in-out') return value * value * (3 - 2 * value)
  return value
}
