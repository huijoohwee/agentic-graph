export const AUTHORING_ECS_PROJECTION_SCHEMA = 'knowgrph-xr-authoring-ecs-projection/v1' as const
export const AUTHORING_ECS_MAX_ROWS = 4_096
export const AUTHORING_ECS_MAX_COMPONENTS_PER_ENTITY = 64

export type AuthoringEcsJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly AuthoringEcsJsonValue[]
  | Readonly<{ [key: string]: AuthoringEcsJsonValue }>

/** Data-only result of a query against the repository-owned ECS world. */
export type AuthoringEcsQueriedComponentRow = Readonly<{
  entityId: number
  componentName: string
  fields: Readonly<Record<string, AuthoringEcsJsonValue>>
}>

export type AuthoringEcsEntityProjection = Readonly<{
  entityId: number
  components: Readonly<Record<string, Readonly<Record<string, AuthoringEcsJsonValue>>>>
}>

export type AuthoringEcsProjection = Readonly<{
  schema: typeof AUTHORING_ECS_PROJECTION_SCHEMA
  entities: readonly AuthoringEcsEntityProjection[]
}>

export type AuthoringEcsProjectionResult =
  | Readonly<{ status: 'ready'; projection: AuthoringEcsProjection }>
  | Readonly<{
      status: 'invalid'
      reason:
        | 'too-many-rows'
        | 'invalid-entity-id'
        | 'invalid-component-name'
        | 'duplicate-component-row'
        | 'too-many-components'
        | 'invalid-field-value'
    }>

const SAFE_COMPONENT_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/

function cloneJsonValue(value: AuthoringEcsJsonValue, depth = 0): AuthoringEcsJsonValue {
  if (depth > 16) throw new TypeError('ECS field value exceeds the maximum nesting depth')
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('ECS field numbers must be finite')
    return value
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map(item => cloneJsonValue(item, depth + 1)))
  }
  if (!value || typeof value !== 'object') throw new TypeError('ECS field value must be JSON-safe')

  const source = value as Readonly<Record<string, AuthoringEcsJsonValue>>
  const output: Record<string, AuthoringEcsJsonValue> = Object.create(null)
  for (const key of Object.keys(source).sort()) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new TypeError('ECS field value contains an unsafe key')
    }
    output[key] = cloneJsonValue(source[key], depth + 1)
  }
  return Object.freeze(output)
}

/**
 * Projects already-queried component rows. It intentionally has no world,
 * query, allocation, registration, mutation, or renderer capability.
 */
export function projectAuthoringEcsRows(
  rows: readonly AuthoringEcsQueriedComponentRow[],
  includeComponents?: readonly string[],
): AuthoringEcsProjectionResult {
  if (rows.length > AUTHORING_ECS_MAX_ROWS) return { status: 'invalid', reason: 'too-many-rows' }

  const include = includeComponents ? new Set(includeComponents) : null
  const grouped = new Map<number, Map<string, Readonly<Record<string, AuthoringEcsJsonValue>>>>()

  for (const row of rows) {
    if (!Number.isSafeInteger(row.entityId) || row.entityId < 1) {
      return { status: 'invalid', reason: 'invalid-entity-id' }
    }
    if (!SAFE_COMPONENT_NAME.test(row.componentName)) {
      return { status: 'invalid', reason: 'invalid-component-name' }
    }
    if (include && !include.has(row.componentName)) continue

    const components = grouped.get(row.entityId) ?? new Map()
    if (components.has(row.componentName)) {
      return { status: 'invalid', reason: 'duplicate-component-row' }
    }
    if (components.size >= AUTHORING_ECS_MAX_COMPONENTS_PER_ENTITY) {
      return { status: 'invalid', reason: 'too-many-components' }
    }

    try {
      const fields: Record<string, AuthoringEcsJsonValue> = Object.create(null)
      for (const key of Object.keys(row.fields).sort()) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          throw new TypeError('unsafe ECS field name')
        }
        fields[key] = cloneJsonValue(row.fields[key])
      }
      components.set(row.componentName, Object.freeze(fields))
    } catch {
      return { status: 'invalid', reason: 'invalid-field-value' }
    }
    grouped.set(row.entityId, components)
  }

  const entities = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([entityId, componentMap]) => {
      const components: Record<string, Readonly<Record<string, AuthoringEcsJsonValue>>> = Object.create(null)
      for (const [componentName, fields] of [...componentMap.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        components[componentName] = fields
      }
      return Object.freeze({ entityId, components: Object.freeze(components) })
    })

  return {
    status: 'ready',
    projection: Object.freeze({
      schema: AUTHORING_ECS_PROJECTION_SCHEMA,
      entities: Object.freeze(entities),
    }),
  }
}
