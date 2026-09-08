import type { SQLInputValue } from 'node:sqlite'
import { createFakeAgenticGraphStorageBrowserSession } from './fake-agentic-graph-storage-browser-session'
import { createStorageWorkerRequest, readStorageWorker } from './fake-agentic-graph-storage-worker-fetch'
import { AGENTIC_OS_STORAGE_ROUTE_PATHS } from '@/lib/storage/agentic-graph-storage-sync-contract'
import { createSqliteD1, syncMigrations } from './native-agentic-graph-storage-d1'
export { createSqliteD1, migrations, syncMigrations } from './native-agentic-graph-storage-d1'

export const WORKSPACE = 'workspace:publication-sqlite'
export const NOW = '2026-01-01T00:00:00.000Z'

export const createFixture = async (migrationNames = syncMigrations, options: { workspaceId?: string; origin?: string } = {}) => {
  const workspaceId = options.workspaceId || WORKSPACE
  const auth = await createFakeAgenticGraphStorageBrowserSession(workspaceId, { role: 'owner', origin: options.origin })
  const database = createSqliteD1(migrationNames)
  try {
    const { sql, d1 } = database
    for (const [table, rows] of [
      ['workspaces', auth.env.DB.workspaces], ['users', auth.env.DB.users],
      ['auth_sessions', auth.env.DB.authSessions], ['workspace_memberships', auth.env.DB.workspaceMemberships],
    ] as const) {
      for (const row of rows.values()) {
        const entries = Object.entries(row)
        sql.prepare(`insert into ${table} (${entries.map(([key]) => key).join(',')}) values (${entries.map(() => '?').join(',')})`)
          .run(...entries.map(([, value]) => value) as SQLInputValue[])
      }
    }
    const env = { ...auth.env, DB: d1 }
    const worker = readStorageWorker()
    const request = (path: string, init: RequestInit = {}) => worker.fetch(new Request(new URL(path, auth.origin), init), env as never)
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const source = createStorageWorkerRequest(input, init)
      const url = new URL(source.url)
      if (url.origin !== auth.origin || !url.pathname.startsWith('/api/storage/')) {
        throw new Error(`Unexpected native storage fixture request: ${source.url}`)
      }
      const headers = new Headers(source.headers)
      if (source.credentials !== 'omit' && !headers.has('cookie')) headers.set('cookie', auth.cookie)
      if (/^(POST|PUT|PATCH|DELETE)$/.test(source.method) && !headers.has('origin')) headers.set('origin', auth.origin)
      return worker.fetch(new Request(source, { headers }), env as never)
    }) as typeof globalThis.fetch
    const publication = (id: string, action: 'publish' | 'revoke' = 'publish', extra: Record<string, unknown> = {}) => request(
      AGENTIC_OS_STORAGE_ROUTE_PATHS.publications, {
        method: 'POST', headers: { cookie: auth.cookie, origin: auth.origin, 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, documentId: id, action, ...extra }),
      },
    )
    const document = (id: string, content = '', targetWorkspaceId = workspaceId) => {
      sql.prepare(`insert into documents
        (id, workspace_id, canonical_path, source_kind, content_md, content_hash, parser_version, revision, deleted, created_at, updated_at)
        values (?, ?, ?, 'markdown', ?, ?, 'fixture-v1', 1, 0, ?, ?)`)
        .run(id, targetWorkspaceId, `${id}.md`, content, `hash:${id}:1`, NOW, NOW)
    }
    const chunk = (id: string, parent: string, markdown: string, order = 0, targetWorkspaceId = workspaceId) => {
      sql.prepare(`insert into document_chunks
        (id, document_id, workspace_id, chunk_key, chunk_order, heading, markdown, token_estimate, content_hash, updated_at)
        values (?, ?, ?, ?, ?, null, ?, 1, ?, ?)`)
        .run(id, parent, targetWorkspaceId, id, order, markdown, `hash:${id}`, NOW)
    }
    const identity = (id: string) => {
      const row = sql.prepare('select revision, content_hash from documents where id = ?').get(id)!
      return { revision: Number(row.revision), contentHash: String(row.content_hash) }
    }
    const read = (id: string, headers?: HeadersInit) => request(
      `${AGENTIC_OS_STORAGE_ROUTE_PATHS.docPrefix}${encodeURIComponent(workspaceId)}/${encodeURIComponent(`${id}.md`)}`, { headers },
    )
    return { ...database, env, auth, workspaceId, request, fetch, publication, document, chunk, identity, read }
  } catch (error) { database.sql.close(); throw error }
}
export type Fixture = Awaited<ReturnType<typeof createFixture>>
