import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { load as loadYaml } from 'js-yaml'

export const WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH = 'docs/workspace-seeds'
export const PHYSICS_SEED_BASENAME = 'knowgrph-physics-playground-demo.md'
export const PHYSICS_SEED_RELATIVE_PATH = `${WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH}/${PHYSICS_SEED_BASENAME}`
export const FLIGHT_SEED_BASENAME = 'knowgrph-game-flight-sim-demo.md'
export const FLIGHT_SEED_RELATIVE_PATH = `${WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH}/${FLIGHT_SEED_BASENAME}`
export const FLIGHT_COMPANION_BASENAME = 'knowgrph-game-flight-sim-demo.companion.md'
export const CITY_SIM_SEED_BASENAME = 'knowgrph-game-city-building-sim-demo.md'
export const CITY_SIM_SEED_RELATIVE_PATH = `${WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH}/${CITY_SIM_SEED_BASENAME}`
export const CITY_SIM_OVERLAY_AUTHORITY = Object.freeze({
  id: 'city-sim',
  rendererRule: 'never create a second Canvas or renderer',
  stageOwner: 'additive City Stage in the existing shared React Three Fiber Canvas',
  worldOwnership: 'overlay-only',
})
export const DRAFT_WORKSPACE_SEED_BASENAMES = Object.freeze([
  'knowgrph-game-mmorpg-demo.companion.md',
  'knowgrph-game-mmorpg-demo.md',
])
export const KNOWGRPH_WORKSPACE_SEED_INVENTORY = Object.freeze([
  'README.md',
  CITY_SIM_SEED_BASENAME,
  FLIGHT_COMPANION_BASENAME,
  FLIGHT_SEED_BASENAME,
  ...DRAFT_WORKSPACE_SEED_BASENAMES,
  PHYSICS_SEED_BASENAME,
])
export const AGENTIC_WORKSPACE_SEED_PROJECTION_INVENTORY = Object.freeze([
  PHYSICS_SEED_BASENAME,
])
const DRAFT_IMPLEMENTED_RUNTIME_KEYS = Object.freeze([
  'native_flight_demo',
  'asset_pipeline',
  'motion_control',
  'flight_sim',
  'native_mmorpg_demo',
  'asset_provenance_pipeline',
  'mmorpg_world',
  'runtime_validation',
  'mcp_control',
])

export const resolveWorkspaceSeedSiblingRootsFromGitCommonDir = gitCommonDirRaw => {
  const gitCommonDir = path.resolve(String(gitCommonDirRaw || '').trim())
  if (path.basename(gitCommonDir) !== '.git') {
    throw new Error(`expected Knowgrph git common directory to end in .git: ${gitCommonDir}`)
  }
  const githubRoot = path.dirname(path.dirname(gitCommonDir))
  return {
    agenticDocsRoot: path.join(githubRoot, 'agentic-canvas-os/docs'),
    publishRoot: path.join(githubRoot, 'huijoohwee'),
  }
}

const isFile = async filePath => (await stat(filePath).catch(() => null))?.isFile() === true

const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value)

const parseYamlFrontmatter = (basename, source) => {
  const match = String(source || '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) throw new Error(`draft workspace document ${basename} must begin with YAML frontmatter`)
  let frontmatter
  try {
    frontmatter = loadYaml(match[1])
  } catch (error) {
    throw new Error(`draft workspace document ${basename} has invalid YAML frontmatter: ${error.message}`)
  }
  if (!isRecord(frontmatter)) {
    throw new Error(`draft workspace document ${basename} frontmatter must parse as an object`)
  }
  return frontmatter
}

const normalizePresetToken = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_+-]+/g, '')

const readCanvasSurfaceMode = value => {
  const token = normalizePresetToken(value)
  if (token === '2d' || token === 'mode2d' || token === 'surface2d') return '2d'
  if (token === '3d' || token === 'mode3d' || token === 'surface3d') return '3d'
  if (token === 'xr' || token === 'xrmode' || token === 'surfacexr') return 'xr'
  if (token === 'geoxr' || token === 'geoxrmode' || token === 'surfacegeoxr') return 'geo-xr'
  if (token === 'geospatial' || token === 'geomode' || token === 'geospatialmode' || token === 'surfacegeospatial') {
    return 'geospatial'
  }
  return undefined
}

const readCanvasRenderMode = value => {
  const token = normalizePresetToken(value)
  if (token === '2d' || token === 'mode2d' || token === 'surface2d') return '2d'
  if (token === '3d' || token === 'mode3d' || token === 'surface3d' || token === 'xr' || token === 'xrmode') {
    return '3d'
  }
  return undefined
}

