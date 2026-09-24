import type { AssetControlValue } from '@/features/image-to-glb/proceduralAssetContract'
import { buildSemanticTwinBinding, editSemanticTwinControl, emptySemanticTwin, MAX_TWIN_OBJECTS,
  validateSemanticTwin, type SemanticTwin, type TwinRoom, type TwinTemplate, type TwinVector } from './semanticTwinRuntime'

export const SEMANTIC_SPACE_SCHEMA = 'agentic-graph/semantic-space/v1' as const
export const MAX_SPACE_OBSERVATIONS = 24
export const MAX_SPACE_ENTITIES = 50
const IMAGE_LIMIT = 2 * 1024 * 1024
const IMAGE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export type SpaceRegion = Readonly<{ x: number; y: number; width: number; height: number }>
export type SpaceObservation = Readonly<{
  id: string
  capturedAtMs: number
  width: number
  height: number
  imageDataUrl: string
  sha256: string
  orientation: 'source-pixels'
  scale: 'unknown'
}>
export type SpaceEntity = Readonly<{
  id: string
  observationId: string
  label: string
  category: string
  region: SpaceRegion
  confirmedAtMs: number
  provenance: 'user-confirmed'
}>
export type SpaceDocument = Readonly<{
  schema: typeof SEMANTIC_SPACE_SCHEMA
  id: string
  revision: number
  observations: readonly SpaceObservation[]
  entities: readonly SpaceEntity[]
  selectedEntityId: string | null
  requestIds: readonly string[]
  twin?: SemanticTwin
}>
export type SpaceAction =
  | Readonly<{ operation: 'capture'; requestId: string; expectedRevision: number; observation: SpaceObservation }>
  | Readonly<{ operation: 'confirm'; requestId: string; expectedRevision: number; entity: SpaceEntity }>
  | Readonly<{ operation: 'correct'; requestId: string; expectedRevision: number; entityId: string; label: string; category: string }>
  | Readonly<{ operation: 'select'; requestId: string; expectedRevision: number; entityId: string | null }>
  | Readonly<{ operation: 'build'; requestId: string; expectedRevision: number; entityId: string;
      template: TwinTemplate; size: TwinVector; position: TwinVector; seed?: number }>
  | Readonly<{ operation: 'set-room'; requestId: string; expectedRevision: number; room: TwinRoom }>
  | Readonly<{ operation: 'move-twin'; requestId: string; expectedRevision: number;
      entityId: string; position: TwinVector }>
  | Readonly<{ operation: 'resize-twin'; requestId: string; expectedRevision: number;
      entityId: string; size: TwinVector }>
  | Readonly<{ operation: 'edit-twin'; requestId: string; expectedRevision: number;
      entityId: string; size: TwinVector; position: TwinVector }>
  | Readonly<{ operation: 'control-twin'; requestId: string; expectedRevision: number;
      entityId: string; controlId: string; value: AssetControlValue }>
  | Readonly<{ operation: 'remove-twin'; requestId: string; expectedRevision: number; entityId: string }>

export class SpaceError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'SpaceError' }
}

const requireId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) throw new SpaceError('invalid-input', `${field} is invalid`)
  return value
}
const requireText = (value: unknown, field: string): string => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > 80 || /[\u0000-\u001f]/.test(text)) throw new SpaceError('invalid-input', `${field} must be 1–80 printable characters`)
  return text
}
const validRegion = (region: SpaceRegion): boolean => Boolean(region
  && [region.x, region.y, region.width, region.height].every(Number.isFinite)
  && region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0
  && region.x + region.width <= 1.000001 && region.y + region.height <= 1.000001)
const validTime = (value: number): boolean => Number.isSafeInteger(value) && value >= 0
const validObservation = (observation: SpaceObservation): boolean => Boolean(observation
  && ID.test(observation.id) && validTime(observation.capturedAtMs)
  && Number.isSafeInteger(observation.width) && observation.width > 0 && observation.width <= 4096
  && Number.isSafeInteger(observation.height) && observation.height > 0 && observation.height <= 4096
  && typeof observation.imageDataUrl === 'string' && observation.imageDataUrl.length <= IMAGE_LIMIT
  && IMAGE.test(observation.imageDataUrl) && /^[a-f0-9]{64}$/.test(observation.sha256)
  && observation.orientation === 'source-pixels' && observation.scale === 'unknown')

