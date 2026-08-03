export const CANVAS_VIEW_COMMAND_TOKEN = '/canvas.view.set'
export const CANVAS_VIEW_SEMANTIC_TOKEN = '#canvas-view'
export const CANVAS_VIEW_BINDING_TOKEN = '@canvas-view'
export const CANVAS_VIEW_MCP_TOOL_NAME = 'knowgrph.control_local_canvas_view'

export const CANVAS_VIEW_CONTROL_OPTION_IDS = Object.freeze([
  'renderer:d3',
  'renderer:dashboard',
  'renderer:gallery',
  'renderer:media',
  'renderer:flowchart',
  'renderer:multiDimTable',
  'renderer:gitGraph',
  'renderer:gantt',
  'renderer:flow',
  'renderer:animatic',
  'renderer:storyboard',
  'renderer:design',
  'layout:block',
  'layout:radial',
  'layout:storyboardWidgetRebalance',
  'document:documentStructure',
  'document:keyword',
  'document:frontmatter',
  'document:multiDimTable',
  'surface:2d',
  'surface:3d',
  'surface:xr',
  'surface:geo-xr',
  'surface:voxel',
  'surface:geospatial',
  'animation:force',
  'animation:orbit',
  'control:richMedia',
  'control:nodeShape',
  'control:clusterShape',
  'control:portHandles',
  'control:minimap',
  'control:grid',
  'control:snapGrid',
  'control:helperLines',
  'control:aspectRatio',
  'control:boardLayout',
  'control:card',
  'control:widget',
  'control:timeline',
  'control:flowchart',
  'control:gitGraph',
  'control:gantt',
  'control:architecture',
  'control:eventModeling',
])

const CANVAS_VIEW_CONTROL_OPTION_ID_SET = new Set(CANVAS_VIEW_CONTROL_OPTION_IDS)

export const isCanvasViewControlOptionId = value => CANVAS_VIEW_CONTROL_OPTION_ID_SET.has(String(value || '').trim())

export const buildCanvasViewInvocation = optionId => {
  const normalizedOptionId = String(optionId || '').trim()
  if (!isCanvasViewControlOptionId(normalizedOptionId)) throw new Error('A canonical Canvas View option id is required.')
  return `${CANVAS_VIEW_COMMAND_TOKEN} ${CANVAS_VIEW_SEMANTIC_TOKEN} ${CANVAS_VIEW_BINDING_TOKEN} option=${normalizedOptionId}`
}

export const parseCanvasViewInvocation = invocationRaw => {
  const invocation = String(invocationRaw || '').trim()
  const match = invocation.match(/^\/canvas\.view\.set\s+#canvas-view\s+@canvas-view\s+option=([^\s]+)$/)
  const optionId = String(match?.[1] || '').trim()
  if (!isCanvasViewControlOptionId(optionId)) throw new Error('Canvas View invocation must use the canonical command tuple and option id.')
  return { invocation: buildCanvasViewInvocation(optionId), optionId }
}
