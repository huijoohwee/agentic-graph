import type {
  CityGeoOverlaySnapshot,
  CityGeoZone,
  CityGeoZoneStyle,
  CityGeographicProfile,
} from 'gympgrph'
import type { CitySimSnapshot } from './citySimRuntimeState'
import {
  resolveRegionalPoiProfile,
} from '@/features/geospatial/regionalPoiProfileCatalog'

const CITY_GEO_PRESENTATION_REVISION = 'city-poi-zoning-presentation/v1'

const CITY_ZONE_STYLES: Readonly<Record<CityGeoZone, CityGeoZoneStyle>> =
  Object.freeze({
    unzoned: Object.freeze({
      fillColor: '#94a3b8',
      outlineColor: '#475569',
    }),
    residential: Object.freeze({
      fillColor: '#4ade80',
      outlineColor: '#166534',
    }),
    commercial: Object.freeze({
      fillColor: '#38bdf8',
      outlineColor: '#075985',
    }),
    industrial: Object.freeze({
      fillColor: '#f59e0b',
      outlineColor: '#92400e',
    }),
  })

function projectGeographicProfile(
  regionalPoiProfileId: string,
): CityGeographicProfile {
  const regionalPoiProfile = resolveRegionalPoiProfile(regionalPoiProfileId)
  return Object.freeze({
    framing: Object.freeze({
      '2d': Object.freeze({
        bearingDegrees: 0,
        maxZoom: 18,
        paddingPixels: 48,
        pitchDegrees: 0,
      }),
      '3d': Object.freeze({
        bearingDegrees: 0,
        maxZoom: 18,
        paddingPixels: 48,
        pitchDegrees: 46,
      }),
    }),
    id: `city-poi-zoning:${regionalPoiProfile.id}`,
    regionalPoiProfile,
    revision: [
      CITY_GEO_PRESENTATION_REVISION,
      regionalPoiProfile.id,
      regionalPoiProfile.revision,
    ].join(':'),
    selectedOutlineColor: '#f8fafc',
    zoneStyles: CITY_ZONE_STYLES,
  })
}

export function projectCitySimToGeospatialOverlay(
  snapshot: CitySimSnapshot,
): CityGeoOverlaySnapshot {
  if (!snapshot.active || !snapshot.city.regionalPoiProfileId) {
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
    profile: projectGeographicProfile(snapshot.city.regionalPoiProfileId),
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
