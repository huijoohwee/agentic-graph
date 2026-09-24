import { validateTwinSilhouette, type TwinSilhouette } from './semanticTwinSilhouette'
import { parseProceduralAssetRecipe, updateProceduralAssetControl,
  type AssetControlValue, type ProceduralAssetRecipe } from '@/features/image-to-glb/proceduralAssetContract'
import { createProceduralAssetFromText } from '@/features/image-to-glb/proceduralAssetTextRecipe'
import type { SpaceEntity, SpaceObservation } from './semanticSpaceRuntime'

export const SEMANTIC_TWIN_SCHEMA = 'agentic-graph/semantic-twin/v1' as const
export const SEMANTIC_TWIN_PREVIEW_EVENT = 'agentic-graph:semantic-twin-preview'
export const SEMANTIC_TWIN_TEMPLATES = ['contour', 'chair', 'table', 'box', 'sphere', 'cylinder'] as const
export const MAX_TWIN_OBJECTS = 20
export type TwinTemplate = typeof SEMANTIC_TWIN_TEMPLATES[number]
export type TwinVector = readonly [number, number, number]
export type TwinRoom = Readonly<{ width: number; depth: number; unit: 'arbitrary' | 'authored-metres' }>
export type TwinBinding = Readonly<{
  entityId: string
  observationId: string
  evidenceSha256: string
  template: TwinTemplate
  silhouette?: TwinSilhouette
  recipe: ProceduralAssetRecipe
  size: TwinVector
  position: TwinVector
  provenance: 'authored-approximation'
}>
export type SemanticTwin = Readonly<{
  schema: typeof SEMANTIC_TWIN_SCHEMA
  room: TwinRoom
  objects: readonly TwinBinding[]
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const vector = (value: unknown, min: number, max: number): value is TwinVector =>
  Array.isArray(value) && value.length === 3 && value.every(item => finite(item, min, max))
const template = (value: unknown): value is TwinTemplate =>
  SEMANTIC_TWIN_TEMPLATES.some(item => item === value)
const fail = (reason: string): never => { throw new Error(`Semantic twin: ${reason}`) }

export function emptySemanticTwin(): SemanticTwin {
  return { schema: SEMANTIC_TWIN_SCHEMA, room: { width: 8, depth: 8, unit: 'arbitrary' }, objects: [] }
}

/** A nested versioned extension of the existing space document; old packages may omit it. */
export function validateSemanticTwin(value: unknown, entities: readonly SpaceEntity[],
  observations: readonly SpaceObservation[]): SemanticTwin {
  if (!isRecord(value) || value.schema !== SEMANTIC_TWIN_SCHEMA || !isRecord(value.room)
    || Object.keys(value).some(key => !['schema', 'room', 'objects'].includes(key))
    || Object.keys(value.room).some(key => !['width', 'depth', 'unit'].includes(key))
    || !finite(value.room.width, 2, 20) || !finite(value.room.depth, 2, 20)
    || !['arbitrary', 'authored-metres'].includes(String(value.room.unit))
    || !Array.isArray(value.objects) || value.objects.length > MAX_TWIN_OBJECTS) fail('unsupported schema or room')
  const twin = value as unknown as SemanticTwin
  const seen = new Set<string>()
  let parts = 0
  for (const object of twin.objects) {
    if (!isRecord(object) || Object.keys(object).some(key => ![
      'entityId', 'observationId', 'evidenceSha256', 'template', 'recipe', 'size', 'position', 'provenance', 'silhouette',
    ].includes(key)) || typeof object.entityId !== 'string' || seen.has(object.entityId)
      || typeof object.observationId !== 'string' || !/^[a-f0-9]{64}$/.test(String(object.evidenceSha256))
      || !template(object.template) || !vector(object.size, 0.1, 5)
      || !vector(object.position, -10, 10) || object.position[1] !== 0
      || object.provenance !== 'authored-approximation') fail('invalid object binding')
    if (Math.abs(object.position[0]) + object.size[0] / 2 > twin.room.width / 2 + 1e-6
      || Math.abs(object.position[2]) + object.size[2] / 2 > twin.room.depth / 2 + 1e-6) fail('object extends beyond authored room')
    if (object.template === 'contour') validateTwinSilhouette(object.silhouette)
    else if (object.silhouette !== undefined) fail('silhouette requires contour geometry')
    const entity = entities.find(item => item.id === object.entityId)
    const observation = observations.find(item => item.id === object.observationId)
    if (!entity || entity.observationId !== object.observationId
      || !observation || observation.sha256 !== object.evidenceSha256) fail('broken entity or evidence link')
    parts += parseProceduralAssetRecipe(object.recipe).parts.length
    seen.add(object.entityId)
  }
  if (parts > 24) fail('mobile material budget exceeded')
  return twin
}

export function buildSemanticTwinBinding(args: Readonly<{
  entity: SpaceEntity; observation: SpaceObservation; template: TwinTemplate
  size: TwinVector; position: TwinVector; room: TwinRoom; seed?: number; silhouette?: TwinSilhouette
}>): TwinBinding {
  if (!template(args.template) || !vector(args.size, 0.1, 5) || !vector(args.position, -10, 10)
    || args.position[1] !== 0 || !Number.isSafeInteger(args.seed ?? 1)
    || (args.seed ?? 1) < 0 || (args.seed ?? 1) > 0xffff_ffff) fail('invalid construction request')
  const recipe = createProceduralAssetFromText(args.template === 'contour' ? 'box' : args.template, args.seed ?? 1)
  if (args.template === 'contour') {
    recipe.controls = recipe.controls.filter(control => ['color', 'visible'].includes(control.id))
    recipe.values = Object.fromEntries(recipe.controls.map(control => [control.id, recipe.values[control.id]]))
  }
  const binding: TwinBinding = {
    entityId: args.entity.id, observationId: args.entity.observationId,
    evidenceSha256: args.observation.sha256, template: args.template,
    recipe,
    ...(args.template === 'contour' ? { silhouette: validateTwinSilhouette(args.silhouette) } : {}),
    size: [...args.size] as [number, number, number],
    position: [...args.position] as [number, number, number],
    provenance: 'authored-approximation',
  }
  validateSemanticTwin({ schema: SEMANTIC_TWIN_SCHEMA, room: args.room, objects: [binding] }, [args.entity], [args.observation])
  return binding
}

export function editSemanticTwinControl(binding: TwinBinding, controlId: string,
  value: AssetControlValue): TwinBinding {
  const recipe = updateProceduralAssetControl(binding.recipe, controlId, value)
  return { ...binding, recipe }
}
