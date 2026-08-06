import {
  isRecord,
  normalizePresetToken,
  parseYamlFrontmatter,
  readBooleanPreset,
  readCanvasRenderMode,
  readCanvasSurfaceMode,
} from '../workspace-seed-frontmatter.mjs'

export const XR_V2_SHARED_SCENE_AUTHORITY = Object.freeze({
  id: 'xr-v2',
  sourceAuthority: '/docs/workspace-seeds/knowgrph-physics-playground-demo.md',
  worldOwnership: 'overlay-only',
  surfaceOwner: 'canonical XR Physics shared Three surface',
  rendererOwner: 'canvas/src/lib/three/ThreeGraph.impl.tsx',
  secondR3fCanvasForbidden: true,
})

const ACCEPTANCE_EVIDENCE_CONTRACTS = Object.freeze({
  'AC-4': Object.freeze({
    evidence: 'browser-observable-after-selected-saved-asset render',
    promotionBoundary: 'physical four-tier viewer matrix, hardened shared storage, and two-device reopen',
    evidenceState: 'browser-observable-after-saved-asset-render',
    output: 'Keep evidence not-observed until a persisted capture survives reload and explicit open, then two distinct timestamped frames render on an attached depth/Three surface or raw-video playback time advances; listing, selection, canplay, or session entry alone is never evidence.',
  }),
  'AC-11': Object.freeze({
    evidence: 'browser-observable-after-explicit-package-and-play action',
    promotionBoundary: 'target-browser user-capture track and codec preservation',
    evidenceState: 'browser-observable-after-explicit-action',
    output: 'Use Verify packaging on the explicitly opened identity-bound capture; evidence appears only after every pre-mux encoded source sample decodes, the mux preserves exact codec/count/payload bytes, and the mounted WebM advances.',
  }),
  'AC-12': Object.freeze({
    evidence: 'browser-observable-after-explicit-local-connected-preview action',
    promotionBoundary: 'physical two-device transport and measured latency',
    evidenceState: 'browser-observable-after-explicit-action',
    output: 'Use Run local preview; evidence appears only after an exact mounted-scene edit crosses real WebRTC peers, paints the attached viewer canvas in a later frame, and is then acknowledged within the bound without reload.',
  }),
})

