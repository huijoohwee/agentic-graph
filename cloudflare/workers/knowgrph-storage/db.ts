import { and, asc, eq, gt, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type {
  KgDocumentChunkRecord,
  KgDocumentRecord,
  KgGraphSnapshotRecord,
} from './contract'
import {
  execute,
  isoFromMs,
  normalizeNullableString,
  normalizeNumber,
  normalizeString,
  queryAll,
  queryFirst,
  readDb,
} from '../shared/d1'
import type {
  D1AllResult,
  D1DatabaseLike,
  D1RunResult,
  D1StatementLike,
} from '../shared/d1'

export {
  execute,
  isoFromMs,
  normalizeNullableString,
  normalizeNumber,
  normalizeString,
  queryAll,
  queryFirst,
  readDb,
}
export type {
  D1AllResult,
  D1DatabaseLike,
  D1RunResult,
  D1StatementLike,
}

const workspacesTable = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  visibility: text('visibility').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

const documentsTable = sqliteTable('documents', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull(),
  canonical_path: text('canonical_path').notNull(),
  title: text('title'),
  doc_type: text('doc_type'),
  lang: text('lang'),
  graph_id: text('graph_id'),
  source_kind: text('source_kind').notNull(),
  content_md: text('content_md').notNull(),
  content_hash: text('content_hash').notNull(),
  parser_version: text('parser_version').notNull(),
  revision: integer('revision').notNull(),
  deleted: integer('deleted').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

const documentChunksTable = sqliteTable('document_chunks', {
  id: text('id').primaryKey(),
  document_id: text('document_id').notNull(),
  workspace_id: text('workspace_id').notNull(),
  chunk_key: text('chunk_key').notNull(),
  chunk_order: integer('chunk_order').notNull(),
  heading: text('heading'),
  markdown: text('markdown').notNull(),
  token_estimate: integer('token_estimate').notNull(),
  content_hash: text('content_hash').notNull(),
  updated_at: text('updated_at').notNull(),
})

const graphSnapshotsTable = sqliteTable('graph_snapshots', {
  id: text('id').primaryKey(),
  document_id: text('document_id').notNull(),
  workspace_id: text('workspace_id').notNull(),
  graph_revision: integer('graph_revision').notNull(),
  graph_hash: text('graph_hash').notNull(),
  graph_json: text('graph_json').notNull(),
  layout_json: text('layout_json'),
  derived_from_document_revision: integer('derived_from_document_revision').notNull(),
  updated_at: text('updated_at').notNull(),
})

const syncDevicesTable = sqliteTable('sync_devices', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull(),
  device_label: text('device_label'),
  last_pull_cursor: text('last_pull_cursor'),
  last_push_cursor: text('last_push_cursor'),
  updated_at: text('updated_at').notNull(),
})

const syncEventsTable = sqliteTable('sync_events', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull(),
  device_id: text('device_id').notNull(),
  event_type: text('event_type').notNull(),
  payload_json: text('payload_json').notNull(),
  created_at: text('created_at').notNull(),
})

const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  display_name: text('display_name').notNull(),
  status: text('status').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

