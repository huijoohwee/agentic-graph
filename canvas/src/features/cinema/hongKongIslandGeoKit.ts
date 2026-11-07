/**
 * Approximate real-world Hong Kong Island geography for the Geo+XR cinema
 * kit. Coordinates are WGS84 [lng, lat]; heights are metres above sea level.
 * Values are public-landmark approximations for shot planning, not survey data.
 */

export type GeoCoordinate = readonly [number, number]

/** Environment-kit id of the XR stage that renders this kit. */
export const HONG_KONG_ISLAND_KIT_ID = 'hong-kong-cinema'

export type HongKongIslandLandmarkForm = 'ifc' | 'prism' | 'slab' | 'mast' | 'peak-tower'

export type HongKongIslandLandmark = Readonly<{
  id: string
  label: string
  coordinate: GeoCoordinate
  heightMeters: number
  footprintMeters: readonly [number, number]
  form: HongKongIslandLandmarkForm
}>

export type HongKongIslandHill = Readonly<{
  id: string
  coordinate: GeoCoordinate
  heightMeters: number
  radiusMeters: number
}>

export type HongKongIslandReferenceGroup = 'ifc' | 'peak' | 'harbour' | 'central-western' | 'island-wide'

export type HongKongIslandReferenceLocation = Readonly<{
  index: number
  group: HongKongIslandReferenceGroup
  label: string
  coordinate: GeoCoordinate
  elevationMeters: number
}>

export const HONG_KONG_ISLAND_LANDMARKS: readonly HongKongIslandLandmark[] = Object.freeze([
  { id: 'ifc-2', label: 'Two IFC', coordinate: [114.1588, 22.2856], heightMeters: 412, footprintMeters: [58, 58], form: 'ifc' },
  { id: 'ifc-1', label: 'One IFC', coordinate: [114.1601, 22.2846], heightMeters: 210, footprintMeters: [46, 40], form: 'slab' },
  { id: 'boc-tower', label: 'Bank of China Tower', coordinate: [114.1614, 22.2793], heightMeters: 367, footprintMeters: [52, 52], form: 'prism' },
  { id: 'cheung-kong-center', label: 'Cheung Kong Center', coordinate: [114.1597, 22.2793], heightMeters: 283, footprintMeters: [48, 48], form: 'slab' },
  { id: 'hsbc-main', label: 'HSBC Main Building', coordinate: [114.1594, 22.2803], heightMeters: 179, footprintMeters: [55, 72], form: 'mast' },
  { id: 'jardine-house', label: 'Jardine House', coordinate: [114.1597, 22.2834], heightMeters: 179, footprintMeters: [44, 44], form: 'slab' },
  { id: 'central-plaza', label: 'Central Plaza', coordinate: [114.1739, 22.2799], heightMeters: 374, footprintMeters: [46, 46], form: 'prism' },
  { id: 'hk-convention', label: 'Convention Centre', coordinate: [114.1734, 22.2833], heightMeters: 34, footprintMeters: [220, 120], form: 'slab' },
  { id: 'the-center', label: 'The Center', coordinate: [114.1543, 22.2848], heightMeters: 346, footprintMeters: [44, 44], form: 'mast' },
  { id: 'lippo-centre', label: 'Lippo Centre', coordinate: [114.1648, 22.2792], heightMeters: 186, footprintMeters: [40, 40], form: 'slab' },
  { id: 'peak-tower', label: 'Peak Tower', coordinate: [114.1497, 22.2711], heightMeters: 428, footprintMeters: [40, 30], form: 'peak-tower' },
  { id: 'icc', label: 'ICC', coordinate: [114.1602, 22.3033], heightMeters: 484, footprintMeters: [64, 64], form: 'ifc' },
])

export const HONG_KONG_ISLAND_HILLS: readonly HongKongIslandHill[] = Object.freeze([
  { id: 'victoria-peak', coordinate: [114.1455, 22.2759], heightMeters: 552, radiusMeters: 900 },
  { id: 'high-west', coordinate: [114.1360, 22.2690], heightMeters: 494, radiusMeters: 650 },
  { id: 'mount-gough', coordinate: [114.1537, 22.2706], heightMeters: 479, radiusMeters: 600 },
  { id: 'mount-cameron', coordinate: [114.1700, 22.2620], heightMeters: 439, radiusMeters: 700 },
  { id: 'mount-nicholson', coordinate: [114.1855, 22.2560], heightMeters: 430, radiusMeters: 760 },
  { id: 'jardines-lookout', coordinate: [114.1990, 22.2650], heightMeters: 433, radiusMeters: 700 },
  { id: 'mount-parker', coordinate: [114.2160, 22.2690], heightMeters: 532, radiusMeters: 900 },
  { id: 'mount-davis', coordinate: [114.1220, 22.2770], heightMeters: 269, radiusMeters: 520 },
])

