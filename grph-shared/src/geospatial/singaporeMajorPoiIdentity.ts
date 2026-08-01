import type { RegionalPoiIdentity } from './regionalPoiGeo.js'

export const SINGAPORE_MAJOR_POI_IDENTITIES = Object.freeze([
  Object.freeze({ id: 'marina-bay-sands', label: 'Marina Bay Sands' }),
  Object.freeze({ id: 'singapore-flyer', label: 'Singapore Flyer' }),
  Object.freeze({ id: 'gardens-by-the-bay', label: 'Gardens by the Bay' }),
  Object.freeze({
    id: 'esplanade-theatres-on-the-bay',
    label: 'Esplanade — Theatres on the Bay',
  }),
  Object.freeze({ id: 'the-fullerton-hotel', label: 'The Fullerton Hotel' }),
  Object.freeze({ id: 'raffles-hotel', label: 'Raffles Hotel' }),
] as const satisfies readonly RegionalPoiIdentity[])

export type SingaporeMajorPoiId =
  typeof SINGAPORE_MAJOR_POI_IDENTITIES[number]['id']
