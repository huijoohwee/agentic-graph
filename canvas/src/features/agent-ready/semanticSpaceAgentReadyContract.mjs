export const SEMANTIC_SPACE_TOOL_IDS = Object.freeze({
  inspectLocalSemanticSpace: 'inspect_local_semantic_space',
  controlLocalSemanticSpace: 'control_local_semantic_space',
})

const id = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' }
const text = { type: 'string', minLength: 1, maxLength: 80 }
const region = { type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'],
  properties: Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, { type: 'number', minimum: 0, maximum: 1 }])) }
const base = { requestId: { ...id, maxLength: 110 }, expectedRevision: { type: 'integer', minimum: 0 } }
const action = (operation, properties, required) => ({ type: 'object', additionalProperties: false,
  required: ['operation', ...required], properties: { operation: { const: operation }, ...properties } })
export const SEMANTIC_SPACE_CONTROL_SCHEMA = Object.freeze({ oneOf: [
  action('query', { text: { type: 'string', maxLength: 80 } }, []),
  action('select', { ...base, entityId: { anyOf: [id, { type: 'null' }] } }, ['requestId', 'expectedRevision', 'entityId']),
  action('correct', { ...base, entityId: id, label: text, category: text }, ['requestId', 'expectedRevision', 'entityId', 'label', 'category']),
  action('confirm', { ...base, observationId: id, label: text, category: text, region },
    ['requestId', 'expectedRevision', 'observationId', 'label', 'category', 'region']),
  { type: 'object', additionalProperties: false, required: ['invocation'], properties: {
    invocation: { type: 'string', minLength: 1, maxLength: 256, pattern: '^/space\\.' },
  } },
] })

export function buildSemanticSpaceAgentReadyToolContracts({ buildWebName, readOnlyAnnotations, mutationAnnotations }) {
  return [{
    name: SEMANTIC_SPACE_TOOL_IDS.inspectLocalSemanticSpace,
    webName: buildWebName(SEMANTIC_SPACE_TOOL_IDS.inspectLocalSemanticSpace),
    title: 'Inspect Local Semantic Space',
    description: 'Read the active local space, confirmed entity IDs, evidence references and optional category query. Images remain on this device.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { query: { type: 'string', maxLength: 80 } } },
    annotations: readOnlyAnnotations,
  }, {
    name: SEMANTIC_SPACE_TOOL_IDS.controlLocalSemanticSpace,
    webName: buildWebName(SEMANTIC_SPACE_TOOL_IDS.controlLocalSemanticSpace),
    title: 'Control Local Semantic Space',
    description: 'Query, select, confirm or correct evidence-linked entities. Structured actions require an expected revision; /space.find #category, /space.select @entity and /space.label @entity #category label="name" are supported.',
    inputSchema: SEMANTIC_SPACE_CONTROL_SCHEMA,
    annotations: mutationAnnotations,
  }]
}
