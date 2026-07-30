export type FakeRow = Record<string, unknown>

export type FakeKnowgrphStorageD1ReadState = {
  documents: Map<string, FakeRow>
  documentChunks: Map<string, FakeRow>
  graphSnapshots: Map<string, FakeRow>
  authSessions: Map<string, FakeRow>
  users: Map<string, FakeRow>
  workspaceMemberships: Map<string, FakeRow>
  workspaceProviderPolicies: Map<string, FakeRow>
  chatProxyAudit: Map<string, FakeRow>
  stripeCheckoutSessions: Map<string, FakeRow>
  stripeWebhookEvents: Map<string, FakeRow>
  agenticCommerceSessions: Map<string, FakeRow>
  agenticCommerceProofs: Map<string, FakeRow>
  agenticCommerceTraceEvents: Map<string, FakeRow>
}

const normalizeSql = (sql: string): string =>
  String(sql || '')
    .toLowerCase()
    .replace(/["`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const readSelectedColumns = (sql: string): string[] => {
  const normalizedSql = normalizeSql(sql)
  const selectPrefix = 'select '
  const fromIndex = normalizedSql.indexOf(' from ')
  if (!normalizedSql.startsWith(selectPrefix) || fromIndex <= selectPrefix.length) return []
  const selectClause = normalizedSql.slice(selectPrefix.length, fromIndex)
  if (selectClause.trim() === '*') return []
  return selectClause
    .split(',')
    .map(part => part.trim())
    .map(part => {
      const aliasMatch = /\s+as\s+([a-z0-9_]+)/.exec(part)
      if (aliasMatch?.[1]) return aliasMatch[1]
      const pieces = part.split('.')
      return pieces[pieces.length - 1] || part
    })
    .filter(Boolean)
}

const filterByWorkspaceAndSince = (
  source: Map<string, FakeRow>,
  values: unknown[],
): FakeRow[] => {
  const workspaceId = values[0]
  const since = typeof values[1] === 'string' ? values[1] : null
  return Array.from(source.values())
    .filter(row => row.workspace_id === workspaceId)
    .filter(row => (since ? String(row.updated_at || '') > since : true))
    .sort((left, right) => String(left.updated_at || '').localeCompare(String(right.updated_at || '')))
}

export const readFakeKnowgrphStorageRows = (
  state: FakeKnowgrphStorageD1ReadState,
  sql: string,
  values: unknown[],
): FakeRow[] => {
  const normalizedSql = normalizeSql(sql)
  if (normalizedSql.includes('from auth_sessions') && normalizedSql.includes('join users on users.id = auth_sessions.user_id')) {
    const [sessionHash, nowIso] = values
    const session = Array.from(state.authSessions.values()).find(row =>
      row.session_hash === sessionHash
      && (row.revoked_at == null || row.revoked_at === '')
      && String(row.expires_at || '') > String(nowIso || ''),
    )
    if (!session) return []
    const user = state.users.get(String(session.user_id || ''))
    if (!user) return []
    return [{
      id: session.id,
      user_id: session.user_id,
      session_hash: session.session_hash,
      expires_at: session.expires_at,
      revoked_at: session.revoked_at ?? null,
      created_at: session.created_at,
      updated_at: session.updated_at,
      user_email: user.email,
      user_display_name: user.display_name,
      user_status: user.status,
    }]
  }
  if (normalizedSql.includes('from workspace_memberships') && normalizedSql.includes('where workspace_id = ?') && normalizedSql.includes('and user_id = ?') && normalizedSql.includes("and status = 'active'")) {
    const [workspaceId, userId] = values
    return Array.from(state.workspaceMemberships.values())
      .filter(row => row.workspace_id === workspaceId && row.user_id === userId && row.status === 'active')
      .slice(0, 1)
  }
  if (normalizedSql.includes('from workspace_memberships') && normalizedSql.includes('where user_id = ?') && normalizedSql.includes('order by workspace_id asc')) {
    const [userId] = values
    return Array.from(state.workspaceMemberships.values())
      .filter(row => row.user_id === userId)
      .sort((left, right) => String(left.workspace_id || '').localeCompare(String(right.workspace_id || '')))
  }
  if (normalizedSql.includes('from workspace_provider_policies') && normalizedSql.includes('where workspace_id = ?') && normalizedSql.includes('and provider_id = ?')) {
    const [workspaceId, providerId] = values
    return Array.from(state.workspaceProviderPolicies.values())
      .filter(row => row.workspace_id === workspaceId && row.provider_id === providerId)
      .slice(0, 1)
  }
  if (normalizedSql.includes('from workspace_provider_policies') && normalizedSql.includes('where workspace_id = ?') && normalizedSql.includes('order by provider_id asc')) {
    const [workspaceId] = values
    return Array.from(state.workspaceProviderPolicies.values())
      .filter(row => row.workspace_id === workspaceId)
      .sort((left, right) => String(left.provider_id || '').localeCompare(String(right.provider_id || '')))
  }
  if (normalizedSql.includes('from chat_proxy_audit') && normalizedSql.includes('where workspace_id = ?') && normalizedSql.includes('order by created_at desc')) {
    const [workspaceId, limit] = values
    return Array.from(state.chatProxyAudit.values())
      .filter(row => row.workspace_id === workspaceId)
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
      .slice(0, Number(limit || 50))
  }
  if (
    normalizedSql.includes('select id, content_md from documents')
    && normalizedSql.includes('documents.workspace_id = ?')
    && normalizedSql.includes('documents.canonical_path = ?')
    && normalizedSql.includes('documents.deleted = ?')
  ) {
    const [workspaceId, canonicalPath, deleted] = values
    return Array.from(state.documents.values())
      .filter(row =>
        row.workspace_id === workspaceId
        && row.canonical_path === canonicalPath
        && Number(row.deleted || 0) === Number(deleted || 0))
      .slice(0, 1)
      .map(row => ({ id: row.id, content_md: row.content_md }))
  }
  if (normalizedSql.includes('select id, content_md from documents where workspace_id = ? and canonical_path = ? and deleted = 0')) {
    const [workspaceId, canonicalPath] = values
    return Array.from(state.documents.values())
      .filter(row =>
        row.workspace_id === workspaceId
        && row.canonical_path === canonicalPath
        && Number(row.deleted || 0) === 0)
      .slice(0, 1)
      .map(row => ({ id: row.id, content_md: row.content_md }))
  }
  if (normalizedSql.includes('select id, chunk_order, markdown from document_chunks')) {
    const [workspaceId, documentId] = values
    return Array.from(state.documentChunks.values())
      .filter(row => row.workspace_id === workspaceId && row.document_id === documentId)
      .sort((left, right) => {
        const orderDelta = Number(left.chunk_order || 0) - Number(right.chunk_order || 0)
        return orderDelta || String(left.id || '').localeCompare(String(right.id || ''))
      })
      .map(row => ({ id: row.id, chunk_order: row.chunk_order, markdown: row.markdown }))
  }
  if (normalizedSql.includes('select id, canonical_path, title, doc_type, content_hash, revision, updated_at') && normalizedSql.includes('from documents')) {
    const [workspaceId] = values
    return Array.from(state.documents.values())
      .filter(row =>
        row.workspace_id === workspaceId
        && Number(row.deleted || 0) === 0
        && String(row.content_md || '').length > 0)
      .sort((left, right) => {
        const pathDelta = String(left.canonical_path || '').localeCompare(String(right.canonical_path || ''))
        return pathDelta || String(left.id || '').localeCompare(String(right.id || ''))
      })
      .map(row => ({
        id: row.id,
        canonical_path: row.canonical_path,
        title: row.title,
        doc_type: row.doc_type,
        content_hash: row.content_hash,
        revision: row.revision,
        updated_at: row.updated_at,
        content_length: String(row.content_md || '').length,
      }))
  }
  if (normalizedSql.includes('select id, revision, content_hash, deleted from documents where id = ? and workspace_id = ?')) {
    const [id, workspaceId] = values
    const row = state.documents.get(String(id))
    return row?.workspace_id === workspaceId
      ? [{ id: row.id, revision: row.revision, content_hash: row.content_hash, deleted: row.deleted }]
      : []
  }
  if (normalizedSql.includes('select id, revision, content_hash, deleted from documents where workspace_id = ? and canonical_path = ?')) {
    const [workspaceId, canonicalPath] = values
    const row = Array.from(state.documents.values()).find(
      candidate => candidate.workspace_id === workspaceId && candidate.canonical_path === canonicalPath,
    )
    return row
      ? [{ id: row.id, revision: row.revision, content_hash: row.content_hash, deleted: row.deleted }]
      : []
  }
  if (normalizedSql.includes('select revision from documents')) {
    const [id, workspaceId] = values
    const row = state.documents.get(String(id))
    return row?.workspace_id === workspaceId ? [{ revision: row.revision }] : []
  }
  if (normalizedSql.includes('select max(graph_revision) as graph_revision from graph_snapshots')) {
    const [documentId, workspaceId] = values
    const rows = Array.from(state.graphSnapshots.values()).filter(
      row => row.document_id === documentId && row.workspace_id === workspaceId,
    )
    const max = rows.reduce((current, row) => Math.max(current, Number(row.graph_revision || 0)), 0)
    return rows.length > 0 ? [{ graph_revision: max }] : []
  }
  if (normalizedSql.includes('select id') && normalizedSql.includes('from stripe_webhook_events where id = ?')) {
    const row = state.stripeWebhookEvents.get(String(values[0]))
    if (!row) return []
    const columns = readSelectedColumns(sql)
    return columns.length === 0
      ? [row]
      : [Object.fromEntries(columns.map(column => [column, row[column]]))]
  }
  if (normalizedSql.includes('select * from stripe_checkout_sessions where id = ?')) {
    const row = state.stripeCheckoutSessions.get(String(values[0]))
    return row ? [row] : []
  }
  if (normalizedSql.includes('select * from agentic_commerce_sessions where id = ?')) {
    const row = state.agenticCommerceSessions.get(String(values[0]))
    return row ? [row] : []
  }
  if (normalizedSql.includes('select * from agentic_commerce_sessions where seller_id = ? and idempotency_key = ?')) {
    const [sellerId, idempotencyKey] = values
    return Array.from(state.agenticCommerceSessions.values())
      .filter(row => row.seller_id === sellerId && row.idempotency_key === idempotencyKey)
      .slice(0, 1)
  }
  if (normalizedSql.includes('select * from agentic_commerce_proofs where session_id = ?')) {
    const [sessionId] = values
    return Array.from(state.agenticCommerceProofs.values())
      .filter(row => row.session_id === sessionId)
      .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')))
      .slice(0, 1)
  }
  if (normalizedSql.includes('select * from agentic_commerce_proofs order by created_at, id')) {
    return Array.from(state.agenticCommerceProofs.values()).sort((left, right) => {
      const timeDelta = String(left.created_at || '').localeCompare(String(right.created_at || ''))
      return timeDelta || String(left.id || '').localeCompare(String(right.id || ''))
    })
  }
  if (normalizedSql.includes('select * from agentic_commerce_trace_events where session_id = ?')) {
    const [sessionId] = values
    return Array.from(state.agenticCommerceTraceEvents.values())
      .filter(row => row.session_id === sessionId)
      .sort((left, right) => {
        const timeDelta = String(left.created_at || '').localeCompare(String(right.created_at || ''))
        return timeDelta || String(left.id || '').localeCompare(String(right.id || ''))
      })
  }
  if (normalizedSql.includes('select * from agentic_commerce_trace_events order by created_at, id')) {
    return Array.from(state.agenticCommerceTraceEvents.values()).sort((left, right) => {
      const timeDelta = String(left.created_at || '').localeCompare(String(right.created_at || ''))
      return timeDelta || String(left.id || '').localeCompare(String(right.id || ''))
    })
  }
  if (normalizedSql.includes('from documents where documents.workspace_id = ?')) {
    return filterByWorkspaceAndSince(state.documents, values)
  }
  if (normalizedSql.includes('select * from documents where id = ? and workspace_id = ?')) {
    const [id, workspaceId] = values
    const row = state.documents.get(String(id))
    return row?.workspace_id === workspaceId ? [row] : []
  }
  if (normalizedSql.includes('select * from documents where workspace_id = ? and canonical_path = ?')) {
    const [workspaceId, canonicalPath] = values
    const row = Array.from(state.documents.values()).find(
      candidate => candidate.workspace_id === workspaceId && candidate.canonical_path === canonicalPath,
    )
    return row ? [row] : []
  }
  if (normalizedSql.includes('select * from documents')) {
    return filterByWorkspaceAndSince(state.documents, values)
  }
  if (normalizedSql.includes('from document_chunks where document_chunks.workspace_id = ?')) {
    return filterByWorkspaceAndSince(state.documentChunks, values)
  }
  if (normalizedSql.includes('select * from document_chunks where id = ? and workspace_id = ?')) {
    const [id, workspaceId] = values
    const row = state.documentChunks.get(String(id))
    return row?.workspace_id === workspaceId ? [row] : []
  }
  if (normalizedSql.includes('select * from document_chunks where document_id = ? and chunk_key = ?')) {
    const [documentId, chunkKey] = values
    const row = Array.from(state.documentChunks.values()).find(
      candidate => candidate.document_id === documentId && candidate.chunk_key === chunkKey,
    )
    return row ? [row] : []
  }
  if (normalizedSql.includes('select * from document_chunks')) {
    return filterByWorkspaceAndSince(state.documentChunks, values)
  }
  if (normalizedSql.includes('from graph_snapshots where graph_snapshots.workspace_id = ?')) {
    return filterByWorkspaceAndSince(state.graphSnapshots, values)
  }
  if (normalizedSql.includes('select * from graph_snapshots where id = ? and workspace_id = ?')) {
    const [id, workspaceId] = values
    const row = state.graphSnapshots.get(String(id))
    return row?.workspace_id === workspaceId ? [row] : []
  }
  if (normalizedSql.includes('select * from graph_snapshots')) {
    return filterByWorkspaceAndSince(state.graphSnapshots, values)
  }
  return []
}

export const readFakeKnowgrphStorageRawRows = (
  state: FakeKnowgrphStorageD1ReadState,
  sql: string,
  values: unknown[],
): unknown[][] => {
  const rows = readFakeKnowgrphStorageRows(state, sql, values)
  const columns = readSelectedColumns(sql)
  if (columns.length === 0) return rows.map(row => Object.values(row))
  return rows.map(row => columns.map(column => row[column]))
}
