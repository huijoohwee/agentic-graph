import {
  WORKSPACE_LAUNCH_MCP_TOOL_NAME,
  buildWorkspaceLaunchInvocation,
  isWorkspaceLaunchOptionId,
  parseWorkspaceLaunchInvocation,
} from './workspaceLaunchInvocationContract.mjs'

export type WorkspaceLaunchOptionId =
  | 'home:open'
  | 'spotlight:open'
  | 'workflowManager:open'
  | 'importLocalFiles:choose'
  | 'importImage:choose'
  | 'fetchApiDataSource:open'
  | 'importFolder:choose'
  | 'importUrl:configure'
  | 'newMarkdown:create'
  | 'newFolder:create'
  | 'save:current'
  | 'export:configure'
  | 'status:open'

export type WorkspaceLaunchActionStatus = 'applied' | 'requested-user-input'

type WorkspaceLaunchHandlerResult = Readonly<{
  status: WorkspaceLaunchActionStatus
  message: string
}>

export type WorkspaceLaunchControlResult = Readonly<{
  schema: 'agentic-graph-workspace-launch-control/v1'
  status: WorkspaceLaunchActionStatus
  optionId: WorkspaceLaunchOptionId
  invocation: string
  mcpTool: typeof WORKSPACE_LAUNCH_MCP_TOOL_NAME
  message: string
}>

type WorkspaceLaunchControlHandler = (optionId: WorkspaceLaunchOptionId) => WorkspaceLaunchHandlerResult | Promise<WorkspaceLaunchHandlerResult>

let activeHandler: WorkspaceLaunchControlHandler | null = null

export function registerWorkspaceLaunchControlHandler(handler: WorkspaceLaunchControlHandler): () => void {
  activeHandler = handler
  return () => {
    if (activeHandler === handler) activeHandler = null
  }
}

export async function executeWorkspaceLaunchControl(input: Record<string, unknown>): Promise<WorkspaceLaunchControlResult> {
  const hasInvocation = typeof input.invocation === 'string' && input.invocation.trim().length > 0
  const hasOptionId = typeof input.optionId === 'string' && input.optionId.trim().length > 0
  if (hasInvocation === hasOptionId) throw new Error('Provide exactly one Workspace Launch invocation or option id.')
  const parsed = hasInvocation
    ? parseWorkspaceLaunchInvocation(input.invocation)
    : { optionId: String(input.optionId || '').trim(), invocation: buildWorkspaceLaunchInvocation(input.optionId) }
  if (!isWorkspaceLaunchOptionId(parsed.optionId)) throw new Error('A canonical Workspace Launch option id is required.')
  if (!activeHandler) throw new Error('The browser-local Workspace Launch owner is unavailable.')
  const outcome = await activeHandler(parsed.optionId as WorkspaceLaunchOptionId)
  return Object.freeze({
    schema: 'agentic-graph-workspace-launch-control/v1',
    status: outcome.status,
    optionId: parsed.optionId as WorkspaceLaunchOptionId,
    invocation: parsed.invocation,
    mcpTool: WORKSPACE_LAUNCH_MCP_TOOL_NAME,
    message: outcome.message,
  })
}
