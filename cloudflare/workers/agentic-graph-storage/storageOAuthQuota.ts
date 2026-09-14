import { queryFirst, execute, type D1DatabaseLike } from './db'
import { oauthHash } from './storageOAuthState'

// Conservative application budgets, not the provider's account-wide limits.
// Fixed bucket keys bound cardinality even when the client address is varied.
export const OAUTH_DAILY_REQUESTS = 500
export const OAUTH_MINUTE_REQUESTS = 20
const increment = async (db: D1DatabaseLike, key: string, window: number, limit: number): Promise<boolean> =>
  !!await queryFirst(db, `INSERT INTO storage_oauth_budget (bucket, window, used) VALUES (?, ?, 1)
    ON CONFLICT(bucket) DO UPDATE SET window = excluded.window,
      used = CASE WHEN storage_oauth_budget.window = excluded.window THEN storage_oauth_budget.used + 1 ELSE 1 END
    WHERE storage_oauth_budget.window < excluded.window OR
      (storage_oauth_budget.window = excluded.window AND storage_oauth_budget.used < ?)
    RETURNING used`, [key, window, limit])
export const admitOAuthRequest = async (db: D1DatabaseLike, request: Request, secret: string, now: number): Promise<boolean> => {
  if (!await increment(db, 'global', Math.floor(now / 86400000), OAUTH_DAILY_REQUESTS)) return false
  // A keyed hash avoids storing addresses; collisions only make the budget stricter.
  const digest = await oauthHash(`${secret}:${request.headers.get('cf-connecting-ip') || 'unknown'}`)
  return increment(db, `client:${digest.slice(0, 1)}`, Math.floor(now / 60000), OAUTH_MINUTE_REQUESTS)
}
export const saveOAuthChallenge = async (db: D1DatabaseLike, state: string, now: number): Promise<void> => {
  await execute(db, 'DELETE FROM storage_oauth_challenges WHERE expires_at <= ?', [now])
  await execute(db, 'INSERT INTO storage_oauth_challenges (state_hash, expires_at) VALUES (?, ?)',
    [await oauthHash(state), now + 300000])
}
export const consumeOAuthChallenge = async (db: D1DatabaseLike, state: string, now: number): Promise<boolean> =>
  !!await queryFirst(db, 'DELETE FROM storage_oauth_challenges WHERE state_hash = ? AND expires_at > ? RETURNING state_hash',
    [await oauthHash(state), now])
