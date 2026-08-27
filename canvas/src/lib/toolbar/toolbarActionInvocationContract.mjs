export const TOOLBAR_ACTION_COMMAND_TOKEN = '/toolbar.invoke'
export const TOOLBAR_ACTION_SEMANTIC_TOKEN = '#toolbar-action'
export const TOOLBAR_ACTION_BINDING_TOKEN = '@canvas'
export const TOOLBAR_ACTION_MCP_TOOL_NAME = 'agenticgraph.control_local_toolbar_action'

export const TOOLBAR_ACTION_IDS = Object.freeze([
  'settings:open',
  'history:open',
  'help:open',
  'node:create',
  'edge:start',
  'workflow:runAll',
  'workflow:resetAll',
  'history:undo',
  'history:redo',
  'search:toggle',
  'chat:open',
  'theme:cycle',
  'pwa:install',
])

const TOOLBAR_ACTION_ID_SET = new Set(TOOLBAR_ACTION_IDS)

export const isToolbarActionId = value => TOOLBAR_ACTION_ID_SET.has(String(value || '').trim())

export const buildToolbarActionInvocation = actionId => {
  const normalizedActionId = String(actionId || '').trim()
  if (!isToolbarActionId(normalizedActionId)) throw new Error('A canonical Main Toolbar action id is required.')
  return `${TOOLBAR_ACTION_COMMAND_TOKEN} ${TOOLBAR_ACTION_SEMANTIC_TOKEN} ${TOOLBAR_ACTION_BINDING_TOKEN} action=${normalizedActionId}`
}

export const parseToolbarActionInvocation = invocationRaw => {
  const invocation = String(invocationRaw || '').trim()
  const match = invocation.match(/^\/toolbar\.invoke\s+#toolbar-action\s+@canvas\s+action=([^\s]+)$/)
  const actionId = String(match?.[1] || '').trim()
  if (!isToolbarActionId(actionId)) throw new Error('Main Toolbar invocation must use the canonical command tuple and action id.')
  return { invocation: buildToolbarActionInvocation(actionId), actionId }
}
