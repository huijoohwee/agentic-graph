import { emitGeospatialModeChanged } from 'grph-shared/geospatial/events'
import type { NormalizedEnhancedConfig } from 'grph-shared/geospatial/enhancedLayerContract'
import { readGeospatialOverlayEnabledPreference, writeGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'

const toErrorMessage = (err: unknown): string => {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message
    const text = String(msg || '').trim()
    if (text) return text
  }
  return 'Unknown error'
}

function publishGeospatialModeEnabled(enabled: boolean, opts?: { emitAlways?: boolean }): boolean {
  const next = enabled === true
  let previous = next
  try {
    previous = readGeospatialOverlayEnabledPreference()
  } catch {
    previous = next
  }
  writeGeospatialOverlayEnabledPreference(next)
  if (opts?.emitAlways === true || previous !== next) {
    try {
      emitGeospatialModeChanged({ enabled: next })
    } catch {
      void 0
    }
  }
  return previous
}

export function publishGeospatialModeEnabledState(enabled: boolean): boolean {
  return publishGeospatialModeEnabled(enabled, { emitAlways: true })
}

export async function importGympgrph(): Promise<typeof import('gympgrph')> {
  try {
    return await import('gympgrph')
  } catch (err) {
    throw new Error(toErrorMessage(err))
  }
}

export async function preloadGeospatialMapRuntime(): Promise<void> {
  const module = await importGympgrph()
  await module.preloadMapLibreBasemapRuntime()
}

export async function readGeospatialModeEnabled(): Promise<boolean> {
  const m = await importGympgrph()
  if (typeof m.isGeospatialModeEnabled !== 'function') return false
  try {
    return Boolean(m.isGeospatialModeEnabled())
  } catch {
    return false
  }
}

export async function readEnhancedGeospatialConfig(): Promise<NormalizedEnhancedConfig> {
  const m = await importGympgrph()
  if (typeof m.readEnhancedLayerConfig !== 'function') {
    throw new Error('Enhanced geospatial configuration API is unavailable')
  }
  return m.readEnhancedLayerConfig()
}

export async function readEnhancedGeospatialEditorState() {
  const m = await importGympgrph()
  if (typeof m.readEnhancedLayerEditorState !== 'function') {
    throw new Error('Enhanced geospatial editor API is unavailable')
  }
  return m.readEnhancedLayerEditorState()
}

export async function writeEnhancedGeospatialConfig(raw: unknown): Promise<boolean> {
  const m = await importGympgrph()
  if (typeof m.writeEnhancedLayerConfig !== 'function') {
    throw new Error('Enhanced geospatial configuration write API is unavailable')
  }
  return m.writeEnhancedLayerConfig(raw)
}

export async function clearEnhancedGeospatialConfigOverride(): Promise<boolean> {
  const m = await importGympgrph()
  if (typeof m.clearEnhancedLayerConfigOverride !== 'function') {
    throw new Error('Enhanced geospatial configuration reset API is unavailable')
  }
  return m.clearEnhancedLayerConfigOverride()
}

export async function toggleGeospatialModeEnabled(): Promise<boolean> {
  const m = await importGympgrph()
  if (typeof m.isGeospatialModeEnabled !== 'function') {
    throw new Error('Geospatial mode API is unavailable')
  }
  const enabled = m.isGeospatialModeEnabled()
  publishGeospatialModeEnabled(!enabled, { emitAlways: true })
  if (typeof m.setGeospatialModeEnabled === 'function') {
    m.setGeospatialModeEnabled(!enabled)
  } else if (typeof m.toggleGeospatialModeEnabled === 'function') {
    m.toggleGeospatialModeEnabled()
  } else {
    throw new Error('Geospatial mode toggle API is unavailable')
  }
  return Boolean(m.isGeospatialModeEnabled())
}

export async function setGeospatialModeEnabled(
  enabled: boolean,
  dependencies: {
    loadRuntime?: typeof importGympgrph
    publishMode?: typeof publishGeospatialModeEnabled
  } = {},
): Promise<boolean> {
  const next = enabled === true
  const publishMode = dependencies.publishMode || publishGeospatialModeEnabled
  const previous = publishMode(next, { emitAlways: true })
  let m: typeof import('gympgrph')
  try {
    m = await (dependencies.loadRuntime || importGympgrph)()
  } catch (error) {
    publishMode(previous, { emitAlways: true })
    throw error
  }
  if (typeof m.isGeospatialModeEnabled !== 'function') {
    publishMode(previous, { emitAlways: true })
    throw new Error('Geospatial mode API is unavailable')
  }
  const current = Boolean(m.isGeospatialModeEnabled())
  if (current === next) return current
  if (typeof m.setGeospatialModeEnabled === 'function') {
    m.setGeospatialModeEnabled(next)
    const resolved = Boolean(m.isGeospatialModeEnabled())
    if (resolved !== next) publishMode(resolved, { emitAlways: true })
    return resolved
  }
  if (typeof m.toggleGeospatialModeEnabled === 'function') {
    m.toggleGeospatialModeEnabled()
    const resolved = Boolean(m.isGeospatialModeEnabled())
    if (resolved !== next) publishMode(resolved, { emitAlways: true })
    return resolved
  }
  publishMode(previous, { emitAlways: true })
  throw new Error('Geospatial mode toggle API is unavailable')
}

export async function requestGeospatialTraversalRun(args?: { edgeIds?: string[] | null }): Promise<void> {
  const m = await importGympgrph()
  if (typeof m.requestGeospatialTraversalRun !== 'function') {
    throw new Error('Geospatial traversal API is unavailable')
  }
  m.requestGeospatialTraversalRun(args)
}

export async function requestGeospatialCurrentLocation(args: { lat: number; lng: number; zoom?: number }): Promise<void> {
  const m = await importGympgrph()
  if (typeof m.requestGeospatialCurrentLocation !== 'function') {
    throw new Error('Geospatial current location API is unavailable')
  }
  m.requestGeospatialCurrentLocation(args)
}

export async function setEnhancedGeospatialLayerVisibility(
  kind: 'extrusion' | 'asset',
  id: string,
  visible: boolean,
): Promise<boolean> {
  const m = await importGympgrph()
  if (typeof m.setEnhancedLayerVisibility !== 'function') {
    throw new Error('Enhanced geospatial layer API is unavailable')
  }
  return m.setEnhancedLayerVisibility(kind, id, visible)
}

export async function setEnhancedGeospatialTagVisibility(tag: string, visible: boolean): Promise<readonly string[]> {
  const m = await importGympgrph()
  if (typeof m.setEnhancedTagVisibility !== 'function') {
    throw new Error('Enhanced geospatial tag API is unavailable')
  }
  return m.setEnhancedTagVisibility(tag, visible)
}

export async function requestGeospatialFitToBounds(
  bounds: readonly [number, number, number, number],
): Promise<void> {
  const m = await importGympgrph()
  if (typeof m.requestGeospatialFitToBounds !== 'function') {
    throw new Error('Geospatial bounds fit API is unavailable')
  }
  m.requestGeospatialFitToBounds(bounds)
}
