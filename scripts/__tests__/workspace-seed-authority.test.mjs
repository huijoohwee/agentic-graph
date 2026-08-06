import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  CITY_SIM_SEED_RELATIVE_PATH,
  DRAFT_WORKSPACE_SEED_BASENAMES,
  FLIGHT_COMPANION_BASENAME,
  FLIGHT_SEED_BASENAME,
  FLIGHT_SEED_RELATIVE_PATH,
  PHYSICS_SEED_RELATIVE_PATH,
  XR_V2_SEED_RELATIVE_PATH,
  resolveWorkspaceSeedSiblingRootsFromGitCommonDir,
  verifyWorkspaceSeedAuthority,
} from '../workspace-seed-authority.mjs'

const canonicalSeed = `---
canonical_source_file: "/docs/workspace-seeds/knowgrph-physics-playground-demo.md"
source_root: "knowgrph/docs"
source_backed: true
kgBottomPanelOpen: false
native_controller_demo:
  camera_mode: "fixed-follow"
  camera:
    default: "fixed-follow"
    selector: "FloatingPanel Camera / SHOOT / Camera source"
    available: ["fixed-follow", "free-orbit"]
    invocation: "/camera.select @camera #camera camera=fixed-follow|free-orbit"
    timeline_override: "camera-mark playback temporarily owns framing"
runtime_validation:
  xr_authoring_edited_media_delivery:
    scope: "xr-authoring-edited-media-delivery"
    projection_role: "downstream scoped evidence; not a second XR readiness authority"
    prd: "/docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md"
    runtime_owner: "canvas/src/components/timeline; canvas/src/features/gitgraph"
    source_snapshot_schema: "knowgrph-xr-v2-readiness/v1"
    source_snapshot_status: "source-ready"
    canonical_delivery_status: "runtime-ready"
    canonical_delivery_limit: "XR authoring and native edited-media delivery only"
    reviewed_feature_commit: "fcd69c6b2d42a00779f55be8c1d57a0ab468339b"
    pull_request: 674
    protected_refresh_chain:
      - "48c58307481c96e5c73c9f4d2f53eb2c2f1c8549"
      - "fea5e37b9bf0d648284330cfbc3dcca03890def0"
      - "a6de5722e550e633d0d73f59f187a09ec7388879"
    canonical_main_commit: "a3ddfef7cc55c38385520173273abd66010e9747"
    canonical_main_tree: "76c8e22da9c9284f01c2627c8ace9c9d3abcd682"
    canonical_main_proof:
      workflow: "Integration"
      run_id: 30895597328
      check: "Integration Gate"
      conclusion: "success"
      completed_at: "2026-08-04T09:26:58Z"
      affected_scope: "xr_v2_video_editor"
      focused_gate: "npm run xr-v2:review-ready"
      browser_observation_schema: "knowgrph-xr-v2-browser-smoke/v1"
      browser_observation: "pass"
    canonical_runtime_reconciliation:
      integration_result_schema: "agentic-device-integration-result/v1"
      integration_status: "runtime_ready"
      readiness_schema: "agentic-local-runtime-readiness/v1"
      feature_runtime_source_revision: "a3ddfef7cc55c38385520173273abd66010e9747"
      feature_runtime_agentic_canvas_os_revision: "217a8a42d6497e059839a6a1f809c2459530ca54"
      feature_runtime_evidence_digest: "fc13db3e3184f69e42985dbec441bab163f52ba2d7e75b959e17194304f8fb23"
      feature_runtime_verified_at: "2026-08-04T09:29:02.924Z"
    proven:
      - "canonical ECS projection including entity zero"
      - "real standalone Three.js material application"
      - "mounted canonical Timeline command routing"
      - "same-origin browser-native edited-media export"
      - "non-empty Blob, decoded metadata, and bounded playback"
      - "media teardown and object-URL revocation without observed page or media errors"
      - "clean-room dependency and source enforcement"
    external_dependencies: []
    no_deployment: true
    deploy_boundary: "Dev-only"
    broader_xr_status: "blocked"
    blocked_claims:
      - "mounted-renderer material wiring"
      - "live depth model and quality"
      - "reference-device frame budget"
      - "camera permission and lifecycle on named physical devices"
      - "physical-headset XR behavior"
      - "Production availability"
      - "deployment authority"
flow:
  nodes:
    - id: "xr_demo_entry"
      type: "XrDemoControl"
      label: "Develop and Run"
      pos: {x: -420, y: 0}
      properties:
        role: "lifecycle"
        state: "runtime-ready"
        output: "Apply this Source Files document to launch the native demo, then switch controllers without resetting motion."
    - id: "xr_edited_media_proof"
      type: "XrDemoValidation"
      label: "Scoped Edited-media Proof"
      pos: {x: 880, y: 300}
      properties:
        role: "downstream canonical-main evidence projection"
        scope: "xr-authoring-edited-media-delivery"
        sourceSnapshotState: "source-ready"
        canonicalDeliveryState: "runtime-ready"
        broaderXrState: "blocked"
        output: "Inspect the protected-main XR v2 review gate and canonical runtime receipt; applying this seed does not rerun the browser smoke."
  connections:
    - from: "xr_demo_entry"
      to: "xr_edited_media_proof"
      label: "inspect scoped proof"
---

## Scoped XR edited-media evidence

It does not load a video sequence, run the dedicated smoke route.
`
const flightRuntimeSeed = `---
status: "runtime-ready"
runtime_status: "runtime-ready"
runtime_claim: "local-runtime-ready"
evidence_status: "exact-head source and browser proof required at every handoff"
publish_scope: "local-only"
kgCanvasSurfaceMode: "geo-xr"
kgCanvasRenderMode: "3d"
kgCanvas3dMode: "xr"
kgFloatingPanelOpen: true
kgFloatingPanelView: "flightSim"
run_ready_demo:
  id: "flight-sim"
  canonical_source_file: "/docs/workspace-seeds/knowgrph-game-flight-sim-demo.md"
  source_root: "knowgrph/docs"
  source_backed: true
  native_runtime: true
  auto_start: true
  external_dependencies: []
shared_xr_scene:
  source_authority: "/docs/workspace-seeds/knowgrph-physics-playground-demo.md"
  world_ownership: "overlay-only"
  surface_owner: "Geo+XR Mode"
  camera_owner: "canvas/src/features/three/useXrNativeControllerDemoCamera.ts"
native_flight_demo:
  camera_mode: "fixed-follow"
  camera:
    default: "fixed-follow"
    selector: "FloatingPanel Camera / SHOOT / Camera source"
    available: ["fixed-follow", "free-orbit"]
    invocation: "/camera.select @camera #camera camera=fixed-follow|free-orbit"
    timeline_override: "camera-mark playback temporarily owns framing"
    catalog_owner: "canvas/src/features/three/xrNativeControllerCameraCatalog.ts"
    selection_owner: "canvas/src/features/three/xrNativeControllerCameraRuntime.ts"
    driver_owner: "gympgrph/src/flightGeoOverlayMapLibreCamera.ts"
    runtime_canvas_driver_owner: "canvas/src/features/three/useXrNativeControllerDemoCamera.ts"
flight_sim:
  invocation: "/flight.sim @canvas #flight operation=open"
  inspect_tool: "knowgrph.inspect_local_flight_sim"
  control_tool: "knowgrph.control_local_flight_sim"
---
`
const flightCompanion = `---
status: "projection-pending"
runtime_claim: "local-runtime-ready"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "flow"
kgFloatingPanelOpen: false
kgBottomPanelOpen: false
activatable_seed: false
note_kind: "projection-contract"
run_ready_demo_id: "flight-sim"
---
`
const cityRuntimeSeed = await readFile(
  new URL('../../docs/workspace-seeds/knowgrph-game-city-building-sim-demo.md', import.meta.url),
  'utf8',
)
const xrV2RuntimeSeed = await readFile(
  new URL('../../docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md', import.meta.url),
  'utf8',
)
const safeDraftPresentation = [
  'runtime_claim: "planned-contract-only"',
  'kgCanvasSurfaceMode: "2d"',
  'kgCanvasRenderMode: "2d"',
  'kgCanvas2dRenderer: "flow"',
  'kgFloatingPanelOpen: false',
  'kgBottomPanelOpen: false',
].join('\n')

const fixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workspace-seed-authority-'))
  const knowgrphRoot = path.join(root, 'knowgrph')
  const agenticDocsRoot = path.join(root, 'agentic-canvas-os/docs')
  const publishRoot = path.join(root, 'huijoohwee')
  const canonicalPath = path.join(knowgrphRoot, PHYSICS_SEED_RELATIVE_PATH)
  const projectionPath = path.join(agenticDocsRoot, 'workspace-seeds/knowgrph-physics-playground-demo.md')
  await mkdir(path.dirname(canonicalPath), { recursive: true })
  await mkdir(path.dirname(projectionPath), { recursive: true })
  await mkdir(publishRoot, { recursive: true })
  await writeFile(path.join(path.dirname(canonicalPath), 'README.md'), '# Workspace Seed Authority\n')
  await writeFile(canonicalPath, canonicalSeed)
  await writeFile(path.join(knowgrphRoot, XR_V2_SEED_RELATIVE_PATH), xrV2RuntimeSeed)
  await writeFile(path.join(knowgrphRoot, CITY_SIM_SEED_RELATIVE_PATH), cityRuntimeSeed)
  await writeFile(path.join(knowgrphRoot, FLIGHT_SEED_RELATIVE_PATH), flightRuntimeSeed)
  await writeFile(
    path.join(knowgrphRoot, 'docs/workspace-seeds', FLIGHT_COMPANION_BASENAME),
    flightCompanion,
  )
  for (const basename of DRAFT_WORKSPACE_SEED_BASENAMES) {
    const frontmatter = basename.endsWith('.companion.md')
      ? `status: "draft"\nactivatable_seed: false\nnote_kind: "projection-contract"\n${safeDraftPresentation}`
      : `status: "draft"\nruntime_status: "draft"\n${safeDraftPresentation}\nplanned_run_ready_demo:\n  id: "planned"\n  activation: "disabled-until-runtime-ready"\n  native_runtime: false\n  auto_start: false`
    await writeFile(
      path.join(path.dirname(canonicalPath), basename),
      `---\n${frontmatter}\n---\n`,
    )
  }
  await writeFile(projectionPath, canonicalSeed)
  return { root, knowgrphRoot, agenticDocsRoot, publishRoot }
}

