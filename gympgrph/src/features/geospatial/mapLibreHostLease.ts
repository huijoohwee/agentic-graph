export const NATIVE_GEOSPATIAL_MAPLIBRE_OWNER = 'native-geospatial-host'

export type MapLibreMapOwnerScope =
  | typeof NATIVE_GEOSPATIAL_MAPLIBRE_OWNER
  | 'embedded-preview'

export type NativeGeospatialMapLibreLease = Readonly<{
  cancelDisposalPreparation: () => void
  canvas: HTMLCanvasElement | null
  dispose: () => void
  id: number
  isCurrent: () => boolean
  isPreparedForDisposal: () => boolean
  map: any
  prepareForDisposal: () => boolean
  root: HTMLElement | null
}>

let leaseSequence = 0
let activeNativeLease: NativeGeospatialMapLibreLease | null = null
const disposalStateByMap = new WeakMap<
  object,
  { count: number; listeners: Set<() => void> }
>()

function readMapObject(map: any): object | null {
  return map && (typeof map === 'object' || typeof map === 'function')
    ? map as object
    : null
}

function readDisposalState(map: any) {
  const mapObject = readMapObject(map)
  if (!mapObject) return null
  let state = disposalStateByMap.get(mapObject)
  if (!state) {
    state = { count: 0, listeners: new Set() }
    disposalStateByMap.set(mapObject, state)
  }
  return state
}

function notifyDisposalState(state: { listeners: Set<() => void> }): void {
  for (const listener of state.listeners) {
    try {
      listener()
    } catch {
      void 0
    }
  }
}

export function acquireMapLibreMapDisposalPreparation(map: any): () => void {
  const state = readDisposalState(map)
  if (!state) return () => void 0
  state.count += 1
  if (state.count === 1) notifyDisposalState(state)
  let released = false
  return () => {
    if (released) return
    released = true
    state.count = Math.max(0, state.count - 1)
    if (state.count === 0) notifyDisposalState(state)
  }
}

export function isMapLibreMapPreparingForDisposal(map: any): boolean {
  return (readDisposalState(map)?.count ?? 0) > 0
}

export function subscribeMapLibreMapDisposalPreparation(
  map: any,
  listener: () => void,
): () => void {
  const state = readDisposalState(map)
  if (!state) return () => void 0
  state.listeners.add(listener)
  return () => state.listeners.delete(listener)
}

function readMapCanvas(map: any): HTMLCanvasElement | null {
  try {
    const canvas = map?.getCanvas?.()
    return canvas && typeof canvas === 'object'
      ? canvas as HTMLCanvasElement
      : null
  } catch {
    return null
  }
}

export function claimMapLibreMapLease(options: Readonly<{
  cancelDisposalPreparation?: () => void
  dispose?: () => void
  isPreparedForDisposal?: () => boolean
  map: any
  ownerScope: MapLibreMapOwnerScope
  prepareForDisposal?: () => boolean
  root: HTMLElement | null
}>): () => void {
  if (
    options.ownerScope !== NATIVE_GEOSPATIAL_MAPLIBRE_OWNER
    || !options.map
  ) {
    return () => void 0
  }
  const leaseId = ++leaseSequence
  const lease: NativeGeospatialMapLibreLease = Object.freeze({
    cancelDisposalPreparation:
      options.cancelDisposalPreparation ?? (() => void 0),
    canvas: readMapCanvas(options.map),
    dispose: options.dispose ?? (() => void 0),
    id: leaseId,
    isCurrent: () => activeNativeLease === lease,
    isPreparedForDisposal:
      options.isPreparedForDisposal ?? (() => false),
    map: options.map,
    prepareForDisposal: options.prepareForDisposal ?? (() => true),
    root: options.root,
  })
  activeNativeLease = lease
  return () => {
    if (activeNativeLease === lease) activeNativeLease = null
  }
}

export function captureNativeGeospatialMapLibreLease():
  NativeGeospatialMapLibreLease | null {
  return activeNativeLease
}

export function readActiveNativeGeospatialMapLibreMap(): any | null {
  return activeNativeLease?.map ?? null
}
