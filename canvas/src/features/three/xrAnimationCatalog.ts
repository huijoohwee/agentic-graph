import type { XrMotionReferenceVector, XrSceneLibraryCategory } from './xrSceneLibrary'
import type { XrChoreographyEasing, XrChoreographyGait } from './xrChoreographyEasing'

export const XR_CHARACTER_MOTION_PRESET_IDS = [
  'fight',
  'dance',
  'sit',
  'drink',
  'jump',
  'play-cards',
  'squirt-gun',
] as const

export const XR_ACTION_PATH_PRESET_IDS = [
  'helicopter-orbit',
  'car-chase',
  'collapsing-debris',
] as const

export type XrCharacterMotionPresetId = (typeof XR_CHARACTER_MOTION_PRESET_IDS)[number]
export type XrActionPathPresetId = (typeof XR_ACTION_PATH_PRESET_IDS)[number]
export type XrAnimationPresetId = XrCharacterMotionPresetId | XrActionPathPresetId
export type XrAnimationTrackKind = 'character-motion' | 'action-path'
export type XrAnimationPropCue = 'none' | 'cup' | 'cards' | 'squirt-gun'

type XrAnimationPresetBase = Readonly<{
  label: string
  description: string
  cycleSeconds: number
  loop: boolean
  compatibleCategories: readonly XrSceneLibraryCategory[]
  compatibleAssetIds: readonly string[]
  keywords: readonly string[]
}>

export type XrCharacterMotionPreset = XrAnimationPresetBase & Readonly<{
  id: XrCharacterMotionPresetId
  kind: 'character-motion'
}>

export type XrActionPathPreset = XrAnimationPresetBase & Readonly<{
  id: XrActionPathPresetId
  kind: 'action-path'
}>

export type XrAnimationPreset = XrCharacterMotionPreset | XrActionPathPreset

type XrAnimationAssignmentBase = Readonly<{
  startTimeSeconds: number
  loop: boolean
}>

export type XrAnimationAssignment =
  | XrAnimationAssignmentBase & Readonly<{ kind: 'character-motion'; presetId: XrCharacterMotionPresetId }>
  | XrAnimationAssignmentBase & Readonly<{ kind: 'action-path'; presetId: XrActionPathPresetId }>

export type XrAnimationPoseSample = Readonly<{
  rootOffsetMeters: XrMotionReferenceVector
  rootRotationDegrees: XrMotionReferenceVector
  crouch: number
  leftArmPitchDegrees: number
  rightArmPitchDegrees: number
  leftArmRollDegrees: number
  rightArmRollDegrees: number
  propCue: XrAnimationPropCue
  eventCues: readonly string[]
}>

export type XrAnimationPathMark = Readonly<{
  timeSeconds: number
  position: XrMotionReferenceVector
  transition: XrChoreographyEasing
  gait: XrChoreographyGait
}>

const PEOPLE = ['people'] as const
const VEHICLES = ['vehicles'] as const
const PROPS = ['props'] as const