test('derives sibling roots from the canonical git common directory', () => {
  assert.deepEqual(
    resolveWorkspaceSeedSiblingRootsFromGitCommonDir('/workspace/GitHub/knowgrph/.git'),
    {
      agenticDocsRoot: path.resolve('/workspace/GitHub/agentic-canvas-os/docs'),
      publishRoot: path.resolve('/workspace/GitHub/huijoohwee'),
    },
  )
})

test('accepts the exact authored and projection inventories', async t => {
  const roots = await fixture()
  t.after(() => rm(roots.root, { recursive: true, force: true }))
  await assert.doesNotReject(() => verifyWorkspaceSeedAuthority(roots))
})

test('rejects drift in the scoped XR edited-media evidence projection', async t => {
  const mutations = [
    ['opened XR bottom panel', 'kgBottomPanelOpen: false', 'kgBottomPanelOpen: true'],
    ['promoted source snapshot', 'source_snapshot_status: "source-ready"', 'source_snapshot_status: "runtime-ready"'],
    ['wrong canonical status', 'canonical_delivery_status: "runtime-ready"', 'canonical_delivery_status: "source-ready"'],
    ['wrong runtime owner', 'runtime_owner: "canvas/src/components/timeline; canvas/src/features/gitgraph"', 'runtime_owner: "alternate/runtime"'],
    ['broadened canonical delivery limit', 'canonical_delivery_limit: "XR authoring and native edited-media delivery only"', 'canonical_delivery_limit: "all XR runtime behavior"'],
    ['wrong workflow', 'workflow: "Integration"', 'workflow: "Deploy"'],
    ['wrong completion timestamp', 'completed_at: "2026-08-04T09:26:58Z"', 'completed_at: "2026-08-04T09:27:00Z"'],
    ['wrong affected scope', 'affected_scope: "xr_v2_video_editor"', 'affected_scope: "all_xr"'],
    ['wrong browser observation schema', 'browser_observation_schema: "knowgrph-xr-v2-browser-smoke/v1"', 'browser_observation_schema: "generic-browser-smoke/v1"'],
    ['external dependency', 'external_dependencies: []', 'external_dependencies: ["remote-editor"]'],
    ['deployment enabled', 'no_deployment: true', 'no_deployment: false'],
    ['Production deploy boundary', 'deploy_boundary: "Dev-only"', 'deploy_boundary: "Production"'],
    ['wrong runtime digest', 'fc13db3e3184f69e42985dbec441bab163f52ba2d7e75b959e17194304f8fb23', '0'.repeat(64)],
    ['removed deployment blocker', '      - "deployment authority"', '      - "deployment allowed"'],
    [
      'extra evidence key',
      '    scope: "xr-authoring-edited-media-delivery"',
      '    scope: "xr-authoring-edited-media-delivery"\n    extra_evidence: true',
    ],
    [
      'extra canonical-main proof key',
      '      workflow: "Integration"',
      '      workflow: "Integration"\n      deployment_run: false',
    ],
    [
      'extra runtime reconciliation key',
      '      integration_result_schema: "agentic-device-integration-result/v1"',
      '      integration_result_schema: "agentic-device-integration-result/v1"\n      deployment_receipt: null',
    ],
    [
      'extra proof node key',
      '    - id: "xr_edited_media_proof"\n      type: "XrDemoValidation"',
      '    - id: "xr_edited_media_proof"\n      extraNodeState: "forbidden"\n      type: "XrDemoValidation"',
    ],
    [
      'extra proof position key',
      '      pos: {x: 880, y: 300}',
      '      pos: {x: 880, y: 300, z: 0}',
    ],
    [
      'extra proof properties key',
      '        role: "downstream canonical-main evidence projection"',
      '        role: "downstream canonical-main evidence projection"\n        deploymentState: "none"',
    ],
    [
      'extra proof edge key',
      '    - from: "xr_demo_entry"\n      to: "xr_edited_media_proof"',
      '    - from: "xr_demo_entry"\n      extraEdgeState: "forbidden"\n      to: "xr_edited_media_proof"',
    ],
    [
      'duplicate proof node',
      '  connections:\n    - from: "xr_demo_entry"',
      '    - id: "xr_edited_media_proof"\n      type: "Duplicate"\n  connections:\n    - from: "xr_demo_entry"',
    ],
    [
      'extra incident proof edge',
      '      label: "inspect scoped proof"\n---',
      '      label: "inspect scoped proof"\n    - from: "xr_edited_media_proof"\n      to: "xr_demo_entry"\n      label: "return"\n---',
    ],
    [
      'wrong proof topology',
      '    - from: "xr_demo_entry"\n      to: "xr_edited_media_proof"\n      label: "inspect scoped proof"',
      '    - from: "xr_runtime_gate"\n      to: "xr_edited_media_proof"\n      label: "inspect scoped proof"',
    ],
  ]
  for (const [label, from, to] of mutations) {
    await t.test(label, async t => {
      const roots = await fixture()
      t.after(() => rm(roots.root, { recursive: true, force: true }))
      const canonicalPath = path.join(roots.knowgrphRoot, PHYSICS_SEED_RELATIVE_PATH)
      const source = await readFile(canonicalPath, 'utf8')
      assert.notEqual(source, source.replace(from, to), `fixture is missing ${from}`)
      await writeFile(canonicalPath, source.replace(from, to))
      await assert.rejects(
        () => verifyWorkspaceSeedAuthority(roots),
        /canonical XR edited-media evidence is invalid/,
      )
    })
  }
})

