export type CachedBalance = Readonly<{
  principalId: string
  availableBalanceMinor: number
  revision: string
  cachedAt: number
}>

const keyFor = (principalId: string): string => `available-balance:${principalId}`

export async function readCachedBalance(cache: KVNamespace, principalId: string): Promise<CachedBalance | null> {
  const value = await cache.get(keyFor(principalId), 'json')
  if (!isCachedBalance(value) || value.principalId !== principalId) return null
  return Object.freeze(value)
}

export async function writeCachedBalance(cache: KVNamespace, value: CachedBalance): Promise<void> {
  await cache.put(keyFor(value.principalId), JSON.stringify(value), { expirationTtl: 60 })
}

export async function invalidateCachedBalance(cache: KVNamespace, principalId: string): Promise<void> {
  await cache.delete(keyFor(principalId))
}

function isCachedBalance(value: unknown): value is CachedBalance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.principalId === 'string'
    && typeof record.availableBalanceMinor === 'number'
    && Number.isSafeInteger(record.availableBalanceMinor)
    && typeof record.revision === 'string'
    && typeof record.cachedAt === 'number'
}