export const XR_ANIMATION_PRESETS: readonly XrAnimationPreset[] = Object.freeze([
  { id: 'fight', kind: 'character-motion', label: 'Fight combo', description: 'Guard, jab, cross, evade, and reset beats for readable stunt blocking.', cycleSeconds: 2.4, loop: true, compatibleCategories: PEOPLE, compatibleAssetIds: [], keywords: ['fight', 'combat', 'jab', 'cross', 'evade', 'stunt'] },
  { id: 'dance', kind: 'character-motion', label: 'Dance loop', description: 'Two-step, turn, arm sweep, and return for rhythmic performance reference.', cycleSeconds: 3.2, loop: true, compatibleCategories: PEOPLE, compatibleAssetIds: [], keywords: ['dance', 'two-step', 'turn', 'rhythm'] },
  { id: 'sit', kind: 'character-motion', label: 'Sit', description: 'Lower, settle, hold, and rise pose reference for a chair-height surface.', cycleSeconds: 4, loop: false, compatibleCategories: PEOPLE, compatibleAssetIds: [], keywords: ['sit', 'chair', 'settle', 'rise'] },
  { id: 'drink', kind: 'character-motion', label: 'Drink', description: 'Reach, lift cup, sip, and lower with a visible hand-prop cue.', cycleSeconds: 2.8, loop: true, compatibleCategories: PEOPLE, compatibleAssetIds: [], keywords: ['drink', 'cup', 'sip', 'hand prop'] },
  { id: 'jump', kind: 'character-motion', label: 'Jump', description: 'Crouch, takeoff, airborne apex, landing, and recovery.', cycleSeconds: 1.8, loop: true, compatibleCategories: PEOPLE, compatibleAssetIds: [], keywords: ['jump', 'takeoff', 'airborne', 'land'] },
  { id: 'play-cards', kind: 'character-motion', label: 'Play cards', description: 'Seated card handling, deal, inspect, and table-return beats.', cycleSeconds: 3.6, loop: true, compatibleCategories: PEOPLE, compatibleAssetIds: [], keywords: ['cards', 'deal', 'table', 'seated'] },
  { id: 'squirt-gun', kind: 'character-motion', label: 'Squirt gun', description: 'Ready, aim, squeeze, recoil, and reset with a procedural prop cue.', cycleSeconds: 2.2, loop: true, compatibleCategories: PEOPLE, compatibleAssetIds: [], keywords: ['squirt gun', 'water', 'aim', 'recoil'] },
  { id: 'helicopter-orbit', kind: 'action-path', label: 'Helicopter orbit', description: 'Constant-altitude establishing orbit with a complete facing path.', cycleSeconds: 8, loop: true, compatibleCategories: VEHICLES, compatibleAssetIds: ['vehicle-helicopter'], keywords: ['helicopter', 'orbit', 'aerial', 'circle'] },
  { id: 'car-chase', kind: 'action-path', label: 'Car chase', description: 'Acceleration, lane changes, corner pressure, and escape-line finish.', cycleSeconds: 7, loop: false, compatibleCategories: VEHICLES, compatibleAssetIds: ['vehicle-sedan', 'vehicle-van'], keywords: ['car', 'chase', 'lane change', 'pursuit'] },
  { id: 'collapsing-debris', kind: 'action-path', label: 'Collapsing debris', description: 'Suspended mass, staged fall, impact, bounce, and final settle.', cycleSeconds: 4, loop: false, compatibleCategories: PROPS, compatibleAssetIds: ['prop-debris-cluster'], keywords: ['debris', 'collapse', 'fall', 'impact', 'bounce'] },
])

export const XR_CHARACTER_MOTION_PRESETS = XR_ANIMATION_PRESETS.filter((preset): preset is XrCharacterMotionPreset => preset.kind === 'character-motion')
export const XR_ACTION_PATH_PRESETS = XR_ANIMATION_PRESETS.filter((preset): preset is XrActionPathPreset => preset.kind === 'action-path')

export function isXrAnimationPresetId(value: unknown): value is XrAnimationPresetId {
  const id = String(value || '').trim()
  return XR_ANIMATION_PRESETS.some(preset => preset.id === id)
}

export function resolveXrAnimationPreset(value: unknown): XrAnimationPreset {
  const id = String(value || '').trim()
  return XR_ANIMATION_PRESETS.find(preset => preset.id === id) || XR_ANIMATION_PRESETS[0]!
}

export function xrAnimationPresetCompatible(args: {
  preset: XrAnimationPreset
  assetId?: string
  category?: XrSceneLibraryCategory
  graphActor?: boolean
}): boolean {
  if (args.preset.compatibleAssetIds.length > 0) return args.preset.compatibleAssetIds.includes(String(args.assetId || ''))
  if (args.graphActor && args.preset.kind === 'character-motion') return true
  return Boolean(args.category && args.preset.compatibleCategories.includes(args.category))
}