test('rejects City drift from the canonical regional POI zoning contract', async t => {
  const mutations = [
    ['wrong surface', 'kgCanvasSurfaceMode: "geo-xr"', 'kgCanvasSurfaceMode: "invalid"'],
    [
      'private MapLibre host',
      'geo_host_owner: "native MapLibre Geo host"',
      'geo_host_owner: "invalid"',
    ],
    [
      'private semantic surface',
      'surface_owner: "native MapLibre Geo+XR surface wrapped by SemanticMediaFigure"',
      'surface_owner: "invalid"',
    ],
    [
      'wrong renderer',
      'renderer_rule: "reuse one native MapLibre map; create or activate zero City Three presentation; any retained shared Canvas remains inactive, invisible, and pointer-transparent"',
      'renderer_rule: "invalid"',
    ],
    [
      'wrong semantic owner',
      'owner: "canvas/src/lib/cards/SemanticMediaFigure.tsx"',
      'owner: "invalid"',
    ],
    [
      'wrong native canvas semantic owner',
      'native_canvas_semantic_owner: "gympgrph/src/features/geospatial/mapLibreCanvasSemanticOwner.ts"',
      'native_canvas_semantic_owner: "invalid"',
    ],
    [
      'wrong semantic child owner',
      'child_owner: "canvas/src/components/CanvasViewportGeospatialOverlay.tsx"',
      'child_owner: "invalid"',
    ],
    [
      'wrong selection condition',
      'selection_target: "live MapLibre canvas while City runtime active"',
      'selection_target: "invalid"',
    ],
    [
      'wrong basemap owner',
      'basemap_owner: "one real native MapLibre basemap"',
      'basemap_owner: "invalid"',
    ],
    [
      'wrong parcel identity policy',
      'parcel_identity_policy: "each parcel_id exactly equals one RegionalPoiIdentity.id from the selected profile; one-to-one coverage; no alias or remap"',
      'parcel_identity_policy: "invalid"',
    ],
    [
      'geometry-bearing ordering policy',
      'ordering_policy: "row and column are deterministic UI ordering only and never geometry"',
      'ordering_policy: "row and column generate geometry"',
    ],
    [
      'wrong regional profile identity',
      'regional_poi_profile_id: "adm0:SGP:major-pois/v1"',
      'regional_poi_profile_id: "legacy-local-singapore"',
    ],
    [
      'wrong Geo+XR layer order',
      'layer_order: ["regional-context", "city", "flight"]',
      'layer_order: ["city", "regional-context", "flight"]',
    ],
    [
      'wrong profile framing policy',
      'camera_policy: "fit the selected regional POI profile bounds into the visible panel-adjusted aperture and restore prior padding"',
      'camera_policy: "fit source-authored parcel bounds"',
    ],
    [
      'wrong camera framing',
      'framing: "selected regional geographic POI bounds in the visible MapLibre aperture"',
      'framing: "source-authored City bounds in the visible MapLibre aperture"',
    ],
    [
      'missing regional projection authority',
      'regional_geographic_poi_projection:',
      'ignored_regional_geographic_poi_projection:',
    ],
    [
      'wrong regional source',
      'source_id: "kg-geo-xr:regional-poi"',
      'source_id: "kg-city-sim:legacy-environment"',
    ],
    [
      'legacy regional layer ids',
      'layers: ["kg-geo-xr:regional-poi:fill", "kg-geo-xr:regional-poi:extrusion", "kg-geo-xr:regional-poi:outline", "kg-geo-xr:regional-poi:locator", "kg-geo-xr:regional-poi:label"]',
      'layers: ["fill", "extrusion", "outline", "label"]',
    ],
    [
      'non-checked-in regional storage',
      'storage_policy: "checked-in"',
      'storage_policy: "runtime-network"',
    ],
    [
      'runtime network dependency',
      'runtime_network_required: false',
      'runtime_network_required: true',
    ],
    [
      'local XR identity',
      'local_xr_environment_identity: false',
      'local_xr_environment_identity: true',
    ],
    [
      'Three or HTML marker admitted',
      'three_r3f_or_html_marker_forbidden: true',
      'three_r3f_or_html_marker_forbidden: false',
    ],
    ['missing direct canvas name', 'direct_canvas_accessible_name_required: true', 'direct_canvas_accessible_name_required: false'],
    ['figure owns competing selection marker', 'figure_selection_marker_forbidden: true', 'figure_selection_marker_forbidden: false'],
    [
      'legacy row-column parcel identity',
      'marina-bay-sands,0,0,residential,10000,10,0',
      'r00c00,0,0,residential,10000,10,0',
    ],
  ]
  for (const [label, from, to] of mutations) {
    await t.test(label, async t => {
      const roots = await fixture()
      t.after(() => rm(roots.root, { recursive: true, force: true }))
      await writeFile(
        path.join(roots.knowgrphRoot, CITY_SIM_SEED_RELATIVE_PATH),
        cityRuntimeSeed.replace(from, to),
      )
      await assert.rejects(
        () => verifyWorkspaceSeedAuthority(roots),
        /proof-pending workspace document knowgrph-game-city-building-sim-demo\.md has invalid authority/,
      )
    })
  }
})

