import { SEMANTIC_TWIN_PROCEDURAL_TEMPLATES } from '../xr-v2/semanticTwinTemplates.mjs'
export const SEMANTIC_SPACE_TOOL_IDS = Object.freeze({
  inspectLocalSemanticSpace: 'inspect_local_semantic_space',
  controlLocalSemanticSpace: 'control_local_semantic_space',
})

const id = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' }
const text = { type: 'string', minLength: 1, maxLength: 80 }
const region = { type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'],
  properties: Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, { type: 'number', minimum: 0, maximum: 1 }])) }
const size = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number', minimum: 0.1, maximum: 5 } }
const position = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number', minimum: -10, maximum: 10 } }
const base = { requestId: { ...id, maxLength: 110 }, expectedRevision: { type: 'integer', minimum: 0 } }
const twinEntity = { ...base, entityId: id }
const action = (operation, properties, required) => ({ type: 'object', additionalProperties: false,
  required: ['operation', ...required], properties: { operation: { const: operation }, ...properties } })
export const SEMANTIC_SPACE_CONTROL_SCHEMA = Object.freeze({ oneOf: [
  action('renderer', { backend: { type: 'string', enum: ['webgl', 'webgpu'] } }, ['backend']),
  action('analyze', { observationId: id, region, relief: { type: 'boolean' }, useWholeRegion: { type: 'boolean' } }, ['observationId']),
  action('overlay', { observationId: id }, ['observationId']),
  action('objects', { observationId: id, presentation: { type: 'string', enum: ['photo', 'layout', 'models'] } }, ['observationId']),
  action('compose-twin-scene', { ...base, evidenceSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    assignments: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', additionalProperties: false,
      required: ['entityId', 'template'], properties: { entityId: id,
        template: { type: 'string', enum: ['contour', ...SEMANTIC_TWIN_PROCEDURAL_TEMPLATES] } } } } },
  ['requestId', 'expectedRevision', 'evidenceSha256', 'assignments']),
  action('query', { text: { type: 'string', maxLength: 80 } }, []),
  action('select', { ...base, entityId: { anyOf: [id, { type: 'null' }] } }, ['requestId', 'expectedRevision', 'entityId']),
  action('correct', { ...base, entityId: id, label: text, category: text }, ['requestId', 'expectedRevision', 'entityId', 'label', 'category']),
  action('confirm', { ...base, observationId: id, label: text, category: text, region },
    ['requestId', 'expectedRevision', 'observationId', 'label', 'category', 'region']),
  action('build', { ...twinEntity, template: { type: 'string', enum: ['contour', ...SEMANTIC_TWIN_PROCEDURAL_TEMPLATES] },
    silhouette: { type: 'object', additionalProperties: false, required: ['width', 'height', 'runs'], properties: {
      width: { type: 'integer', minimum: 3, maximum: 192 }, height: { type: 'integer', minimum: 3, maximum: 192 },
      runs: { type: 'array', minItems: 1, maxItems: 2048, items: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'integer', minimum: 0, maximum: 192 } } },
    } }, size, position }, ['requestId', 'expectedRevision', 'entityId', 'template', 'size', 'position']),
  action('edit-twin', { ...twinEntity, size, position },
    ['requestId', 'expectedRevision', 'entityId', 'size', 'position']),
  action('set-room', { ...base, room: { type: 'object', additionalProperties: false,
    required: ['width', 'depth', 'unit'], properties: {
      width: { type: 'number', minimum: 2, maximum: 20 }, depth: { type: 'number', minimum: 2, maximum: 20 },
      unit: { type: 'string', enum: ['arbitrary', 'authored-metres'] },
    } } }, ['requestId', 'expectedRevision', 'room']),
  action('control-twin', { ...twinEntity, controlId: id,
    value: { anyOf: [{ type: 'number' }, { type: 'string', maxLength: 80 }, { type: 'boolean' }] } },
  ['requestId', 'expectedRevision', 'entityId', 'controlId', 'value']),
  action('remove-twin', twinEntity, ['requestId', 'expectedRevision', 'entityId']),
  action('simulate', { entityId: id }, ['entityId']),
  action('reset', { entityId: id }, ['entityId']),
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
    description: 'Inspect and edit evidence-linked entities and CPU procedural twins. Mutations require a request ID and expected revision. Structured compose-twin-scene assigns solid shapes and an authored ground layout; objects accepts presentation=layout for solid navigation or photo for evidence comparison. /space.renderer @canvas #webgpu or #webgl chooses device rendering. /space.analyze @observation #regions proposes local pixel groups; #relief proposes a whole-image brightness surface without mutation. /space.overlay @observation #image aligns saved objects; /space.objects @observation #models opens separate models with shared selection and Timeline editing. /space.find #category, /space.select @entity, /space.label, /space.build @entity #procedural-asset, /space.simulate and /space.reset are supported.',
    inputSchema: SEMANTIC_SPACE_CONTROL_SCHEMA,
    annotations: mutationAnnotations,
  }]
}
