export const GEOSPATIAL_MODE_CHANGED_EVENT = 'kg:geospatialModeChanged' as const

export const GEOSPATIAL_STYLE_URL_CHANGED_EVENT = 'kg:geospatialStyleUrlChanged' as const
export const GEOSPATIAL_POINT_STYLE_CHANGED_EVENT = 'kg:geospatialPointStyleChanged' as const
export const GEOSPATIAL_ENHANCED_LAYERS_CHANGED_EVENT = 'kg:geospatialEnhancedLayersChanged' as const

export const DEFAULT_GEOSPATIAL_OVERLAY_ENABLED = false as const
export const GEOSPATIAL_OVERLAY_PREFERENCE_VERSION = 'neutral-v1' as const

export const GEOSPATIAL_LS_KEYS = {
  geospatialOverlayEnabled: 'kg:ui:geospatial:overlayEnabled',
  geospatialOverlayPreferenceVersion: 'kg:ui:geospatial:overlayPreferenceVersion',
  geospatialViewMode: 'kg:ui:geospatial:viewMode',
  geospatialStyleUrl: 'kg:ui:geospatial:styleUrl',
  grabMapsBasemapStyleUrl: 'kg:maps:grabmaps:basemap:styleUrl',
  geospatialPointStyleConfig: 'kg:ui:geospatial:pointStyleConfig',
  geospatialOverlayOpacity: 'kg:ui:geospatial:overlayOpacity',
  geospatialInteractionMode: 'kg:ui:geospatial:interactionMode',
  geospatialProjectionMode: 'kg:ui:geospatial:projectionMode',
  geospatialAnimateCamera: 'kg:ui:geospatial:animateCamera',
  geospatialAutoFitEnabled: 'kg:ui:geospatial:autoFitEnabled',
  geospatialDatasets: 'kg:ui:geospatial:datasets',
  geospatialDatasetTimeoutMs: 'kg:ui:geospatial:datasetTimeoutMs',
  geospatialDatasetMaxBytes: 'kg:ui:geospatial:datasetMaxBytes',
  geospatialGraphPoiColor: 'kg:ui:geospatial:graphPoiColor',
  geospatialGraphPoiSelectedColor: 'kg:ui:geospatial:graphPoiSelectedColor',
  geospatialGraphEdgeColor: 'kg:ui:geospatial:graphEdgeColor',
  geospatialGraphEdgeSelectedColor: 'kg:ui:geospatial:graphEdgeSelectedColor',
  geospatialGlobeAutoRotate: 'kg:ui:geospatial:globeAutoRotate',
  geospatialGlobeAutoRotateSpeed: 'kg:ui:geospatial:globeAutoRotateSpeed',
  geospatialClusterEnabled: 'kg:ui:geospatial:clusterEnabled',
  geospatialClusterRadius: 'kg:ui:geospatial:clusterRadius',
  geospatialClusterMaxZoom: 'kg:ui:geospatial:clusterMaxZoom',
  geospatialEnhancedLayers: 'kg:ui:geospatial:enhancedLayers',
  geospatialEnhancedLayerVisibility: 'kg:ui:geospatial:enhancedLayerVisibility',
  geospatialGeoHarnessEnabled: 'kg:ui:geospatial:geoHarnessEnabled',
  geospatialGeoHarnessBudgetUsd: 'kg:ui:geospatial:geoHarnessBudgetUsd',
} as const
