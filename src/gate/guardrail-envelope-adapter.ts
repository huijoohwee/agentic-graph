import { invalidateCachedBalance, readCachedBalance, writeCachedBalance } from '../cache/balance-cache'
import { isIdentifier, isMinorUnits } from '../bundle/bundle-runtime'
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
  if (!isIdentifier(principalId)) return { kind: 'rejected', reason: 'envelope-malformed' }
  const cached = await ignoreCacheFailure(() => readCachedBalance(env.BALANCE_CACHE, principalId), null)
  let authoritative: AuthoritativeBalance | Rejection
  try {
    authoritative = await env.ENVELOPE_LEDGER.getByName(principalId).getAvailableBalance()
  } catch {
    return { kind: 'rejected', reason: 'envelope-unavailable' }
  }
  if (isRejection(authoritative)) return authoritative
  if (
    cached
    && (cached.revision !== authoritative.revision
      || cached.availableBalanceMinor !== authoritative.availableBalanceMinor)
  ) await ignoreCacheFailure(() => invalidateCachedBalance(env.BALANCE_CACHE, principalId), undefined)
  await ignoreCacheFailure(
    () => writeCachedBalance(env.BALANCE_CACHE, Object.freeze({ ...authoritative, cachedAt: Date.now() })),
    undefined,
  )
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
  if (!isMinorUnits(amountMinor)) return { kind: 'rejected', reason: 'envelope-malformed' }
  const balance = await confirmAvailableBalance(env, principalId)
  if ('kind' in balance) return balance
  return amountMinor <= balance.availableBalanceMinor
    ? { status: 'pass', availableBalanceMinor: balance.availableBalanceMinor }
    : { kind: 'rejected', reason: 'insufficient-envelope', details: { availableAtCheck: balance.availableBalanceMinor } }
}

async function ignoreCacheFailure<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try { return await operation() } catch { return fallback }
}
