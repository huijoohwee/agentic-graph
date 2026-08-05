import { query } from '../../../../ecs/index.js'
import { snapshotWorld } from '../../../../ecs/world.js'

import {
  projectAuthoringEcsRows,
  type AuthoringEcsJsonValue,
  type AuthoringEcsProjectionResult,
  type AuthoringEcsQueriedComponentRow,
} from './authoringEcsProjection'

export type AuthoringEcsWorldProjectionResult =
  | AuthoringEcsProjectionResult
  | Readonly<{ status: 'invalid'; reason: 'world-unavailable' }>

type CanonicalWorldSnapshot = Readonly<{
  entities: readonly Readonly<{
    entityId: number
    components: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  }>[]
}>

/**
 * Read-only adapter from the repository-owned ECS World into the XR authoring
 * projection. World allocation, registration, querying, and storage remain
 * owned by the canonical ECS runtime.
 */
export function projectCanonicalAuthoringEcsWorld(
  world: object,
  includeComponents?: readonly string[],
): AuthoringEcsWorldProjectionResult {
  try {
    const entityIds = new Set<number>(query(world, includeComponents ? [...includeComponents] : []))
    const snapshot = snapshotWorld(world) as CanonicalWorldSnapshot
    const rows: AuthoringEcsQueriedComponentRow[] = []

    for (const entity of snapshot.entities) {
      if (!entityIds.has(entity.entityId)) continue
      for (const [componentName, fields] of Object.entries(entity.components)) {
        rows.push({
          componentName,
          entityId: entity.entityId,
          fields: fields as Readonly<Record<string, AuthoringEcsJsonValue>>,
        })
      }
    }

    return projectAuthoringEcsRows(rows, includeComponents)
  } catch {
    return { status: 'invalid', reason: 'world-unavailable' }
  }
}
