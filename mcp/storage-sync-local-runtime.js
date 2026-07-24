import {
  KNOWGRPH_STORAGE_BROWSER_TOOL_IDS,
  KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES,
  normalizeKnowgrphFileSyncControlInput,
  normalizeKnowgrphGitControlInput,
} from '../canvas/src/lib/storage/knowgrphStorageEngineMcpContract.mjs'

export const isStorageSyncLocalToolName = toolName =>
  toolName === KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES.gitRun
  || toolName === KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES.fileSyncRun

const buildPayload = ({
  status,
  errorCode,
  requiredTool,
  invocation,
  message,
}) => ({
  schema: 'knowgrph-storage-stdio-handoff/v1',
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
  const git = toolName === KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES.gitRun
  const requiredTool = git
    ? `knowgrph.${KNOWGRPH_STORAGE_BROWSER_TOOL_IDS.controlLocalGitRepository}`
    : `knowgrph.${KNOWGRPH_STORAGE_BROWSER_TOOL_IDS.controlLocalFileSync}`
  let invocation
  try {
    invocation = git
      ? normalizeKnowgrphGitControlInput(input)
      : normalizeKnowgrphFileSyncControlInput(input)
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
    message: 'Local stdio cannot access the active browser IndexedDB-backed Persisted_Cache. Invoke the required browser WebMCP tool in the open Knowgrph task.',
  })
}
