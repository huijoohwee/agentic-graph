import type { D1DatabaseLike } from '../shared/d1'

export const PAID_RESOURCE_REJECTION_LIMIT = 8

export const recordPaidResourceRejection = async (
  db: D1DatabaseLike,
  args: {
    id: string
    expectedRevision: number
    fromState: 'settling' | 'settlement_unknown'
    now: string
    claimToken?: string
  },
): Promise<void> => {
  const claimClause = args.claimToken ? 'AND claim_token = ?' : ''
  await db.prepare(
    `INSERT OR IGNORE INTO agentic_commerce_paid_resource_rejections (
       paid_resource_id, network, transaction_hash, expires_at, created_at
     ) SELECT id, network, transaction_hash, expires_at, ?
       FROM agentic_commerce_paid_resources
      WHERE id = ? AND revision = ? AND state = ? ${claimClause}
        AND transaction_hash IS NOT NULL`,
  ).bind(
    args.now,
    args.id,
    args.expectedRevision,
    args.fromState,
    ...(args.claimToken ? [args.claimToken] : []),
  ).run()
}

export const prunePaidResourceRejections = async (
  db: D1DatabaseLike,
  now: string,
): Promise<void> => {
  await db.prepare(
    `DELETE FROM agentic_commerce_paid_resource_rejections
      WHERE rowid IN (SELECT rowid FROM agentic_commerce_paid_resource_rejections
        WHERE expires_at <= ? ORDER BY expires_at LIMIT 64)`,
  ).bind(now).run()
}
