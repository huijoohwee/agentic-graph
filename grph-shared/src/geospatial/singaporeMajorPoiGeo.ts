import {
  createRegionalPoiProfile,
  type RegionalPoiCoordinate,
  type RegionalPoiProfile,
  type RegionalPoiSourceReference,
  type RegionalPoiSurface,
} from './regionalPoiGeo.js'
import {
  SINGAPORE_MAJOR_POI_IDENTITIES,
} from './singaporeMajorPoiIdentity.js'

const SNAPSHOT_AT = '2026-07-31T00:00:00Z'

const MARINA_BAY_SANDS_OFFICIAL_CONTEXT = Object.freeze({
  authority: 'Marina Bay Sands',
  sourceId: 'marina-bay-sands:architecture',
  sourceUrl:
    'https://www.marinabaysands.com/guides/exceptional-experiences/marina-bay-sands-architecture.html',
  sourceVersion: 'accessed-2026-07-31',
  snapshotAt: SNAPSHOT_AT,
}) satisfies RegionalPoiSourceReference

const SINGAPORE_FLYER_OFFICIAL_SOURCE = Object.freeze({
  authority: 'Singapore Flyer',
  sourceId: 'singapore-flyer:fun-facts',
  sourceUrl: 'https://www.singaporeflyer.com/en/fun-facts',
  sourceVersion: 'accessed-2026-07-31',
  snapshotAt: SNAPSHOT_AT,
}) satisfies RegionalPoiSourceReference

const GARDENS_BY_THE_BAY_OFFICIAL_CONTEXT = Object.freeze({
  authority: 'Gardens by the Bay',
  sourceId: 'gardens-by-the-bay:supertrees-2007',
  sourceUrl:
    'https://www.gardensbythebay.com.sg/en/about-us/media-room/2007.html',
  sourceVersion: 'accessed-2026-07-31',
  snapshotAt: SNAPSHOT_AT,
}) satisfies RegionalPoiSourceReference

function osmWayReference(
  wayId: number,
  version: number,
): RegionalPoiSourceReference {
  return Object.freeze({
    authority: 'OpenStreetMap contributors',
    sourceId: `openstreetmap:way/${wayId}`,
    sourceUrl: `https://www.openstreetmap.org/way/${wayId}`,
    sourceVersion: String(version),
    snapshotAt: SNAPSHOT_AT,
  })
}

function osmSurface(input: {
  id: string
  poiId: string
  label: string
  category: string
  wayId: number
  wayVersion: number
  ring: readonly RegionalPoiCoordinate[]
  baseHeightMeters?: number
  heightMeters: number
  statement: string
  context?: readonly RegionalPoiSourceReference[]
}): RegionalPoiSurface {
  const source = osmWayReference(input.wayId, input.wayVersion)
  return {
    id: input.id,
    poiId: input.poiId,
    label: input.label,
    category: input.category,
    geometry: {
      type: 'Polygon',
      coordinates: [input.ring],
    },
    baseHeightMeters: input.baseHeightMeters ?? 0,
    heightMeters: input.heightMeters,
    accuracy: {
      footprint: 'source-polygon',
      height: 'source-recorded',
      statement: input.statement,
    },
    provenance: {
      geometry: source,
      height: source,
      context: input.context ?? [],
    },
  }
}

const MBS_TOWER_1_RING = [
  [103.8605263, 1.2827539], [103.8604802, 1.2827859],
  [103.8601414, 1.2830212], [103.8599199, 1.2827024],
  [103.8598409, 1.2825888], [103.8602258, 1.2823215],
  [103.8605263, 1.2827539],
] as const

const MBS_TOWER_2_RING = [
  [103.8606018, 1.2839324], [103.860369, 1.2834367],
  [103.8607815, 1.2832456], [103.8610143, 1.2837414],
  [103.860892, 1.2837988], [103.8606018, 1.2839324],
] as const

const MBS_TOWER_3_RING = [
  [103.8611752, 1.2846907], [103.8611459, 1.284699],
  [103.8610342, 1.2847306], [103.8610137, 1.2846581],
  [103.8609398, 1.284679], [103.8608858, 1.2846942],
  [103.8607721, 1.2842924], [103.8610409, 1.2842163],
  [103.8611752, 1.2846907],
] as const

