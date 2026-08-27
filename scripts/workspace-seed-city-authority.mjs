import {
  isRecord,
  normalizePresetToken,
  parseYamlFrontmatter,
  readBooleanPreset,
  readCanvasRenderMode,
  readCanvasSurfaceMode,
} from './workspace-seed-frontmatter.mjs'

const POI_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const POI_ZONING_HEADING = '## Authored initial POI zoning'

function readPoiZoningIds(source) {
  const headingIndex = source.indexOf(POI_ZONING_HEADING)
  if (headingIndex < 0 || source.lastIndexOf(POI_ZONING_HEADING) !== headingIndex) {
    return []
  }
  const fenceStart = source.indexOf('```csv\n', headingIndex)
  const fenceEnd = source.indexOf('\n```', fenceStart + 7)
  if (fenceStart < 0 || fenceEnd < 0) return []
  const lines = source.slice(fenceStart + 7, fenceEnd).split('\n')
  if (lines.shift() !== 'parcel_id,row,column,zone,land_value_cents,population,pollution') {
    return []
  }
  return lines.map(line => line.split(',')[0])
}

export function requireCitySimRuntimeIdentity({
  authority,
  basename,
  relativePath,
  source,
}) {
  const frontmatter = parseYamlFrontmatter(basename, source)
  const runReadyDemo = isRecord(frontmatter.run_ready_demo)
    ? frontmatter.run_ready_demo
    : {}
  const cityRuntime = isRecord(frontmatter.city_runtime)
    ? frontmatter.city_runtime
    : {}
  const cityZoning = isRecord(frontmatter.city_regional_poi_zoning)
    ? frontmatter.city_regional_poi_zoning
    : {}
  const cityInitial = isRecord(frontmatter.city_initial)
    ? frontmatter.city_initial
    : {}
  const citySemanticMedia = isRecord(frontmatter.city_semantic_media)
    ? frontmatter.city_semantic_media
    : {}
  const cityPoiProjection = isRecord(frontmatter.city_poi_zoning_projection)
    ? frontmatter.city_poi_zoning_projection
    : {}
  const regionalProjection = isRecord(frontmatter.regional_geographic_poi_projection)
    ? frontmatter.regional_geographic_poi_projection
    : {}
  const cityCamera = isRecord(frontmatter.city_camera)
    ? frontmatter.city_camera
    : {}
  const missing = []
  const requireValue = (label, actual, expected) => {
    if (actual !== expected) missing.push(`${label}=${JSON.stringify(expected)}`)
  }

  requireValue('status', frontmatter.status, 'proof-pending')
  requireValue('runtime_status', frontmatter.runtime_status, 'proof-pending')
  requireValue('publish_scope', frontmatter.publish_scope, 'local-only')
  requireValue(
    'kgCanvasSurfaceMode',
    readCanvasSurfaceMode(frontmatter.kgCanvasSurfaceMode),
    'geo-xr',
  )
  requireValue(
    'kgCanvasRenderMode',
    readCanvasRenderMode(frontmatter.kgCanvasRenderMode),
    '3d',
  )
  requireValue(
    'kgCanvas3dMode',
    normalizePresetToken(frontmatter.kgCanvas3dMode),
    'xr',
  )
  requireValue(
    'kgFloatingPanelOpen',
    readBooleanPreset(frontmatter.kgFloatingPanelOpen),
    true,
  )
  requireValue('kgFloatingPanelView', frontmatter.kgFloatingPanelView, 'cityBuilder')
  requireValue('run_ready_demo.id', runReadyDemo.id, authority.id)
  requireValue('run_ready_demo.activation', runReadyDemo.activation, 'applied-source-document')
  requireValue(
    'run_ready_demo.identity_authority',
    runReadyDemo.identity_authority,
    'source-authored run_ready_demo.id',
  )
  requireValue(
    'run_ready_demo.identity_conflict',
    runReadyDemo.identity_conflict,
    'fail closed when a known path and source identity disagree',
  )
  requireValue(
    'run_ready_demo.canonical_source_file',
    runReadyDemo.canonical_source_file,
    `/${relativePath}`,
  )
  requireValue('run_ready_demo.source_root', runReadyDemo.source_root, 'agenticgraph/docs')
  requireValue('run_ready_demo.source_backed', readBooleanPreset(runReadyDemo.source_backed), true)
  requireValue('run_ready_demo.native_runtime', readBooleanPreset(runReadyDemo.native_runtime), true)
  requireValue('run_ready_demo.presentation', runReadyDemo.presentation, 'native-maplibre-geo-xr-city-surface')
  requireValue('run_ready_demo.auto_start', readBooleanPreset(runReadyDemo.auto_start), false)
  requireValue(
    'run_ready_demo.forbid_external_copy_or_dependency',
    readBooleanPreset(runReadyDemo.forbid_external_copy_or_dependency),
    true,
  )
  if (!Array.isArray(runReadyDemo.external_dependencies) || runReadyDemo.external_dependencies.length !== 0) {
    missing.push('run_ready_demo.external_dependencies=[]')
  }
  const consumers = ['workspace', 'geo-xr-mode', 'city-builder', 'city-maplibre-overlay']
  requireValue(
    'run_ready_demo.canonical_consumers',
    JSON.stringify(runReadyDemo.canonical_consumers),
    JSON.stringify(consumers),
  )

  requireValue('city_runtime.schema_id', cityRuntime.schema_id, 'agenticgraph-city-poi-zoning/v1')
  requireValue('city_runtime.world_ownership', cityRuntime.world_ownership, authority.worldOwnership)
  requireValue('city_runtime.runtime_dependencies_added', cityRuntime.runtime_dependencies_added, 0)
  requireValue('city_runtime.surface_owner', cityRuntime.surface_owner, authority.surfaceOwner)
  requireValue('city_runtime.renderer_rule', cityRuntime.renderer_rule, authority.rendererRule)

  requireValue('city_regional_poi_zoning.surface_owner', cityZoning.surface_owner, 'Geo+XR Mode')
  requireValue(
    'city_regional_poi_zoning.profile_identity_source',
    cityZoning.profile_identity_source,
    authority.regionalPoi.profileIdentitySource,
  )
  requireValue('city_regional_poi_zoning.geo_host_owner', cityZoning.geo_host_owner, 'native MapLibre Geo host')
  requireValue('city_regional_poi_zoning.city_surface_owner', cityZoning.city_surface_owner, authority.citySurfaceOwner)
  requireValue('city_regional_poi_zoning.basemap_owner', cityZoning.basemap_owner, authority.basemapOwner)
  requireValue('city_regional_poi_zoning.parcel_identity_policy', cityZoning.parcel_identity_policy, authority.parcelIdentityPolicy)
  requireValue('city_regional_poi_zoning.ordering_policy', cityZoning.ordering_policy, authority.orderingPolicy)
  requireValue('city_regional_poi_zoning.composition', cityZoning.composition, authority.composition)
  requireValue('city_regional_poi_zoning.layer_order', JSON.stringify(cityZoning.layer_order), JSON.stringify(authority.layerOrder))
  requireValue(
    'city_regional_poi_zoning.duplicate_map_or_canvas_forbidden',
    readBooleanPreset(cityZoning.duplicate_map_or_canvas_forbidden),
    true,
  )

  requireValue('city_initial.regional_poi_profile_id', cityInitial.regional_poi_profile_id, authority.regionalPoi.profileId)
  requireValue('city_initial.rows', cityInitial.rows, 2)
  requireValue('city_initial.columns', cityInitial.columns, 3)
  const poiIds = readPoiZoningIds(source)
  if (
    poiIds.length !== 6
    || new Set(poiIds).size !== poiIds.length
    || poiIds.some(id => !POI_ID_PATTERN.test(id) || /^r\d{2}c\d{2}$/.test(id))
  ) {
    missing.push('authored initial POI zoning=6 unique canonical RegionalPoiIdentity ids')
  }

  requireValue('city_poi_zoning_projection.source_id', cityPoiProjection.source_id, 'kg-city-sim:geo-overlay')
  requireValue('city_poi_zoning_projection.source_owner', cityPoiProjection.source_owner, 'gympgrph/src/cityGeoOverlay.ts')
  requireValue('city_poi_zoning_projection.layer_owner', cityPoiProjection.layer_owner, 'gympgrph/src/cityGeoOverlayMapLibre.ts')
  requireValue('city_poi_zoning_projection.framing_owner', cityPoiProjection.framing_owner, 'gympgrph/src/cityGeoOverlayMapLibreController.ts')
  requireValue('city_poi_zoning_projection.camera_policy', cityPoiProjection.camera_policy, authority.parcelCameraPolicy)
  requireValue(
    'city_poi_zoning_projection.duplicate_source_or_layer_ids_forbidden',
    readBooleanPreset(cityPoiProjection.duplicate_source_or_layer_ids_forbidden),
    true,
  )

  requireValue('regional_geographic_poi_projection.profile_identity_source', regionalProjection.profile_identity_source, authority.regionalPoi.profileIdentitySource)
  requireValue('regional_geographic_poi_projection.profile_fact_authority', regionalProjection.profile_fact_authority, authority.regionalPoi.profileFactAuthority)
  requireValue('regional_geographic_poi_projection.source_id', regionalProjection.source_id, authority.regionalPoi.sourceId)
  requireValue('regional_geographic_poi_projection.layers', JSON.stringify(regionalProjection.layers), JSON.stringify(authority.regionalPoi.layers))
  requireValue('regional_geographic_poi_projection.feature_contract', regionalProjection.feature_contract, authority.regionalPoi.featureContract)
  requireValue('regional_geographic_poi_projection.presentation_policy', regionalProjection.presentation_policy, authority.regionalPoi.presentationPolicy)
  requireValue('regional_geographic_poi_projection.storage_policy', regionalProjection.storage_policy, authority.regionalPoi.storagePolicy)
  requireValue('regional_geographic_poi_projection.runtime_network_required', readBooleanPreset(regionalProjection.runtime_network_required), false)
  requireValue('regional_geographic_poi_projection.city_fact_ownership', readBooleanPreset(regionalProjection.city_fact_ownership), false)
  requireValue('regional_geographic_poi_projection.local_xr_environment_identity', readBooleanPreset(regionalProjection.local_xr_environment_identity), false)
  requireValue('regional_geographic_poi_projection.three_r3f_or_html_marker_forbidden', readBooleanPreset(regionalProjection.three_r3f_or_html_marker_forbidden), true)

  requireValue('city_semantic_media.owner', citySemanticMedia.owner, authority.semanticMediaOwner)
  requireValue('city_semantic_media.child_owner', citySemanticMedia.child_owner, authority.semanticMediaChildOwner)
  requireValue('city_semantic_media.native_canvas_semantic_owner', citySemanticMedia.native_canvas_semantic_owner, authority.semanticMediaCanvasOwner)
  requireValue('city_semantic_media.element', citySemanticMedia.element, 'figure')
  requireValue('city_semantic_media.accessible_name', citySemanticMedia.accessible_name, 'Interactive City simulation media stage')
  requireValue('city_semantic_media.selection_marker_owner', citySemanticMedia.selection_marker_owner, authority.semanticMediaSelectionOwner)
  requireValue('city_semantic_media.selection_target', citySemanticMedia.selection_target, authority.semanticMediaSelectionTarget)
  requireValue('city_semantic_media.direct_canvas_accessible_name_required', readBooleanPreset(citySemanticMedia.direct_canvas_accessible_name_required), true)
  requireValue('city_semantic_media.figure_selection_marker_forbidden', readBooleanPreset(citySemanticMedia.figure_selection_marker_forbidden), true)
  requireValue(
    'city_semantic_media.pointer_capture_owner',
    citySemanticMedia.pointer_capture_owner,
    'none; MapLibre owns Geo+XR viewport gestures and City Builder POI controls own parcel selection',
  )
  requireValue('city_semantic_media.wrapper_added_generic_div_or_aria_hidden_forbidden', readBooleanPreset(citySemanticMedia.wrapper_added_generic_div_or_aria_hidden_forbidden), true)

  requireValue('city_camera.canvas_mode', readCanvasSurfaceMode(cityCamera.canvas_mode), 'geo-xr')
  requireValue('city_camera.framing', cityCamera.framing, authority.cameraFraming)
  requireValue('city_camera.projection', cityCamera.projection, 'MapLibre')
  requireValue('city_camera.owner', cityCamera.owner, 'native MapLibre Geo host')

  const forbidden = [
    'city_geo_xr',
    'city_aerial_projection',
    'city_parcel_projection',
    'city_environment',
    'city_poi_projection',
    'regional_poi_projection',
  ].filter(key => Object.hasOwn(frontmatter, key))
  const forbiddenZoningFields = [
    'anchor',
    'parcel_dimensions_meters',
    'parcel_gap_meters',
    'parcel_bearing_degrees',
    'aerial_route_coordinates',
    'aerial_aircraft_coordinate',
    'aerial_aircraft_heading_degrees',
    'aerial_aircraft_altitude_meters',
  ].filter(key => Object.hasOwn(cityZoning, key))
    .map(key => `city_regional_poi_zoning.${key}`)
  forbidden.push(...forbiddenZoningFields)
  if (Object.hasOwn(cityRuntime, 'stage_owner')) forbidden.push('city_runtime.stage_owner')
  for (const key of ['html_marker_owner', 'three_stage_owner', 'r3f_owner']) {
    if (Object.hasOwn(regionalProjection, key)) {
      forbidden.push(`regional_geographic_poi_projection.${key}`)
    }
  }
  for (const key of ['exit_rule', 'captured_camera', 'restore_target']) {
    if (Object.hasOwn(cityCamera, key)) forbidden.push(`city_camera.${key}`)
  }
  if (missing.length > 0 || forbidden.length > 0) {
    throw new Error(
      `proof-pending workspace document ${basename} has invalid authority; `
      + `missing=${JSON.stringify(missing)} forbidden=${JSON.stringify(forbidden)}`,
    )
  }
}
