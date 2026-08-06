import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { requireCitySimRuntimeIdentity } from './workspace-seed-city-authority.mjs'
import {
  isRecord,
  normalizePresetToken,
  parseYamlFrontmatter,
  readBooleanPreset,
  readCanvas2dRenderer,
  readCanvasRenderMode,
  readCanvasSurfaceMode,
} from './workspace-seed-frontmatter.mjs'

export const WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH = 'docs/workspace-seeds'
export const PHYSICS_SEED_BASENAME = 'knowgrph-physics-playground-demo.md'
export const PHYSICS_SEED_RELATIVE_PATH = `${WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH}/${PHYSICS_SEED_BASENAME}`
export const XR_V2_SEED_BASENAME = 'knowgrph-ar-vr-xr-runtime-readiness-demo.md'
export const XR_V2_SEED_RELATIVE_PATH = `${WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH}/${XR_V2_SEED_BASENAME}`
export const FLIGHT_SEED_BASENAME = 'knowgrph-game-flight-sim-demo.md'
export const FLIGHT_SEED_RELATIVE_PATH = `${WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH}/${FLIGHT_SEED_BASENAME}`
export const FLIGHT_COMPANION_BASENAME = 'knowgrph-game-flight-sim-demo.companion.md'
export const CITY_SIM_SEED_BASENAME = 'knowgrph-game-city-building-sim-demo.md'
export const CITY_SIM_SEED_RELATIVE_PATH = `${WORKSPACE_SEED_DIRECTORY_RELATIVE_PATH}/${CITY_SIM_SEED_BASENAME}`
export const CITY_SIM_OVERLAY_AUTHORITY = Object.freeze({
  id: 'city-sim',
  rendererRule: 'reuse one native MapLibre map; create or activate zero City Three presentation; any retained shared Canvas remains inactive, invisible, and pointer-transparent',
  surfaceOwner: 'native MapLibre Geo+XR surface wrapped by SemanticMediaFigure',
  citySurfaceOwner: 'native MapLibre Geo+XR host wrapped by the City semantic media figure',
  basemapOwner: 'one real native MapLibre basemap',
  composition: 'one real native MapLibre basemap with companion-owned regional geographic POI surfaces carrying read-only City zoning state; existing Flight aircraft and route layers remain independently owned; zero City-authored geometry, Flight data, Three presentation, or HTML POI markers',
  layerOrder: Object.freeze(['regional-context', 'city', 'flight']),
  parcelIdentityPolicy: 'each parcel_id exactly equals one RegionalPoiIdentity.id from the selected profile; one-to-one coverage; no alias or remap',
  orderingPolicy: 'row and column are deterministic UI ordering only and never geometry',
  parcelCameraPolicy: 'fit the selected regional POI profile bounds into the visible panel-adjusted aperture and restore prior padding',
  regionalPoi: Object.freeze({
    profileId: 'adm0:SGP:major-pois/v1',
    profileIdentitySource: 'city_initial.regional_poi_profile_id',
    profileFactAuthority: '/docs/documents/knowgrph-adm0-singapore-prd-tad-ard.companion.md',
    sourceId: 'kg-geo-xr:regional-poi',
    layers: Object.freeze([
      'kg-geo-xr:regional-poi:fill',
      'kg-geo-xr:regional-poi:extrusion',
      'kg-geo-xr:regional-poi:outline',
      'kg-geo-xr:regional-poi:locator',
      'kg-geo-xr:regional-poi:label',
    ]),
    featureContract: 'companion-authored exact geographic Polygon rings with real-metre base/height, accuracy, and provenance plus one topology-aware representative Point locator per POI',
    presentationPolicy: 'read-only MapLibre regional-context band below City parcels and Flight route/aircraft; surface-only massing plus fixed-pixel locators and collision-aware variable-anchor labels',
    storagePolicy: 'checked-in',
  }),
  cameraFraming: 'selected regional geographic POI bounds in the visible MapLibre aperture',
  semanticMediaCanvasOwner: 'gympgrph/src/features/geospatial/mapLibreCanvasSemanticOwner.ts',
  semanticMediaChildOwner: 'canvas/src/components/CanvasViewportGeospatialOverlay.tsx',
  semanticMediaOwner: 'canvas/src/lib/cards/SemanticMediaFigure.tsx',
  semanticMediaSelectionOwner: 'canvas/src/lib/cards/mediaPreviewSurfaceSelection.ts',
  semanticMediaSelectionTarget: 'live MapLibre canvas while City runtime active',
  worldOwnership: 'overlay-only',
})
export const DRAFT_WORKSPACE_SEED_BASENAMES = Object.freeze(['knowgrph-game-mmorpg-demo.companion.md', 'knowgrph-game-mmorpg-demo.md'])
export const KNOWGRPH_WORKSPACE_SEED_INVENTORY = Object.freeze([
  'README.md',
  XR_V2_SEED_BASENAME,
  CITY_SIM_SEED_BASENAME,
  FLIGHT_COMPANION_BASENAME,
  FLIGHT_SEED_BASENAME,
  ...DRAFT_WORKSPACE_SEED_BASENAMES,
  PHYSICS_SEED_BASENAME,
])
export const AGENTIC_WORKSPACE_SEED_PROJECTION_INVENTORY = Object.freeze([
  PHYSICS_SEED_BASENAME,
])
const DRAFT_IMPLEMENTED_RUNTIME_KEYS = Object.freeze(['native_flight_demo', 'asset_pipeline', 'motion_control', 'flight_sim', 'native_mmorpg_demo', 'asset_provenance_pipeline', 'mmorpg_world', 'runtime_validation', 'mcp_control'])
const XR_EDITED_MEDIA_PROVEN = Object.freeze(['canonical ECS projection including entity zero', 'real standalone Three.js material application', 'mounted canonical Timeline command routing', 'same-origin browser-native edited-media export', 'non-empty Blob, decoded metadata, and bounded playback', 'media teardown and object-URL revocation without observed page or media errors', 'clean-room dependency and source enforcement'])
const XR_EDITED_MEDIA_BLOCKED = Object.freeze(['mounted-renderer material wiring', 'live depth model and quality', 'reference-device frame budget', 'camera permission and lifecycle on named physical devices', 'physical-headset XR behavior', 'Production availability', 'deployment authority'])
const XR_EDITED_MEDIA_EVIDENCE_KEYS = Object.freeze(['scope', 'projection_role', 'prd', 'runtime_owner', 'source_snapshot_schema', 'source_snapshot_status', 'canonical_delivery_status', 'canonical_delivery_limit', 'reviewed_feature_commit', 'pull_request', 'protected_refresh_chain', 'canonical_main_commit', 'canonical_main_tree', 'canonical_main_proof', 'canonical_runtime_reconciliation', 'proven', 'external_dependencies', 'no_deployment', 'deploy_boundary', 'broader_xr_status', 'blocked_claims'])
const XR_EDITED_MEDIA_MAIN_PROOF_KEYS = Object.freeze(['workflow', 'run_id', 'check', 'conclusion', 'completed_at', 'affected_scope', 'focused_gate', 'browser_observation_schema', 'browser_observation'])
const XR_EDITED_MEDIA_RUNTIME_RECONCILIATION_KEYS = Object.freeze(['integration_result_schema', 'integration_status', 'readiness_schema', 'feature_runtime_source_revision', 'feature_runtime_agentic_canvas_os_revision', 'feature_runtime_evidence_digest', 'feature_runtime_verified_at'])
const XR_EDITED_MEDIA_PROOF_NODE_ID = 'xr_edited_media_proof'
const XR_EDITED_MEDIA_PROOF_NODE_KEYS = Object.freeze(['id', 'type', 'label', 'pos', 'properties'])
const XR_EDITED_MEDIA_PROOF_POSITION_KEYS = Object.freeze(['x', 'y'])
const XR_EDITED_MEDIA_PROOF_PROPERTIES_KEYS = Object.freeze(['role', 'scope', 'sourceSnapshotState', 'canonicalDeliveryState', 'broaderXrState', 'output'])
const XR_EDITED_MEDIA_PROOF_CONNECTION_KEYS = Object.freeze(['from', 'to', 'label'])

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

