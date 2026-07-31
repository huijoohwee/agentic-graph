import {
  isRecord,
  normalizePresetToken,
  parseYamlFrontmatter,
  readBooleanPreset,
  readCanvasRenderMode,
  readCanvasSurfaceMode,
} from './workspace-seed-frontmatter.mjs'

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
  const cityGeoXr = isRecord(frontmatter.city_geo_xr)
    ? frontmatter.city_geo_xr
    : {}
  const citySemanticMedia = isRecord(frontmatter.city_semantic_media)
    ? frontmatter.city_semantic_media
    : {}
  const cityParcelProjection = isRecord(frontmatter.city_parcel_projection)
    ? frontmatter.city_parcel_projection
    : {}
  const regionalGeographicPoiProjection = isRecord(
    frontmatter.regional_geographic_poi_projection,
  )
    ? frontmatter.regional_geographic_poi_projection
    : {}
  const cityAerialProjection = isRecord(frontmatter.city_aerial_projection)
    ? frontmatter.city_aerial_projection
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
  requireValue('run_ready_demo.source_root', runReadyDemo.source_root, 'knowgrph/docs')
  requireValue(
    'run_ready_demo.source_backed',
    readBooleanPreset(runReadyDemo.source_backed),
    true,
  )
  requireValue(
    'run_ready_demo.native_runtime',
    readBooleanPreset(runReadyDemo.native_runtime),
    true,
  )
  requireValue(
    'run_ready_demo.presentation',
    runReadyDemo.presentation,
    'native-maplibre-geo-xr-city-surface',
  )
  requireValue(
    'run_ready_demo.auto_start',
    readBooleanPreset(runReadyDemo.auto_start),
    false,
  )
  requireValue(
    'run_ready_demo.forbid_external_copy_or_dependency',
    readBooleanPreset(runReadyDemo.forbid_external_copy_or_dependency),
    true,
  )
  if (
    !Array.isArray(runReadyDemo.external_dependencies)
    || runReadyDemo.external_dependencies.length !== 0
  ) missing.push('run_ready_demo.external_dependencies=[]')
  if (JSON.stringify(runReadyDemo.canonical_consumers) !== JSON.stringify([
    'workspace',
    'geo-xr-mode',
    'city-builder',
    'city-maplibre-overlay',
    'flight-aerial-overlay',
  ])) {
    missing.push(
      'run_ready_demo.canonical_consumers=["workspace","geo-xr-mode","city-builder","city-maplibre-overlay","flight-aerial-overlay"]',
    )
  }
  requireValue('city_runtime.schema_id', cityRuntime.schema_id, 'knowgrph-city-grid/v1')
  requireValue('city_runtime.world_ownership', cityRuntime.world_ownership, authority.worldOwnership)
  requireValue('city_runtime.runtime_dependencies_added', cityRuntime.runtime_dependencies_added, 0)
  requireValue('city_runtime.surface_owner', cityRuntime.surface_owner, authority.surfaceOwner)
  requireValue('city_runtime.renderer_rule', cityRuntime.renderer_rule, authority.rendererRule)
  requireValue('city_geo_xr.surface_owner', cityGeoXr.surface_owner, 'Geo+XR Mode')
  requireValue('city_geo_xr.profile_id', cityGeoXr.profile_id, 'city-sim:civic-seed:geo/v1')
  requireValue(
    'city_geo_xr.regional_poi_profile_id',
    cityGeoXr.regional_poi_profile_id,
    authority.regionalPoi.profileId,
  )
  requireValue('city_geo_xr.parcel_gap_meters', cityGeoXr.parcel_gap_meters, 6)
  requireValue('city_geo_xr.parcel_bearing_degrees', cityGeoXr.parcel_bearing_degrees, 18)
  requireValue('city_geo_xr.geo_host_owner', cityGeoXr.geo_host_owner, 'native MapLibre Geo host')
  requireValue(
    'city_geo_xr.geo_policy_owner',
    cityGeoXr.geo_policy_owner,
    'canvas/src/components/CanvasViewportGeospatialOverlay.tsx',
  )
  requireValue('city_geo_xr.city_surface_owner', cityGeoXr.city_surface_owner, authority.citySurfaceOwner)
  requireValue('city_geo_xr.basemap_owner', cityGeoXr.basemap_owner, authority.basemapOwner)
  requireValue(
    'city_geo_xr.parcel_input_owner',
    cityGeoXr.parcel_input_owner,
    'one City Runtime selectedParcelId shared by MapLibre parcel clicks and City Builder coordinate controls',
  )
  requireValue(
    'city_geo_xr.parcel_scale_policy',
    cityGeoXr.parcel_scale_policy,
    authority.parcelScalePolicy,
  )
  requireValue('city_geo_xr.composition', cityGeoXr.composition, authority.composition)
  requireValue(
    'city_geo_xr.layer_order',
    JSON.stringify(cityGeoXr.layer_order),
    JSON.stringify(authority.layerOrder),
  )
  requireValue(
    'city_geo_xr.duplicate_map_or_canvas_forbidden',
    readBooleanPreset(cityGeoXr.duplicate_map_or_canvas_forbidden),
    true,
  )
  requireValue('city_parcel_projection.source_id', cityParcelProjection.source_id, 'kg-city-sim:geo-overlay')
  requireValue('city_parcel_projection.source_owner', cityParcelProjection.source_owner, 'gympgrph/src/cityGeoOverlay.ts')
  requireValue('city_parcel_projection.layer_owner', cityParcelProjection.layer_owner, 'gympgrph/src/cityGeoOverlayMapLibre.ts')
  requireValue('city_parcel_projection.framing_owner', cityParcelProjection.framing_owner, 'gympgrph/src/cityGeoOverlayMapLibreController.ts')
  requireValue(
    'city_parcel_projection.camera_policy',
    cityParcelProjection.camera_policy,
    authority.parcelCameraPolicy,
  )
  requireValue(
    'city_parcel_projection.duplicate_source_or_layer_ids_forbidden',
    readBooleanPreset(cityParcelProjection.duplicate_source_or_layer_ids_forbidden),
    true,
  )
  requireValue(
    'regional_geographic_poi_projection.profile_identity_source',
    regionalGeographicPoiProjection.profile_identity_source,
    authority.regionalPoi.profileIdentitySource,
  )
  requireValue(
    'regional_geographic_poi_projection.profile_fact_authority',
    regionalGeographicPoiProjection.profile_fact_authority,
    authority.regionalPoi.profileFactAuthority,
  )
  requireValue(
    'regional_geographic_poi_projection.source_id',
    regionalGeographicPoiProjection.source_id,
    authority.regionalPoi.sourceId,
  )
  requireValue(
    'regional_geographic_poi_projection.layers',
    JSON.stringify(regionalGeographicPoiProjection.layers),
    JSON.stringify(authority.regionalPoi.layers),
  )
  requireValue(
    'regional_geographic_poi_projection.feature_contract',
    regionalGeographicPoiProjection.feature_contract,
    authority.regionalPoi.featureContract,
  )
  requireValue(
    'regional_geographic_poi_projection.presentation_policy',
    regionalGeographicPoiProjection.presentation_policy,
    authority.regionalPoi.presentationPolicy,
  )
  requireValue(
    'regional_geographic_poi_projection.storage_policy',
    regionalGeographicPoiProjection.storage_policy,
    authority.regionalPoi.storagePolicy,
  )
  requireValue(
    'regional_geographic_poi_projection.runtime_network_required',
    readBooleanPreset(regionalGeographicPoiProjection.runtime_network_required),
    false,
  )
  requireValue(
    'regional_geographic_poi_projection.city_fact_ownership',
    readBooleanPreset(regionalGeographicPoiProjection.city_fact_ownership),
    false,
  )
  requireValue(
    'regional_geographic_poi_projection.local_xr_environment_identity',
    readBooleanPreset(regionalGeographicPoiProjection.local_xr_environment_identity),
    false,
  )
  requireValue(
    'regional_geographic_poi_projection.three_r3f_or_html_marker_forbidden',
    readBooleanPreset(
      regionalGeographicPoiProjection.three_r3f_or_html_marker_forbidden,
    ),
    true,
  )
  requireValue('city_semantic_media.owner', citySemanticMedia.owner, authority.semanticMediaOwner)
  requireValue('city_semantic_media.child_owner', citySemanticMedia.child_owner, authority.semanticMediaChildOwner)
  requireValue(
    'city_semantic_media.native_canvas_semantic_owner',
    citySemanticMedia.native_canvas_semantic_owner,
    authority.semanticMediaCanvasOwner,
  )
  requireValue('city_semantic_media.element', citySemanticMedia.element, 'figure')
  requireValue('city_semantic_media.accessible_name', citySemanticMedia.accessible_name, 'Interactive City simulation media stage')
  requireValue(
    'city_semantic_media.selection_marker_owner',
    citySemanticMedia.selection_marker_owner,
    authority.semanticMediaSelectionOwner,
  )
  requireValue(
    'city_semantic_media.selection_target',
    citySemanticMedia.selection_target,
    authority.semanticMediaSelectionTarget,
  )
  requireValue(
    'city_semantic_media.direct_canvas_accessible_name_required',
    readBooleanPreset(citySemanticMedia.direct_canvas_accessible_name_required),
    true,
  )
  requireValue(
    'city_semantic_media.figure_selection_marker_forbidden',
    readBooleanPreset(citySemanticMedia.figure_selection_marker_forbidden),
    true,
  )
  requireValue(
    'city_semantic_media.pointer_capture_owner',
    citySemanticMedia.pointer_capture_owner,
    'none; MapLibre owns Geo+XR viewport gestures and City Builder coordinate controls own parcel selection',
  )
  requireValue(
    'city_semantic_media.wrapper_added_generic_div_or_aria_hidden_forbidden',
    readBooleanPreset(citySemanticMedia.wrapper_added_generic_div_or_aria_hidden_forbidden),
    true,
  )
  requireValue('city_aerial_projection.behavior', cityAerialProjection.behavior, 'deterministic read-only stopped aircraft and route')
  requireValue('city_aerial_projection.phase', cityAerialProjection.phase, 'stopped')
  requireValue(
    'city_aerial_projection.spatial_source',
    cityAerialProjection.spatial_source,
    "this source document's typed city_geo_xr geographic profile",
  )
  requireValue(
    'city_aerial_projection.adapter_owner',
    cityAerialProjection.adapter_owner,
    'canvas/src/features/game-city-sim/citySimAerialInspectionProjection.ts',
  )
  requireValue(
    'city_aerial_projection.adapter_function',
    cityAerialProjection.adapter_function,
    'projectCitySimAerialInspectionToGeospatialOverlay',
  )
  requireValue('city_aerial_projection.presentation_owner', cityAerialProjection.presentation_owner, 'city')
  requireValue('city_aerial_projection.overlay_store_owner', cityAerialProjection.overlay_store_owner, 'gympgrph/src/flightGeoOverlay.ts')
  requireValue('city_aerial_projection.maplibre_projection_owner', cityAerialProjection.maplibre_projection_owner, 'gympgrph/src/flightGeoOverlayMapLibre.ts')
  requireValue('city_aerial_projection.shared_publisher_owner', cityAerialProjection.shared_publisher_owner, 'canvas/src/components/CanvasViewportGeospatialOverlay.tsx')
  requireValue(
    'city_aerial_projection.flight_gameplay_active',
    readBooleanPreset(cityAerialProjection.flight_gameplay_active),
    false,
  )
  requireValue(
    'city_aerial_projection.flight_readiness_claimed',
    readBooleanPreset(cityAerialProjection.flight_readiness_claimed),
    false,
  )
  requireValue(
    'city_aerial_projection.duplicate_source_or_layers_forbidden',
    readBooleanPreset(cityAerialProjection.duplicate_source_or_layers_forbidden),
    true,
  )
  requireValue('city_camera.canvas_mode', readCanvasSurfaceMode(cityCamera.canvas_mode), 'geo-xr')
  requireValue('city_camera.framing', cityCamera.framing, authority.cameraFraming)
  requireValue('city_camera.projection', cityCamera.projection, 'MapLibre')
  requireValue('city_camera.owner', cityCamera.owner, 'native MapLibre Geo host')
  const forbidden = [
    Object.hasOwn(cityRuntime, 'stage_owner') ? 'city_runtime.stage_owner' : null,
    Object.hasOwn(cityGeoXr, 'environment') ? 'city_geo_xr.environment' : null,
    Object.hasOwn(cityGeoXr, 'city_stage_owner') ? 'city_geo_xr.city_stage_owner' : null,
    Object.hasOwn(cityGeoXr, 'regional_poi_profile')
      ? 'city_geo_xr.regional_poi_profile'
      : null,
    Object.hasOwn(cityGeoXr, 'poi_profile_id')
      ? 'city_geo_xr.poi_profile_id'
      : null,
    Object.hasOwn(cityGeoXr, 'environment_profile_id')
      ? 'city_geo_xr.environment_profile_id'
      : null,
    Object.hasOwn(regionalGeographicPoiProjection, 'environment')
      ? 'regional_geographic_poi_projection.environment'
      : null,
    Object.hasOwn(regionalGeographicPoiProjection, 'local_xr_environment_source')
      ? 'regional_geographic_poi_projection.local_xr_environment_source'
      : null,
    Object.hasOwn(regionalGeographicPoiProjection, 'three_stage_owner')
      ? 'regional_geographic_poi_projection.three_stage_owner'
      : null,
    Object.hasOwn(regionalGeographicPoiProjection, 'r3f_owner')
      ? 'regional_geographic_poi_projection.r3f_owner'
      : null,
    Object.hasOwn(regionalGeographicPoiProjection, 'html_marker_owner')
      ? 'regional_geographic_poi_projection.html_marker_owner'
      : null,
    Object.hasOwn(regionalGeographicPoiProjection, 'html_marker_layer')
      ? 'regional_geographic_poi_projection.html_marker_layer'
      : null,
    Object.hasOwn(regionalGeographicPoiProjection, 'runtime_url')
      ? 'regional_geographic_poi_projection.runtime_url'
      : null,
    Object.hasOwn(regionalGeographicPoiProjection, 'remote_source')
      ? 'regional_geographic_poi_projection.remote_source'
      : null,
    Object.hasOwn(cityAerialProjection, 'flight_projection_owner')
      ? 'city_aerial_projection.flight_projection_owner'
      : null,
    Object.hasOwn(cityAerialProjection, 'environment_owner')
      ? 'city_aerial_projection.environment_owner'
      : null,
    Object.hasOwn(cityAerialProjection, 'environment')
      ? 'city_aerial_projection.environment'
      : null,
    Object.hasOwn(cityCamera, 'exit_rule') ? 'city_camera.exit_rule' : null,
    Object.hasOwn(cityCamera, 'captured_camera') ? 'city_camera.captured_camera' : null,
    Object.hasOwn(cityCamera, 'restore_target') ? 'city_camera.restore_target' : null,
    Object.hasOwn(frontmatter, 'city_environment') ? 'city_environment' : null,
    Object.hasOwn(frontmatter, 'city_poi_projection') ? 'city_poi_projection' : null,
    Object.hasOwn(frontmatter, 'regional_poi_projection')
      ? 'regional_poi_projection'
      : null,
  ].filter(Boolean)
  if (missing.length > 0 || forbidden.length > 0) {
    throw new Error(
      `proof-pending workspace document ${basename} has invalid authority; `
      + `missing=${JSON.stringify(missing)} forbidden=${JSON.stringify(forbidden)}`,
    )
  }
}