const authSessionsTable = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  session_hash: text('session_hash').notNull(),
  expires_at: text('expires_at').notNull(),
  revoked_at: text('revoked_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

const authIdentitiesTable = sqliteTable('auth_identities', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  provider: text('provider').notNull(),
  issuer: text('issuer').notNull(),
  subject: text('subject').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

const workspaceMembershipsTable = sqliteTable('workspace_memberships', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull(),
  user_id: text('user_id').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull(),
  invited_by_user_id: text('invited_by_user_id'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

const workspaceProviderPoliciesTable = sqliteTable('workspace_provider_policies', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull(),
  provider_id: text('provider_id').notNull(),
  allow_server_managed: integer('allow_server_managed').notNull(),
  allow_byok: integer('allow_byok').notNull(),
  monthly_request_limit: integer('monthly_request_limit'),
  monthly_token_limit: integer('monthly_token_limit'),
  monthly_spend_limit_cents: integer('monthly_spend_limit_cents'),
  default_model: text('default_model'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

const chatProxyAuditTable = sqliteTable('chat_proxy_audit', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull(),
  user_id: text('user_id').notNull(),
  membership_id: text('membership_id').notNull(),
  provider_id: text('provider_id').notNull(),
  auth_mode: text('auth_mode').notNull(),
  request_id: text('request_id'),
  upstream_status: integer('upstream_status'),
  relay_status: text('relay_status').notNull(),
  model_id: text('model_id'),
  request_bytes: integer('request_bytes'),
  response_bytes: integer('response_bytes'),
  latency_ms: integer('latency_ms'),
  error_code: text('error_code'),
  error_message: text('error_message'),
  created_at: text('created_at').notNull(),
})

const createKnowgrphStorageDrizzleDb = (db: D1DatabaseLike) => drizzle(db as never, {
  schema: {
    workspacesTable,
    documentsTable,
    documentChunksTable,
    graphSnapshotsTable,
    syncDevicesTable,
    syncEventsTable,
      usersTable,
      authSessionsTable,
      authIdentitiesTable,
      workspaceMembershipsTable,
      workspaceProviderPoliciesTable,
      chatProxyAuditTable,
  },
})

export type DocumentRow = {
  id: string
  workspace_id: string
  canonical_path: string
  title: string | null
  doc_type: string | null
  lang: string | null
  graph_id: string | null
  source_kind: string
  content_md: string
  content_hash: string
  parser_version: string
  revision: number
  deleted: number
  updated_at: string
}

export type DocumentChunkRow = {
  id: string
  document_id: string
  workspace_id: string
  chunk_key: string
  chunk_order: number
  heading: string | null
  markdown: string
  token_estimate: number
  content_hash: string
  updated_at: string
}

export type GraphSnapshotRow = {
  id: string
  document_id: string
  workspace_id: string
  graph_revision: number
  graph_hash: string
  graph_json: string
  layout_json: string | null
  derived_from_document_revision: number
  updated_at: string
}

export type CrawlerDocumentRow = {
  id: string
  canonical_path: string
  title: string | null
  doc_type: string | null
  content_hash: string
  revision: number
  updated_at: string
  content_length: number
}

export type UserRow = {
  id: string
  email: string
  display_name: string
  status: string
  created_at: string
  updated_at: string
}

export type AuthSessionRow = {
  id: string
  user_id: string
  session_hash: string
  expires_at: string
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export type AuthIdentityRow = {
  id: string
  user_id: string
  provider: string
  issuer: string
  subject: string
  created_at: string
  updated_at: string
}

export type AuthIdentityUserRow = AuthIdentityRow & {
  user_email: string
  user_display_name: string
  user_status: string
}

export type WorkspaceMembershipRow = {
  id: string
  workspace_id: string
  user_id: string
  role: string
  status: string
  invited_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type WorkspaceProviderPolicyRow = {
  id: string
  workspace_id: string
  provider_id: string
  allow_server_managed: number
  allow_byok: number
  monthly_request_limit: number | null
  monthly_token_limit: number | null
  monthly_spend_limit_cents: number | null
  default_model: string | null
  created_at: string
  updated_at: string
}

export type ChatProxyAuditRow = {
  id: string
  workspace_id: string
  user_id: string
  membership_id: string
  provider_id: string
  auth_mode: string
  request_id: string | null
  upstream_status: number | null
  relay_status: string
  model_id: string | null
  request_bytes: number | null
  response_bytes: number | null
  latency_ms: number | null
  error_code: string | null
  error_message: string | null
  created_at: string
}

export const ensureWorkspaceRow = async (db: D1DatabaseLike, workspaceId: string, nowIso: string): Promise<void> => {
  await createKnowgrphStorageDrizzleDb(db)
    .insert(workspacesTable)
    .values({
      id: workspaceId,
      slug: workspaceId,
      title: workspaceId,
      visibility: 'private',
      created_at: nowIso,
      updated_at: nowIso,
    })
    .onConflictDoNothing()
}

export const ensureSyncDeviceRow = async (
  db: D1DatabaseLike,
  workspaceId: string,
  deviceId: string,
  nowIso: string,
): Promise<void> => {
  await createKnowgrphStorageDrizzleDb(db)
    .insert(syncDevicesTable)
    .values({
      id: deviceId,
      workspace_id: workspaceId,
      device_label: deviceId,
      last_pull_cursor: null,
      last_push_cursor: null,
      updated_at: nowIso,
    })
    .onConflictDoNothing()
}

const SYNC_EVENT_RETENTION_HOURS = 24

export const pruneStaleSyncEvents = async (db: D1DatabaseLike, nowIso: string): Promise<void> => {
  const cutoff = new Date(Date.parse(nowIso) - SYNC_EVENT_RETENTION_HOURS * 3600_000).toISOString()
  await createKnowgrphStorageDrizzleDb(db)
    .delete(syncEventsTable)
    .where(lt(syncEventsTable.created_at, cutoff))
}

export const writeSyncEvent = async (
  db: D1DatabaseLike,
  args: { workspaceId: string; deviceId: string; eventType: string; payload: Record<string, unknown>; nowIso: string },
): Promise<void> => {
  const eventId = `${args.eventType}:${Date.now()}:${Math.random().toString(16).slice(2)}`
  await createKnowgrphStorageDrizzleDb(db)
    .insert(syncEventsTable)
    .values({
      id: eventId,
      workspace_id: args.workspaceId,
      device_id: args.deviceId,
      event_type: args.eventType,
      payload_json: JSON.stringify(args.payload),
      created_at: args.nowIso,
    })
}

export const readActiveAuthSessionByHash = async (
  db: D1DatabaseLike,
  sessionHash: string,
  nowIso: string,
): Promise<(AuthSessionRow & { user_email: string; user_display_name: string; user_status: string }) | null> =>
  await queryFirst<AuthSessionRow & { user_email: string; user_display_name: string; user_status: string }>(
    db,
    `select
      auth_sessions.id,
      auth_sessions.user_id,
      auth_sessions.session_hash,
      auth_sessions.expires_at,
      auth_sessions.revoked_at,
      auth_sessions.created_at,
      auth_sessions.updated_at,
      users.email as user_email,
      users.display_name as user_display_name,
      users.status as user_status
    from auth_sessions
    join users on users.id = auth_sessions.user_id
    where auth_sessions.session_hash = ?
      and auth_sessions.revoked_at is null
      and auth_sessions.expires_at > ?
    limit 1`,
    [sessionHash, nowIso],
  )

/**
 * Browser Access identities are provisioned out of band. Authentication can
 * create a short-lived session, but it must never create a user or grant a
 * workspace membership merely because an Access JWT is valid.
 */
export const readAuthIdentityUser = async (
  db: D1DatabaseLike,
  args: { provider: string; issuer: string; subject: string },
): Promise<AuthIdentityUserRow | null> =>
  await queryFirst<AuthIdentityUserRow>(
    db,
    `select
      auth_identities.id,
      auth_identities.user_id,
      auth_identities.provider,
      auth_identities.issuer,
      auth_identities.subject,
      auth_identities.created_at,
      auth_identities.updated_at,
      users.email as user_email,
      users.display_name as user_display_name,
      users.status as user_status
    from auth_identities
    join users on users.id = auth_identities.user_id
    where auth_identities.provider = ?
      and auth_identities.issuer = ?
      and auth_identities.subject = ?
    limit 1`,
    [args.provider, args.issuer, args.subject],
  )

export const writeAuthSession = async (
  db: D1DatabaseLike,
  args: {
    id: string
    userId: string
    sessionHash: string
    expiresAt: string
    nowIso: string
  },
): Promise<void> => {
  await execute(
    db,
    `insert into auth_sessions (
      id, user_id, session_hash, expires_at, revoked_at, created_at, updated_at
    ) values (?, ?, ?, ?, null, ?, ?)`,
    [
      args.id,
      args.userId,
      args.sessionHash,
      args.expiresAt,
      args.nowIso,
      args.nowIso,
    ],
  )
}

export const revokeAuthSessionByHash = async (
  db: D1DatabaseLike,
  args: { sessionHash: string; nowIso: string },
): Promise<void> => {
  await execute(
    db,
    `update auth_sessions
    set revoked_at = ?, updated_at = ?
    where session_hash = ? and revoked_at is null`,
    [args.nowIso, args.nowIso, args.sessionHash],
  )
}

export const readWorkspaceMembershipRow = async (
  db: D1DatabaseLike,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMembershipRow | null> =>
  await queryFirst<WorkspaceMembershipRow>(
    db,
    `select
      id,
      workspace_id,
      user_id,
      role,
      status,
      invited_by_user_id,
      created_at,
      updated_at
    from workspace_memberships
    where workspace_id = ?
      and user_id = ?
      and status = 'active'
    limit 1`,
    [workspaceId, userId],
  )

export const readWorkspaceMembershipRowsByUser = async (
  db: D1DatabaseLike,
  userId: string,
): Promise<WorkspaceMembershipRow[]> =>
  await queryAll<WorkspaceMembershipRow>(
    db,
    `select
      id,
      workspace_id,
      user_id,
      role,
      status,
      invited_by_user_id,
      created_at,
      updated_at
    from workspace_memberships
    where user_id = ?
    order by workspace_id asc`,
    [userId],
  )

export const readWorkspaceProviderPolicyRow = async (
  db: D1DatabaseLike,
  workspaceId: string,
  providerId: string,
): Promise<WorkspaceProviderPolicyRow | null> =>
  await queryFirst<WorkspaceProviderPolicyRow>(
    db,
    `select
      id,
      workspace_id,
      provider_id,
      allow_server_managed,
      allow_byok,
      monthly_request_limit,
      monthly_token_limit,
      monthly_spend_limit_cents,
      default_model,
      created_at,
      updated_at
    from workspace_provider_policies
    where workspace_id = ?
      and provider_id = ?
    limit 1`,
    [workspaceId, providerId],
  )

export const readWorkspaceProviderPolicyRows = async (
  db: D1DatabaseLike,
  workspaceId: string,
): Promise<WorkspaceProviderPolicyRow[]> =>
  await queryAll<WorkspaceProviderPolicyRow>(
    db,
    `select
      id,
      workspace_id,
      provider_id,
      allow_server_managed,
      allow_byok,
      monthly_request_limit,
      monthly_token_limit,
      monthly_spend_limit_cents,
      default_model,
      created_at,
      updated_at
    from workspace_provider_policies
    where workspace_id = ?
    order by provider_id asc`,
    [workspaceId],
  )

export const writeChatProxyAuditRow = async (
  db: D1DatabaseLike,
  args: {
    id: string
    workspaceId: string
    userId: string
    membershipId: string
    providerId: string
    authMode: string
    requestId?: string | null
    upstreamStatus?: number | null
    relayStatus: string
    modelId?: string | null
    requestBytes?: number | null
    responseBytes?: number | null
    latencyMs?: number | null
    errorCode?: string | null
    errorMessage?: string | null
    createdAt: string
  },
): Promise<void> => {
  await createKnowgrphStorageDrizzleDb(db)
    .insert(chatProxyAuditTable)
    .values({
      id: args.id,
      workspace_id: args.workspaceId,
      user_id: args.userId,
      membership_id: args.membershipId,
      provider_id: args.providerId,
      auth_mode: args.authMode,
      request_id: normalizeNullableString(args.requestId),
      upstream_status: args.upstreamStatus == null ? null : normalizeNumber(args.upstreamStatus),
      relay_status: args.relayStatus,
      model_id: normalizeNullableString(args.modelId),
      request_bytes: args.requestBytes == null ? null : normalizeNumber(args.requestBytes),
      response_bytes: args.responseBytes == null ? null : normalizeNumber(args.responseBytes),
      latency_ms: args.latencyMs == null ? null : normalizeNumber(args.latencyMs),
      error_code: normalizeNullableString(args.errorCode),
      error_message: normalizeNullableString(args.errorMessage),
      created_at: args.createdAt,
    })
}

export const readChatProxyAuditRows = async (
  db: D1DatabaseLike,
  workspaceId: string,
  limit: number,
): Promise<ChatProxyAuditRow[]> =>
  await queryAll<ChatProxyAuditRow>(
    db,
    `select
      id,
      workspace_id,
      user_id,
      membership_id,
      provider_id,
      auth_mode,
      request_id,
      upstream_status,
      relay_status,
      model_id,
      request_bytes,
      response_bytes,
      latency_ms,
      error_code,
      error_message,
      created_at
    from chat_proxy_audit
    where workspace_id = ?
    order by created_at desc
    limit ?`,
    [workspaceId, Math.max(1, Math.min(200, Math.floor(limit || 50)))],
  )

export const readPullChangeRows = async (
  db: D1DatabaseLike,
  workspaceId: string,
  since: string | null,
): Promise<{
  documents: DocumentRow[]
  documentChunks: DocumentChunkRow[]
  graphSnapshots: GraphSnapshotRow[]
}> => {
  const repo = createKnowgrphStorageDrizzleDb(db)
  const sinceValue = normalizeNullableString(since)
  const documentPredicate = sinceValue
    ? and(eq(documentsTable.workspace_id, workspaceId), gt(documentsTable.updated_at, sinceValue))
    : eq(documentsTable.workspace_id, workspaceId)
  const chunkPredicate = sinceValue
    ? and(eq(documentChunksTable.workspace_id, workspaceId), gt(documentChunksTable.updated_at, sinceValue))
    : eq(documentChunksTable.workspace_id, workspaceId)
  const graphPredicate = sinceValue
    ? and(eq(graphSnapshotsTable.workspace_id, workspaceId), gt(graphSnapshotsTable.updated_at, sinceValue))
    : eq(graphSnapshotsTable.workspace_id, workspaceId)

  const [documents, documentChunks, graphSnapshots] = await Promise.all([
    repo.select().from(documentsTable).where(documentPredicate).orderBy(asc(documentsTable.updated_at)).all(),
    repo.select().from(documentChunksTable).where(chunkPredicate).orderBy(asc(documentChunksTable.updated_at)).all(),
    repo.select().from(graphSnapshotsTable).where(graphPredicate).orderBy(asc(graphSnapshotsTable.updated_at)).all(),
  ])

  return {
    documents: documents as DocumentRow[],
    documentChunks: documentChunks as DocumentChunkRow[],
    graphSnapshots: graphSnapshots as GraphSnapshotRow[],
  }
}

export const mapDocumentRow = (row: DocumentRow): KgDocumentRecord => ({
  id: normalizeString(row.id),
  workspaceId: normalizeString(row.workspace_id),
  canonicalPath: normalizeString(row.canonical_path),
  title: normalizeNullableString(row.title),
  docType: normalizeNullableString(row.doc_type),
  lang: normalizeNullableString(row.lang),
  graphId: normalizeNullableString(row.graph_id),
  sourceKind: 'markdown',
  contentMd: typeof row.content_md === 'string' ? row.content_md : '',
  contentHash: normalizeString(row.content_hash),
  parserVersion: normalizeString(row.parser_version),
  revision: normalizeNumber(row.revision),
  updatedAtMs: Date.parse(normalizeString(row.updated_at)) || 0,
  deleted: Number(row.deleted || 0) === 1,
})

export const mapDocumentChunkRow = (row: DocumentChunkRow): KgDocumentChunkRecord => ({
  id: normalizeString(row.id),
  documentId: normalizeString(row.document_id),
  workspaceId: normalizeString(row.workspace_id),
  chunkKey: normalizeString(row.chunk_key),
  chunkOrder: normalizeNumber(row.chunk_order),
  heading: normalizeNullableString(row.heading),
  markdown: typeof row.markdown === 'string' ? row.markdown : '',
  tokenEstimate: normalizeNumber(row.token_estimate),
  contentHash: normalizeString(row.content_hash),
  updatedAtMs: Date.parse(normalizeString(row.updated_at)) || 0,
})

export const safeJsonParseObject = (text: unknown): Record<string, unknown> | null => {
  if (typeof text !== 'string' || !text.trim()) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const mapGraphSnapshotRow = (row: GraphSnapshotRow): KgGraphSnapshotRecord => ({
  id: normalizeString(row.id),
  documentId: normalizeString(row.document_id),
  workspaceId: normalizeString(row.workspace_id),
  graphRevision: normalizeNumber(row.graph_revision),
  graphHash: normalizeString(row.graph_hash),
  graphJson: safeJsonParseObject(row.graph_json) || {},
  layoutJson: safeJsonParseObject(row.layout_json),
  derivedFromDocumentRevision: normalizeNumber(row.derived_from_document_revision),
  updatedAtMs: Date.parse(normalizeString(row.updated_at)) || 0,
})