test('rejects removed City geometry, aerial, stage, and camera authority fields', async t => {
  const legacyFields = [
    [
      'runtime stage owner',
      '  runtime_dependencies_added: 0',
      '  runtime_dependencies_added: 0\n  stage_owner: "legacy"',
      'city_runtime.stage_owner',
    ],
    [
      'legacy City Geo+XR section',
      'city_regional_poi_zoning:',
      'city_geo_xr:\n  anchor: [103.8,1.2]\ncity_regional_poi_zoning:',
      'city_geo_xr',
    ],
    [
      'City-authored anchor',
      '  profile_identity_source: "city_initial.regional_poi_profile_id"',
      '  profile_identity_source: "city_initial.regional_poi_profile_id"\n  anchor: [103.8,1.2]',
      'city_regional_poi_zoning.anchor',
    ],
    [
      'City-authored parcel dimensions',
      '  ordering_policy: "row and column are deterministic UI ordering only and never geometry"',
      '  ordering_policy: "row and column are deterministic UI ordering only and never geometry"\n  parcel_dimensions_meters: [48,48]',
      'city_regional_poi_zoning.parcel_dimensions_meters',
    ],
    [
      'regional HTML marker owner',
      '  three_r3f_or_html_marker_forbidden: true',
      '  three_r3f_or_html_marker_forbidden: true\n  html_marker_owner: "legacy"',
      'regional_geographic_poi_projection.html_marker_owner',
    ],
    [
      'regional Three stage owner',
      '  three_r3f_or_html_marker_forbidden: true',
      '  three_r3f_or_html_marker_forbidden: true\n  three_stage_owner: "legacy"',
      'regional_geographic_poi_projection.three_stage_owner',
    ],
    [
      'City-authored aerial field',
      '  ordering_policy: "row and column are deterministic UI ordering only and never geometry"',
      '  ordering_policy: "row and column are deterministic UI ordering only and never geometry"\n  aerial_aircraft_altitude_meters: 140',
      'city_regional_poi_zoning.aerial_aircraft_altitude_meters',
    ],
    [
      'removed camera exit rule',
      '  owner: "native MapLibre Geo host"',
      '  owner: "native MapLibre Geo host"\n  exit_rule: "legacy"',
      'city_camera.exit_rule',
    ],
  ]
  for (const [label, from, to, forbiddenField] of legacyFields) {
    await t.test(label, async t => {
      const roots = await fixture()
      t.after(() => rm(roots.root, { recursive: true, force: true }))
      await writeFile(
        path.join(roots.knowgrphRoot, CITY_SIM_SEED_RELATIVE_PATH),
        cityRuntimeSeed.replace(from, to),
      )
      await assert.rejects(
        () => verifyWorkspaceSeedAuthority(roots),
        new RegExp(`forbidden=.*${forbiddenField.replaceAll('.', '\\.')}`),
      )
    })
  }
})

