import {
  AGENTICGRAPH_STORAGE_BROWSER_TOOL_IDS,
  AGENTICGRAPH_STORAGE_LOCAL_TOOL_NAMES,
  normalizeAgenticGraphFileSyncControlInput,
  normalizeAgenticGraphGitControlInput,
} from '../canvas/src/lib/storage/agenticgraphStorageEngineMcpContract.mjs'

export const isStorageSyncLocalToolName = toolName =>
  toolName === AGENTICGRAPH_STORAGE_LOCAL_TOOL_NAMES.gitRun
  || toolName === AGENTICGRAPH_STORAGE_LOCAL_TOOL_NAMES.fileSyncRun

const buildPayload = ({
  status,
  errorCode,
  requiredTool,
  invocation,
  message,
}) => ({
  schema: 'agenticgraph-storage-stdio-handoff/v1',
  ok: false,
  status,
  errorCode,
  surface: 'local-stdio',
  executableSurface: 'browser-webmcp',
  requiredTool,
  invocation,
  message,
})

export const runStorageSyncLocalTool = (toolName, input = {}) => {
  if (!isStorageSyncLocalToolName(toolName)) {
    throw new Error(`Unknown storage-sync local tool: ${String(toolName || '')}`)
  }
  const git = toolName === AGENTICGRAPH_STORAGE_LOCAL_TOOL_NAMES.gitRun
  const requiredTool = git
    ? `agenticgraph.${AGENTICGRAPH_STORAGE_BROWSER_TOOL_IDS.controlLocalGitRepository}`
    : `agenticgraph.${AGENTICGRAPH_STORAGE_BROWSER_TOOL_IDS.controlLocalFileSync}`
  let invocation
  try {
    invocation = git
      ? normalizeAgenticGraphGitControlInput(input)
      : normalizeAgenticGraphFileSyncControlInput(input)
  } catch (error) {
    return buildPayload({
      status: 'rejected',
      errorCode: 'INVALID_INPUT',
      requiredTool,
      invocation: {},
      message: error instanceof Error ? error.message : 'Storage-sync input is invalid.',
    })
  }
  return buildPayload({
    status: 'blocked',
    errorCode: 'BROWSER_RUNTIME_REQUIRED',
    requiredTool,
    invocation,
    message: 'Local stdio cannot access the active browser IndexedDB-backed Persisted_Cache. Invoke the required browser WebMCP tool in the open AgenticGraph task.',
  })
}