const MBS_SKYPARK_RING = [
  [103.8609826, 1.2848989], [103.8610173, 1.285036],
  [103.8610442, 1.2850909], [103.8610808, 1.2851351],
  [103.8611099, 1.2851541], [103.8611359, 1.2851574],
  [103.8611632, 1.2851505], [103.8611939, 1.2851262],
  [103.8612164, 1.2850935], [103.8612318, 1.2850442],
  [103.8612425, 1.2849657], [103.8612569, 1.2848545],
  [103.8612302, 1.2846658], [103.8611969, 1.2844555],
  [103.8611461, 1.284261], [103.8610867, 1.2840541],
  [103.8609999, 1.2838001], [103.8608748, 1.2835139],
  [103.8607372, 1.2832315], [103.8605401, 1.2829092],
  [103.8604051, 1.2826851], [103.8600916, 1.2822886],
  [103.859959, 1.2823283], [103.8598747, 1.2824039],
  [103.8598239, 1.2825055], [103.8599698, 1.282688],
  [103.8601815, 1.2829848], [103.8602257, 1.2830433],
  [103.8603308, 1.2832159], [103.860497, 1.2835257],
  [103.8606228, 1.2838056], [103.8606844, 1.2839598],
  [103.860746, 1.2841248], [103.860846, 1.2844417],
  [103.8609147, 1.2847022], [103.8609826, 1.2848989],
] as const

const SINGAPORE_FLYER_WHEEL_RING = [
  [103.8625828, 1.2890295], [103.8636235, 1.2898476],
  [103.8636678, 1.2897913], [103.8626271, 1.2889732],
  [103.8625828, 1.2890295],
] as const

const SUPERTREE_681695804_RING = [
  [103.8634673, 1.2819593], [103.8634522, 1.2819617],
  [103.8634391, 1.2819696], [103.8634299, 1.2819818],
  [103.8634261, 1.2819967], [103.8634281, 1.2820119],
  [103.8634357, 1.2820251], [103.863438, 1.2820276],
  [103.8634508, 1.2820359], [103.8634659, 1.2820388],
  [103.8634809, 1.2820359], [103.8634937, 1.2820274],
  [103.8635023, 1.2820147], [103.8635055, 1.2819998],
  [103.8635029, 1.2819847], [103.8634947, 1.2819718],
  [103.8634822, 1.2819628], [103.8634673, 1.2819593],
] as const

const SUPERTREE_572839881_RING = [
  [103.8640295, 1.2818615], [103.8640131, 1.2818452],
  [103.8639941, 1.2818322], [103.863973, 1.2818229],
  [103.8639505, 1.2818176], [103.8639275, 1.2818165],
  [103.8639046, 1.2818197], [103.8638827, 1.281827],
  [103.8638625, 1.2818383], [103.8638447, 1.281853],
  [103.86383, 1.2818708], [103.8638188, 1.2818909],
  [103.8638114, 1.2819128], [103.8638083, 1.2819357],
  [103.8638093, 1.2819587], [103.8638146, 1.2819812],
  [103.8638239, 1.2820023], [103.863837, 1.2820214],
  [103.8638533, 1.2820377], [103.8638724, 1.2820507],
  [103.8638935, 1.2820601], [103.8639159, 1.2820653],
  [103.863939, 1.2820664], [103.8639619, 1.2820632],
  [103.8639838, 1.2820559], [103.8640039, 1.2820446],
  [103.8640217, 1.2820299], [103.8640365, 1.2820121],
  [103.8640477, 1.2819919], [103.864055, 1.28197],
  [103.8640582, 1.2819472], [103.8640571, 1.2819242],
  [103.8640519, 1.2819017], [103.8640425, 1.2818806],
  [103.8640295, 1.2818615],
] as const

