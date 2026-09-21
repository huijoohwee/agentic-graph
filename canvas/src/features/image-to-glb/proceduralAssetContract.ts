export const PROCEDURAL_ASSET_SCHEMA = 'agentic-graph-procedural-asset/v1'
export const PROCEDURAL_ASSET_LIMITS = { bytes: 65_536, parts: 48, controls: 32, clips: 8, keys: 32, triangles: 120_000 } as const
export type AssetVector = [number, number, number]
export type AssetPrimitive = 'box' | 'sphere' | 'cylinder' | 'cone'
export type AssetPart = {
  id: string; parentId: string | null; primitive: AssetPrimitive
  position: AssetVector; rotation: AssetVector; size: AssetVector; pivot: AssetVector
  color: string; visible: boolean
}
export type AssetControlValue = number | string | boolean
export type AssetControl = {
  id: string; label: string; partId: string
  target: 'width' | 'height' | 'depth' | 'color' | 'visible' | 'detail'
} & (
  | { type: 'number'; min: number; max: number; step: number; default: number }
  | { type: 'color'; default: string }
  | { type: 'boolean'; default: boolean }
  | { type: 'enum'; options: ('low' | 'medium' | 'high')[]; default: string }
)
export type AssetClip = {
  id: string; duration: number
  tracks: { partId: string; keys: { time: number; rotation: AssetVector }[] }[]
}
export type ProceduralAssetRecipe = {
  schema: typeof PROCEDURAL_ASSET_SCHEMA; intent: string; seed: number
  parts: AssetPart[]; controls: AssetControl[]; values: Record<string, AssetControlValue>; clips: AssetClip[]
}
const idPattern = /^[a-z][a-z0-9-]{0,47}$/
const colorPattern = /^#[0-9a-fA-F]{6}$/
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const vector = (v: unknown, min: number, max: number): v is AssetVector => Array.isArray(v) && v.length === 3 && v.every(n => finite(n, min, max))
function requireValid(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`Procedural asset: ${message}`)
}
function keysOnly(value: Record<string, unknown>, keys: string[]): void {
  requireValid(Object.keys(value).every(key => keys.includes(key)), 'unsupported field; executable source and external assets are not recipe inputs')
}
export function validateAssetControlValue(control: AssetControl, value: unknown): value is AssetControlValue {
  if (control.type === 'number') return finite(value, control.min, control.max)
  if (control.type === 'color') return typeof value === 'string' && colorPattern.test(value)
  if (control.type === 'boolean') return typeof value === 'boolean'
  return typeof value === 'string' && control.options.includes(value as 'low')
}
/** Copies only bounded JSON after structural admission; never executes source. */
export function parseProceduralAssetRecipe(input: unknown): ProceduralAssetRecipe {
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  requireValid(typeof text === 'string' && new TextEncoder().encode(text).length <= PROCEDURAL_ASSET_LIMITS.bytes, 'recipe exceeds 64 kB')
  const recipe: unknown = JSON.parse(text)
  requireValid(object(recipe), 'recipe must be an object')
  keysOnly(recipe, ['schema', 'intent', 'seed', 'parts', 'controls', 'values', 'clips'])
  requireValid(recipe.schema === PROCEDURAL_ASSET_SCHEMA, 'unsupported recipe schema')
  requireValid(typeof recipe.intent === 'string' && recipe.intent.trim().length > 0 && recipe.intent.length <= 2000, 'intent must contain 1–2000 characters')
  requireValid(finite(recipe.seed, 0, 0xffffffff) && Number.isInteger(recipe.seed), 'seed must be an unsigned integer')
  requireValid(Array.isArray(recipe.parts) && recipe.parts.length > 0 && recipe.parts.length <= PROCEDURAL_ASSET_LIMITS.parts, 'requires 1–48 parts')
  const parts = new Map<string, AssetPart>()
  for (const part of recipe.parts) {
    requireValid(object(part), 'invalid part')
    keysOnly(part, ['id', 'parentId', 'primitive', 'position', 'rotation', 'size', 'pivot', 'color', 'visible'])
    requireValid(typeof part.id === 'string' && idPattern.test(part.id) && !parts.has(part.id), 'part IDs must be stable and unique')
    requireValid(part.parentId === null || typeof part.parentId === 'string', 'invalid parent')
    requireValid(typeof part.primitive === 'string' && ['box', 'sphere', 'cylinder', 'cone'].includes(part.primitive), 'unsupported primitive')
    requireValid(vector(part.position, -100, 100) && vector(part.pivot, -100, 100) && vector(part.rotation, -Math.PI, Math.PI), 'invalid part transform')
    requireValid(vector(part.size, 0.01, 20), 'part dimensions must be 0.01–20')
    requireValid(typeof part.color === 'string' && colorPattern.test(part.color) && typeof part.visible === 'boolean', 'invalid colour or visibility')
    parts.set(part.id, part as AssetPart)
  }
  for (const part of parts.values()) {
    const seen = new Set<string>([part.id])
    let parent = part.parentId
    while (parent !== null) {
      requireValid(parts.has(parent) && !seen.has(parent), 'cyclic or dangling part parent')
      seen.add(parent); parent = parts.get(parent)!.parentId
    }
  }
  requireValid(Array.isArray(recipe.controls) && recipe.controls.length <= PROCEDURAL_ASSET_LIMITS.controls && object(recipe.values), 'invalid controls or values')
  const controls = new Set<string>(), targets = new Set<string>()
  for (const raw of recipe.controls) {
    requireValid(object(raw), 'invalid control')
    requireValid(typeof raw.id === 'string' && idPattern.test(raw.id) && !controls.has(raw.id), 'control IDs must be unique')
    requireValid(typeof raw.label === 'string' && raw.label.trim().length > 0 && raw.label.length <= 80 && typeof raw.partId === 'string' && parts.has(raw.partId), 'invalid control label or target part')
    const target = `${raw.partId}:${raw.target}`
    requireValid(!targets.has(target), 'duplicate control target')
    targets.add(target); controls.add(raw.id)
    const common = ['id', 'label', 'partId', 'target', 'type', 'default']
    if (raw.type === 'number') {
      keysOnly(raw, [...common, 'min', 'max', 'step'])
      requireValid(typeof raw.target === 'string' && ['width', 'height', 'depth'].includes(raw.target) && finite(raw.min, 0.01, 20) && finite(raw.max, raw.min, 20) && finite(raw.step, 0.001, 20), 'invalid numeric control bounds')
    } else if (raw.type === 'enum') {
      keysOnly(raw, [...common, 'options'])
      requireValid(raw.target === 'detail' && Array.isArray(raw.options) && raw.options.length > 0 && raw.options.length <= 3 && new Set(raw.options).size === raw.options.length && raw.options.every(v => ['low', 'medium', 'high'].includes(v)), 'invalid detail choices')
    } else {
      keysOnly(raw, common)
      requireValid(raw.type === 'color' && raw.target === 'color' || raw.type === 'boolean' && raw.target === 'visible', 'unsupported control')
    }
    const control = raw as AssetControl
    requireValid(validateAssetControlValue(control, control.default), 'invalid control default')
    requireValid(Object.prototype.hasOwnProperty.call(recipe.values, control.id) && validateAssetControlValue(control, recipe.values[control.id]), 'invalid or missing control value')
  }
  requireValid(Object.keys(recipe.values).every(key => controls.has(key)), 'unknown control value')
  requireValid(Array.isArray(recipe.clips) && recipe.clips.length <= PROCEDURAL_ASSET_LIMITS.clips, 'invalid clips')
  const clipIds = new Set<string>()
  for (const clip of recipe.clips) {
    requireValid(object(clip), 'invalid clip')
    keysOnly(clip, ['id', 'duration', 'tracks'])
    requireValid(typeof clip.id === 'string' && idPattern.test(clip.id) && !clipIds.has(clip.id) && finite(clip.duration, 0.05, 60), 'invalid clip identity or duration')
    clipIds.add(clip.id)
    requireValid(Array.isArray(clip.tracks) && clip.tracks.length > 0 && clip.tracks.length <= parts.size, 'invalid clip tracks')
    const tracked = new Set<string>()
    for (const track of clip.tracks) {
      requireValid(object(track), 'invalid track')
      keysOnly(track, ['partId', 'keys'])
      requireValid(typeof track.partId === 'string' && parts.has(track.partId) && !tracked.has(track.partId), 'duplicate or missing track part')
      tracked.add(track.partId)
      requireValid(Array.isArray(track.keys) && track.keys.length >= 2 && track.keys.length <= PROCEDURAL_ASSET_LIMITS.keys, 'invalid key count')
      let previous = -1
      for (const key of track.keys) {
        requireValid(object(key), 'invalid keyframe')
        keysOnly(key, ['time', 'rotation'])
        requireValid(finite(key.time, 0, clip.duration) && key.time > previous && vector(key.rotation, -Math.PI, Math.PI), 'invalid keyframe time or rotation')
        previous = key.time
      }
      requireValid(track.keys[0].time === 0 && previous === clip.duration, 'tracks must cover the complete clip')
    }
  }
  return recipe as ProceduralAssetRecipe
}

export function updateProceduralAssetControl(recipe: ProceduralAssetRecipe, id: string, value?: AssetControlValue): ProceduralAssetRecipe {
  const next = parseProceduralAssetRecipe(recipe)
  const control = next.controls.find(item => item.id === id)
  requireValid(control, 'unknown control')
  const applied = value === undefined ? control.default : value
  requireValid(validateAssetControlValue(control, applied), 'control value outside its schema')
  next.values[id] = applied
  return next
}