/** The 25 numbered scenes on the Hong Kong Island Bionics Bureau reference sheet. */
export const HONG_KONG_ISLAND_REFERENCE_LOCATIONS: readonly HongKongIslandReferenceLocation[] = Object.freeze([
  { index: 1, group: 'ifc', label: 'Rainy-night observation deck', coordinate: [114.1588, 22.2856], elevationMeters: 416 },
  { index: 2, group: 'ifc', label: 'AI control room', coordinate: [114.1584, 22.2859], elevationMeters: 300 },
  { index: 3, group: 'ifc', label: '108F secret room', coordinate: [114.1592, 22.2853], elevationMeters: 380 },
  { index: 4, group: 'ifc', label: 'Black-gold vault', coordinate: [114.1596, 22.2849], elevationMeters: 4 },
  { index: 5, group: 'ifc', label: 'Signal-shield corridor', coordinate: [114.1588, 22.2856], elevationMeters: 430 },
  { index: 6, group: 'peak', label: 'Fog castle main hall', coordinate: [114.1455, 22.2759], elevationMeters: 556 },
  { index: 7, group: 'peak', label: 'Matrix lab', coordinate: [114.1497, 22.2711], elevationMeters: 380 },
  { index: 8, group: 'peak', label: 'Century-old house archives', coordinate: [114.1520, 22.2690], elevationMeters: 400 },
  { index: 9, group: 'peak', label: 'Mid-Levels EM shield grove', coordinate: [114.1520, 22.2800], elevationMeters: 140 },
  { index: 10, group: 'peak', label: 'Hidden mountain passage', coordinate: [114.1400, 22.2730], elevationMeters: 420 },
  { index: 11, group: 'harbour', label: 'Mist signal platform', coordinate: [114.1660, 22.2900], elevationMeters: 6 },
  { index: 12, group: 'harbour', label: 'Submarine cable base', coordinate: [114.1610, 22.2880], elevationMeters: 2 },
  { index: 13, group: 'harbour', label: 'Midnight empty channel', coordinate: [114.1720, 22.2885], elevationMeters: 2 },
  { index: 14, group: 'harbour', label: 'Cross-sea data airspace', coordinate: [114.1680, 22.2905], elevationMeters: 120 },
  { index: 15, group: 'harbour', label: 'Underwater equipment cabin', coordinate: [114.1760, 22.2895], elevationMeters: 1 },
  { index: 16, group: 'central-western', label: 'Abandoned server room', coordinate: [114.1580, 22.2820], elevationMeters: 40 },
  { index: 17, group: 'central-western', label: 'Underground finance tunnel', coordinate: [114.1570, 22.2830], elevationMeters: 2 },
  { index: 18, group: 'central-western', label: 'Smart warehouse pier', coordinate: [114.1400, 22.2900], elevationMeters: 4 },
  { index: 19, group: 'central-western', label: 'Power-cut neon streets', coordinate: [114.1550, 22.2810], elevationMeters: 8 },
  { index: 20, group: 'central-western', label: 'Abandoned penthouse', coordinate: [114.1543, 22.2848], elevationMeters: 350 },
  { index: 21, group: 'island-wide', label: 'Global signal relay tower', coordinate: [114.1700, 22.2620], elevationMeters: 470 },
  { index: 22, group: 'island-wide', label: 'Cable tunnel loop', coordinate: [114.1850, 22.2780], elevationMeters: 2 },
  { index: 23, group: 'island-wide', label: 'Smart parking cabin', coordinate: [114.1900, 22.2830], elevationMeters: 6 },
  { index: 24, group: 'island-wide', label: 'Silent weather station', coordinate: [114.2160, 22.2690], elevationMeters: 560 },
  { index: 25, group: 'island-wide', label: 'Border shield blind zone', coordinate: [114.1300, 22.2600], elevationMeters: 300 },
])

export const HONG_KONG_ISLAND_REFERENCE_GROUP_COLORS: Readonly<Record<HongKongIslandReferenceGroup, string>> = Object.freeze({
  ifc: '#35e0ff',
  peak: '#c45bff',
  harbour: '#3d9bff',
  'central-western': '#ff5a36',
  'island-wide': '#3dff9e',
})

/** Star Ferry Tsim Sha Tsui ↔ Central route, WGS84. */
export const HONG_KONG_STAR_FERRY_ROUTE: readonly GeoCoordinate[] = Object.freeze([
  [114.1686, 22.2939],
  [114.1660, 22.2905],
  [114.1610, 22.2870],
])

/** Hong Kong Tramways corridor along Des Voeux Road / Queensway, WGS84. */
export const HONG_KONG_TRAM_CORRIDOR: readonly GeoCoordinate[] = Object.freeze([
  [114.1500, 22.2870],
  [114.1560, 22.2843],
  [114.1600, 22.2818],
  [114.1660, 22.2790],
  [114.1730, 22.2780],
])

const EARTH_CIRCUMFERENCE_METERS = 2 * Math.PI * 6_371_008.8
const MAX_MERCATOR_LATITUDE = 85.051129

const mercatorY = (latitude: number): number => {
  const clamped = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude))
  const radians = clamped * Math.PI / 180
  return (180 - 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + radians / 2))) / 360
}

/**
 * Local metres (east, south) from `origin`, using the same Mercator frame as
 * the Geo+XR projection so XR geometry and MapLibre tiles share one scale.
 */
export function geoLocalMeters(coordinate: GeoCoordinate, origin: GeoCoordinate): readonly [number, number] {
  const latitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, Number(origin[1])))
  const metersPerMercatorUnit = EARTH_CIRCUMFERENCE_METERS * Math.max(0.01, Math.cos(latitude * Math.PI / 180))
  const longitudeDelta = ((Number(coordinate[0]) - Number(origin[0]) + 540) % 360) - 180
  return [
    longitudeDelta / 360 * metersPerMercatorUnit,
    (mercatorY(Number(coordinate[1])) - mercatorY(Number(origin[1]))) * metersPerMercatorUnit,
  ]
}

/** Combined hill height (metres) at a local point, max of radial cosine domes. */
export function hongKongIslandTerrainHeight(
  east: number,
  south: number,
  hills: readonly Readonly<{ east: number; south: number; heightMeters: number; radiusMeters: number }>[],
): number {
  let height = 0
  for (const hill of hills) {
    const distance = Math.hypot(east - hill.east, south - hill.south) / hill.radiusMeters
    if (distance >= 1) continue
    const falloff = 0.5 + 0.5 * Math.cos(Math.PI * distance)
    height = Math.max(height, hill.heightMeters * falloff * falloff * (2 - falloff))
  }
  return height
}

