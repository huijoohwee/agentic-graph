import { readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { D1DatabaseLike, D1StatementLike } from '../../../../cloudflare/workers/agentic-graph-storage/db'

export const migrations = [
  '0001_agentic-graph_storage.sql',
  '0008_chat_auth_and_audit.sql',
  '0015_storage_publication_contract.sql',
  '0019_storage_chunk_document_identity.sql',
]
export const syncMigrations = [...migrations, '0020_storage_child_sync_state.sql']

// Execute real SQL, including RETURNING, triggers and BLOB substrings. D1 exposes
// BLOB cells as byte arrays, unlike node:sqlite's Uint8Array cells.
export const createSqliteD1 = (migrationNames = syncMigrations) => {
  const sql = new DatabaseSync(':memory:')
  try {
    for (const name of migrationNames) sql.exec(readFileSync(new URL(`../../../../cloudflare/d1/migrations/${name}`, import.meta.url), 'utf8'))
  } catch (error) { sql.close(); throw error }
  let beforeRead: ((query: string) => void | Promise<void>) | null = null
  const segmentSizes: number[] = []
  const inFlight = new Set<Promise<unknown>>()
  const ownedStatements = new WeakMap<D1StatementLike, { query: string; values: unknown[] }>()
  const normalizeRow = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (!(value instanceof Uint8Array)) return [key, value]
    if (key === 'segment') segmentSizes.push(value.byteLength)
    return [key, Array.from(value)]
  }))
  const d1: D1DatabaseLike = {
    async batch(statements) {
      const inputs = statements.map(statement => {
        const input = ownedStatements.get(statement)
        if (!input) throw new Error('Native SQLite batch requires statements from this database')
        return input
      })
      sql.exec('BEGIN')
      try {
        const results = inputs.map(({ query, values }) => {
          const rows = sql.prepare(query).all(...values as SQLInputValue[])
          return { success: true, results: rows.map(normalizeRow) }
        })
        sql.exec('COMMIT')
        return results
      } catch (error) { sql.exec('ROLLBACK'); throw error }
    },
    prepare(query) {
      const makeStatement = (values: unknown[]): D1StatementLike => {
        const statement: D1StatementLike = {
          bind: (...next) => makeStatement(next),
          all<T>() {
            const operation = (async () => {
              await beforeRead?.(query)
              const rows = sql.prepare(query).all(...values as SQLInputValue[])
              return { results: rows.map(normalizeRow) as T[] }
            })()
            inFlight.add(operation)
            void operation.then(() => inFlight.delete(operation), () => inFlight.delete(operation))
            return operation
          },
          async run() {
            const result = sql.prepare(query).run(...values as SQLInputValue[])
            return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }
          },
        }
        ownedStatements.set(statement, { query, values })
        return statement
      }
      return makeStatement([])
    },
  }
  return {
    sql, d1, segmentSizes, beforeRead: (hook: typeof beforeRead) => { beforeRead = hook },
    async close() {
      // Reader cancellation fences delivery; an already-running async SQL hook
      // still owns this database until its current operation settles.
      while (inFlight.size) await Promise.allSettled([...inFlight])
      sql.close()
    },
  }
}

type Row = Record<string, unknown>
type NativeStorageFixtureState = {
  workspaces: Map<string, Row>; documents: Map<string, Row>
  documentChunks: Map<string, Row>; graphSnapshots: Map<string, Row>
  storageChildState: Map<string, Row>; storageChildSequence: number
  statementTime: () => string
  storageRecordWriteCounts: { documents: number; documentChunks: number; graphSnapshots: number }
}
export type NativeStorageStatement = { sql: string; values: unknown[] }