const SUPERTREE_572839873_RING = [
  [103.8642248, 1.2823002], [103.8642124, 1.2822805],
  [103.8641962, 1.2822674], [103.8641768, 1.2822599],
  [103.864156, 1.2822587], [103.8641358, 1.2822639],
  [103.8641182, 1.282275], [103.8641049, 1.282291],
  [103.8640971, 1.2823103], [103.8640956, 1.2823311],
  [103.8641006, 1.2823513], [103.8641131, 1.2823709],
  [103.8641316, 1.282385], [103.8641537, 1.282392],
  [103.864177, 1.282391], [103.8641985, 1.2823822],
  [103.8642157, 1.2823665], [103.8642265, 1.282346],
  [103.8642296, 1.2823229], [103.8642248, 1.2823002],
] as const

const SUPERTREE_681695795_RING = [
  [103.8638425, 1.2823918], [103.8638272, 1.2823942],
  [103.8638139, 1.2824022], [103.8638046, 1.2824146],
  [103.8638008, 1.2824296], [103.8638028, 1.2824449],
  [103.8638106, 1.2824583], [103.8638128, 1.2824608],
  [103.8638258, 1.2824692], [103.863841, 1.2824722],
  [103.8638562, 1.2824692], [103.8638691, 1.2824606],
  [103.8638779, 1.2824478], [103.8638811, 1.2824327],
  [103.8638784, 1.2824174], [103.8638701, 1.2824044],
  [103.8638576, 1.2823954], [103.8638425, 1.2823918],
] as const

const MBS_OFFICIAL_CONTEXT_STATEMENT =
  'The dated OSM polygon and height tags are the render authority. The official Marina Bay Sands architecture page is context only: it describes the towers as about 191 metres and the rooftop observation deck as 200 metres.'

const SUPERTREE_OFFICIAL_CONTEXT_STATEMENT =
  'The dated OSM polygon and height tags are the render authority. The official Gardens by the Bay page provides a contextual 25 to 50 metre range for Supertrees.'

