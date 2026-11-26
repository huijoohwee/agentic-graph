import { type AgenticGraphStorageWorkerEnv } from './contract'
import { readDb } from './db'
import { readAgenticGraphStorageBrowserSessionConfiguration } from './storageBrowserSession'

const hasCanvasRoomBinding = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  const binding = value as Record<string, unknown>
  return typeof binding.idFromName === 'function' && typeof binding.get === 'function'
}

// Shared by both readiness scopes. Optional travel cannot supply core authority.
export const inspectStorageCoreBindings = (env: AgenticGraphStorageWorkerEnv) => {
  const local = String(env.AGENTIC_OS_STORAGE_LOCAL_RUNTIME || '').trim() === 'true'
  const dependencies = {
    d1: readDb(env) ? 'ready' : 'missing',
    canvasRoom: hasCanvasRoomBinding(env.AGENTIC_OS_CANVAS_ROOM) ? 'ready' : 'missing',
    browserSessionAccessConfiguration: local ? 'local-only'
      : readAgenticGraphStorageBrowserSessionConfiguration(env).ok ? 'configured' : 'missing',
    signingSecret: String(env.AGENTIC_OS_STORAGE_SIGNING_SECRET || '').length >= 32
      ? 'ready' : local ? 'local-only' : 'missing',
  }
  const reasons = [
    ...(dependencies.d1 === 'missing' ? ['d1-binding-missing'] : []),
    ...(dependencies.canvasRoom === 'missing' ? ['canvas-room-binding-missing'] : []),
    ...(dependencies.browserSessionAccessConfiguration === 'missing' ? ['storage-browser-session-access-configuration-missing'] : []),
    ...(dependencies.signingSecret === 'missing' ? ['storage-signing-secret-missing'] : []),
  ]
  return { dependencies, reasons, runtime: local ? 'local' : 'production' }
}

const AUTH_TABLES = ['auth_identities', 'auth_sessions', 'users', 'workspace_memberships']
const D1_BLOB_COLUMNS = {
  agentic_graph_d1_blob_quota: ['id', 'used_bytes', 'limit_bytes'],
  agentic_graph_d1_blob_objects: ['object_key', 'content_type', 'content_hash', 'custom_metadata_json', 'size_bytes', 'etag', 'updated_at'],
  agentic_graph_d1_blob_chunks: ['object_key', 'chunk_index', 'body'],
} as const

const hasD1BlobStore = async (env: AgenticGraphStorageWorkerEnv): Promise<boolean> => {
  const db = readDb(env)
  if (!db) return false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        for (const [table, required] of Object.entries(D1_BLOB_COLUMNS)) {
          const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
          const columns = new Set(result.results?.map(row => row.name))
          if (!required.every(column => columns.has(column))) return false
        }
        const stateResult = await db.prepare('SELECT used_bytes, limit_bytes FROM agentic_graph_d1_blob_quota WHERE id = 1')
          .all<{ used_bytes: number; limit_bytes: number }>()
        const state = stateResult.results?.[0]
        if (!state || state.limit_bytes !== 67108864 || state.used_bytes < 0 || state.used_bytes > state.limit_bytes) return false
        const actualResult = await db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS used_bytes FROM agentic_graph_d1_blob_objects')
          .all<{ used_bytes: number }>()
        return actualResult.results?.[0]?.used_bytes === state.used_bytes
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 3000) }),
    ])
  } catch { return false }
  finally { clearTimeout(timer) }
}

export const probeStorageCoreReadiness = async (env: AgenticGraphStorageWorkerEnv) => {
  const tables = [...AUTH_TABLES, ...(env.AGENTIC_OS_STORAGE_BROWSER_AUTH_MODE === 'oauth'
    ? ['storage_oauth_budget', 'storage_oauth_challenges'] : [])].sort()
  const core = inspectStorageCoreBindings(env)
  const reasons = [...core.reasons]
  const db = readDb(env)
  let authSchema = 'not-probed'
  if (db) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${tables.map(() => '?').join(', ')})`)
          .bind(...tables).all<{ name: string }>(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 3000) }),
      ])
      const names = result.results?.map(row => row.name).sort()
      authSchema = JSON.stringify(names) === JSON.stringify(tables) ? 'ready' : 'missing'
    } catch { authSchema = 'unavailable' }
    finally { clearTimeout(timer) }
    if (authSchema !== 'ready') reasons.push('storage-auth-schema-unavailable')
  }
  const blobStorage = await hasD1BlobStore(env) ? 'ready' : 'blocked'
  if (blobStorage === 'blocked') reasons.push('storage-blob-d1-quota-or-schema-unavailable')
  return { scope: 'core', runtime: core.runtime, ok: reasons.length === 0,
    dependencies: { ...core.dependencies, authSchema, blobStorage }, reasons }
}
