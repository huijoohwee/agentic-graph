import {
  KNOWGRPH_FILE_SYNC_CONTROL_INPUT_SCHEMA,
  KNOWGRPH_STORAGE_BROWSER_TOOL_IDS,
  KNOWGRPH_STORAGE_GIT_CONTROL_INPUT_SCHEMA,
} from '../../lib/storage/knowgrphStorageEngineMcpContract.mjs'

export const STORAGE_SYNC_AGENT_READY_TOOL_IDS = KNOWGRPH_STORAGE_BROWSER_TOOL_IDS

const INSPECT_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
})

const CONTROL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
  idempotentHint: false,
})

const INSPECTION_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: true,
  required: ['schema', 'ok', 'persistence'],
})

const CONTROL_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: true,
  required: ['schema', 'ok', 'status'],
})

export function buildStorageSyncAgentReadyToolContracts({ buildWebName }) {
  return [{
    name: STORAGE_SYNC_AGENT_READY_TOOL_IDS.inspectLocalGitRepository,
    webName: buildWebName(STORAGE_SYNC_AGENT_READY_TOOL_IDS.inspectLocalGitRepository),
    title: 'Inspect Local Git Repository',
    description: 'Inspect browser-local Git repository metadata, refs, object counts, retained operations, persistence readiness, bounds, and exact /git.run @local-git-repository @git-remote #git-remote grammar without returning object bytes or credentials.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: INSPECTION_OUTPUT_SCHEMA,
    annotations: INSPECT_ANNOTATIONS,
  }, {
    name: STORAGE_SYNC_AGENT_READY_TOOL_IDS.controlLocalGitRepository,
    webName: buildWebName(STORAGE_SYNC_AGENT_READY_TOOL_IDS.controlLocalGitRepository),
    title: 'Control Local Git Repository',
    description: 'Clone, fetch, commit, or push the active browser-local persisted Git repository through an opaque Dev Worker remote using structured fields or exact /git.run grammar.',
    inputSchema: KNOWGRPH_STORAGE_GIT_CONTROL_INPUT_SCHEMA,
    outputSchema: CONTROL_OUTPUT_SCHEMA,
    annotations: CONTROL_ANNOTATIONS,
  }, {
    name: STORAGE_SYNC_AGENT_READY_TOOL_IDS.inspectLocalFileSync,
    webName: buildWebName(STORAGE_SYNC_AGENT_READY_TOOL_IDS.inspectLocalFileSync),
    title: 'Inspect Local File Sync',
    description: 'Inspect browser-local multi-provider file-sync metadata, provider identifiers, ledger counts, retained transfers, persistence readiness, bounds, and exact /file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync grammar without returning file bytes or credentials.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: INSPECTION_OUTPUT_SCHEMA,
    annotations: INSPECT_ANNOTATIONS,
  }, {
    name: STORAGE_SYNC_AGENT_READY_TOOL_IDS.controlLocalFileSync,
    webName: buildWebName(STORAGE_SYNC_AGENT_READY_TOOL_IDS.controlLocalFileSync),
    title: 'Control Local File Sync',
    description: 'Pull or push a bounded browser-local persisted file/directory prefix through an opaque Dev Worker provider using structured fields or exact /file.sync grammar.',
    inputSchema: KNOWGRPH_FILE_SYNC_CONTROL_INPUT_SCHEMA,
    outputSchema: CONTROL_OUTPUT_SCHEMA,
    annotations: CONTROL_ANNOTATIONS,
  }]
}