export function validateSpaceDocument(input: unknown): SpaceDocument {
  const doc = input as SpaceDocument
  if (!doc || doc.schema !== SEMANTIC_SPACE_SCHEMA || !ID.test(doc.id)
    || !Number.isSafeInteger(doc.revision) || doc.revision < 0
    || !Array.isArray(doc.observations) || doc.observations.length > MAX_SPACE_OBSERVATIONS
    || !Array.isArray(doc.entities) || doc.entities.length > MAX_SPACE_ENTITIES
    || !Array.isArray(doc.requestIds) || doc.requestIds.length > 32) {
    throw new SpaceError('invalid-package', 'Space document schema or bounds are invalid')
  }
  const observations = new Set<string>()
  for (const observation of doc.observations) {
    if (!validObservation(observation) || observations.has(observation.id)) {
      throw new SpaceError('invalid-package', 'Space observation is malformed or duplicated')
    }
    observations.add(observation.id)
  }
  const entities = new Set<string>()
  for (const entity of doc.entities) {
    if (!entity || !ID.test(entity.id) || entities.has(entity.id)
      || !observations.has(entity.observationId) || !validRegion(entity.region)
      || !validTime(entity.confirmedAtMs) || entity.provenance !== 'user-confirmed') {
      throw new SpaceError('invalid-package', 'Space entity or evidence link is invalid')
    }
    requireText(entity.label, 'label'); requireText(entity.category, 'category')
    entities.add(entity.id)
  }
  if (doc.selectedEntityId !== null && !entities.has(doc.selectedEntityId)) {
    throw new SpaceError('invalid-package', 'Selected entity does not exist')
  }
  if (doc.requestIds.some(id => !ID.test(id)) || new Set(doc.requestIds).size !== doc.requestIds.length) {
    throw new SpaceError('invalid-package', 'Request receipts are invalid')
  }
  if (doc.twin !== undefined) {
    try { validateSemanticTwin(doc.twin, doc.entities, doc.observations) }
    catch (error) { throw new SpaceError('invalid-package', String((error as Error).message || error)) }
  }
  return doc
}

export function newSpaceDocument(id: string): SpaceDocument {
  return { schema: SEMANTIC_SPACE_SCHEMA, id: requireId(id, 'space id'), revision: 0,
    observations: [], entities: [], selectedEntityId: null, requestIds: [] }
}

export async function hashSpaceImage(imageDataUrl: string): Promise<string> {
  const match = IMAGE.exec(imageDataUrl)
  if (!match || imageDataUrl.length > IMAGE_LIMIT) throw new SpaceError('invalid-image', 'Image format or size is unsupported')
  let bytes: Uint8Array
  try { bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0)) }
  catch { throw new SpaceError('invalid-image', 'Image encoding is corrupt') }
  const png = match[1] === 'png' && bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  const jpeg = match[1] === 'jpeg' && bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = match[1] === 'webp' && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (!png && !jpeg && !webp) throw new SpaceError('invalid-image', 'Image bytes do not match their declared format')
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifySpaceEvidence(doc: SpaceDocument, decodePixels = false): Promise<SpaceDocument> {
  validateSpaceDocument(doc)
  for (const observation of doc.observations) {
    if (await hashSpaceImage(observation.imageDataUrl) !== observation.sha256) {
      throw new SpaceError('corrupt-evidence', `Image evidence is corrupt: ${observation.id}`)
    }
    if (decodePixels && typeof Image !== 'undefined') {
      const image = new Image()
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new SpaceError('corrupt-evidence', `Image cannot be decoded: ${observation.id}`))
      })
      image.src = observation.imageDataUrl
      await loaded
      if (image.naturalWidth !== observation.width || image.naturalHeight !== observation.height) {
        throw new SpaceError('corrupt-evidence', `Image dimensions do not match: ${observation.id}`)
      }
    }
  }
  return doc
}

