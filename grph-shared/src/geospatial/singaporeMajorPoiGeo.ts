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
  snapshotAt = SNAPSHOT_AT,
): RegionalPoiSourceReference {
  return Object.freeze({
    authority: 'OpenStreetMap contributors',
    sourceId: `openstreetmap:way/${wayId}`,
    sourceUrl: `https://www.openstreetmap.org/way/${wayId}`,
    sourceVersion: String(version),
    snapshotAt,
  })
}

function osmSurface(input: {
  id: string
  poiId: string
  label: string
  category: string
  wayId: number
  wayVersion: number
  sourceTimestamp?: string
  ring: readonly RegionalPoiCoordinate[]
  baseHeightMeters?: number
  heightMeters: number
  statement: string
  context?: readonly RegionalPoiSourceReference[]
}): RegionalPoiSurface {
  const source = osmWayReference(
    input.wayId,
    input.wayVersion,
    input.sourceTimestamp,
  )
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

const ESPLANADE_THEATRES_ON_THE_BAY_RING = [
  [103.8563507, 1.2892255], [103.8563712, 1.2892234],
  [103.8563807, 1.2894071], [103.856396, 1.2897006],
  [103.8563981, 1.2897383], [103.8564013, 1.2897951],
  [103.8564262, 1.2897979], [103.8564188, 1.2898683],
  [103.8563899, 1.289964], [103.8563511, 1.2900244],
  [103.8563087, 1.2900692], [103.8562842, 1.2900885],
  [103.8562259, 1.2901344], [103.8561394, 1.2901713],
  [103.8561231, 1.29014], [103.8560876, 1.2901534],
  [103.8560365, 1.2901727], [103.8559812, 1.2901722],
  [103.855937, 1.2903079], [103.8558132, 1.2902671],
  [103.8558897, 1.2899639], [103.8558885, 1.2899067],
  [103.8558706, 1.2898647], [103.8558452, 1.2898379],
  [103.8557637, 1.2897819], [103.8556784, 1.289745],
  [103.8555778, 1.2897246], [103.8554989, 1.2897348],
  [103.8554428, 1.2897705], [103.8554174, 1.2898163],
  [103.8552459, 1.2902159], [103.8551766, 1.2901515],
  [103.8551064, 1.2900765], [103.8550396, 1.2899725],
  [103.8549994, 1.2898938], [103.8549855, 1.2898587],
  [103.8549508, 1.2897439], [103.8549423, 1.2895978],
  [103.8553728, 1.2897017], [103.8554416, 1.289703],
  [103.8554899, 1.2896775], [103.8555409, 1.2896101],
  [103.8555778, 1.2895375], [103.8556135, 1.2894217],
  [103.8556147, 1.289358], [103.8555905, 1.2892868],
  [103.8555511, 1.2892422], [103.8553086, 1.2891493],
  [103.855323, 1.2891293], [103.8552845, 1.2891011],
  [103.8553352, 1.2890498], [103.8553654, 1.2890802],
  [103.855401, 1.2890545], [103.8554232, 1.2890431],
  [103.8554516, 1.2890317], [103.8554825, 1.2890218],
  [103.8555134, 1.289018], [103.8555515, 1.2890191],
  [103.8555808, 1.2890228], [103.8556079, 1.2890284],
  [103.8556361, 1.2890395], [103.8556602, 1.2890505],
  [103.855677, 1.2890606], [103.8556937, 1.2890726],
  [103.8557276, 1.2891073], [103.8557447, 1.2891274],
  [103.8557599, 1.2891485], [103.855772, 1.2891759],
  [103.8557827, 1.2892077], [103.855791, 1.2892384],
  [103.8557952, 1.2892752], [103.8558947, 1.289269],
  [103.8559682, 1.2893539], [103.8559501, 1.2893648],
  [103.8559396, 1.289375], [103.8559331, 1.2893852],
  [103.8559268, 1.2894001], [103.8559211, 1.2894144],
  [103.855918, 1.2894303], [103.8559193, 1.2894503],
  [103.8559222, 1.2894688], [103.8559298, 1.2894878],
  [103.8559369, 1.2895022], [103.855946, 1.2895134],
  [103.8559551, 1.2895227], [103.8559663, 1.2895299],
  [103.8559789, 1.2895374], [103.8559941, 1.2895435],
  [103.8560124, 1.289548], [103.8560285, 1.2895488],
  [103.8560451, 1.289546], [103.856061, 1.2895424],
  [103.8560738, 1.2895374], [103.8560877, 1.2895289],
  [103.8561004, 1.2895168], [103.8561101, 1.2895052],
  [103.8561166, 1.2894965], [103.856122, 1.2894868],
  [103.8561271, 1.2894717], [103.8561302, 1.2894499],
  [103.8561307, 1.2894367], [103.8561291, 1.2894236],
  [103.8561239, 1.2894029], [103.8561146, 1.2893874],
  [103.8561007, 1.289367], [103.8560845, 1.2893537],
  [103.8560714, 1.2893466], [103.8561369, 1.2892427],
  [103.8563507, 1.2892255],
] as const

const FULLERTON_HOTEL_RING = [
  [103.8527136, 1.2862226], [103.8527127, 1.2862881],
  [103.8527118, 1.2863536], [103.8527497, 1.2864132],
  [103.8528883, 1.2866487], [103.8529382, 1.2867335],
  [103.852989, 1.2867908], [103.853154, 1.2867855],
  [103.8532303, 1.2867407], [103.8532314, 1.2866979],
  [103.853254, 1.286693], [103.8532611, 1.2864877],
  [103.8533104, 1.286488], [103.8533096, 1.2864372],
  [103.8533837, 1.2864362], [103.8534137, 1.2863679],
  [103.8534236, 1.2862849], [103.8534191, 1.2861811],
  [103.853384, 1.2860833], [103.8533059, 1.2860838],
  [103.8533044, 1.2860351], [103.8532499, 1.2860352],
  [103.8532311, 1.2857608], [103.853208, 1.2857594],
  [103.8532041, 1.2857133], [103.8531708, 1.2857124],
  [103.8531787, 1.2856683], [103.8530893, 1.2856502],
  [103.8530004, 1.2856321], [103.8529923, 1.2856769],
  [103.8529561, 1.2856689], [103.8529021, 1.2857877],
  [103.8528783, 1.2857767], [103.8527173, 1.2861348],
  [103.8527517, 1.2861548], [103.8527136, 1.2862226],
] as const

const RAFFLES_HOTEL_RING = [
  [103.8543832, 1.2945481], [103.8546251, 1.2943649],
  [103.8545623, 1.2942821], [103.854507, 1.2942091],
  [103.8542652, 1.2943923], [103.8542779, 1.2944091],
  [103.8543684, 1.2945285], [103.8543832, 1.2945481],
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
  osmSurface({
    id: 'esplanade-theatres-on-the-bay:main-building',
    poiId: 'esplanade-theatres-on-the-bay',
    label: 'Esplanade — Theatres on the Bay',
    category: 'theatre',
    wayId: 97582570,
    wayVersion: 33,
    sourceTimestamp: '2024-04-14T16:45:20Z',
    ring: ESPLANADE_THEATRES_ON_THE_BAY_RING,
    heightMeters: 13,
    statement:
      'The exact closed footprint and 13 metre top height reproduce OpenStreetMap way 97582570 version 33 at its source timestamp.',
  }),
  osmSurface({
    id: 'the-fullerton-hotel:main-building',
    poiId: 'the-fullerton-hotel',
    label: 'The Fullerton Hotel',
    category: 'heritage-hotel',
    wayId: 46595395,
    wayVersion: 27,
    sourceTimestamp: '2024-04-12T11:55:48Z',
    ring: FULLERTON_HOTEL_RING,
    heightMeters: 25,
    statement:
      'The exact closed footprint and explicit 25 metre height tag reproduce OpenStreetMap way 46595395 version 27 at its source timestamp. The generic extrusion contract consumes the current height tag and does not substitute its conflicting building:height value.',
  }),
  osmSurface({
    id: 'raffles-hotel:main-building',
    poiId: 'raffles-hotel',
    label: 'Raffles Hotel',
    category: 'heritage-hotel',
    wayId: 254815862,
    wayVersion: 8,
    sourceTimestamp: '2023-12-05T10:20:00Z',
    ring: RAFFLES_HOTEL_RING,
    heightMeters: 14,
    statement:
      'The exact closed footprint, 14 metre top height, and Raffles Hotel identity reproduce OpenStreetMap way 254815862 version 8 at its source timestamp.',
  }),
]

export const SINGAPORE_MAJOR_POI_GEO_PROFILE: RegionalPoiProfile =
  createRegionalPoiProfile({
    schema: 'agenticgraph.regional-poi-profile/v1',
    id: 'adm0:SGP:major-pois/v1',
    region: {
      code: 'SGP',
      label: 'Singapore',
    },
    revision: '2026-07-31.2',
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
