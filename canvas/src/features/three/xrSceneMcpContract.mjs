export const XR_SCENE_MCP_SCHEMA = 'agentic-graph-xr-scene-mcp/v1'

export const XR_SCENE_WEB_MCP_TOOL_IDS = Object.freeze({
  inspect: 'inspect_local_xr_scene_assets',
  control: 'control_local_xr_scene',
})

export const XR_SCENE_INVOCATION_COMMANDS = Object.freeze({
  stage: '/xr.stage',
  place: '/xr.place',
  transform: '/xr.transform',
  label: '/xr.label',
  remove: '/xr.remove',
  physics: '/xr.physics',
  present: '/xr.present',
})

export const XR_SCENE_INVOCATION_BINDINGS = Object.freeze({
  canvas: '@canvas',
  scene: '@scene',
})

export const XR_SCENE_INVOCATION_SEMANTICS = Object.freeze({
  transform: '#transform',
  world: '#world',
  body: '#body',
  impulse: '#impulse',
  controller: '#controller',
  reticle: '#reticle',
})

const cleanTarget = value => String(value || '').trim().replace(/^@+/, '')
const cleanTransition = value => String(value || '').trim() === 'hold' ? 'hold' : 'linear'

export const buildXrStageInvocation = stageId => (
  `${XR_SCENE_INVOCATION_COMMANDS.stage} @${cleanTarget(stageId)}`
)

export const buildXrPlaceInvocation = (assetId, transition = 'linear', label = '') => {
  const target = `@${cleanTarget(assetId)}`
  const normalizedLabel = String(label || '').trim()
  return [
    XR_SCENE_INVOCATION_COMMANDS.place,
    target,
    `transition=${cleanTransition(transition)}`,
    normalizedLabel ? `label=${encodeURIComponent(normalizedLabel)}` : '',
  ].filter(Boolean).join(' ')
}

export const buildXrTransformInvocation = (subjectId, transform = {}) => {
  const pairs = [
    String(transform.assetId || '').trim() ? `asset=${cleanTarget(transform.assetId)}` : '',
    Array.isArray(transform.position) ? `position=${transform.position.join(',')}` : '',
    Number.isFinite(transform.rotationYDegrees) ? `rotation=${transform.rotationYDegrees}` : '',
    Number.isFinite(transform.scale) ? `scale=${transform.scale}` : '',
    /^#[0-9a-f]{6}$/i.test(String(transform.color || '')) ? `color=${String(transform.color).toLowerCase()}` : '',
  ].filter(Boolean)
  return [
    XR_SCENE_INVOCATION_COMMANDS.transform,
    `@${encodeURIComponent(cleanTarget(subjectId))}`,
    XR_SCENE_INVOCATION_SEMANTICS.transform,
    ...pairs,
  ].join(' ')
}

export const buildXrPhysicsInvocation = (semantic, operation, pairs = {}) => {
  const normalizedSemantic = String(semantic || '').trim().replace(/^#+/, '')
  const normalizedOperation = String(operation || '').trim()
  const pairText = Object.entries(pairs)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => {
      const normalizedValue = Array.isArray(value) ? value.join(',') : String(value).trim()
      return `${key}=${key === 'subject' ? encodeURIComponent(normalizedValue) : normalizedValue}`
    })
    .join(' ')
  return [
    XR_SCENE_INVOCATION_COMMANDS.physics,
    XR_SCENE_INVOCATION_BINDINGS.canvas,
    `#${normalizedSemantic}`,
    `operation=${normalizedOperation}`,
    pairText,
  ].filter(Boolean).join(' ')
}

export const buildXrPresentInvocation = () => (
  `${XR_SCENE_INVOCATION_COMMANDS.present} ${XR_SCENE_INVOCATION_BINDINGS.scene} ${XR_SCENE_INVOCATION_SEMANTICS.reticle}`
)
