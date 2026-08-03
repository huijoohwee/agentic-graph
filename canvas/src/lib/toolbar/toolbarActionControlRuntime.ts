import {
  TOOLBAR_ACTION_MCP_TOOL_NAME,
  buildToolbarActionInvocation,
  isToolbarActionId,
  parseToolbarActionInvocation,
} from './toolbarActionInvocationContract.mjs'

export type ToolbarActionId =
  | 'settings:open'
  | 'history:open'
  | 'help:open'
  | 'node:create'
  | 'edge:start'
  | 'workflow:runAll'
  | 'workflow:resetAll'
  | 'history:undo'
  | 'history:redo'
  | 'search:toggle'
  | 'chat:open'
  | 'theme:cycle'
  | 'pwa:install'

export type ToolbarActionStatus = 'applied' | 'blocked'

export type ToolbarActionHandlerResult = Readonly<{
  status: ToolbarActionStatus
  message: string
}>

export type ToolbarActionControlResult = Readonly<{
  schema: 'knowgrph-toolbar-action-control/v1'
  status: ToolbarActionStatus
  actionId: ToolbarActionId
  invocation: string
  mcpTool: typeof TOOLBAR_ACTION_MCP_TOOL_NAME
  message: string
}>

type ToolbarActionControlHandler = (actionId: ToolbarActionId) => ToolbarActionHandlerResult | Promise<ToolbarActionHandlerResult>

let activeHandler: ToolbarActionControlHandler | null = null

export function registerToolbarActionControlHandler(handler: ToolbarActionControlHandler): () => void {
  activeHandler = handler
  return () => {
    if (activeHandler === handler) activeHandler = null
  }
}

export async function executeToolbarActionControl(input: Record<string, unknown>): Promise<ToolbarActionControlResult> {
  const hasInvocation = typeof input.invocation === 'string' && input.invocation.trim().length > 0
  const hasActionId = typeof input.actionId === 'string' && input.actionId.trim().length > 0
  if (hasInvocation === hasActionId) throw new Error('Provide exactly one Main Toolbar invocation or action id.')
  const parsed = hasInvocation
    ? parseToolbarActionInvocation(input.invocation)
    : { actionId: String(input.actionId || '').trim(), invocation: buildToolbarActionInvocation(input.actionId) }
  if (!isToolbarActionId(parsed.actionId)) throw new Error('A canonical Main Toolbar action id is required.')
  if (!activeHandler) throw new Error('The browser-local Main Toolbar owner is unavailable.')
  const outcome = await activeHandler(parsed.actionId as ToolbarActionId)
  return Object.freeze({
    schema: 'knowgrph-toolbar-action-control/v1',
    status: outcome.status,
    actionId: parsed.actionId as ToolbarActionId,
    invocation: parsed.invocation,
    mcpTool: TOOLBAR_ACTION_MCP_TOOL_NAME,
    message: outcome.message,
  })
}
