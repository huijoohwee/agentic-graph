export const WORKSPACE_LAUNCH_COMMAND_TOKEN = '/workspace.launch'
export const WORKSPACE_LAUNCH_SEMANTIC_TOKEN = '#workspace-launch'
export const WORKSPACE_LAUNCH_BINDING_TOKEN = '@canvas'
export const WORKSPACE_LAUNCH_MCP_TOOL_NAME = 'agentic-graph.control_local_workspace_launch'

export const WORKSPACE_LAUNCH_OPTION_IDS = Object.freeze([
  'home:open',
  'spotlight:open',
  'workflowManager:open',
  'importLocalFiles:choose',
  'importImage:choose',
  'fetchApiDataSource:open',
  'importFolder:choose',
  'importUrl:configure',
  'newMarkdown:create',
  'newFolder:create',
  'save:current',
  'export:configure',
  'status:open',
])

const WORKSPACE_LAUNCH_OPTION_ID_SET = new Set(WORKSPACE_LAUNCH_OPTION_IDS)

export const isWorkspaceLaunchOptionId = value => WORKSPACE_LAUNCH_OPTION_ID_SET.has(String(value || '').trim())

export const buildWorkspaceLaunchInvocation = optionId => {
  const normalizedOptionId = String(optionId || '').trim()
  if (!isWorkspaceLaunchOptionId(normalizedOptionId)) throw new Error('A canonical Workspace Launch option id is required.')
  return `${WORKSPACE_LAUNCH_COMMAND_TOKEN} ${WORKSPACE_LAUNCH_SEMANTIC_TOKEN} ${WORKSPACE_LAUNCH_BINDING_TOKEN} option=${normalizedOptionId}`
}

export const parseWorkspaceLaunchInvocation = invocationRaw => {
  const invocation = String(invocationRaw || '').trim()
  const match = invocation.match(/^\/workspace\.launch\s+#workspace-launch\s+@canvas\s+option=([^\s]+)$/)
  const optionId = String(match?.[1] || '').trim()
  if (!isWorkspaceLaunchOptionId(optionId)) throw new Error('Workspace Launch invocation must use the canonical command tuple and option id.')
  return { invocation: buildWorkspaceLaunchInvocation(optionId), optionId }
}
