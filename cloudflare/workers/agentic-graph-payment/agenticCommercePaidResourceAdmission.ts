import { sha256AgenticCommercePaidResourceHex } from '../../../grph-shared/src/payments/agenticCommercePaidResourceSsot'
import type { D1DatabaseLike } from '../shared/d1'
import {
  admitPaidResourceChallenge,
  prunePaidResourceRetention,
} from './agenticCommercePaidResourcePersistence'

const ADMISSION_WINDOW_MS = 60_000
const ADMISSION_WINDOW_LIMIT = 10
const EXPIRED_EVIDENCE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000

export const PAID_RESOURCE_ADMISSION_RETRY_SECONDS = ADMISSION_WINDOW_MS / 1_000

export const admitPaidResourceRequest = async (
  request: Request,
  db: D1DatabaseLike,
  now: Date,
): Promise<boolean> => {
  const source = request.headers.get('cf-connecting-ip')?.trim().slice(0, 128) || 'local'
  const window = Math.floor(now.getTime() / ADMISSION_WINDOW_MS)
  const admitted = await admitPaidResourceChallenge(db, {
    bucketKey: await sha256AgenticCommercePaidResourceHex(`v1\n${source}\n${window}`),
    limit: ADMISSION_WINDOW_LIMIT,
    expiresAt: new Date(now.getTime() + ADMISSION_WINDOW_MS).toISOString(),
    now: now.toISOString(),
  })
  if (admitted) await prunePaidResourceRetention(db, {
    now: now.toISOString(),
    expiredBefore: new Date(now.getTime() - EXPIRED_EVIDENCE_RETENTION_MS).toISOString(),
  })
  return admitted
}
