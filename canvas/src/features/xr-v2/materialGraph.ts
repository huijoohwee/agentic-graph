export const MATERIAL_GRAPH_SCHEMA = 'knowgrph-xr-material-graph/v1' as const
export const MATERIAL_GRAPH_MAX_NODES = 128
export const MATERIAL_GRAPH_MAX_DEPTH = 32

export type MaterialNumberNode = Readonly<{ id: string; type: 'number'; value: number }>
export type MaterialBooleanNode = Readonly<{ id: string; type: 'boolean'; value: boolean }>
export type MaterialColorNode = Readonly<{ id: string; type: 'color'; value: string }>
export type MaterialMultiplyNode = Readonly<{ id: string; type: 'multiply'; left: string; right: string }>

export type MeshStandardMaterialParameterName =
  | 'color'
  | 'emissive'
  | 'roughness'
  | 'metalness'
  | 'opacity'
  | 'emissiveIntensity'
  | 'transparent'
  | 'wireframe'
  | 'depthWrite'

export type MaterialOutputNode = Readonly<{
  id: string
  type: 'mesh-standard-output'
  bindings: Readonly<Partial<Record<MeshStandardMaterialParameterName, string>>>
}>

export type MaterialGraphNode =
  | MaterialNumberNode
  | MaterialBooleanNode
  | MaterialColorNode
  | MaterialMultiplyNode
  | MaterialOutputNode

export type MaterialGraph = Readonly<{
  schema: typeof MATERIAL_GRAPH_SCHEMA
  nodes: readonly MaterialGraphNode[]
}>

export type MeshStandardMaterialParameterDescriptor = Readonly<{
  target: 'MeshStandardMaterial'
  parameters: Readonly<
    Partial<Record<MeshStandardMaterialParameterName, string | number | boolean>>
  >
}>

export type MaterialGraphCompileResult =
  | Readonly<{ status: 'ready'; descriptor: MeshStandardMaterialParameterDescriptor }>
  | Readonly<{
      status: 'invalid'
      reason:
        | 'too-many-nodes'
        | 'invalid-node'
        | 'duplicate-node-id'
        | 'output-count'
        | 'unknown-reference'
        | 'cycle'
        | 'type-mismatch'
        | 'unsafe-parameter-value'
    }>

type EvaluatedValue = Readonly<
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'color'; value: string }
>

const SAFE_NODE_ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/
const NUMBER_PARAMETERS = new Set<MeshStandardMaterialParameterName>([
  'roughness',
  'metalness',
  'opacity',
  'emissiveIntensity',
])
const BOOLEAN_PARAMETERS = new Set<MeshStandardMaterialParameterName>([
  'transparent',
  'wireframe',
  'depthWrite',
])
const COLOR_PARAMETERS = new Set<MeshStandardMaterialParameterName>(['color', 'emissive'])

function parameterInRange(parameter: MeshStandardMaterialParameterName, value: number): boolean {
  if (!Number.isFinite(value)) return false
  if (parameter === 'emissiveIntensity') return value >= 0 && value <= 100
  return value >= 0 && value <= 1
}

function isValidNodeShape(node: MaterialGraphNode): boolean {
  if (!node || !SAFE_NODE_ID.test(node.id)) return false
  if (node.type === 'number') return Number.isFinite(node.value)
  if (node.type === 'boolean') return typeof node.value === 'boolean'
  if (node.type === 'color') return SAFE_COLOR.test(node.value)
  if (node.type === 'multiply') return SAFE_NODE_ID.test(node.left) && SAFE_NODE_ID.test(node.right)
  if (node.type !== 'mesh-standard-output' || !node.bindings || typeof node.bindings !== 'object') return false
  return Object.entries(node.bindings).every(([parameter, reference]) =>
    (NUMBER_PARAMETERS.has(parameter as MeshStandardMaterialParameterName)
      || BOOLEAN_PARAMETERS.has(parameter as MeshStandardMaterialParameterName)
      || COLOR_PARAMETERS.has(parameter as MeshStandardMaterialParameterName))
    && typeof reference === 'string'
    && SAFE_NODE_ID.test(reference),
  )
}

