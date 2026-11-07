/** Pure review policy. Scene schemas, geometry, storage and approval stay with their source owners. */
export const SPATIAL_REVIEW_MAX_BYTES = 128 * 1024
export const SPATIAL_REVIEW_MAX_RECEIPTS = 32

export class SpatialReviewError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'SpatialReviewError' }
}
export function refuse(code: string, message: string): never { throw new SpatialReviewError(code, message) }
export function canonicalSpatialJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalSpatialJson).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalSpatialJson((value as Record<string, unknown>)[key])}`).join(',')}}`
}
export async function spatialDigest(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSpatialJson(value)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
export function freezeSpatial<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeSpatial); Object.freeze(value) }
  return value
}
export function enforceSpatialBudget(value: unknown): void {
  if (new TextEncoder().encode(JSON.stringify(value)).length > SPATIAL_REVIEW_MAX_BYTES) refuse('budget-exceeded', 'Spatial review exceeds 128 KiB. Export and prune receipts before continuing.')
}
export function spatialValuesEqual(before: unknown, after: unknown): boolean {
  return canonicalSpatialJson(before) === canonicalSpatialJson(after)
}

export type SpatialCapability = 'inspect' | 'preview' | 'apply' | 'undo' | 'export'
export type SpatialSourceDescriptor = Readonly<{
  sourceKind: string
  schema: string
  documentId: string
  session: string
  revision: string
}>
export type SpatialSourceIdentity = SpatialSourceDescriptor & Readonly<{ token: string }>
export type SpatialSourceBinding = Readonly<{ sourceKind: string; schema: string; sourceToken: string }>

/** The owner supplies its persisted revision and local session; this token grants no write authority. */
export async function createSpatialSourceIdentity(source: SpatialSourceDescriptor): Promise<SpatialSourceIdentity> {
  const limits = { sourceKind: 64, schema: 128, documentId: 1024, session: 128, revision: 256 }
  if (!source || Object.keys(source).sort().join(',') !== Object.keys(limits).sort().join(',')) refuse('invalid-input', 'A review source needs its complete owner-qualified identity.')
  for (const key of Object.keys(limits) as (keyof SpatialSourceDescriptor)[]) {
    if (typeof source[key] !== 'string' || !source[key] || source[key].length > limits[key]) refuse('invalid-input', `Invalid review source ${key}.`)
  }
  if (!/^[a-z][a-z0-9-]*$/.test(source.sourceKind)) refuse('invalid-input', 'Review source kind must be a qualified owner name.')
  const copy = { ...source }
  return freezeSpatial({ ...copy, token: `${copy.sourceKind}:${await spatialDigest(copy)}` })
}

/** Validate an untrusted binding against a freshly inspected identity and owner-selected capabilities. */
export function requireSpatialCapability(
  current: SpatialSourceIdentity, binding: unknown, operation: string, supported: readonly SpatialCapability[],
): void {
  if (!['inspect', 'preview', 'apply', 'undo', 'export'].includes(operation) || !supported.includes(operation as SpatialCapability)) refuse('unsupported-operation', 'This source does not support the requested review operation.')
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) refuse('invalid-input', 'An owner-qualified source binding is required.')
  const value = binding as Record<string, unknown>
  if (Object.keys(value).sort().join(',') !== 'schema,sourceKind,sourceToken') refuse('invalid-input', 'Unsupported source binding fields.')
  if (value.sourceKind !== current.sourceKind || value.schema !== current.schema) refuse('unsupported-source', 'The source owner or schema does not match this runtime.')
  if (typeof value.sourceToken !== 'string' || value.sourceToken !== current.token) refuse('stale-source', 'The reviewed source or session changed. Inspect it and create a fresh proposal.')
}
