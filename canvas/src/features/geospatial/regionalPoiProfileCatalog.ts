import type {
  RegionalPoiProfile,
} from 'grph-shared/geospatial/regionalPoiGeo'
import {
  SINGAPORE_MAJOR_POI_GEO_PROFILE,
} from 'grph-shared/geospatial/singaporeMajorPoiGeo'

const REGIONAL_POI_PROFILES = new Map<string, RegionalPoiProfile>([
  [
    SINGAPORE_MAJOR_POI_GEO_PROFILE.id,
    SINGAPORE_MAJOR_POI_GEO_PROFILE,
  ],
])

export function resolveRegionalPoiProfile(
  profileId: string,
): RegionalPoiProfile {
  const profile = REGIONAL_POI_PROFILES.get(profileId)
  if (!profile) {
    throw new Error(`Unknown regional POI profile ${JSON.stringify(profileId)}.`)
  }
  return profile
}
