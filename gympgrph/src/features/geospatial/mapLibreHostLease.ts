export const NATIVE_GEOSPATIAL_MAPLIBRE_OWNER = 'native-geospatial-host'

export type MapLibreMapOwnerScope =
  | typeof NATIVE_GEOSPATIAL_MAPLIBRE_OWNER
  | 'embedded-preview'

export type NativeGeospatialMapLibreLease = Readonly<{
  canvas: HTMLCanvasElement | null
  id: number
  isCurrent: () => boolean
  map: any
  root: HTMLElement | null
}>

let leaseSequence = 0
let activeNativeLease: NativeGeospatialMapLibreLease | null = null

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
  map: any
  ownerScope: MapLibreMapOwnerScope
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
    canvas: readMapCanvas(options.map),
    id: leaseId,
    isCurrent: () => activeNativeLease === lease,
    map: options.map,
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
