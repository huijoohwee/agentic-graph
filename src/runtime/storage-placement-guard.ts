import type { Rejection } from '../bundle/bundle-types'

const HOT_PATH_COMPONENTS = new Set(['Bundle_Graph_Store', 'Envelope_Ledger', 'Reopt_Worker'])

export function authorizeD1Access(component: string, purpose: string): { kind: 'allowed' } | Rejection {
  if (HOT_PATH_COMPONENTS.has(component) || purpose !== 'aggregate-reporting') {
    return { kind: 'rejected', reason: 'storage-placement', details: { component, purpose } }
  }
  return { kind: 'allowed' }
}

export const ALLOWED_STORAGE_SYSTEMS = Object.freeze([
  'durable-object-sqlite', 'kv', 'cache-api', 'r2', 'd1-aggregate-only', 'yjs',
])