// Direct-map rows are historical test setup. Execute the current source SQL and
// triggers against that setup; never synthesize successful mutation receipts.
// One in-memory connection is owned and closed by each synchronous operation.
export const runNativeStorageStatements = (state: NativeStorageFixtureState, statements: NativeStorageStatement[]) => {
  const { sql } = createSqliteD1()
  const tables = [
    ['documents', state.documents], ['document_chunks', state.documentChunks],
    ['graph_snapshots', state.graphSnapshots], ['storage_child_state', state.storageChildState],
  ] as const
  const insert = (table: string, value: Row) => {
    const entries = Object.entries(value).filter(([, value]) => value !== undefined)
    sql.prepare(`INSERT INTO ${table} (${entries.map(([key]) => key).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`)
      .run(...entries.map(([, value]) => value) as SQLInputValue[])
  }
  try {
    // Some tests deliberately seed invalid cross-workspace rows to exercise the
    // real reader's ownership checks; setup is separate from guarded writes.
    sql.exec('PRAGMA foreign_keys = OFF')
    sql.function('strftime', { varargs: true }, (...args) => {
      if (args[0] !== '%Y-%m-%dT%H:%M:%fZ' || args[1] !== 'now') throw new Error('Unexpected fixture timestamp expression')
      return state.statementTime()
    })
    for (const value of state.workspaces.values()) insert('workspaces', value)
    for (const [table, source] of tables.slice(0, 3)) for (const value of source.values()) insert(table, value)
    // Import is a snapshot, so historical parent revisions/times must not be
    // advanced again by the child insert triggers used during materialization.
    sql.exec('DELETE FROM documents')
    for (const value of state.documents.values()) insert('documents', value)
    const initialized = sql.prepare('SELECT * FROM storage_child_state ORDER BY sync_revision').all()
    sql.exec('DELETE FROM storage_child_state')
    const sequence = Math.max(state.storageChildSequence, ...Array.from(state.storageChildState.values(), value => Number(value.sync_revision)))
    sql.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'storage_child_state'").run(sequence)
    for (const value of state.storageChildState.values()) insert('storage_child_state', value)
    for (const value of initialized) {
      // Existing state, including tombstones, is authoritative. Only rows seeded
      // directly without any state receive their initial fixture index entry.
      if (Array.from(state.storageChildState.values()).some(known => known.workspace_id === value.workspace_id
          && known.entity === value.entity && (known.record_id === value.record_id
            || (known.document_id === value.document_id && known.identity_key === value.identity_key)))) continue
      const record = (value.entity === 'documentChunk' ? state.documentChunks : state.graphSnapshots).get(String(value.record_id))!
      const { sync_revision: _revision, ...initial } = value
      insert('storage_child_state', { ...initial, updated_at: record.updated_at })
    }
    sql.exec('PRAGMA foreign_keys = ON; BEGIN')
    const results = statements.map(({ sql: query, values }) => ({
      success: true, results: sql.prepare(query).all(...values as SQLInputValue[]) as Row[],
    }))
    sql.exec('COMMIT')
    for (const [table, target] of tables) {
      // node:sqlite string cells truncate embedded NUL on the pinned Node
      // version; JSON serialization retains the complete fixture text bytes.
      const columns = sql.prepare(`PRAGMA table_info(${table})`).all().map(column => String(column.name))
      const rows = sql.prepare(`SELECT json_object(${columns.map(column => `'${column}', ${column}`).join(', ')}) AS value FROM ${table}`)
        .all().map(row => JSON.parse(String(row.value)) as Row)
      target.clear()
      for (const value of rows) target.set(String(value.id ?? value.sync_revision), { ...value })
    }
    state.storageChildSequence = Number(sql.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'storage_child_state'").get()?.seq || 0)
    statements.forEach(({ sql: query }, index) => {
      const match = /^\s*(?:INSERT INTO|UPDATE|DELETE FROM)\s+(documents|document_chunks|graph_snapshots)\b/i.exec(query)
      if (!match) return
      const key = match[1]!.toLowerCase() === 'documents' ? 'documents'
        : match[1]!.toLowerCase() === 'document_chunks' ? 'documentChunks' : 'graphSnapshots'
      state.storageRecordWriteCounts[key] += results[index]!.results.length
    })
    return results
  } finally { sql.close() }
}