const surfaces: readonly RegionalPoiSurface[] = [
  osmSurface({
    id: 'marina-bay-sands:tower-1',
    poiId: 'marina-bay-sands',
    label: 'Marina Bay Sands Tower 1',
    category: 'tower',
    wayId: 116801004,
    wayVersion: 24,
    ring: MBS_TOWER_1_RING,
    heightMeters: 193,
    statement: MBS_OFFICIAL_CONTEXT_STATEMENT,
    context: [MARINA_BAY_SANDS_OFFICIAL_CONTEXT],
  }),
  osmSurface({
    id: 'marina-bay-sands:tower-2',
    poiId: 'marina-bay-sands',
    label: 'Marina Bay Sands Tower 2',
    category: 'tower',
    wayId: 172307472,
    wayVersion: 20,
    ring: MBS_TOWER_2_RING,
    heightMeters: 193,
    statement: MBS_OFFICIAL_CONTEXT_STATEMENT,
    context: [MARINA_BAY_SANDS_OFFICIAL_CONTEXT],
  }),
  osmSurface({
    id: 'marina-bay-sands:tower-3',
    poiId: 'marina-bay-sands',
    label: 'Marina Bay Sands Tower 3',
    category: 'tower',
    wayId: 172307471,
    wayVersion: 22,
    ring: MBS_TOWER_3_RING,
    heightMeters: 193,
    statement: MBS_OFFICIAL_CONTEXT_STATEMENT,
    context: [MARINA_BAY_SANDS_OFFICIAL_CONTEXT],
  }),
  osmSurface({
    id: 'marina-bay-sands:skypark',
    poiId: 'marina-bay-sands',
    label: 'Marina Bay Sands SkyPark',
    category: 'skypark',
    wayId: 116800998,
    wayVersion: 37,
    ring: MBS_SKYPARK_RING,
    baseHeightMeters: 193,
    heightMeters: 207,
    statement: MBS_OFFICIAL_CONTEXT_STATEMENT,
    context: [MARINA_BAY_SANDS_OFFICIAL_CONTEXT],
  }),
  {
    id: 'singapore-flyer:wheel',
    poiId: 'singapore-flyer',
    label: 'Singapore Flyer',
    category: 'observation-wheel',
    geometry: {
      type: 'Polygon',
      coordinates: [SINGAPORE_FLYER_WHEEL_RING],
    },
    baseHeightMeters: 0,
    heightMeters: 165,
    accuracy: {
      footprint: 'source-polygon',
      height: 'official-published',
      statement:
        'The exact closed ring reproduces OpenStreetMap way 230082125 version 19, whose mapped big-wheel area is aligned with the wheel plane. The official 165 metre top height supplies geographic massing only; a MapLibre fill extrusion is not the wheel morphology or a podium footprint.',
    },
    provenance: {
      geometry: osmWayReference(230082125, 19),
      height: SINGAPORE_FLYER_OFFICIAL_SOURCE,
      context: [],
    },
  },
  osmSurface({
    id: 'gardens-by-the-bay:supertree-681695804',
    poiId: 'gardens-by-the-bay',
    label: 'Gardens by the Bay Supertree 681695804',
    category: 'supertree',
    wayId: 681695804,
    wayVersion: 4,
    ring: SUPERTREE_681695804_RING,
    baseHeightMeters: 17,
    heightMeters: 33,
    statement:
      `Footprint, 17 metre minimum height, and 33 metre top height reproduce the dated OpenStreetMap way. ${SUPERTREE_OFFICIAL_CONTEXT_STATEMENT}`,
    context: [GARDENS_BY_THE_BAY_OFFICIAL_CONTEXT],
  }),
  osmSurface({
    id: 'gardens-by-the-bay:supertree-572839881',
    poiId: 'gardens-by-the-bay',
    label: 'Gardens by the Bay Supertree 572839881',
    category: 'supertree',
    wayId: 572839881,
    wayVersion: 6,
    ring: SUPERTREE_572839881_RING,
    heightMeters: 46,
    statement:
      `Footprint and 46 metre top height reproduce the dated OpenStreetMap way. ${SUPERTREE_OFFICIAL_CONTEXT_STATEMENT}`,
    context: [GARDENS_BY_THE_BAY_OFFICIAL_CONTEXT],
  }),
  osmSurface({
    id: 'gardens-by-the-bay:supertree-572839873',
    poiId: 'gardens-by-the-bay',
    label: 'Gardens by the Bay Supertree 572839873',
    category: 'supertree',
    wayId: 572839873,
    wayVersion: 6,
    ring: SUPERTREE_572839873_RING,
    baseHeightMeters: 33,
    heightMeters: 36,
    statement:
      `Footprint, 33 metre minimum height, and 36 metre top height reproduce the dated OpenStreetMap way. ${SUPERTREE_OFFICIAL_CONTEXT_STATEMENT}`,
    context: [GARDENS_BY_THE_BAY_OFFICIAL_CONTEXT],
  }),
  osmSurface({
    id: 'gardens-by-the-bay:supertree-681695795',
    poiId: 'gardens-by-the-bay',
    label: 'Gardens by the Bay Supertree 681695795',
    category: 'supertree',
    wayId: 681695795,
    wayVersion: 4,
    ring: SUPERTREE_681695795_RING,
    baseHeightMeters: 27,
    heightMeters: 33,
    statement:
      `Footprint, 27 metre minimum height, and 33 metre top height reproduce the dated OpenStreetMap way. ${SUPERTREE_OFFICIAL_CONTEXT_STATEMENT}`,
    context: [GARDENS_BY_THE_BAY_OFFICIAL_CONTEXT],
  }),
]

export const SINGAPORE_MAJOR_POI_GEO_PROFILE: RegionalPoiProfile =
  createRegionalPoiProfile({
    schema: 'knowgrph.regional-poi-profile/v1',
    id: 'adm0:SGP:major-pois/v1',
    region: {
      code: 'SGP',
      label: 'Singapore',
    },
    revision: '2026-07-31.1',
    dataPolicy: {
      storage: 'checked-in',
      runtimeNetwork: 'forbidden',
    },
    attribution: [{
      text: '© OpenStreetMap contributors',
      url: 'https://www.openstreetmap.org/copyright',
      licenseName: 'Open Data Commons Open Database License 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    }],
    pois: SINGAPORE_MAJOR_POI_IDENTITIES,
    surfaces,
  })