export function applySpaceAction(doc: SpaceDocument, action: SpaceAction): SpaceDocument {
  validateSpaceDocument(doc)
  requireId(action.requestId, 'request id')
  if (doc.requestIds.includes(action.requestId)) return doc
  if (action.expectedRevision !== doc.revision) throw new SpaceError('stale-revision', 'Space changed; reload before editing')
  let next: SpaceDocument
  const twin = doc.twin || emptySemanticTwin()
  const existing = 'entityId' in action && typeof action.entityId === 'string'
    ? twin.objects.find(item => item.entityId === action.entityId) : undefined
  switch (action.operation) {
    case 'capture':
      if (doc.observations.length >= MAX_SPACE_OBSERVATIONS) throw new SpaceError('capacity', 'Space observation limit reached')
      if (!validObservation(action.observation) || doc.observations.some(item => item.id === action.observation.id)) {
        throw new SpaceError('invalid-input', 'Observation is invalid or already exists')
      }
      next = { ...doc, observations: [...doc.observations, action.observation] }
      break
    case 'confirm':
      if (doc.entities.length >= MAX_SPACE_ENTITIES) throw new SpaceError('capacity', 'Space entity limit reached')
      if (!ID.test(action.entity.id) || doc.entities.some(item => item.id === action.entity.id)
        || !doc.observations.some(item => item.id === action.entity.observationId)
        || !validRegion(action.entity.region) || !validTime(action.entity.confirmedAtMs)
        || action.entity.provenance !== 'user-confirmed') throw new SpaceError('invalid-input', 'Confirmed region is invalid')
      next = { ...doc, entities: [...doc.entities, { ...action.entity,
        label: requireText(action.entity.label, 'label'), category: requireText(action.entity.category, 'category') }],
        selectedEntityId: action.entity.id }
      break
    case 'correct':
      if (!doc.entities.some(item => item.id === action.entityId)) throw new SpaceError('unknown-entity', 'Entity does not exist')
      next = { ...doc, entities: doc.entities.map(item => item.id === action.entityId
        ? { ...item, label: requireText(action.label, 'label'), category: requireText(action.category, 'category') } : item) }
      break
    case 'select':
      if (action.entityId !== null && !doc.entities.some(item => item.id === action.entityId)) {
        throw new SpaceError('unknown-entity', 'Entity does not exist')
      }
      next = { ...doc, selectedEntityId: action.entityId }
      break
    case 'build': {
      const entity = doc.entities.find(item => item.id === action.entityId)
      if (!entity) throw new SpaceError('unknown-entity', 'Confirm an entity before building its geometry')
      const observation = doc.observations.find(item => item.id === entity.observationId)!
      if (!existing && twin.objects.length >= MAX_TWIN_OBJECTS) throw new SpaceError('capacity', 'Twin object limit reached')
      let binding
      try { binding = buildSemanticTwinBinding({ entity, observation, room: twin.room,
        template: action.template, size: action.size, position: action.position, seed: action.seed }) }
      catch (error) { throw new SpaceError('invalid-input', String((error as Error).message || error)) }
      next = { ...doc, twin: { ...twin, objects: [...twin.objects.filter(item => item.entityId !== entity.id), binding] },
        selectedEntityId: entity.id }
      break
    }
    case 'set-room':
      next = { ...doc, twin: { ...twin, room: action.room } }
      break
    case 'move-twin':
      if (!existing) throw new SpaceError('unknown-entity', 'Build this entity before moving it')
      next = { ...doc, twin: { ...twin, objects: twin.objects.map(item => item.entityId === existing.entityId
        ? { ...item, position: action.position } : item) } }
      break
    case 'resize-twin':
      if (!existing) throw new SpaceError('unknown-entity', 'Build this entity before resizing it')
      next = { ...doc, twin: { ...twin, objects: twin.objects.map(item => item.entityId === existing.entityId
        ? { ...item, size: action.size } : item) } }
      break
    case 'edit-twin':
      if (!existing) throw new SpaceError('unknown-entity', 'Build this entity before editing its placement')
      next = { ...doc, twin: { ...twin, objects: twin.objects.map(item => item.entityId === existing.entityId
        ? { ...item, size: action.size, position: action.position } : item) } }
      break
    case 'control-twin':
      if (!existing) throw new SpaceError('unknown-entity', 'Build this entity before editing it')
      try { next = { ...doc, twin: { ...twin, objects: twin.objects.map(item => item.entityId === existing.entityId
        ? editSemanticTwinControl(item, action.controlId, action.value) : item) } } }
      catch (error) { throw new SpaceError('invalid-input', String((error as Error).message || error)) }
      break
    case 'remove-twin':
      if (!existing) throw new SpaceError('unknown-entity', 'This entity has no built geometry')
      next = { ...doc, twin: { ...twin, objects: twin.objects.filter(item => item.entityId !== existing.entityId) } }
      break
  }
  if (next.twin !== undefined) {
    try { validateSemanticTwin(next.twin, next.entities, next.observations) }
    catch (error) { throw new SpaceError('invalid-input', String((error as Error).message || error)) }
  }
  return { ...next, revision: doc.revision + 1, requestIds: [...doc.requestIds, action.requestId].slice(-32) }
}

export function querySpaceEntities(doc: SpaceDocument, category = ''): readonly SpaceEntity[] {
  validateSpaceDocument(doc)
  const needle = category.trim().toLowerCase()
  return doc.entities.filter(entity => !needle || entity.category.toLowerCase().includes(needle)
    || entity.label.toLowerCase().includes(needle))
}
