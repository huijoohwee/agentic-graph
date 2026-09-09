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
export const probeStorageCoreReadiness = async (env: AgenticGraphStorageWorkerEnv) => {
  const core = inspectStorageCoreBindings(env)
  const reasons = [...core.reasons]
  const db = readDb(env)
  let authSchema = 'not-probed'
  if (db) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?)")
          .bind(...AUTH_TABLES).all<{ name: string }>(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 3000) }),
      ])
      const names = result.results?.map(row => row.name).sort()
      authSchema = JSON.stringify(names) === JSON.stringify(AUTH_TABLES) ? 'ready' : 'missing'
    } catch { authSchema = 'unavailable' }
    finally { clearTimeout(timer) }
    if (authSchema !== 'ready') reasons.push('storage-auth-schema-unavailable')
  }
  const bucket = env.AGENTIC_OS_STORAGE_BLOB_BUCKET
  const blobStorage = bucket && typeof bucket.get === 'function' && typeof bucket.put === 'function' ? 'ready' : 'missing'
  if (blobStorage === 'missing') reasons.push('storage-blob-binding-missing')
  return { scope: 'core', runtime: core.runtime, ok: reasons.length === 0,
    dependencies: { ...core.dependencies, authSchema, blobStorage }, reasons }
}