/** Compiles a closed material graph into data. It never imports or instantiates Three.js. */
export function compileMeshStandardMaterialGraph(graph: MaterialGraph): MaterialGraphCompileResult {
  if (!graph || graph.schema !== MATERIAL_GRAPH_SCHEMA || !Array.isArray(graph.nodes)) {
    return { status: 'invalid', reason: 'invalid-node' }
  }
  if (graph.nodes.length > MATERIAL_GRAPH_MAX_NODES) return { status: 'invalid', reason: 'too-many-nodes' }

  const nodes = new Map<string, MaterialGraphNode>()
  for (const node of graph.nodes) {
    if (!isValidNodeShape(node)) return { status: 'invalid', reason: 'invalid-node' }
    if (nodes.has(node.id)) return { status: 'invalid', reason: 'duplicate-node-id' }
    nodes.set(node.id, node)
  }

  const outputs = graph.nodes.filter((node): node is MaterialOutputNode => node.type === 'mesh-standard-output')
  if (outputs.length !== 1) return { status: 'invalid', reason: 'output-count' }

  const cache = new Map<string, EvaluatedValue>()
  const evaluating = new Set<string>()
  let failure: MaterialGraphCompileResult | null = null

  const evaluate = (id: string, depth: number): EvaluatedValue | null => {
    const cached = cache.get(id)
    if (cached) return cached
    if (depth > MATERIAL_GRAPH_MAX_DEPTH || evaluating.has(id)) {
      failure = { status: 'invalid', reason: 'cycle' }
      return null
    }
    const node = nodes.get(id)
    if (!node) {
      failure = { status: 'invalid', reason: 'unknown-reference' }
      return null
    }
    if (node.type === 'mesh-standard-output') {
      failure = { status: 'invalid', reason: 'type-mismatch' }
      return null
    }

    evaluating.add(id)
    let value: EvaluatedValue | null = null
    if (node.type === 'number') value = { type: 'number', value: node.value }
    if (node.type === 'boolean') value = { type: 'boolean', value: node.value }
    if (node.type === 'color') value = { type: 'color', value: node.value.toLowerCase() }
    if (node.type === 'multiply') {
      const left = evaluate(node.left, depth + 1)
      const right = evaluate(node.right, depth + 1)
      if (left && right) {
        if (left.type !== 'number' || right.type !== 'number') {
          failure = { status: 'invalid', reason: 'type-mismatch' }
        } else {
          const product = left.value * right.value
          if (!Number.isFinite(product)) failure = { status: 'invalid', reason: 'unsafe-parameter-value' }
          else value = { type: 'number', value: product }
        }
      }
    }
    evaluating.delete(id)
    if (value) cache.set(id, value)
    return value
  }

  const parameters: Partial<Record<MeshStandardMaterialParameterName, string | number | boolean>> = {}
  for (const parameter of Object.keys(outputs[0].bindings).sort() as MeshStandardMaterialParameterName[]) {
    const reference = outputs[0].bindings[parameter]
    if (!reference) return { status: 'invalid', reason: 'unknown-reference' }
    const value = evaluate(reference, 0)
    if (!value) return failure ?? { status: 'invalid', reason: 'unknown-reference' }

    if (NUMBER_PARAMETERS.has(parameter)) {
      if (value.type !== 'number') return { status: 'invalid', reason: 'type-mismatch' }
      if (!parameterInRange(parameter, value.value)) return { status: 'invalid', reason: 'unsafe-parameter-value' }
    } else if (BOOLEAN_PARAMETERS.has(parameter)) {
      if (value.type !== 'boolean') return { status: 'invalid', reason: 'type-mismatch' }
    } else if (COLOR_PARAMETERS.has(parameter)) {
      if (value.type !== 'color') return { status: 'invalid', reason: 'type-mismatch' }
    } else {
      return { status: 'invalid', reason: 'invalid-node' }
    }
    parameters[parameter] = value.value
  }

  return {
    status: 'ready',
    descriptor: Object.freeze({
      target: 'MeshStandardMaterial',
      parameters: Object.freeze(parameters),
    }),
  }
}
