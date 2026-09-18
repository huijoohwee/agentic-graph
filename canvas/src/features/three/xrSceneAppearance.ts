/** Serializable appearance only. Geometry, colliders and playback retain their existing owners. */
export type XrSceneAppearance = Readonly<{
  skyColor: string
  fogColor: string
  groundColor: string
  waterColor: string
  lightColor: string
  lightIntensity: number
  sunAzimuthDegrees: number
  fogDistanceMeters: number
  detail: 'low' | 'standard'
  shadows: boolean
}>

export const XR_SCENE_APPEARANCE_PRESETS = Object.freeze([
  { id: 'coast', label: 'Coast', skyColor: '#8ed5f3', fogColor: '#c5e8ed', groundColor: '#e7dec1', waterColor: '#229fad', lightColor: '#fff1d0', lightIntensity: 1.8, sunAzimuthDegrees: 35, fogDistanceMeters: 92, detail: 'standard', shadows: true },
  { id: 'golden', label: 'Golden hour', skyColor: '#edc4a9', fogColor: '#f3d8ba', groundColor: '#d8c99c', waterColor: '#527d94', lightColor: '#ffd49a', lightIntensity: 1.6, sunAzimuthDegrees: 105, fogDistanceMeters: 75, detail: 'standard', shadows: true },
  { id: 'studio', label: 'Studio', skyColor: '#cddbe6', fogColor: '#dce5eb', groundColor: '#a9bac6', waterColor: '#6a96ad', lightColor: '#ffffff', lightIntensity: 1.3, sunAzimuthDegrees: -35, fogDistanceMeters: 120, detail: 'low', shadows: true },
] as const)
export const DEFAULT_XR_SCENE_APPEARANCE: XrSceneAppearance = readXrSceneAppearance({})

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback
}
function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
export function readXrSceneAppearance(value: unknown): XrSceneAppearance {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const defaults = XR_SCENE_APPEARANCE_PRESETS[0]
  return Object.freeze({
    skyColor: color(input.skyColor, defaults.skyColor),
    fogColor: color(input.fogColor, defaults.fogColor),
    groundColor: color(input.groundColor, defaults.groundColor),
    waterColor: color(input.waterColor, defaults.waterColor),
    lightColor: color(input.lightColor, defaults.lightColor),
    lightIntensity: bounded(input.lightIntensity, defaults.lightIntensity, 0.2, 4),
    sunAzimuthDegrees: bounded(input.sunAzimuthDegrees, defaults.sunAzimuthDegrees, -180, 180),
    fogDistanceMeters: bounded(input.fogDistanceMeters, defaults.fogDistanceMeters, 40, 180),
    detail: input.detail === 'low' ? 'low' : 'standard',
    shadows: typeof input.shadows === 'boolean' ? input.shadows : defaults.shadows,
  })
}
export function xrSceneAppearancePresetId(value: XrSceneAppearance): string {
  return XR_SCENE_APPEARANCE_PRESETS.find(preset => Object.entries(value).every(([key, item]) => preset[key as keyof typeof preset] === item))?.id || 'custom'
}
export function xrSceneSunPosition(value: XrSceneAppearance, scale: number): [number, number, number] {
  const angle = value.sunAzimuthDegrees * Math.PI / 180
  return [Math.sin(angle) * scale * 16, scale * 19, Math.cos(angle) * scale * 16]
}
