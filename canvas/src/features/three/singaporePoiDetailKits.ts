import { createProceduralAssetFromText } from '@/features/image-to-glb/proceduralAssetTextRecipe'

/** Optional, schematic visual assets keyed to the regional profile's stable POI identities. */
export const SINGAPORE_POI_DETAIL_KITS = Object.freeze([
  {
    poiId: 'national-gallery-singapore',
    assetId: 'poi-detail-national-gallery-singapore',
    label: 'National Gallery Singapore',
    description: 'Schematic civic and cultural building detail; the regional profile retains footprint authority.',
    intent: 'white building',
    dimensionsMeters: [1.6, 3, 1.2] as const,
    defaultColor: '#e6ebe8',
    keywords: ['gallery', 'civic', 'cultural', 'building', 'singapore'],
  },
  {
    poiId: 'marina-barrage',
    assetId: 'poi-detail-marina-barrage',
    label: 'Marina Barrage',
    description: 'Schematic blue water-management landmark detail for an authored regional scene.',
    intent: 'blue building',
    dimensionsMeters: [1.6, 3, 1.2] as const,
    defaultColor: '#5195d9',
    keywords: ['water', 'civic', 'infrastructure', 'building', 'singapore'],
  },
  {
    poiId: 'merlion-park',
    assetId: 'poi-detail-merlion-park',
    label: 'Merlion Park',
    description: 'Schematic green landscape detail; profile surfaces preserve the sourced park footprint.',
    intent: 'green landscape',
    dimensionsMeters: [3.8, 1.6, 2.2] as const,
    defaultColor: '#47ad85',
    keywords: ['park', 'green', 'landscape', 'waterfront', 'singapore'],
  },
  {
    poiId: 'suntec-singapore-convention-exhibition-centre',
    assetId: 'poi-detail-suntec-singapore-convention-exhibition-centre',
    label: 'Suntec Singapore Convention & Exhibition Centre',
    description: 'Schematic commercial and civic building detail for an authored regional scene.',
    intent: 'blue building',
    dimensionsMeters: [1.6, 3, 1.2] as const,
    defaultColor: '#5195d9',
    keywords: ['convention', 'commercial', 'civic', 'building', 'singapore'],
  },
  {
    poiId: 'marina-bay-cruise-centre',
    assetId: 'poi-detail-marina-bay-cruise-centre',
    label: 'Marina Bay Cruise Centre',
    description: 'Schematic passenger-vessel detail for a waterfront scene; no navigation data is implied.',
    intent: 'white ship',
    dimensionsMeters: [1, 1.1, 2.6] as const,
    defaultColor: '#e6ebe8',
    keywords: ['waterfront', 'transit', 'ship', 'cruise', 'singapore'],
  },
  {
    poiId: 'the-shoppes-at-marina-bay-sands',
    assetId: 'poi-detail-the-shoppes-at-marina-bay-sands',
    label: 'The Shoppes at Marina Bay Sands',
    description: 'Schematic commercial building detail for a waterfront city scene.',
    intent: 'orange building',
    dimensionsMeters: [1.6, 3, 1.2] as const,
    defaultColor: '#e49a52',
    keywords: ['shopping', 'commercial', 'waterfront', 'building', 'singapore'],
  },
] as const)

export type SingaporePoiDetailKit = (typeof SINGAPORE_POI_DETAIL_KITS)[number]

export function resolveSingaporePoiDetailKitByPoiId(poiId: string): SingaporePoiDetailKit | undefined {
  return SINGAPORE_POI_DETAIL_KITS.find(kit => kit.poiId === poiId)
}

export function resolveSingaporePoiDetailKitByAssetId(assetId: string): SingaporePoiDetailKit | undefined {
  return SINGAPORE_POI_DETAIL_KITS.find(kit => kit.assetId === assetId)
}

export function createSingaporePoiDetailKitRecipe(kit: SingaporePoiDetailKit) {
  let seed = 2_166_136_261
  for (const char of kit.poiId) seed = Math.imul(seed ^ char.charCodeAt(0), 16_777_619)
  return createProceduralAssetFromText(kit.intent, (seed >>> 0) || 1)
}
