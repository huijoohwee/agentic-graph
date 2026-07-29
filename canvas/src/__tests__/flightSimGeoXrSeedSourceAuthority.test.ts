import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { load as loadYaml } from 'js-yaml'
import {
  diagnoseWorkspaceRunReadyDemoActivation,
  FLIGHT_SIM_DEMO_REPO_REL_PATH,
  FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME,
  FLIGHT_SIM_RUN_READY_DEMO_ID,
  XR_PHYSICS_DEMO_REPO_REL_PATH,
  resolveWorkspaceRunReadyDemoIdForDocument,
  resolveWorkspaceRunReadyDemoSeed,
} from '@/features/workspace-fs/workspaceRunReadyDemos'

const repoRoot = resolve(process.cwd(), '..')
const seedSource = readFileSync(
  resolve(repoRoot, FLIGHT_SIM_DEMO_REPO_REL_PATH),
  'utf8',
)

function frontmatter(source: string): Record<string, unknown> {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  assert.ok(match)
  const parsed = loadYaml(match[1])
  assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
  return parsed as Record<string, unknown>
}

test('Flight Sim activation is source-authored and path conflicts fail closed', () => {
  assert.equal(
    resolveWorkspaceRunReadyDemoSeed(FLIGHT_SIM_RUN_READY_DEMO_ID)?.validationSeedRelPath,
    FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME,
  )
  assert.equal(
    resolveWorkspaceRunReadyDemoIdForDocument('/imports/local-flight.md', seedSource),
    FLIGHT_SIM_RUN_READY_DEMO_ID,
  )
  assert.equal(
    resolveWorkspaceRunReadyDemoIdForDocument(FLIGHT_SIM_DEMO_REPO_REL_PATH, seedSource),
    FLIGHT_SIM_RUN_READY_DEMO_ID,
  )
  assert.equal(
    resolveWorkspaceRunReadyDemoIdForDocument(XR_PHYSICS_DEMO_REPO_REL_PATH, seedSource),
    '',
  )
  const conflict = diagnoseWorkspaceRunReadyDemoActivation(
    XR_PHYSICS_DEMO_REPO_REL_PATH,
    seedSource,
  )
  assert.equal(conflict.ok, false)
  if (conflict.ok === false) {
    assert.equal(conflict.errorCode, 'RUN_READY_IDENTITY_CONFLICT')
    assert.match(conflict.message, /xr-physics/)
    assert.match(conflict.message, /flight-sim/)
  }
  const unregistered = diagnoseWorkspaceRunReadyDemoActivation(
    '/imports/unknown.md',
    seedSource.replace('id: "flight-sim"', 'id: "unregistered-flight"'),
  )
  assert.equal(unregistered.ok, false)
  if (unregistered.ok === false) {
    assert.equal(unregistered.errorCode, 'RUN_READY_IDENTITY_UNREGISTERED')
    assert.match(unregistered.message, /unregistered-flight/)
  }
})

test('Flight Sim source declares the canonical Geo+XR composition', () => {
  const meta = frontmatter(seedSource)
  assert.equal(meta.status, 'runtime-ready')
  assert.equal(meta.runtime_status, 'runtime-ready')
  assert.equal(meta.runtime_claim, 'local-runtime-ready')
  assert.equal(
    meta.evidence_status,
    'exact-head source and browser proof required at every handoff',
  )
  assert.equal(meta.publish_scope, 'local-only')
  assert.equal(meta.kgCanvasSurfaceMode, 'geo-xr')
  assert.equal(meta.kgCanvasRenderMode, '3d')
  assert.equal(meta.kgCanvas3dMode, 'xr')
  assert.equal(meta.kgCanvas2dRenderer, undefined)
  assert.equal(meta.kgFloatingPanelOpen, true)
  assert.equal(meta.kgFloatingPanelView, 'flightSim')
  assert.equal(
    Object.keys(meta).some(key => key.startsWith('planned_')),
    false,
  )
  assert.deepEqual(meta.run_ready_demo, {
    id: 'flight-sim',
    activation: 'applied-source-document',
    identity_authority: 'source-authored run_ready_demo.id',
    imported_path_alias_required: false,
    identity_conflict: 'fail closed when path and source identity disagree',
    canonical_consumers: ['workspace', 'geo-xr-mode'],
    dev_command: 'npm run dev',
    canonical_source_file: '/docs/workspace-seeds/knowgrph-game-flight-sim-demo.md',
    env_selector: 'VITE_KNOWGRPH_RUN_READY_DEMO=flight-sim',
    validation_seed_path: '/knowgrph-game-flight-sim-demo.md',
    source_root: 'knowgrph/docs',
    source_backed: true,
    clean_canvas_recommended: true,
    native_runtime: true,
    presentation: 'shared-geo-xr-gameplay-overlay',
    document_presentation: 'runtime-ready-workspace-demo',
    auto_start: true,
    external_dependencies: [],
    forbid_external_copy_or_dependency: true,
  })
  assert.deepEqual(meta.shared_xr_scene, {
    source_authority: '/docs/workspace-seeds/knowgrph-physics-playground-demo.md',
    world_ownership: 'overlay-only',
    surface_owner: 'Geo+XR Mode',
    renderer_owner: 'canvas/src/lib/three/ThreeGraph.impl.tsx',
    collider_owner: 'canvas/src/features/three/xrCanonicalSceneSpatialSource.ts',
    camera_owner: 'canvas/src/features/three/useXrNativeControllerDemoCamera.ts',
    second_r3f_canvas_forbidden: true,
  })
  assert.deepEqual(meta.geo_flight_overlay, {
    activation: 'selected authored environment plus source-authored Flight identity',
    renderer_owner: 'native MapLibre Geo host',
    geo_policy_owner: 'canvas/src/components/CanvasViewportGeospatialOverlay.tsx',
    presentation_owner: 'gympgrph/src/GeospatialHost.tsx',
    render_policy: 'native MapLibre under transparent Flight R3F overlay',
    maplibre_views: ['2d-classic', '2d-modern', '3d-classic', '3d-modern'],
    basemap: 'selected native MapLibre provider view',
    maplibre_runtime_started: true,
    provider_transport_owner: 'gympgrph Geo runtime; independent from Flight gameplay',
    flight_gameplay_transport: 'none',
    control_owner: 'canvas/src/features/game-flight-sim/useFlightSimSurfaceControls.ts',
    route_projection_owner: 'canvas/src/features/game-flight-sim/flightSimGeospatialProjection.ts',
    xr_canvas_mounted: true,
    duplicate_r3f_environment_mounted: false,
    composition: 'MapLibre owns the geospatial world plus all visible Flight route/waypoint/aircraft geometry; the existing transparent R3F Canvas retains simulation/input/readiness and paints no Flight or XR geometry',
  })
  const authority = readFileSync(
    resolve(repoRoot, 'scripts/workspace-seed-authority.mjs'),
    'utf8',
  )
  const projectionStart = authority.indexOf(
    'AGENTIC_WORKSPACE_SEED_PROJECTION_INVENTORY',
  )
  const projectionEnd = authority.indexOf('])', projectionStart)
  const projectionInventory = authority.slice(projectionStart, projectionEnd + 2)
  assert.match(projectionInventory, /PHYSICS_SEED_BASENAME/)
  assert.doesNotMatch(projectionInventory, /FLIGHT_SEED_BASENAME/)
})