export const requireXrV2RuntimeIdentity = ({ basename, relativePath, source }) => {
  const frontmatter = parseYamlFrontmatter(basename, source)
  const runReady = isRecord(frontmatter.run_ready_demo) ? frontmatter.run_ready_demo : {}
  const sharedXrScene = isRecord(frontmatter.shared_xr_scene) ? frontmatter.shared_xr_scene : {}
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
    ['status', frontmatter.status, 'runtime-ready'], ['runtime_status', frontmatter.runtime_status, 'browser-local-runtime-ready'],
    ['runtime_claim', frontmatter.runtime_claim, 'local-browser-demo-runtime-ready'], ['pinned_contract_status', frontmatter.pinned_contract_status, 'partial'],
    ['browser_local_mount_status', frontmatter.browser_local_mount_status, 'mounted-after-explorer-selection'],
    ['publish_scope', frontmatter.publish_scope, 'local-first-explicit-existing-storage'], ['saved_asset_persistence', frontmatter.saved_asset_persistence, 'device-local-indexeddb-with-explicit-existing-storage-publish'],
    ['cross_device_reopen_status', frontmatter.cross_device_reopen_status, 'client-adapter-ready-external-promotion-blocked'],
    ['cross_device_reopen_blocker', frontmatter.cross_device_reopen_blocker, 'shared-storage-auth-and-server-digest-not-enforced'],
    ['deploy_boundary', frontmatter.deploy_boundary, 'Dev-only'],
    ['kgCanvasSurfaceMode', readCanvasSurfaceMode(frontmatter.kgCanvasSurfaceMode), '3d'], ['kgCanvasRenderMode', readCanvasRenderMode(frontmatter.kgCanvasRenderMode), '3d'],
    ['kgCanvas3dMode', normalizePresetToken(frontmatter.kgCanvas3dMode), '3d'], ['kgFloatingPanelOpen', readBooleanPreset(frontmatter.kgFloatingPanelOpen), true],
    ['kgFloatingPanelView', frontmatter.kgFloatingPanelView, 'motionControl'], ['run_ready_demo.id', runReady.id, 'xr-v2'],
    ['run_ready_demo.activation', runReady.activation, 'applied-source-document'],
    ['run_ready_demo.canonical_source_file', runReady.canonical_source_file, `/${relativePath}`], ['run_ready_demo.source_root', runReady.source_root, 'knowgrph/docs'],
    ['run_ready_demo.validation_seed_path', runReady.validation_seed_path, `/${relativePath}`],
    ['run_ready_demo.source_backed', readBooleanPreset(runReady.source_backed), true], ['run_ready_demo.native_runtime', readBooleanPreset(runReady.native_runtime), true],
    ['run_ready_demo.browser_activation_evidence', runReady.browser_activation_evidence, 'actual Explorer Source Files row selection; no environment selector'],
    ['run_ready_demo.mount_status', runReady.mount_status, 'mounted-after-applied-source-document'],
    ['run_ready_demo.canonical_xr_world_owner', runReady.canonical_xr_world_owner, 'docs/workspace-seeds/knowgrph-physics-playground-demo.md'],
    ['shared_xr_scene.source_authority', sharedXrScene.source_authority, XR_V2_SHARED_SCENE_AUTHORITY.sourceAuthority],
    ['shared_xr_scene.world_ownership', sharedXrScene.world_ownership, XR_V2_SHARED_SCENE_AUTHORITY.worldOwnership],
    ['shared_xr_scene.surface_owner', sharedXrScene.surface_owner, XR_V2_SHARED_SCENE_AUTHORITY.surfaceOwner],
    ['shared_xr_scene.renderer_owner', sharedXrScene.renderer_owner, XR_V2_SHARED_SCENE_AUTHORITY.rendererOwner],
    ['shared_xr_scene.second_r3f_canvas_forbidden', readBooleanPreset(sharedXrScene.second_r3f_canvas_forbidden), XR_V2_SHARED_SCENE_AUTHORITY.secondR3fCanvasForbidden],
    ['run_ready_demo.auto_start', readBooleanPreset(runReady.auto_start), true], ['pinned_source.path', pinned.path, 'docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md'],
    ['pinned_source.commit', pinned.commit, '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7'], ['pinned_source.git_blob_sha1', pinned.git_blob_sha1, '1c0cc60e8cdfaf4bc1b599e11cd5aba109ad6544'],
    ['pinned_source.content_sha256', pinned.content_sha256, '9dfcb6b55a5cb510177f0108ebccedace5d640390dbeef4d69a63f1e89edb6ea'], ['runtime_readiness.focused_gate', readiness.focused_gate, 'npm run xr-v2:review-ready'],
    ['runtime_readiness.browser_demo_status', readiness.browser_demo_status, 'runtime-ready'], ['runtime_readiness.browser_local_mount_status', readiness.browser_local_mount_status, 'mounted'],
    ['runtime_readiness.pinned_contract_status', readiness.pinned_contract_status, 'partial'],
    ['runtime_readiness.physical_device_certification', readiness.physical_device_certification, 'external-required'], ['runtime_readiness.production_availability', readiness.production_availability, 'not-claimed'],
    ['runtime_readiness.deployment_authority', readBooleanPreset(readiness.deployment_authority), false], ['permission_control.owner', permissions.owner, 'user'],
    ['permission_control.default_state', permissions.default_state, 'disabled'], ['permission_control.camera', permissions.camera, 'user-enable-disable'],
    ['permission_control.sensors', permissions.sensors, 'user-enable-disable'],
  ]) requireValue(label, actual, expected)
  if (Object.hasOwn(runReady, 'env_selector')) missing.push('run_ready_demo.env_selector=absent')
  if (!Array.isArray(runReady.external_dependencies) || runReady.external_dependencies.length !== 0) missing.push('run_ready_demo.external_dependencies=[]')
  const acIds = Array.from({ length: 12 }, (_, index) => `AC-${index + 1}`)
  if (JSON.stringify(criteria.map(entry => isRecord(entry) ? entry.id : null)) !== JSON.stringify(acIds)) missing.push('acceptance_criteria=exact AC-1..AC-12 ledger')
  for (const [criterion, contract] of Object.entries(ACCEPTANCE_EVIDENCE_CONTRACTS)) {
    const entry = criteria.find(candidate => isRecord(candidate) && candidate.id === criterion)
    requireValue(`${criterion}.evidence`, entry?.evidence, contract.evidence)
    requireValue(`${criterion}.promotion_boundary`, entry?.promotion_boundary, contract.promotionBoundary)
  }
  const requiredNodeTypes = {
    xr_v2_demo_entry: 'XrDemoControl', 'schema:XrTransform': 'EcsComponentSchema', 'schema:XrRenderable': 'EcsComponentSchema',
    'schema:XrParticleEmitter': 'EcsComponentSchema', 'schema:XrRig': 'EcsComponentSchema', 'entity:scene.hero': 'EcsEntity',
    'entity:scene.marker': 'EcsEntity', 'material:hero': 'XrMaterialGraph', 'behavior:hero:select': 'XrBehaviorTrigger',
    'action:hero:burst': 'XrBehaviorAction', 'timeline:hero': 'XrTimelineSequence', xr_v2_certification_boundary: 'XrDemoValidation',
  }
  for (const [id, type] of Object.entries(requiredNodeTypes)) {
    if (nodes.filter(node => isRecord(node) && node.id === id && node.type === type).length !== 1) missing.push(`flow.nodes=exactly one ${id}:${type}`)
  }
  const certificationBoundary = nodes.find(node => isRecord(node) && node.id === 'xr_v2_certification_boundary')
  const certificationProperties = isRecord(certificationBoundary?.properties) ? certificationBoundary.properties : {}
  for (const [label, actual, expected] of [
    ['certification.browserDemoState', certificationProperties.browserDemoState, 'runtime-ready'],
    ['certification.browserLocalMountState', certificationProperties.browserLocalMountState, 'mounted'],
    ['certification.pinnedContractState', certificationProperties.pinnedContractState, 'partial'],
    ['certification.physicalDeviceState', certificationProperties.physicalDeviceState, 'external-required'],
    ['certification.productionState', certificationProperties.productionState, 'not-claimed'],
  ]) requireValue(label, actual, expected)
  for (const [index, criterion] of acIds.entries()) {
    const id = `xr_v2_ac_${String(index + 1).padStart(2, '0')}`
    const matches = nodes.filter(node => isRecord(node) && node.id === id && node.type === 'XrDemoValidation' && isRecord(node.properties) && node.properties.criterion === criterion)
    if (matches.length !== 1) missing.push(`flow.nodes=exactly one source-authored ${criterion}`)
    const contract = ACCEPTANCE_EVIDENCE_CONTRACTS[criterion]
    if (matches.length === 1 && contract) {
      requireValue(`${criterion}.flow.evidenceState`, matches[0].properties.evidenceState, contract.evidenceState)
      requireValue(`${criterion}.flow.output`, matches[0].properties.output, contract.output)
    }
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
  if (missing.length > 0) throw new Error(`runtime-ready workspace document ${basename} has invalid authority; missing=${JSON.stringify(missing)}`)
}
