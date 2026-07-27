import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
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
  resolveWorkspaceSeedSiblingRootsFromGitCommonDir,
  verifyWorkspaceSeedAuthority,
} from '../workspace-seed-authority.mjs'

const canonicalSeed = `---
canonical_source_file: "/docs/workspace-seeds/knowgrph-physics-playground-demo.md"
source_root: "knowgrph/docs"
source_backed: true
native_controller_demo:
  camera_mode: "fixed-follow"
  camera:
    default: "fixed-follow"
    selector: "FloatingPanel Camera / SHOOT / Camera source"
    available: ["fixed-follow", "free-orbit"]
    invocation: "/camera.select @camera #camera camera=fixed-follow|free-orbit"
    timeline_override: "camera-mark playback temporarily owns framing"
---
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
    driver_owner: "canvas/src/features/three/useXrNativeControllerDemoCamera.ts"
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
const cityRuntimeSeed = `---
status: "proof-pending"
runtime_status: "proof-pending"
publish_scope: "local-only"
kgCanvasSurfaceMode: "xr"
kgCanvasRenderMode: "3d"
kgCanvas3dMode: "xr"
kgFloatingPanelOpen: true
kgFloatingPanelView: "cityBuilder"
run_ready_demo:
  id: "city-sim"
  activation: "applied-source-document"
  identity_authority: "source-authored run_ready_demo.id"
  identity_conflict: "fail closed when a known path and source identity disagree"
  canonical_source_file: "/docs/workspace-seeds/knowgrph-game-city-building-sim-demo.md"
  source_root: "knowgrph/docs"
  source_backed: true
  native_runtime: true
  auto_start: false
  external_dependencies: []
  forbid_external_copy_or_dependency: true
city_runtime:
  schema_id: "knowgrph-city-grid/v1"
  world_ownership: "overlay-only"
  stage_owner: "additive City Stage in the existing shared Canvas"
  renderer_rule: "never create a second Canvas or renderer"
  runtime_dependencies_added: 0
---
`
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
