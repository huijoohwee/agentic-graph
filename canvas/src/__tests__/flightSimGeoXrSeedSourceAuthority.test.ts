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
import {
  FLIGHT_SIM_SHARED_XR_SOURCE_AUTHORITY,
  hydrateFlightSimSharedXrSceneSource,
  resolveCanonicalFlightSimXrPersistedValue,
  resolveFlightSimSharedXrMotionReferenceSource,
} from '@/features/game-flight-sim/flightSimSharedXrSceneSource'
import {
  readXrMotionReferencePlan,
} from '@/features/three/xrMotionReferenceModel'
import {
  readXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import {
  hydrateCanonicalXrMotionReferenceRuntime,
} from '@/features/three/XrMotionReferenceRuntimeBridge'
import {
  controlLocalXrScene,
} from '@/features/three/xrSceneMcpRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'

const repoRoot = resolve(process.cwd(), '..')
const seedSource = readFileSync(
  resolve(repoRoot, FLIGHT_SIM_DEMO_REPO_REL_PATH),
  'utf8',
)
const physicsSeedSource = readFileSync(
  resolve(repoRoot, XR_PHYSICS_DEMO_REPO_REL_PATH),
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
    canonical_source_file: '/docs/workspace-seeds/agenticgraph-game-flight-sim-demo.md',
    env_selector: 'VITE_AGENTICGRAPH_RUN_READY_DEMO=flight-sim',
    validation_seed_path: '/agenticgraph-game-flight-sim-demo.md',
    source_root: 'agenticgraph/docs',
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
    source_authority: '/docs/workspace-seeds/agenticgraph-physics-playground-demo.md',
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
    render_policy: 'native MapLibre owns every visible Flight route and aircraft mark',
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

test('Flight resolves subjects from its declared Physics authority without a copied fallback', () => {
  const resolved = resolveFlightSimSharedXrMotionReferenceSource({
    activeDocumentText: seedSource,
    currentPersistedValue: undefined,
    physicsSourceText: physicsSeedSource,
  })
  assert.equal(resolved.ok, true)
  if (!resolved.ok) return
  assert.equal(resolved.authority, 'physics-source')
  const plan = readXrMotionReferencePlan(resolved.persistedValue)
  assert.equal(plan.stageId, 'singapore')
  assert.deepEqual(
    plan.subjects.map(subject => subject.assetId),
    ['vehicle-helicopter', 'vehicle-sedan'],
  )

  const explicitEmptyPlan = {
    schema: 'agenticgraph-xr-motion-reference/v1',
    stageId: 'singapore',
    durationSeconds: 6,
    fps: 12,
    subjects: [],
    cast: [],
    camera: [],
  }
  const explicit = resolveFlightSimSharedXrMotionReferenceSource({
    activeDocumentText: seedSource,
    currentPersistedValue: explicitEmptyPlan,
    physicsSourceText: '',
  })
  assert.equal(explicit.ok, true)
  if (explicit.ok) {
    assert.equal(explicit.authority, 'active-document')
    assert.equal(explicit.persistedValue, explicitEmptyPlan)
    assert.equal(
      readXrMotionReferencePlan(explicit.persistedValue).subjects.length,
      0,
    )
  }
  const physicsPlan =
    frontmatter(physicsSeedSource).kgXrMotionReference as Record<string, unknown>
  const physicsCast = physicsPlan.cast as unknown[]

  const mismatchedAuthority =
    resolveFlightSimSharedXrMotionReferenceSource({
      activeDocumentText: seedSource.replace(
        FLIGHT_SIM_SHARED_XR_SOURCE_AUTHORITY,
        '/docs/workspace-seeds/not-the-physics-authority.md',
      ),
      currentPersistedValue: undefined,
      physicsSourceText: physicsSeedSource,
    })
  assert.equal(mismatchedAuthority.ok, false)

  const unrelatedDocument =
    resolveFlightSimSharedXrMotionReferenceSource({
      activeDocumentText: physicsSeedSource,
      currentPersistedValue: undefined,
      physicsSourceText: physicsSeedSource,
    })
  assert.equal(unrelatedDocument.ok, false)

  for (const malformed of [
    null,
    'invalid',
    {
      ...explicitEmptyPlan,
      schema: 'wrong/v9',
    },
    {
      ...explicitEmptyPlan,
      subjects: [{}],
    },
    {
      ...explicitEmptyPlan,
      durationSeconds: 999,
    },
    {
      ...explicitEmptyPlan,
      cast: [{ actorId: 'orphan', marks: [] }],
    },
    {
      ...explicitEmptyPlan,
      camera: [{}],
    },
    {
      ...physicsPlan,
      cast: [...physicsCast, physicsCast[0]],
    },
  ]) {
    const result = resolveFlightSimSharedXrMotionReferenceSource({
      activeDocumentText: seedSource,
      currentPersistedValue: malformed,
      physicsSourceText: physicsSeedSource,
    })
    assert.equal(result.ok, false)
  }

  const wrongPhysicsSchema =
    resolveFlightSimSharedXrMotionReferenceSource({
      activeDocumentText: seedSource,
      currentPersistedValue: undefined,
      physicsSourceText: physicsSeedSource.replace(
        'schema: "agenticgraph-xr-motion-reference/v1"',
        'schema: "wrong/v9"',
      ),
    })
  assert.equal(wrongPhysicsSchema.ok, false)

  const emptyPhysicsSubjects =
    resolveFlightSimSharedXrMotionReferenceSource({
      activeDocumentText: seedSource,
      currentPersistedValue: undefined,
      physicsSourceText: physicsSeedSource.replace(
        /  subjects:\n[\s\S]*?\n  cast:/,
        '  subjects: []\n  cast:',
      ),
    })
  assert.equal(emptyPhysicsSubjects.ok, false)

  const invalidFlightIdentity = resolveCanonicalFlightSimXrPersistedValue({
    activeDocumentName: FLIGHT_SIM_DEMO_REPO_REL_PATH,
    activeDocumentText: seedSource.replace(
      'id: "flight-sim"',
      'id: "unregistered-flight"',
    ),
    currentPersistedValue: undefined,
    graphData: {
      type: 'Graph',
      nodes: [{
        id: 'flight-route',
        label: 'Flight route',
        type: 'Route',
        properties: {},
      }],
      edges: [],
      metadata: {},
    },
  })
  assert.equal(invalidFlightIdentity.applies, true)
  if (invalidFlightIdentity.applies) {
    assert.equal(invalidFlightIdentity.ok, false)
  }
})

test('canonical XR controls preserve the verified Flight Physics subjects', async () => {
  const previous = useGraphStore.getState()
  useGraphStore.setState({
    graphData: {
      type: 'Graph',
      nodes: [
        {
          id: 'flight_demo_entry',
          label: 'Launch and Fly',
          type: 'FlightDemoControl',
          properties: {},
        },
        {
          id: 'flight_aircraft',
          label: 'Airplane',
          type: 'FlightDemoAircraft',
          properties: {},
        },
        {
          id: 'flight_runtime_gate',
          label: 'Runtime Readiness',
          type: 'FlightDemoValidation',
          properties: {},
        },
      ],
      edges: [],
      metadata: {},
    },
    markdownDocumentName: FLIGHT_SIM_DEMO_REPO_REL_PATH,
    markdownDocumentText: seedSource,
    floatingPanelOpen: true,
    floatingPanelView: 'flightSim',
    bottomSurfaceCollapsed: true,
    bottomSurfaceTab: 'timeline',
  } as never)
  try {
    const revisionBeforeVerification = readXrMotionReferenceRuntime().revision
    assert.equal(hydrateCanonicalXrMotionReferenceRuntime(), false)
    assert.equal(
      readXrMotionReferenceRuntime().revision,
      revisionBeforeVerification,
    )

    assert.equal(await hydrateFlightSimSharedXrSceneSource(), true)
    const expectedAssetIds = [
      'vehicle-helicopter',
      'vehicle-sedan',
    ]
    const expectedGraphActorIds = [
      'flight_demo_entry',
      'flight_aircraft',
      'flight_runtime_gate',
    ]
    const expectedCastActorIds = [
      ...expectedGraphActorIds,
      ...readXrMotionReferenceRuntime().plan.subjects
        .map(subject => subject.id),
    ]
    assert.deepEqual(
      readXrMotionReferenceRuntime().plan.subjects
        .map(subject => subject.assetId),
      expectedAssetIds,
    )
    assert.deepEqual(
      readXrMotionReferenceRuntime().plan.cast
        .map(track => track.actorId),
      expectedCastActorIds,
    )

    const beforeSceneIdentityChange =
      readXrMotionReferenceRuntime().revision
    useGraphStore.setState(state => ({
      graphData: state.graphData
        ? {
            ...state.graphData,
            metadata: {
              ...state.graphData.metadata,
              sourcePath: '/imports/flight-sim-copy.md',
            },
          }
        : null,
    }) as never)
    assert.equal(hydrateCanonicalXrMotionReferenceRuntime(), false)
    assert.equal(
      readXrMotionReferenceRuntime().revision,
      beforeSceneIdentityChange,
    )
    assert.equal(await hydrateFlightSimSharedXrSceneSource(), true)

    assert.equal(hydrateCanonicalXrMotionReferenceRuntime(), true)
    assert.deepEqual(
      readXrMotionReferenceRuntime().plan.subjects
        .map(subject => subject.assetId),
      expectedAssetIds,
    )

    const graphDataBeforeSameStageHandoff =
      useGraphStore.getState().graphData
    const graphRevisionBeforeSameStageHandoff =
      useGraphStore.getState().graphDataRevision
    const graphContentRevisionBeforeSameStageHandoff =
      useGraphStore.getState().graphContentRevision
    const documentTextBeforeSameStageHandoff =
      useGraphStore.getState().markdownDocumentText
    const motionRevisionBeforeSameStageHandoff =
      readXrMotionReferenceRuntime().revision
    assert.equal(readXrMotionReferenceRuntime().dirty, false)
    assert.equal(
      useGraphStore.getState().graphData?.metadata?.kgXrMotionReference,
      undefined,
    )
    const stageResult = controlLocalXrScene({
      action: 'stage',
      stageId: 'singapore',
    })
    assert.equal(stageResult.ok, true)
    assert.match(stageResult.message, /already staged/i)
    assert.equal(
      readXrMotionReferenceRuntime().revision,
      motionRevisionBeforeSameStageHandoff,
    )
    assert.equal(
      useGraphStore.getState().graphData,
      graphDataBeforeSameStageHandoff,
    )
    assert.equal(
      useGraphStore.getState().graphDataRevision,
      graphRevisionBeforeSameStageHandoff,
    )
    assert.equal(
      useGraphStore.getState().graphContentRevision,
      graphContentRevisionBeforeSameStageHandoff,
    )
    assert.equal(
      useGraphStore.getState().markdownDocumentText,
      documentTextBeforeSameStageHandoff,
    )
    assert.equal(useGraphStore.getState().floatingPanelOpen, true)
    assert.equal(useGraphStore.getState().floatingPanelView, 'flightSim')
    assert.equal(useGraphStore.getState().bottomSurfaceCollapsed, true)
    assert.equal(useGraphStore.getState().bottomSurfaceTab, 'timeline')
    assert.equal(
      useGraphStore.getState().graphData?.metadata?.kgXrMotionReference,
      undefined,
    )
    assert.equal(hydrateCanonicalXrMotionReferenceRuntime(), true)
    assert.deepEqual(
      readXrMotionReferenceRuntime().plan.subjects
        .map(subject => subject.assetId),
      expectedAssetIds,
    )
    assert.deepEqual(
      readXrMotionReferenceRuntime().plan.cast
        .map(track => track.actorId),
      expectedCastActorIds,
    )
  } finally {
    useGraphStore.setState({
      graphData: previous.graphData,
      markdownDocumentName: previous.markdownDocumentName,
      markdownDocumentText: previous.markdownDocumentText,
      floatingPanelOpen: previous.floatingPanelOpen,
      floatingPanelView: previous.floatingPanelView,
      bottomSurfaceCollapsed: previous.bottomSurfaceCollapsed,
      bottomSurfaceTab: previous.bottomSurfaceTab,
    } as never)
    hydrateCanonicalXrMotionReferenceRuntime()
  }
})
