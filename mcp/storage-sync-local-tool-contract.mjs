import {
  KNOWGRPH_FILE_SYNC_CONTROL_INPUT_SCHEMA,
  KNOWGRPH_STORAGE_GIT_CONTROL_INPUT_SCHEMA,
  KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES,
} from '../canvas/src/lib/storage/knowgrphStorageEngineMcpContract.mjs'

const LOCAL_STORAGE_CONTROL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
  idempotentHint: false,
})

const HANDOFF_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: true,
  required: [
    'schema',
    'ok',
    'status',
    'errorCode',
    'surface',
    'executableSurface',
    'requiredTool',
    'invocation',
    'message',
  ],
  properties: {
    schema: { const: 'knowgrph-storage-stdio-handoff/v1' },
    ok: { const: false },
    status: { type: 'string', enum: ['blocked', 'rejected'] },
    errorCode: { type: 'string' },
    surface: { const: 'local-stdio' },
    executableSurface: { const: 'browser-webmcp' },
    requiredTool: { type: 'string' },
    invocation: { type: 'object', additionalProperties: true },
    message: { type: 'string' },
  },
})

const withDefaults = definition => ({
  ...definition,
  inputSchema: {
    type: 'object',
    ...definition.inputSchema,
  },
  outputSchema: HANDOFF_OUTPUT_SCHEMA,
  annotations: LOCAL_STORAGE_CONTROL_ANNOTATIONS,
})

export const buildStorageSyncLocalToolDefinitions = () => [
  withDefaults({
    name: KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES.gitRun,
    title: 'Run Browser Git Operation',
    description: 'Use this when a local MCP host needs to validate a Knowgrph-owned browser Git clone, fetch, commit, or push request. Local stdio cannot access the active IndexedDB repository and returns a typed handoff without performing filesystem or network work.',
    inputSchema: KNOWGRPH_STORAGE_GIT_CONTROL_INPUT_SCHEMA,
  }),
  withDefaults({
    name: KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES.fileSyncRun,
    title: 'Run Browser File Sync',
    description: 'Use this when a local MCP host needs to validate a Knowgrph-owned multi-provider pull or push request. Local stdio cannot access the active IndexedDB cache and returns a typed handoff without performing filesystem or network work.',
    inputSchema: KNOWGRPH_FILE_SYNC_CONTROL_INPUT_SCHEMA,
  }),
]