test('rejects a missing authored inventory entry', async t => {
  const roots = await fixture()
  t.after(() => rm(roots.root, { recursive: true, force: true }))
  await rm(path.join(roots.knowgrphRoot, 'docs/workspace-seeds/README.md'))
  await assert.rejects(
    () => verifyWorkspaceSeedAuthority(roots),
    /Knowgrph authored workspace-seed directory must have exact file inventory.*missing=\["README.md"\]/,
  )
})

test('rejects every missing authored draft document', async t => {
  for (const basename of DRAFT_WORKSPACE_SEED_BASENAMES) {
    await t.test(basename, async t => {
      const roots = await fixture()
      t.after(() => rm(roots.root, { recursive: true, force: true }))
      await rm(path.join(roots.knowgrphRoot, 'docs/workspace-seeds', basename))
      await assert.rejects(
        () => verifyWorkspaceSeedAuthority(roots),
        new RegExp(`Knowgrph authored workspace-seed directory must have exact file inventory.*missing=.*${basename.replaceAll('.', '\\.')}`),
      )
    })
  }
})

test('rejects a flight runtime source without canonical shared-XR overlay authority', async t => {
  const roots = await fixture()
  t.after(() => rm(roots.root, { recursive: true, force: true }))
  await writeFile(
    path.join(roots.knowgrphRoot, FLIGHT_SEED_RELATIVE_PATH),
    flightRuntimeSeed.replace('world_ownership: "overlay-only"', 'world_ownership: "standalone"'),
  )
  await assert.rejects(
    () => verifyWorkspaceSeedAuthority(roots),
    /runtime-ready workspace document knowgrph-game-flight-sim-demo\.md has invalid authority/,
  )
})

test('rejects a flight runtime source with a private camera catalog', async t => {
  const roots = await fixture()
  t.after(() => rm(roots.root, { recursive: true, force: true }))
  await writeFile(
    path.join(roots.knowgrphRoot, FLIGHT_SEED_RELATIVE_PATH),
    flightRuntimeSeed.replace(
      'catalog_owner: "canvas/src/features/three/xrNativeControllerCameraCatalog.ts"',
      'catalog_owner: "canvas/src/features/game-flight-sim/flightCameraCatalog.ts"',
    ),
  )
  await assert.rejects(
    () => verifyWorkspaceSeedAuthority(roots),
    /runtime-ready workspace document knowgrph-game-flight-sim-demo\.md has invalid authority/,
  )
})

