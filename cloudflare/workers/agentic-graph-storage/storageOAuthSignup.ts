/** Explicit personal-workspace registration; shared workspace grants remain independent. */
import { readAuthIdentityUser, queryFirst, type D1DatabaseLike } from './db'
import { OAUTH_ISSUERS, OAuthFailure } from './storageOAuthProviders'
import { oauthHash, type OAuthProvider } from './storageOAuthState'

export const OAUTH_SIGNUP_ACCOUNT_LIMIT = 100
export const registerOAuthPersonalWorkspace = async (args: {
  db: D1DatabaseLike; provider: OAuthProvider; subject: string; now: number
}): Promise<string> => {
  const { db, provider, subject, now } = args
  if (!db.batch) throw new OAuthFailure(503, 'Account creation is unavailable. Your local files remain available.')
  const issuer = OAUTH_ISSUERS[provider]
  const identityKey = { provider, issuer, subject }
  const existing = await readAuthIdentityUser(db, identityKey)
  if (existing) {
    if (existing.user_status !== 'active') throw new OAuthFailure(403, 'This account is unavailable.')
    return existing.user_id
  }
  // A lifetime reservation cannot reset at a time-window boundary. Failed attempts consume
  // capacity conservatively; no automatic upgrade, overflow or retry can enlarge this bound.
  const admitted = await queryFirst(db, `INSERT INTO storage_oauth_budget (bucket, window, used)
    VALUES ('signup-total', 0, 1) ON CONFLICT(bucket) DO UPDATE SET used = used + 1
    WHERE window = 0 AND used < ? RETURNING used`, [OAUTH_SIGNUP_ACCOUNT_LIMIT])
  if (!admitted) throw new OAuthFailure(429, 'Free account capacity is full. Existing accounts and local files remain available.')
  const digest = await oauthHash(JSON.stringify([provider, issuer, subject]))
  const userId = `oauth:${digest}`, workspaceId = `kgws:personal:${digest}`
  const stamp = new Date(now).toISOString()
  const statement = (sql: string, values: unknown[]) => db.prepare(sql).bind(...values)
  const results = await db.batch([
    statement(`INSERT INTO users (id, email, display_name, status, created_at, updated_at)
      SELECT ?, ?, 'Personal account', 'active', ?, ? WHERE NOT EXISTS (
        SELECT 1 FROM auth_identities WHERE provider = ? AND issuer = ? AND subject = ?)
      ON CONFLICT(id) DO NOTHING`,
    [userId, `${digest}@identity.invalid`, stamp, stamp, provider, issuer, subject]),
    statement(`INSERT INTO auth_identities (id, user_id, provider, issuer, subject, created_at, updated_at)
      SELECT ?, id, ?, ?, ?, ?, ? FROM users WHERE id = ? AND status = 'active'
      ON CONFLICT(provider, issuer, subject) DO NOTHING`,
    [`identity:${digest}`, provider, issuer, subject, stamp, stamp, userId]),
    statement(`INSERT INTO workspaces (id, slug, title, visibility, created_at, updated_at)
      SELECT ?, ?, 'My workspace', 'private', ?, ? FROM auth_identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = ? AND i.issuer = ? AND i.subject = ? AND i.user_id = ? AND u.status = 'active'
      ON CONFLICT(id) DO NOTHING`,
    [workspaceId, `personal-${digest}`, stamp, stamp, provider, issuer, subject, userId]),
    statement(`INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at, updated_at)
      SELECT ?, w.id, u.id, 'owner', 'active', ?, ? FROM workspaces w JOIN users u ON u.id = ?
      JOIN auth_identities i ON i.user_id = u.id
      WHERE w.id = ? AND w.visibility = 'private' AND u.status = 'active'
        AND i.provider = ? AND i.issuer = ? AND i.subject = ?
      ON CONFLICT(workspace_id, user_id) DO NOTHING`,
    [`membership:${digest}`, stamp, stamp, userId, workspaceId, provider, issuer, subject]),
  ])
  if (results.length !== 4 || results.some(result => result.success !== true))
    throw new OAuthFailure(503, 'Account creation could not be verified. Your local files remain available.')
  const identity = await readAuthIdentityUser(db, identityKey)
  if (identity?.user_id !== userId || identity.user_status !== 'active')
    throw new OAuthFailure(403, 'This account is unavailable.')
  return userId
}