const requireExactFileInventory = async ({
  directoryPath,
  expectedBasenames,
  optionalBasenames = [],
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
  const allowedNames = new Set([...expected, ...optionalBasenames])
  const missing = expected.filter(name => !actualNames.has(name))
  const unexpected = actual.filter(name => !allowedNames.has(name))
  const nonFiles = entries
    .filter(entry => allowedNames.has(entry.name) && !entry.isFile())
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

const requirePhysicsEditedMediaEvidence = source => {
  const frontmatter = parseYamlFrontmatter(PHYSICS_SEED_BASENAME, source)
  const runtimeValidation = isRecord(frontmatter.runtime_validation)
    ? frontmatter.runtime_validation
    : {}
  const evidence = isRecord(runtimeValidation.xr_authoring_edited_media_delivery)
    ? runtimeValidation.xr_authoring_edited_media_delivery
    : {}
  const mainProof = isRecord(evidence.canonical_main_proof)
    ? evidence.canonical_main_proof
    : {}
  const runtime = isRecord(evidence.canonical_runtime_reconciliation)
    ? evidence.canonical_runtime_reconciliation
    : {}
  const flow = isRecord(frontmatter.flow) ? frontmatter.flow : {}
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : []
  const connections = Array.isArray(flow.connections) ? flow.connections : []
  const missing = []
  const requireValue = (label, actual, expected) => {
    if (actual !== expected) missing.push(`${label}=${JSON.stringify(expected)}`)
  }
  const requireExactKeys = (label, actual, expectedKeys) => {
    if (!isRecord(actual)) {
      missing.push(`${label}=object with exact keys ${JSON.stringify(expectedKeys)}`)
      return
    }
    const actualKeys = Object.keys(actual).sort()
    const expected = [...expectedKeys].sort()
    if (JSON.stringify(actualKeys) !== JSON.stringify(expected)) {
      missing.push(`${label}.keys=${JSON.stringify(expected)}`)
    }
  }

  requireValue('kgBottomPanelOpen', readBooleanPreset(frontmatter.kgBottomPanelOpen), false)
  requireExactKeys('evidence', evidence, XR_EDITED_MEDIA_EVIDENCE_KEYS)
  requireExactKeys('canonical_main_proof', mainProof, XR_EDITED_MEDIA_MAIN_PROOF_KEYS)
  requireExactKeys(
    'canonical_runtime_reconciliation',
    runtime,
    XR_EDITED_MEDIA_RUNTIME_RECONCILIATION_KEYS,
  )
  requireValue('scope', evidence.scope, 'xr-authoring-edited-media-delivery')
  requireValue('projection_role', evidence.projection_role, 'downstream scoped evidence; not a second XR readiness authority')
  requireValue('prd', evidence.prd, '/docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md')
  requireValue('runtime_owner', evidence.runtime_owner, 'canvas/src/components/timeline; canvas/src/features/gitgraph')
  requireValue('source_snapshot_schema', evidence.source_snapshot_schema, 'knowgrph-xr-v2-readiness/v1')
  requireValue('source_snapshot_status', evidence.source_snapshot_status, 'source-ready')
  requireValue('canonical_delivery_status', evidence.canonical_delivery_status, 'runtime-ready')
  requireValue('canonical_delivery_limit', evidence.canonical_delivery_limit, 'XR authoring and native edited-media delivery only')
  requireValue('reviewed_feature_commit', evidence.reviewed_feature_commit, 'fcd69c6b2d42a00779f55be8c1d57a0ab468339b')
  requireValue('pull_request', evidence.pull_request, 674)
  requireValue('canonical_main_commit', evidence.canonical_main_commit, 'a3ddfef7cc55c38385520173273abd66010e9747')
  requireValue('canonical_main_tree', evidence.canonical_main_tree, '76c8e22da9c9284f01c2627c8ace9c9d3abcd682')
  requireValue('canonical_main_proof.workflow', mainProof.workflow, 'Integration')
  requireValue('canonical_main_proof.run_id', mainProof.run_id, 30895597328)
  requireValue('canonical_main_proof.check', mainProof.check, 'Integration Gate')
  requireValue('canonical_main_proof.conclusion', mainProof.conclusion, 'success')
  requireValue('canonical_main_proof.completed_at', mainProof.completed_at, '2026-08-04T09:26:58Z')
  requireValue('canonical_main_proof.affected_scope', mainProof.affected_scope, 'xr_v2_video_editor')
  requireValue('canonical_main_proof.focused_gate', mainProof.focused_gate, 'npm run xr-v2:review-ready')
  requireValue(
    'canonical_main_proof.browser_observation_schema',
    mainProof.browser_observation_schema,
    'knowgrph-xr-v2-browser-smoke/v1',
  )
  requireValue('canonical_main_proof.browser_observation', mainProof.browser_observation, 'pass')
  requireValue('runtime.integration_result_schema', runtime.integration_result_schema, 'agentic-device-integration-result/v1')
  requireValue('runtime.integration_status', runtime.integration_status, 'runtime_ready')
  requireValue('runtime.readiness_schema', runtime.readiness_schema, 'agentic-local-runtime-readiness/v1')
  requireValue('runtime.feature_runtime_source_revision', runtime.feature_runtime_source_revision, 'a3ddfef7cc55c38385520173273abd66010e9747')
  requireValue('runtime.feature_runtime_agentic_canvas_os_revision', runtime.feature_runtime_agentic_canvas_os_revision, '217a8a42d6497e059839a6a1f809c2459530ca54')
  requireValue('runtime.feature_runtime_evidence_digest', runtime.feature_runtime_evidence_digest, 'fc13db3e3184f69e42985dbec441bab163f52ba2d7e75b959e17194304f8fb23')
  requireValue('runtime.feature_runtime_verified_at', runtime.feature_runtime_verified_at, '2026-08-04T09:29:02.924Z')
  requireValue('no_deployment', evidence.no_deployment, true)
  requireValue('deploy_boundary', evidence.deploy_boundary, 'Dev-only')
  requireValue('broader_xr_status', evidence.broader_xr_status, 'blocked')
  if (JSON.stringify(evidence.protected_refresh_chain) !== JSON.stringify([
    '48c58307481c96e5c73c9f4d2f53eb2c2f1c8549',
    'fea5e37b9bf0d648284330cfbc3dcca03890def0',
    'a6de5722e550e633d0d73f59f187a09ec7388879',
  ])) missing.push('protected_refresh_chain=exact PR #674 chain')
  if (!Array.isArray(evidence.external_dependencies) || evidence.external_dependencies.length !== 0) {
    missing.push('external_dependencies=[]')
  }
  if (JSON.stringify(evidence.proven) !== JSON.stringify(XR_EDITED_MEDIA_PROVEN)) {
    missing.push('proven=exact scoped proof set')
  }
  if (JSON.stringify(evidence.blocked_claims) !== JSON.stringify(XR_EDITED_MEDIA_BLOCKED)) {
    missing.push('blocked_claims=exact broader-XR blocker set')
  }
  if (!Array.isArray(flow.nodes)) missing.push('flow.nodes=array')
  if (!Array.isArray(flow.connections)) missing.push('flow.connections=array')
  const proofNodes = nodes.filter(node => (
    isRecord(node) && node.id === XR_EDITED_MEDIA_PROOF_NODE_ID
  ))
  if (proofNodes.length !== 1) {
    missing.push(`flow.nodes=exactly one ${XR_EDITED_MEDIA_PROOF_NODE_ID}`)
  } else {
    const proofNode = proofNodes[0]
    const position = isRecord(proofNode.pos) ? proofNode.pos : {}
    const properties = isRecord(proofNode.properties) ? proofNode.properties : {}
    requireExactKeys('proof_node', proofNode, XR_EDITED_MEDIA_PROOF_NODE_KEYS)
    requireExactKeys('proof_node.pos', position, XR_EDITED_MEDIA_PROOF_POSITION_KEYS)
    requireExactKeys(
      'proof_node.properties',
      properties,
      XR_EDITED_MEDIA_PROOF_PROPERTIES_KEYS,
    )
    requireValue('proof_node.id', proofNode.id, XR_EDITED_MEDIA_PROOF_NODE_ID)
    requireValue('proof_node.type', proofNode.type, 'XrDemoValidation')
    requireValue('proof_node.label', proofNode.label, 'Scoped Edited-media Proof')
    requireValue('proof_node.pos.x', position.x, 880)
    requireValue('proof_node.pos.y', position.y, 300)
    requireValue(
      'proof_node.properties.role',
      properties.role,
      'downstream canonical-main evidence projection',
    )
    requireValue(
      'proof_node.properties.scope',
      properties.scope,
      'xr-authoring-edited-media-delivery',
    )
    requireValue('proof_node.properties.sourceSnapshotState', properties.sourceSnapshotState, 'source-ready')
    requireValue('proof_node.properties.canonicalDeliveryState', properties.canonicalDeliveryState, 'runtime-ready')
    requireValue('proof_node.properties.broaderXrState', properties.broaderXrState, 'blocked')
    requireValue(
      'proof_node.properties.output',
      properties.output,
      'Inspect the protected-main XR v2 review gate and canonical runtime receipt; applying this seed does not rerun the browser smoke.',
    )
  }
  const proofConnections = connections.filter(connection => (
    isRecord(connection)
    && (
      connection.from === XR_EDITED_MEDIA_PROOF_NODE_ID
      || connection.to === XR_EDITED_MEDIA_PROOF_NODE_ID
    )
  ))
  if (proofConnections.length !== 1) {
    missing.push(`flow.connections=exactly one incident ${XR_EDITED_MEDIA_PROOF_NODE_ID} edge`)
  } else {
    const proofConnection = proofConnections[0]
    requireExactKeys(
      'proof_connection',
      proofConnection,
      XR_EDITED_MEDIA_PROOF_CONNECTION_KEYS,
    )
    requireValue('proof_connection.from', proofConnection.from, 'xr_demo_entry')
    requireValue('proof_connection.to', proofConnection.to, XR_EDITED_MEDIA_PROOF_NODE_ID)
    requireValue('proof_connection.label', proofConnection.label, 'inspect scoped proof')
  }
  for (const marker of [
    '## Scoped XR edited-media evidence',
    'It does not load a video sequence, run the dedicated smoke route',
  ]) {
    if (!source.includes(marker)) missing.push(`source marker ${JSON.stringify(marker)}`)
  }
  if (missing.length > 0) {
    throw new Error(`canonical XR edited-media evidence is invalid: ${missing.join(', ')}`)
  }
}

const requireXrV2RuntimeIdentity = source => {
  const frontmatter = parseYamlFrontmatter(XR_V2_SEED_BASENAME, source)
  const runReady = isRecord(frontmatter.run_ready_demo) ? frontmatter.run_ready_demo : {}
  const pinned = isRecord(frontmatter.pinned_source) ? frontmatter.pinned_source : {}
  const readiness = isRecord(frontmatter.runtime_readiness) ? frontmatter.runtime_readiness : {}
  const permissions = isRecord(frontmatter.permission_control) ? frontmatter.permission_control : {}
  const criteria = Array.isArray(frontmatter.acceptance_criteria) ? frontmatter.acceptance_criteria : []
  const flow = isRecord(frontmatter.flow) ? frontmatter.flow : {}
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : []
  const connections = Array.isArray(flow.connections) ? flow.connections : []
  const missing = []
  const requireValue = (label, actual, expected) => {
    if (actual !== expected) missing.push(`${label}=${JSON.stringify(expected)}`)
  }
  for (const [label, actual, expected] of [
    ['status', frontmatter.status, 'runtime-ready'], ['runtime_status', frontmatter.runtime_status, 'browser-demo-ready'],
    ['runtime_claim', frontmatter.runtime_claim, 'local-browser-demo-runtime-ready'], ['pinned_contract_status', frontmatter.pinned_contract_status, 'partial'],
    ['publish_scope', frontmatter.publish_scope, 'local-only'], ['deploy_boundary', frontmatter.deploy_boundary, 'Dev-only'],
    ['kgCanvasSurfaceMode', readCanvasSurfaceMode(frontmatter.kgCanvasSurfaceMode), '2d'], ['kgCanvasRenderMode', readCanvasRenderMode(frontmatter.kgCanvasRenderMode), '3d'],
    ['kgCanvas3dMode', normalizePresetToken(frontmatter.kgCanvas3dMode), 'graph'], ['kgFloatingPanelOpen', readBooleanPreset(frontmatter.kgFloatingPanelOpen), true],
    ['kgFloatingPanelView', frontmatter.kgFloatingPanelView, 'motionControl'], ['run_ready_demo.id', runReady.id, 'xr-v2'],
    ['run_ready_demo.canonical_source_file', runReady.canonical_source_file, `/${XR_V2_SEED_RELATIVE_PATH}`], ['run_ready_demo.source_root', runReady.source_root, 'knowgrph/docs'],
    ['run_ready_demo.source_backed', readBooleanPreset(runReady.source_backed), true], ['run_ready_demo.native_runtime', readBooleanPreset(runReady.native_runtime), true],
    ['run_ready_demo.canonical_xr_world_owner', runReady.canonical_xr_world_owner, 'docs/workspace-seeds/knowgrph-physics-playground-demo.md'],
    ['run_ready_demo.auto_start', readBooleanPreset(runReady.auto_start), true], ['pinned_source.path', pinned.path, 'docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md'],
    ['pinned_source.commit', pinned.commit, '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7'], ['pinned_source.git_blob_sha1', pinned.git_blob_sha1, '1c0cc60e8cdfaf4bc1b599e11cd5aba109ad6544'],
    ['pinned_source.content_sha256', pinned.content_sha256, '9dfcb6b55a5cb510177f0108ebccedace5d640390dbeef4d69a63f1e89edb6ea'], ['runtime_readiness.focused_gate', readiness.focused_gate, 'npm run xr-v2:review-ready'],
    ['runtime_readiness.browser_demo_status', readiness.browser_demo_status, 'runtime-ready'], ['runtime_readiness.pinned_contract_status', readiness.pinned_contract_status, 'partial'],
    ['runtime_readiness.physical_device_certification', readiness.physical_device_certification, 'external-required'], ['runtime_readiness.production_availability', readiness.production_availability, 'not-claimed'],
    ['runtime_readiness.deployment_authority', readBooleanPreset(readiness.deployment_authority), false], ['permission_control.owner', permissions.owner, 'user'],
    ['permission_control.default_state', permissions.default_state, 'disabled'], ['permission_control.camera', permissions.camera, 'user-enable-disable'],
    ['permission_control.sensors', permissions.sensors, 'user-enable-disable'],
  ]) requireValue(label, actual, expected)
  if (!Array.isArray(runReady.external_dependencies) || runReady.external_dependencies.length !== 0) missing.push('run_ready_demo.external_dependencies=[]')
  const acIds = Array.from({ length: 12 }, (_, index) => `AC-${index + 1}`)
  if (JSON.stringify(criteria.map(entry => isRecord(entry) ? entry.id : null)) !== JSON.stringify(acIds)) missing.push('acceptance_criteria=exact AC-1..AC-12 ledger')
  const requiredNodeTypes = {
    xr_v2_demo_entry: 'XrDemoControl', 'schema:XrTransform': 'EcsComponentSchema', 'schema:XrRenderable': 'EcsComponentSchema',
    'schema:XrParticleEmitter': 'EcsComponentSchema', 'schema:XrRig': 'EcsComponentSchema', 'entity:scene.hero': 'EcsEntity',
    'entity:scene.marker': 'EcsEntity', 'material:hero': 'XrMaterialGraph', 'behavior:hero:select': 'XrBehaviorTrigger',
    'action:hero:burst': 'XrBehaviorAction', 'timeline:hero': 'XrTimelineSequence', xr_v2_certification_boundary: 'XrDemoValidation',
  }
  for (const [id, type] of Object.entries(requiredNodeTypes)) {
    if (nodes.filter(node => isRecord(node) && node.id === id && node.type === type).length !== 1) missing.push(`flow.nodes=exactly one ${id}:${type}`)
  }
  for (const [index, criterion] of acIds.entries()) {
    const id = `xr_v2_ac_${String(index + 1).padStart(2, '0')}`
    const matches = nodes.filter(node => isRecord(node) && node.id === id && node.type === 'XrDemoValidation' && isRecord(node.properties) && node.properties.criterion === criterion)
    if (matches.length !== 1) missing.push(`flow.nodes=exactly one source-authored ${criterion}`)
  }
  const requiredEdges = [
    ['material:hero', 'entity:scene.hero', 'xr-material-target'], ['behavior:hero:select', 'action:hero:burst', 'xr-behavior-wire'],
    ['timeline:hero', 'entity:scene.hero', 'xr-timeline-target'], ['xr_v2_demo_entry', 'xr_v2_ac_01', 'validate AC-1'],
    ...acIds.slice(1).map((criterion, index) => [`xr_v2_ac_${String(index + 1).padStart(2, '0')}`, `xr_v2_ac_${String(index + 2).padStart(2, '0')}`, `validate ${criterion}`]),
    ['xr_v2_ac_12', 'xr_v2_certification_boundary', 'stop at external certification'],
  ]
  for (const [from, to, label] of requiredEdges) {
    if (!connections.some(edge => isRecord(edge) && edge.from === from && edge.to === to && edge.label === label)) missing.push(`flow.connections=${from}->${to}:${label}`)
  }
  if (missing.length > 0) throw new Error(`runtime-ready workspace document ${XR_V2_SEED_BASENAME} has invalid authority; missing=${JSON.stringify(missing)}`)
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
    optionalBasenames: [XR_V2_SEED_BASENAME],
    label: 'Knowgrph authored workspace-seed directory',
  })
  const canonicalPath = path.resolve(knowgrphRoot, PHYSICS_SEED_RELATIVE_PATH)
  if (!await isFile(canonicalPath)) throw new Error(`canonical workspace seed is missing: ${canonicalPath}`)
  const source = await readFile(canonicalPath, 'utf8')
  requireCanonicalIdentity(source)
  requirePhysicsEditedMediaEvidence(source)
  const xrV2Path = path.resolve(knowgrphRoot, XR_V2_SEED_RELATIVE_PATH)
  if (await isFile(xrV2Path)) requireXrV2RuntimeIdentity(await readFile(xrV2Path, 'utf8'))
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
  requireCitySimRuntimeIdentity({
    authority: CITY_SIM_OVERLAY_AUTHORITY,
    basename: CITY_SIM_SEED_BASENAME,
    relativePath: CITY_SIM_SEED_RELATIVE_PATH,
    source: citySimSource,
  })
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
