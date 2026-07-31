import type {
  CityGeoOverlaySnapshot,
  CityGeoZone,
  CityGeoZoneStyle,
  CityGeographicProfile,
} from 'gympgrph'
import type { CitySimGeographicProfile } from './citySimAuthoredSource'
import type { CitySimSnapshot } from './citySimRuntimeState'
import {
  resolveRegionalPoiProfile,
} from '@/features/geospatial/regionalPoiProfileCatalog'

const CITY_GEO_PRESENTATION_REVISION = 'city-geo-presentation/v1'

const CITY_ZONE_STYLES: Readonly<Record<CityGeoZone, CityGeoZoneStyle>> =
  Object.freeze({
    unzoned: Object.freeze({
      baseHeightMeters: 0,
      fillColor: '#94a3b8',
      landValueCentsPerHeightMeter: null,
      maxHeightMeters: 1,
      outlineColor: '#475569',
      populationPerHeightMeter: null,
    }),
    residential: Object.freeze({
      baseHeightMeters: 2,
      fillColor: '#4ade80',
      landValueCentsPerHeightMeter: 2_500,
      maxHeightMeters: 28,
      outlineColor: '#166534',
      populationPerHeightMeter: 2,
    }),
    commercial: Object.freeze({
      baseHeightMeters: 3,
      fillColor: '#38bdf8',
      landValueCentsPerHeightMeter: 1_800,
      maxHeightMeters: 36,
      outlineColor: '#075985',
      populationPerHeightMeter: 2,
    }),
    industrial: Object.freeze({
      baseHeightMeters: 3,
      fillColor: '#f59e0b',
      landValueCentsPerHeightMeter: 2_400,
      maxHeightMeters: 22,
      outlineColor: '#92400e',
      populationPerHeightMeter: null,
    }),
  })

function projectGeographicProfile(
  profile: CitySimGeographicProfile,
): CityGeographicProfile {
  const regionalPoiProfile = resolveRegionalPoiProfile(
    profile.regionalPoiProfileId,
  )
  return Object.freeze({
    bearingDegrees: profile.parcelBearingDegrees,
    center: profile.anchor,
    columnGapMeters: profile.parcelGapMeters,
    framing: Object.freeze({
      '2d': Object.freeze({
        bearingDegrees: profile.parcelBearingDegrees,
        maxZoom: 18,
        paddingPixels: 48,
        pitchDegrees: 0,
      }),
      '3d': Object.freeze({
        bearingDegrees: profile.parcelBearingDegrees,
        maxZoom: 18,
        paddingPixels: 48,
        pitchDegrees: 46,
      }),
    }),
    id: profile.id,
    parcelDepthMeters: profile.parcelDepthMeters,
    parcelWidthMeters: profile.parcelWidthMeters,
    regionalPoiProfile,
    revision: [
      CITY_GEO_PRESENTATION_REVISION,
      profile.id,
      regionalPoiProfile.id,
      regionalPoiProfile.revision,
      profile.anchor.join(','),
      profile.parcelWidthMeters,
      profile.parcelDepthMeters,
      profile.parcelGapMeters,
      profile.parcelBearingDegrees,
    ].join(':'),
    rowGapMeters: profile.parcelGapMeters,
    selectedOutlineColor: '#f8fafc',
    zoneStyles: CITY_ZONE_STYLES,
  })
}

export function projectCitySimToGeospatialOverlay(
  snapshot: CitySimSnapshot,
): CityGeoOverlaySnapshot {
  if (!snapshot.active || !snapshot.geographicProfile) {
    return Object.freeze({
      active: false,
      columns: 0,
      parcels: Object.freeze([]),
      profile: null,
      revision: `inactive:${snapshot.revision}`,
      rows: 0,
      selectedParcelId: null,
    })
  }
  return Object.freeze({
    active: true,
    columns: snapshot.city.columns,
    parcels: snapshot.city.parcels,
    profile: projectGeographicProfile(snapshot.geographicProfile),
    revision: [
      'city-sim',
      snapshot.revision,
      snapshot.city.tick,
      snapshot.selectedParcelId ?? 'none',
    ].join(':'),
    rows: snapshot.city.rows,
    selectedParcelId: snapshot.selectedParcelId,
  })
}
