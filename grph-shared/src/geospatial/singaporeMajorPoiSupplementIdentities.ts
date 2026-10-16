import type { RegionalPoiIdentity } from './regionalPoiGeo.js'

/** Additional Singapore identities with checked-in OpenStreetMap footprints. */
export const SINGAPORE_MAJOR_POI_SUPPLEMENT_IDENTITIES = [{"id":"national-gallery-singapore","label":"National Gallery Singapore"},{"id":"marina-barrage","label":"Marina Barrage"},{"id":"merlion-park","label":"Merlion Park"},{"id":"suntec-singapore-convention-exhibition-centre","label":"Suntec Singapore Convention & Exhibition Centre"},{"id":"marina-bay-cruise-centre","label":"Marina Bay Cruise Centre"},{"id":"the-shoppes-at-marina-bay-sands","label":"The Shoppes at Marina Bay Sands"}] as const satisfies readonly RegionalPoiIdentity[]
