export const PYTHON_LEARNING_TOOL_IDS = Object.freeze({ inspect: 'inspect_local_python_learning', control: 'control_local_python_learning' })
export const PYTHON_LEARNING_OPERATIONS = Object.freeze(['validate', 'run', 'step', 'pause', 'stop', 'reset', 'hint', 'save'])
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const identity = {
  workspaceId: { type: 'string', minLength: 1, maxLength: 1024 }, documentId: { type: 'string', minLength: 1, maxLength: 1024 },
  sourceDigest: digest, sceneDigest: digest, lessonId: { type: 'string', enum: ['travel', 'route', 'sense'] },
  lessonRevision: { const: '1' }, runtimeRevision: { const: 'learning-python-1' }, seed: { const: 0 },
  expectedRunId: { anyOf: [{ type: 'null' }, { type: 'string', minLength: 1, maxLength: 64 }] },
}
export const buildPythonLearningToolContracts = ({ buildWebName }) => [
  { name: PYTHON_LEARNING_TOOL_IDS.inspect, webName: buildWebName(PYTHON_LEARNING_TOOL_IDS.inspect), title: 'Inspect Local Python Learning',
    description: 'Read the active Python document identity, supported limits, local lesson and current simulation rubric. Does not execute, edit or save source.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true } },
  { name: PYTHON_LEARNING_TOOL_IDS.control, webName: buildWebName(PYTHON_LEARNING_TOOL_IDS.control), title: 'Control Local Python Learning',
    description: 'Apply an explicitly requested operation to the bound active Python document. Requires a fresh complete identity from inspection. Run acknowledges start; inspect at most five times for completion. Save is a separate explicit action. Never edits source or calls a model.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...identity,
      operation: { type: 'string', enum: PYTHON_LEARNING_OPERATIONS }, requestId: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' } },
      required: [...Object.keys(identity), 'operation', 'requestId'] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false } },
]