const round = (value: number, places = 4): number => {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const smoothstep = (value: number): number => {
  const bounded = clamp(value, 0, 1)
  return bounded * bounded * (3 - 2 * bounded)
}

const emptyPose = (): XrAnimationPoseSample => ({
  rootOffsetMeters: [0, 0, 0],
  rootRotationDegrees: [0, 0, 0],
  crouch: 0,
  leftArmPitchDegrees: 0,
  rightArmPitchDegrees: 0,
  leftArmRollDegrees: 0,
  rightArmRollDegrees: 0,
  propCue: 'none',
  eventCues: [],
})

export function sampleXrAnimationPose(
  assignment: XrAnimationAssignment | null,
  timeSeconds: number,
): XrAnimationPoseSample {
  if (!assignment) return emptyPose()
  const preset = resolveXrAnimationPreset(assignment.presetId)
  if (preset.kind !== 'character-motion') return emptyPose()
  const elapsed = Math.max(0, Number(timeSeconds) - assignment.startTimeSeconds)
  const cycle = Math.max(0.1, preset.cycleSeconds)
  const normalized = assignment.loop
    ? (elapsed % cycle) / cycle
    : clamp(elapsed / cycle, 0, 1)
  const wave = Math.sin(normalized * Math.PI * 2)
  const pulse = Math.sin(normalized * Math.PI)
  if (preset.id === 'fight') {
    const jab = normalized < 0.25 ? smoothstep(normalized / 0.25) : normalized < 0.5 ? 1 - smoothstep((normalized - 0.25) / 0.25) : 0
    const cross = normalized >= 0.5 && normalized < 0.75 ? smoothstep((normalized - 0.5) / 0.25) : normalized >= 0.75 ? 1 - smoothstep((normalized - 0.75) / 0.25) : 0
    return { rootOffsetMeters: [0, 0, round(-0.08 * Math.abs(wave))], rootRotationDegrees: [round(-6 * Math.abs(wave)), round(12 * (cross - jab)), 0], crouch: round(0.18 + 0.12 * Math.abs(wave)), leftArmPitchDegrees: round(-30 - 105 * jab), rightArmPitchDegrees: round(-30 - 105 * cross), leftArmRollDegrees: -18, rightArmRollDegrees: 18, propCue: 'none', eventCues: jab > 0.85 ? ['jab'] : cross > 0.85 ? ['cross'] : [] }
  }
  if (preset.id === 'dance') return { rootOffsetMeters: [round(wave * 0.22), round(Math.abs(wave) * 0.08), 0], rootRotationDegrees: [0, round(normalized * 360), round(wave * 8)], crouch: round(0.08 + Math.abs(wave) * 0.1), leftArmPitchDegrees: round(-30 - wave * 55), rightArmPitchDegrees: round(-30 + wave * 55), leftArmRollDegrees: round(-35 - wave * 18), rightArmRollDegrees: round(35 - wave * 18), propCue: 'none', eventCues: normalized > 0.46 && normalized < 0.54 ? ['turn'] : [] }
  if (preset.id === 'sit') {
    const seated = normalized < 0.35 ? smoothstep(normalized / 0.35) : normalized < 0.8 ? 1 : 1 - smoothstep((normalized - 0.8) / 0.2)
    return { rootOffsetMeters: [0, round(-0.55 * seated), round(-0.18 * seated)], rootRotationDegrees: [round(12 * seated), 0, 0], crouch: round(0.72 * seated), leftArmPitchDegrees: round(-12 * seated), rightArmPitchDegrees: round(-12 * seated), leftArmRollDegrees: -8, rightArmRollDegrees: 8, propCue: 'none', eventCues: seated > 0.98 ? ['seated'] : [] }
  }
  if (preset.id === 'drink') {
    const lift = normalized < 0.3 ? smoothstep(normalized / 0.3) : normalized < 0.68 ? 1 : 1 - smoothstep((normalized - 0.68) / 0.32)
    return { rootOffsetMeters: [0, 0, 0], rootRotationDegrees: [round(-4 * lift), 0, 0], crouch: 0.04, leftArmPitchDegrees: -10, rightArmPitchDegrees: round(-20 - 105 * lift), leftArmRollDegrees: -8, rightArmRollDegrees: round(14 + 20 * lift), propCue: 'cup', eventCues: lift > 0.95 ? ['sip'] : [] }
  }
  if (preset.id === 'jump') {
    const launch = Math.max(0, Math.sin(normalized * Math.PI))
    const crouch = normalized < 0.18 ? smoothstep(normalized / 0.18) : normalized > 0.78 ? 1 - smoothstep((normalized - 0.78) / 0.22) : 0
    return { rootOffsetMeters: [0, round(launch * 1.15), 0], rootRotationDegrees: [round(-8 * launch), 0, 0], crouch: round(crouch * 0.55), leftArmPitchDegrees: round(-25 - launch * 130), rightArmPitchDegrees: round(-25 - launch * 130), leftArmRollDegrees: -14, rightArmRollDegrees: 14, propCue: 'none', eventCues: normalized > 0.47 && normalized < 0.53 ? ['apex'] : normalized > 0.93 ? ['land'] : [] }
  }
  if (preset.id === 'play-cards') return { rootOffsetMeters: [0, -0.52, -0.14], rootRotationDegrees: [9, round(wave * 5), 0], crouch: 0.7, leftArmPitchDegrees: round(-68 - wave * 12), rightArmPitchDegrees: round(-68 + wave * 20), leftArmRollDegrees: -22, rightArmRollDegrees: 22, propCue: 'cards', eventCues: normalized > 0.48 && normalized < 0.58 ? ['deal'] : [] }
  return { rootOffsetMeters: [0, round(-0.04 * pulse), 0], rootRotationDegrees: [round(-4 * pulse), round(wave * 8), 0], crouch: 0.12, leftArmPitchDegrees: round(-95 - pulse * 18), rightArmPitchDegrees: round(-95 - pulse * 18), leftArmRollDegrees: -12, rightArmRollDegrees: 12, propCue: 'squirt-gun', eventCues: normalized > 0.42 && normalized < 0.58 ? ['squirt'] : [] }
}

const boundedPosition = (
  position: XrMotionReferenceVector,
  stageSizeMeters: readonly [number, number],
): XrMotionReferenceVector => [
  round(clamp(position[0], -stageSizeMeters[0] * 0.48, stageSizeMeters[0] * 0.48)),
  round(clamp(position[1], 0, 30)),
  round(clamp(position[2], -stageSizeMeters[1] * 0.48, stageSizeMeters[1] * 0.48)),
]

export function buildXrAnimationActionPath(args: {
  presetId: XrActionPathPresetId
  durationSeconds: number
  origin: XrMotionReferenceVector
  stageSizeMeters: readonly [number, number]
}): readonly XrAnimationPathMark[] {
  const duration = Math.max(1, Number(args.durationSeconds) || 1)
  const [width, depth] = args.stageSizeMeters
  const defaultGait: XrChoreographyGait = args.presetId === 'car-chase'
    ? 'wheeled'
    : args.presetId === 'collapsing-debris'
      ? 'drop'
      : 'flight'
  const mark = (
    progress: number,
    position: XrMotionReferenceVector,
    transition: XrChoreographyEasing = 'ease-in-out',
    gait: XrChoreographyGait = defaultGait,
  ): XrAnimationPathMark => ({ timeSeconds: round(duration * progress, 3), position: boundedPosition(position, args.stageSizeMeters), transition, gait })
  if (args.presetId === 'helicopter-orbit') {
    const radiusX = Math.max(2.5, width * 0.28)
    const radiusZ = Math.max(2.5, depth * 0.28)
    const altitude = Math.max(4.5, args.origin[1])
    return Array.from({ length: 9 }, (_item, index) => {
      const angle = index / 8 * Math.PI * 2
      return mark(index / 8, [Math.cos(angle) * radiusX, altitude + Math.sin(angle * 2) * 0.35, Math.sin(angle) * radiusZ], 'linear')
    })
  }
  if (args.presetId === 'car-chase') return [
    mark(0, [-width * 0.42, 0, depth * 0.2]),
    mark(0.18, [-width * 0.22, 0, -depth * 0.12]),
    mark(0.38, [-width * 0.02, 0, depth * 0.08]),
    mark(0.58, [width * 0.16, 0, -depth * 0.2]),
    mark(0.78, [width * 0.3, 0, depth * 0.04]),
    mark(1, [width * 0.44, 0, -depth * 0.12]),
  ]
  const originX = clamp(args.origin[0], -width * 0.25, width * 0.25)
  const originZ = clamp(args.origin[2], -depth * 0.25, depth * 0.25)
  return [
    mark(0, [originX, Math.max(8, args.origin[1]), originZ], 'ease-in', 'drop'),
    mark(0.28, [originX + 0.2, Math.max(7.5, args.origin[1] - 0.5), originZ - 0.1]),
    mark(0.68, [originX - 0.45, 0.3, originZ + 0.55]),
    mark(0.82, [originX + 0.35, 0.85, originZ + 0.9]),
    mark(1, [originX + 0.8, 0, originZ + 1.25], 'hold', 'hold'),
  ]
}
