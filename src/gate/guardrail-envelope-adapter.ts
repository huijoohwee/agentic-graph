import { invalidateCachedBalance, readCachedBalance, writeCachedBalance } from '../cache/balance-cache'
import type { Rejection } from '../bundle/bundle-types'

type AuthoritativeBalance = Readonly<{
  principalId: string
  availableBalanceMinor: number
  revision: string
}>

export async function confirmAvailableBalance(
  env: TravelCommerceEnv,
  principalId: string,
): Promise<AuthoritativeBalance | Rejection> {
  const cached = await readCachedBalance(env.BALANCE_CACHE, principalId)
  const ledger = env.ENVELOPE_LEDGER.getByName(principalId)
  const authoritative = await ledger.getAvailableBalance()
  if (isRejection(authoritative)) return authoritative
  if (
    cached
    && (cached.revision !== authoritative.revision
      || cached.availableBalanceMinor !== authoritative.availableBalanceMinor)
  ) await invalidateCachedBalance(env.BALANCE_CACHE, principalId)
  await writeCachedBalance(env.BALANCE_CACHE, Object.freeze({ ...authoritative, cachedAt: Date.now() }))
  return authoritative
}

function isRejection(value: unknown): value is Rejection {
  return Boolean(value && typeof value === 'object' && 'kind' in value && value.kind === 'rejected')
}

export async function guardrailEnvelopeCheck(
  env: TravelCommerceEnv,
  principalId: string,
  amountMinor: number,
): Promise<Readonly<{ status: 'pass'; availableBalanceMinor: number }> | Rejection> {
  const balance = await confirmAvailableBalance(env, principalId)
  if ('kind' in balance) return balance
  return amountMinor <= balance.availableBalanceMinor
    ? { status: 'pass', availableBalanceMinor: balance.availableBalanceMinor }
    : { kind: 'rejected', reason: 'insufficient-envelope', details: { availableAtCheck: balance.availableBalanceMinor } }
}
