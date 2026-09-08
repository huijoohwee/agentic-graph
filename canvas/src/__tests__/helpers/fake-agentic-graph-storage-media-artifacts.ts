// SQL surface used by the native mediaArtifacts D1 owner; unsupported media SQL fails loudly.
type MediaRow = Record<string, unknown>
type MediaTable = Map<string, MediaRow>
const columns = [
  'id', 'workspace_id', 'run_id', 'stage_id', 'shot_id', 'kind', 'durable_r2_url',
  'content_hash', 'media_type', 'provenance_json', 'layout_json', 'version', 'created_at', 'updated_at',
]
const updateColumns = [
  'run_id', 'stage_id', 'shot_id', 'kind', 'durable_r2_url', 'content_hash',
  'media_type', 'provenance_json', 'layout_json', 'version', 'updated_at',
]
const insertSql = `insert into media_artifacts ( ${columns.join(', ')} ) values (${columns.map(() => '?').join(', ')})`
const updateSql = `update media_artifacts set ${updateColumns.map(column => `${column} = ?`).join(', ')} where id = ? and workspace_id = ?`

const checkedValues = (values: unknown[], count: number): void => {
  if (values.length !== count) throw new Error(`media_artifacts expected ${count} bindings, got ${values.length}`)
}

const validateRow = (table: MediaTable, row: MediaRow, updatingId?: string): void => {
  for (const column of columns) {
    if (column !== 'media_type' && column !== 'layout_json' && row[column] == null) {
      throw new Error(`NOT NULL constraint failed: media_artifacts.${column}`)
    }
  }
  if (table.has(String(row.id)) && String(row.id) !== updatingId) {
    throw new Error('UNIQUE constraint failed: media_artifacts.id')
  }
  for (const existing of table.values()) {
    if (String(existing.id) !== updatingId && existing.workspace_id === row.workspace_id && existing.content_hash === row.content_hash) {
      throw new Error('UNIQUE constraint failed: media_artifacts.workspace_id, media_artifacts.content_hash')
    }
  }
}

export const mutateFakeMediaArtifacts = (table: MediaTable, sql: string, values: unknown[]): boolean => {
  if (!/\bmedia_artifacts\b/.test(sql)) return false
  if (sql === insertSql) {
    checkedValues(values, columns.length)
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]))
    validateRow(table, row)
    table.set(String(row.id), row)
    return true
  }
  if (sql === updateSql) {
    checkedValues(values, updateColumns.length + 2)
    const id = String(values[updateColumns.length])
    const existing = table.get(id)
    if (!existing || existing.workspace_id !== values[updateColumns.length + 1]) return true
    const row = { ...existing, ...Object.fromEntries(updateColumns.map((column, index) => [column, values[index]])) }
    validateRow(table, row, id)
    table.set(id, row)
    return true
  }
  if (sql === 'update media_artifacts set provenance_json = ?, version = version + 1, updated_at = ? where workspace_id = ? and id = ?') {
    checkedValues(values, 4)
    const [provenance, updatedAt, workspaceId, id] = values
    const row = table.get(String(id))
    if (row?.workspace_id === workspaceId) {
      const updated = { ...row, provenance_json: provenance, version: Number(row.version) + 1, updated_at: updatedAt }
      validateRow(table, updated, String(id))
      table.set(String(id), updated)
    }
    return true
  }
  if (sql === 'delete from media_artifacts where workspace_id = ? and id = ?') {
    checkedValues(values, 2)
    const [workspaceId, id] = values
    if (table.get(String(id))?.workspace_id === workspaceId) table.delete(String(id))
    return true
  }
  throw new Error(`Unsupported media_artifacts mutation: ${sql}`)
}

export const readFakeMediaArtifacts = (table: MediaTable, sql: string, values: unknown[]): MediaRow[] | undefined => {
  if (!/\bmedia_artifacts\b/.test(sql)) return undefined
  if (sql === 'select version from media_artifacts where id = ? and workspace_id = ?'
    || sql === 'select * from media_artifacts where id = ? and workspace_id = ? limit 1') {
    checkedValues(values, 2)
    const row = table.get(String(values[0]))
    return row?.workspace_id === values[1] ? [sql.startsWith('select version ') ? { version: row.version } : { ...row }] : []
  }
  checkedValues(values, 2)
  const rows = Array.from(table.values()).filter(row => row.workspace_id === values[0])
  if (sql === 'select * from media_artifacts where workspace_id = ? and run_id = ? order by created_at asc') {
    return rows.filter(row => row.run_id === values[1])
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map(row => ({ ...row }))
  }
  if (sql === 'select * from media_artifacts where workspace_id = ? order by updated_at desc limit ?') {
    return rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .slice(0, Number(values[1])).map(row => ({ ...row }))
  }
  if (sql === 'select * from media_artifacts where workspace_id = ? and content_hash = ? limit 1') {
    const row = rows.find(candidate => candidate.content_hash === values[1])
    return row ? [{ ...row }] : []
  }
  throw new Error(`Unsupported media_artifacts query: ${sql}`)
}