test('rejects drift from the shared Physics camera contract', async t => {
  const mutations = [
    ['camera mode', 'camera_mode: "fixed-follow"', 'camera_mode: "free-orbit"'],
    [
      'selector',
      'selector: "FloatingPanel Camera / SHOOT / Camera source"',
      'selector: "Flight Camera"',
    ],
    [
      'invocation',
      'invocation: "/camera.select @camera #camera camera=fixed-follow|free-orbit"',
      'invocation: "/flight.camera camera=fixed-follow|free-orbit"',
    ],
    [
      'Timeline override',
      'timeline_override: "camera-mark playback temporarily owns framing"',
      'timeline_override: "Flight always owns framing"',
    ],
  ]
  for (const [label, from, to] of mutations) {
    await t.test(label, async t => {
      const roots = await fixture()
      t.after(() => rm(roots.root, { recursive: true, force: true }))
      await writeFile(
        path.join(roots.knowgrphRoot, FLIGHT_SEED_RELATIVE_PATH),
        flightRuntimeSeed.replace(from, to),
      )
      await assert.rejects(
        () => verifyWorkspaceSeedAuthority(roots),
        /runtime-ready workspace document knowgrph-game-flight-sim-demo\.md has invalid authority/,
      )
    })
  }
})

test('rejects every live canvas or runtime claim in a draft document', async t => {
  const forbiddenClaims = [
    {
      label: 'runtime-normalized XR surface alias with an inline comment',
      presentation: safeDraftPresentation.replace(
        'kgCanvasSurfaceMode: "2d"',
        'kgCanvasSurfaceMode: "XR Mode" # runtime-normalized alias',
      ),
    },
    {
      label: 'XR renderer alias',
      presentation: safeDraftPresentation.replace('kgCanvasRenderMode: "2d"', 'kgCanvasRenderMode: xr'),
    },
    { label: '3D canvas mode', append: 'kgCanvas3dMode: "xr"' },
    {
      label: 'string-valued open FloatingPanel',
      presentation: safeDraftPresentation.replace('kgFloatingPanelOpen: false', 'kgFloatingPanelOpen: "yes"'),
    },
    { label: 'FloatingPanel runtime view', append: 'kgFloatingPanelView: "mmorpgWorld"' },
    {
      label: 'YAML-valued open BottomPanel',
      presentation: safeDraftPresentation.replace('kgBottomPanelOpen: false', 'kgBottomPanelOpen: on'),
    },
    { label: 'run-ready activation', append: 'run_ready_demo:\n  id: "forbidden"' },
    { label: 'implemented flight runtime', append: 'native_flight_demo:\n  runtime_owner: "missing"' },
    { label: 'implemented native runtime', append: 'native_mmorpg_demo:\n  runtime_owner: "missing"' },
    { label: 'implemented asset pipeline', append: 'asset_pipeline:\n  loader: "missing"' },
    { label: 'implemented provenance pipeline', append: 'asset_provenance_pipeline:\n  loader: "missing"' },
    { label: 'implemented motion control', append: 'motion_control:\n  runtime: "missing"' },
    { label: 'implemented Flight Sim panel', append: 'flight_sim:\n  invocation: "/flight.sim"' },
    { label: 'implemented panel runtime', append: 'mmorpg_world:\n  invocation: "/mmorpg"' },
    { label: 'implemented validation contract', append: 'runtime_validation:\n  status: "pending"' },
    { label: 'implemented MCP contract', append: 'mcp_control:\n  inspect_tool: "missing"' },
  ]
  for (const forbiddenClaim of forbiddenClaims) {
    await t.test(forbiddenClaim.label, async t => {
      const roots = await fixture()
      t.after(() => rm(roots.root, { recursive: true, force: true }))
      await writeFile(
        path.join(roots.knowgrphRoot, 'docs/workspace-seeds/knowgrph-game-mmorpg-demo.md'),
        `---\nstatus: "draft"\nruntime_status: "draft"\n${forbiddenClaim.presentation || safeDraftPresentation}\nplanned_run_ready_demo:\n  id: "planned"\n  activation: "disabled-until-runtime-ready"\n  native_runtime: false\n  auto_start: false\n${forbiddenClaim.append || ''}\n---\n`,
      )
      await assert.rejects(
        () => verifyWorkspaceSeedAuthority(roots),
        /draft workspace document knowgrph-game-mmorpg-demo\.md must remain non-activating/,
      )
    })
  }
})

test('rejects live activation flags nested in a planned run-ready contract', async t => {
  const plannedContractCases = [
    {
      label: 'applied-document activation',
      contract: '  activation: applied-source-document\n  native_runtime: false\n  auto_start: false',
    },
    {
      label: 'string-valued native runtime',
      contract: '  activation: disabled-until-runtime-ready\n  native_runtime: "yes"\n  auto_start: false',
    },
    {
      label: 'string-valued automatic start',
      contract: '  activation: disabled-until-runtime-ready\n  native_runtime: false\n  auto_start: "on"',
    },
  ]
  for (const plannedContractCase of plannedContractCases) {
    await t.test(plannedContractCase.label, async t => {
      const roots = await fixture()
      t.after(() => rm(roots.root, { recursive: true, force: true }))
      await writeFile(
        path.join(roots.knowgrphRoot, 'docs/workspace-seeds/knowgrph-game-mmorpg-demo.md'),
        `---\nstatus: draft\nruntime_status: draft\n${safeDraftPresentation}\nplanned_run_ready_demo:\n  id: planned\n${plannedContractCase.contract}\n---\n`,
      )
      await assert.rejects(
        () => verifyWorkspaceSeedAuthority(roots),
        /draft workspace document knowgrph-game-mmorpg-demo\.md must remain non-activating/,
      )
    })
  }
})