const readCanvas2dRenderer = value => {
  const token = normalizePresetToken(value)
  return token === 'flow' || token === 'flowcanvas' || token === 'canvas' ? 'flow' : undefined
}

const readBooleanPreset = value => {
  if (typeof value === 'boolean') return value
  const token = normalizePresetToken(value)
  if (token === 'true' || token === '1' || token === 'yes' || token === 'on') return true
  if (token === 'false' || token === '0' || token === 'no' || token === 'off') return false
  return undefined
}

const requireExactFileInventory = async ({
  directoryPath,
  expectedBasenames,
  label,
  allowMissingDirectory = false,
}) => {
  let entries
  try {
    entries = await readdir(directoryPath, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT' && allowMissingDirectory) return []
    if (error?.code === 'ENOENT') throw new Error(`${label} directory is missing: ${directoryPath}`)
    throw error
  }

  const expected = [...expectedBasenames].sort()
  const actual = entries.map(entry => entry.name).sort()
  const actualNames = new Set(actual)
  const expectedNames = new Set(expected)
  const missing = expected.filter(name => !actualNames.has(name))
  const unexpected = actual.filter(name => !expectedNames.has(name))
  const nonFiles = entries
    .filter(entry => expectedNames.has(entry.name) && !entry.isFile())
    .map(entry => entry.name)
    .sort()

  if (missing.length > 0 || unexpected.length > 0 || nonFiles.length > 0) {
    throw new Error(
      `${label} must have exact file inventory ${JSON.stringify(expected)}; `
      + `missing=${JSON.stringify(missing)} unexpected=${JSON.stringify(unexpected)} nonFiles=${JSON.stringify(nonFiles)}`,
    )
  }
  return actual
}

const requireCanonicalIdentity = source => {
  const requiredMarkers = [
    'canonical_source_file: "/docs/workspace-seeds/knowgrph-physics-playground-demo.md"',
    'source_root: "knowgrph/docs"',
    'source_backed: true',
  ]
  const missing = requiredMarkers.filter(marker => !source.includes(marker))
  if (missing.length > 0) {
    throw new Error(`canonical workspace seed is missing identity markers: ${missing.join(', ')}`)
  }
}

const requireFlightRuntimeIdentity = (source, physicsSource) => {
  const frontmatter = parseYamlFrontmatter(FLIGHT_SEED_BASENAME, source)
  const physicsFrontmatter = parseYamlFrontmatter(
    PHYSICS_SEED_BASENAME,
    physicsSource,
  )
  const runReadyDemo = isRecord(frontmatter.run_ready_demo) ? frontmatter.run_ready_demo : {}
  const sharedScene = isRecord(frontmatter.shared_xr_scene) ? frontmatter.shared_xr_scene : {}
  const nativeFlightDemo = isRecord(frontmatter.native_flight_demo) ? frontmatter.native_flight_demo : {}
  const camera = isRecord(nativeFlightDemo.camera) ? nativeFlightDemo.camera : {}
  const nativeControllerDemo = isRecord(physicsFrontmatter.native_controller_demo)
    ? physicsFrontmatter.native_controller_demo
    : {}
  const physicsCamera = isRecord(nativeControllerDemo.camera)
    ? nativeControllerDemo.camera
    : {}
  const flightSim = isRecord(frontmatter.flight_sim) ? frontmatter.flight_sim : {}
  const missing = []
  const requireValue = (label, actual, expected) => {
    if (actual !== expected) missing.push(`${label}=${JSON.stringify(expected)}`)
  }

  requireValue('status', frontmatter.status, 'runtime-ready')
  requireValue('runtime_status', frontmatter.runtime_status, 'runtime-ready')
  requireValue('runtime_claim', frontmatter.runtime_claim, 'local-runtime-ready')
  requireValue(
    'evidence_status',
    frontmatter.evidence_status,
    'exact-head source and browser proof required at every handoff',
  )
  requireValue('publish_scope', frontmatter.publish_scope, 'local-only')
  requireValue('kgCanvasSurfaceMode', readCanvasSurfaceMode(frontmatter.kgCanvasSurfaceMode), 'geo-xr')
  requireValue('kgCanvasRenderMode', readCanvasRenderMode(frontmatter.kgCanvasRenderMode), '3d')
  requireValue('kgCanvas3dMode', normalizePresetToken(frontmatter.kgCanvas3dMode), 'xr')
  requireValue('kgFloatingPanelOpen', readBooleanPreset(frontmatter.kgFloatingPanelOpen), true)
  requireValue('kgFloatingPanelView', frontmatter.kgFloatingPanelView, 'flightSim')
  requireValue('run_ready_demo.id', runReadyDemo.id, 'flight-sim')
  requireValue(
    'run_ready_demo.canonical_source_file',
    runReadyDemo.canonical_source_file,
    `/${FLIGHT_SEED_RELATIVE_PATH}`,
  )
  requireValue('run_ready_demo.source_root', runReadyDemo.source_root, 'knowgrph/docs')
  requireValue('run_ready_demo.source_backed', readBooleanPreset(runReadyDemo.source_backed), true)
  requireValue('run_ready_demo.native_runtime', readBooleanPreset(runReadyDemo.native_runtime), true)
  requireValue('run_ready_demo.auto_start', readBooleanPreset(runReadyDemo.auto_start), true)
  if (!Array.isArray(runReadyDemo.external_dependencies) || runReadyDemo.external_dependencies.length !== 0) {
    missing.push('run_ready_demo.external_dependencies=[]')
  }
  requireValue(
    'shared_xr_scene.source_authority',
    sharedScene.source_authority,
    `/${PHYSICS_SEED_RELATIVE_PATH}`,
  )
  requireValue('shared_xr_scene.world_ownership', sharedScene.world_ownership, 'overlay-only')
  requireValue('shared_xr_scene.surface_owner', sharedScene.surface_owner, 'Geo+XR Mode')
  requireValue(
    'shared_xr_scene.camera_owner',
    sharedScene.camera_owner,
    'canvas/src/features/three/useXrNativeControllerDemoCamera.ts',
  )
  requireValue(
    'native_flight_demo.camera_mode',
    nativeFlightDemo.camera_mode,
    nativeControllerDemo.camera_mode,
  )
  for (const key of [
    'default',
    'selector',
    'available',
    'invocation',
    'timeline_override',
  ]) {
    if (JSON.stringify(camera[key]) !== JSON.stringify(physicsCamera[key])) {
      missing.push(`native_flight_demo.camera.${key}=Physics source`)
    }
  }
  requireValue('native_flight_demo.camera.default', camera.default, 'fixed-follow')
  requireValue('native_flight_demo.camera_mode', nativeFlightDemo.camera_mode, camera.default)
  if (JSON.stringify(camera.available) !== JSON.stringify(['fixed-follow', 'free-orbit'])) {
    missing.push('native_flight_demo.camera.available=["fixed-follow","free-orbit"]')
  }
  requireValue(
    'native_flight_demo.camera.catalog_owner',
    camera.catalog_owner,
    'canvas/src/features/three/xrNativeControllerCameraCatalog.ts',
  )
  requireValue(
    'native_flight_demo.camera.selection_owner',
    camera.selection_owner,
    'canvas/src/features/three/xrNativeControllerCameraRuntime.ts',
  )
  requireValue(
    'native_flight_demo.camera.driver_owner',
    camera.driver_owner,
    'gympgrph/src/flightGeoOverlayMapLibreCamera.ts',
  )
  requireValue(
    'native_flight_demo.camera.runtime_canvas_driver_owner',
    camera.runtime_canvas_driver_owner,
    'canvas/src/features/three/useXrNativeControllerDemoCamera.ts',
  )
  requireValue('flight_sim.invocation', flightSim.invocation, '/flight.sim @canvas #flight operation=open')
  requireValue('flight_sim.inspect_tool', flightSim.inspect_tool, 'knowgrph.inspect_local_flight_sim')
  requireValue('flight_sim.control_tool', flightSim.control_tool, 'knowgrph.control_local_flight_sim')

  const forbidden = Object.keys(frontmatter).filter(key => key.startsWith('planned_'))
  if (missing.length > 0 || forbidden.length > 0) {
    throw new Error(
      `runtime-ready workspace document ${FLIGHT_SEED_BASENAME} has invalid authority; `
      + `missing=${JSON.stringify(missing)} forbidden=${JSON.stringify(forbidden)}`,
    )
  }
}

const requireFlightCompanionIdentity = source => {
  const frontmatter = parseYamlFrontmatter(FLIGHT_COMPANION_BASENAME, source)
  const missing = []
  const requireValue = (label, actual, expected) => {
    if (actual !== expected) missing.push(`${label}=${JSON.stringify(expected)}`)
  }
  requireValue('status', frontmatter.status, 'projection-pending')
  requireValue('runtime_claim', frontmatter.runtime_claim, 'local-runtime-ready')
  requireValue('kgCanvasSurfaceMode', readCanvasSurfaceMode(frontmatter.kgCanvasSurfaceMode), '2d')
  requireValue('kgCanvasRenderMode', readCanvasRenderMode(frontmatter.kgCanvasRenderMode), '2d')
  requireValue('kgCanvas2dRenderer', readCanvas2dRenderer(frontmatter.kgCanvas2dRenderer), 'flow')
  requireValue('kgFloatingPanelOpen', readBooleanPreset(frontmatter.kgFloatingPanelOpen), false)
  requireValue('kgBottomPanelOpen', readBooleanPreset(frontmatter.kgBottomPanelOpen), false)
  requireValue('activatable_seed', readBooleanPreset(frontmatter.activatable_seed), false)
  requireValue('note_kind', frontmatter.note_kind, 'projection-contract')
  requireValue('run_ready_demo_id', frontmatter.run_ready_demo_id, 'flight-sim')
  const forbidden = [
    'run_ready_demo',
    'kgCanvas3dMode',
    'kgFloatingPanelView',
    ...DRAFT_IMPLEMENTED_RUNTIME_KEYS,
  ].filter(key => Object.hasOwn(frontmatter, key))
  if (missing.length > 0 || forbidden.length > 0) {
    throw new Error(
      `projection companion ${FLIGHT_COMPANION_BASENAME} must remain non-activating; `
      + `missing=${JSON.stringify(missing)} forbidden=${JSON.stringify(forbidden)}`,
    )
  }
}

const requireCitySimRuntimeIdentity = source => {
  const frontmatter = parseYamlFrontmatter(CITY_SIM_SEED_BASENAME, source)
  const runReadyDemo = isRecord(frontmatter.run_ready_demo)
    ? frontmatter.run_ready_demo
    : {}
  const cityRuntime = isRecord(frontmatter.city_runtime)
    ? frontmatter.city_runtime
    : {}
  const cityGeoXr = isRecord(frontmatter.city_geo_xr)
    ? frontmatter.city_geo_xr
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
  requireValue('kgCanvasSurfaceMode', readCanvasSurfaceMode(frontmatter.kgCanvasSurfaceMode), 'geo-xr')
  requireValue('kgCanvasRenderMode', readCanvasRenderMode(frontmatter.kgCanvasRenderMode), '3d')
  requireValue('kgCanvas3dMode', normalizePresetToken(frontmatter.kgCanvas3dMode), 'xr')
  requireValue('kgFloatingPanelOpen', readBooleanPreset(frontmatter.kgFloatingPanelOpen), true)
  requireValue('kgFloatingPanelView', frontmatter.kgFloatingPanelView, 'cityBuilder')
  requireValue('run_ready_demo.id', runReadyDemo.id, CITY_SIM_OVERLAY_AUTHORITY.id)
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
    `/${CITY_SIM_SEED_RELATIVE_PATH}`,
  )
  requireValue('run_ready_demo.source_root', runReadyDemo.source_root, 'knowgrph/docs')
  requireValue('run_ready_demo.source_backed', readBooleanPreset(runReadyDemo.source_backed), true)
  requireValue('run_ready_demo.native_runtime', readBooleanPreset(runReadyDemo.native_runtime), true)
  requireValue('run_ready_demo.presentation', runReadyDemo.presentation, 'shared-geo-xr-city-overlay')
  requireValue('run_ready_demo.auto_start', readBooleanPreset(runReadyDemo.auto_start), false)
  requireValue(
    'run_ready_demo.forbid_external_copy_or_dependency',
    readBooleanPreset(runReadyDemo.forbid_external_copy_or_dependency),
    true,
  )
  if (!Array.isArray(runReadyDemo.external_dependencies) || runReadyDemo.external_dependencies.length !== 0) {
    missing.push('run_ready_demo.external_dependencies=[]')
  }
  if (JSON.stringify(runReadyDemo.canonical_consumers) !== JSON.stringify([
    'workspace',
    'geo-xr-mode',
    'city-builder',
    'maplibre-flight-overlay',
  ])) {
    missing.push(
      'run_ready_demo.canonical_consumers=["workspace","geo-xr-mode","city-builder","maplibre-flight-overlay"]',
    )
  }
  requireValue('city_runtime.schema_id', cityRuntime.schema_id, 'knowgrph-city-grid/v1')
  requireValue('city_runtime.runtime_dependencies_added', cityRuntime.runtime_dependencies_added, 0)
  requireValue(
    'city_runtime.stage_owner',
    cityRuntime.stage_owner,
    CITY_SIM_OVERLAY_AUTHORITY.stageOwner,
  )
  requireValue(
    'city_runtime.renderer_rule',
    cityRuntime.renderer_rule,
    CITY_SIM_OVERLAY_AUTHORITY.rendererRule,
  )
  requireValue('city_geo_xr.surface_owner', cityGeoXr.surface_owner, 'Geo+XR Mode')
  requireValue('city_geo_xr.geo_host_owner', cityGeoXr.geo_host_owner, 'native MapLibre Geo host')
  requireValue(
    'city_geo_xr.geo_policy_owner',
    cityGeoXr.geo_policy_owner,
    'canvas/src/components/CanvasViewportGeospatialOverlay.tsx',
  )
  requireValue(
    'city_geo_xr.city_stage_owner',
    cityGeoXr.city_stage_owner,
    'existing shared React Three Fiber Canvas',
  )
  requireValue('city_geo_xr.parcel_input_owner', cityGeoXr.parcel_input_owner, 'City Stage')
  requireValue(
    'city_geo_xr.composition',
    cityGeoXr.composition,
    'native MapLibre Geo below the shared City R3F stage',
  )
  requireValue(
    'city_geo_xr.duplicate_map_or_canvas_forbidden',
    readBooleanPreset(cityGeoXr.duplicate_map_or_canvas_forbidden),
    true,
  )
  requireValue(
    'city_aerial_projection.behavior',
    cityAerialProjection.behavior,
    'deterministic read-only stopped aircraft and route',
  )
  requireValue('city_aerial_projection.phase', cityAerialProjection.phase, 'stopped')
  requireValue(
    'city_aerial_projection.spatial_source',
    cityAerialProjection.spatial_source,
    'current selected authored XR spatial profile and environment',
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
  requireValue(
    'city_aerial_projection.flight_projection_owner',
    cityAerialProjection.flight_projection_owner,
    'canvas/src/features/game-flight-sim/flightSimGeospatialProjection.ts',
  )
  requireValue(
    'city_aerial_projection.overlay_store_owner',
    cityAerialProjection.overlay_store_owner,
    'gympgrph/src/flightGeoOverlay.ts',
  )
  requireValue(
    'city_aerial_projection.maplibre_projection_owner',
    cityAerialProjection.maplibre_projection_owner,
    'gympgrph/src/flightGeoOverlayMapLibre.ts',
  )
  requireValue(
    'city_aerial_projection.shared_publisher_owner',
    cityAerialProjection.shared_publisher_owner,
    'canvas/src/components/CanvasViewportGeospatialOverlay.tsx',
  )
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
  if (missing.length > 0) {
    throw new Error(
      `proof-pending workspace document ${CITY_SIM_SEED_BASENAME} has invalid authority; `
      + `missing=${JSON.stringify(missing)}`,
    )
  }
}

const requireDraftIdentity = (basename, source) => {
  const frontmatter = parseYamlFrontmatter(basename, source)
  const isCompanion = basename.endsWith('.companion.md')
  const missing = []
  const forbidden = []
  const requireValue = (label, actual, expected) => {
    if (actual !== expected) missing.push(`${label}=${JSON.stringify(expected)}`)
  }

  requireValue('status', frontmatter.status, 'draft')
  requireValue('runtime_claim', frontmatter.runtime_claim, 'planned-contract-only')
  requireValue('kgCanvasSurfaceMode', readCanvasSurfaceMode(frontmatter.kgCanvasSurfaceMode), '2d')
  requireValue('kgCanvasRenderMode', readCanvasRenderMode(frontmatter.kgCanvasRenderMode), '2d')
  requireValue('kgCanvas2dRenderer', readCanvas2dRenderer(frontmatter.kgCanvas2dRenderer), 'flow')
  requireValue('kgFloatingPanelOpen', readBooleanPreset(frontmatter.kgFloatingPanelOpen), false)
  requireValue('kgBottomPanelOpen', readBooleanPreset(frontmatter.kgBottomPanelOpen), false)

  if (isCompanion) {
    requireValue('activatable_seed', readBooleanPreset(frontmatter.activatable_seed), false)
    requireValue('note_kind', frontmatter.note_kind, 'projection-contract')
  } else {
    requireValue('runtime_status', frontmatter.runtime_status, 'draft')
    if (!isRecord(frontmatter.planned_run_ready_demo)) {
      missing.push('planned_run_ready_demo object')
    } else {
      requireValue('planned_run_ready_demo.activation', frontmatter.planned_run_ready_demo.activation, 'disabled-until-runtime-ready')
      requireValue('planned_run_ready_demo.native_runtime', readBooleanPreset(frontmatter.planned_run_ready_demo.native_runtime), false)
      requireValue('planned_run_ready_demo.auto_start', readBooleanPreset(frontmatter.planned_run_ready_demo.auto_start), false)
    }
  }

  if (Object.hasOwn(frontmatter, 'run_ready_demo')) forbidden.push('run_ready_demo')
  if (Object.hasOwn(frontmatter, 'kgCanvas3dMode')) forbidden.push('3D canvas mode')
  if (Object.hasOwn(frontmatter, 'kgFloatingPanelView')) forbidden.push('FloatingPanel runtime view')
  for (const key of DRAFT_IMPLEMENTED_RUNTIME_KEYS) {
    if (Object.hasOwn(frontmatter, key)) forbidden.push(`implemented runtime contract ${key}`)
  }
  if (missing.length > 0 || forbidden.length > 0) {
    throw new Error(
      `draft workspace document ${basename} must remain non-activating; `
      + `missing=${JSON.stringify(missing)} forbidden=${JSON.stringify(forbidden)}`,
    )
  }
}

export async function verifyWorkspaceSeedAuthority({
  knowgrphRoot,
  agenticDocsRoot,
  publishRoot,
}) {
  const knowgrphInventory = await requireExactFileInventory({
    directoryPath: path.resolve(knowgrphRoot, WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH),
    expectedBasenames: KNOWGRPH_WORKSPACE_SEED_INVENTORY,
    label: 'Knowgrph authored workspace-seed directory',
  })
  const canonicalPath = path.resolve(knowgrphRoot, PHYSICS_SEED_RELATIVE_PATH)
  if (!await isFile(canonicalPath)) throw new Error(`canonical workspace seed is missing: ${canonicalPath}`)
  const source = await readFile(canonicalPath, 'utf8')
  requireCanonicalIdentity(source)
  const flightSource = await readFile(
    path.resolve(knowgrphRoot, FLIGHT_SEED_RELATIVE_PATH),
    'utf8',
  )
  requireFlightRuntimeIdentity(flightSource, source)
  const flightCompanionSource = await readFile(
    path.resolve(knowgrphRoot, WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH, FLIGHT_COMPANION_BASENAME),
    'utf8',
  )
  requireFlightCompanionIdentity(flightCompanionSource)
  const citySimSource = await readFile(
    path.resolve(knowgrphRoot, CITY_SIM_SEED_RELATIVE_PATH),
    'utf8',
  )
  requireCitySimRuntimeIdentity(citySimSource)
  for (const basename of DRAFT_WORKSPACE_SEED_BASENAMES) {
    const draftSource = await readFile(
      path.resolve(knowgrphRoot, WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH, basename),
      'utf8',
    )
    requireDraftIdentity(basename, draftSource)
  }

  let agenticInventory = null
  if (agenticDocsRoot) {
    const projectionDirectory = path.resolve(agenticDocsRoot, 'workspace-seeds')
    agenticInventory = await requireExactFileInventory({
      directoryPath: projectionDirectory,
      expectedBasenames: AGENTIC_WORKSPACE_SEED_PROJECTION_INVENTORY,
      label: 'Agentic Canvas OS workspace-seed projection directory',
    })
    const projectionPath = path.resolve(projectionDirectory, PHYSICS_SEED_BASENAME)
    if (!await isFile(projectionPath)) throw new Error(`default-storage projection is missing: ${projectionPath}`)
    const projection = await readFile(projectionPath, 'utf8')
    if (projection !== source) {
      throw new Error('Agentic Canvas OS default-storage projection must be byte-identical to the Knowgrph workspace-seed SSOT')
    }
  }

  let publishInventory = null
  if (publishRoot) {
    publishInventory = await requireExactFileInventory({
      directoryPath: path.resolve(publishRoot, WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH),
      expectedBasenames: [],
      label: 'Publish repository workspace-seed directory',
      allowMissingDirectory: true,
    })
  }

  return {
    canonicalPath,
    sourceBytes: Buffer.byteLength(source),
    knowgrphInventory,
    agenticInventory,
    publishInventory,
  }
}
