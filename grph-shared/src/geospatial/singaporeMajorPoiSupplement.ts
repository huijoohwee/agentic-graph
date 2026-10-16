import type { RegionalPoiSurface } from './regionalPoiGeo.js'
import { SINGAPORE_MAJOR_POI_SUPPLEMENT_IDENTITIES } from './singaporeMajorPoiSupplementIdentities.js'
import { SINGAPORE_MAJOR_POI_SUPPLEMENT_SURFACES_A } from './singaporeMajorPoiSupplementSurfacesA.js'
import { SINGAPORE_MAJOR_POI_SUPPLEMENT_SURFACES_B } from './singaporeMajorPoiSupplementSurfacesB.js'
import { SINGAPORE_MAJOR_POI_SUPPLEMENT_SURFACES_C } from './singaporeMajorPoiSupplementSurfacesC.js'

export { SINGAPORE_MAJOR_POI_SUPPLEMENT_IDENTITIES }

/**
 * Exact source polygons remain the spatial authority. Generated presentation
 * detail is separate and may not change these rings or imply unrecorded height.
 */
export const SINGAPORE_MAJOR_POI_SUPPLEMENT_SURFACES = [
  ...SINGAPORE_MAJOR_POI_SUPPLEMENT_SURFACES_A,
  ...SINGAPORE_MAJOR_POI_SUPPLEMENT_SURFACES_B,
  ...SINGAPORE_MAJOR_POI_SUPPLEMENT_SURFACES_C,
] as const satisfies readonly RegionalPoiSurface[]