test('accepts runtime-equivalent safe aliases and ignores Markdown body examples', async t => {
  const roots = await fixture()
  t.after(() => rm(roots.root, { recursive: true, force: true }))
  await writeFile(
    path.join(roots.knowgrphRoot, 'docs/workspace-seeds/knowgrph-game-mmorpg-demo.md'),
    [
      '---',
      'status: draft',
      'runtime_status: draft',
      'runtime_claim: planned-contract-only',
      'kgCanvasSurfaceMode: Surface 2D # runtime-normalized alias',
      'kgCanvasRenderMode: Mode 2D',
      'kgCanvas2dRenderer: Flow Canvas',
      'kgFloatingPanelOpen: "off"',
      'kgBottomPanelOpen: "no"',
      'planned_run_ready_demo:',
      '  id: planned',
      '  activation: disabled-until-runtime-ready',
      '  native_runtime: "false"',
      '  auto_start: "0"',
      '---',
      '',
      '```yaml',
      'kgCanvasSurfaceMode: "xr"',
      'kgFloatingPanelOpen: true',
      'run_ready_demo:',
      '```',
    ].join('\n'),
  )
  await assert.doesNotReject(() => verifyWorkspaceSeedAuthority(roots))
})

test('does not accept safe presentation markers from the Markdown body', async t => {
  const roots = await fixture()
  t.after(() => rm(roots.root, { recursive: true, force: true }))
  await writeFile(
    path.join(roots.knowgrphRoot, 'docs/workspace-seeds', FLIGHT_COMPANION_BASENAME),
    [
      '---',
      'status: projection-pending',
      'runtime_claim: local-runtime-ready',
      'activatable_seed: false',
      'note_kind: projection-contract',
      '---',
      '',
      safeDraftPresentation,
    ].join('\n'),
  )
  await assert.rejects(
    () => verifyWorkspaceSeedAuthority(roots),
    /projection companion knowgrph-game-flight-sim-demo\.companion\.md must remain non-activating.*missing=/,
  )
})

test('rejects draft documents projected into Agentic Canvas OS', async t => {
  for (const basename of [
    FLIGHT_SEED_BASENAME,
    FLIGHT_COMPANION_BASENAME,
    ...DRAFT_WORKSPACE_SEED_BASENAMES,
  ]) {
    await t.test(basename, async t => {
      const roots = await fixture()
      t.after(() => rm(roots.root, { recursive: true, force: true }))
      await writeFile(
        path.join(roots.agenticDocsRoot, 'workspace-seeds', basename),
        '# Forbidden stale draft projection\n',
      )
      await assert.rejects(
        () => verifyWorkspaceSeedAuthority(roots),
        new RegExp(`Agentic Canvas OS workspace-seed projection directory must have exact file inventory.*${basename.replaceAll('.', '\\.')}`),
      )
    })
  }
})

test('rejects a divergent storage projection', async t => {
  const roots = await fixture()
  t.after(() => rm(roots.root, { recursive: true, force: true }))
  await writeFile(
    path.join(roots.agenticDocsRoot, 'workspace-seeds/knowgrph-physics-playground-demo.md'),
    `${canonicalSeed}stale\n`,
  )
  await assert.rejects(() => verifyWorkspaceSeedAuthority(roots), /byte-identical/)
})

test('rejects every workspace-seed entry in the publish repository', async t => {
  const roots = await fixture()
  t.after(() => rm(roots.root, { recursive: true, force: true }))
  const duplicatePath = path.join(roots.publishRoot, PHYSICS_SEED_RELATIVE_PATH)
  await mkdir(path.dirname(duplicatePath), { recursive: true })
  await writeFile(duplicatePath, canonicalSeed)
  await assert.rejects(
    () => verifyWorkspaceSeedAuthority(roots),
    /Publish repository workspace-seed directory must have exact file inventory \[\].*knowgrph-physics-playground-demo\.md/,
  )
})
