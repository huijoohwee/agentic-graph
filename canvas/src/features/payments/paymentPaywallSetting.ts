import { LS_KEYS } from '@/lib/config.ls.keys'

const LEGACY_STRIPE_PAYWALL_STORAGE_KEY =
  'kg:payments:stripe:paywallEnabled'

const parseStoredBoolean = (
  value: string | null,
  fallback: boolean,
): boolean => {
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return fallback
}

export const readMigratedPaymentsPaywallEnabled = (
  storage: Storage | null,
  fallback = false,
): boolean => {
  if (!storage) return fallback
  try {
    const current = storage.getItem(LS_KEYS.paymentsPaywallEnabled)
    if (current !== null) {
      storage.removeItem(LEGACY_STRIPE_PAYWALL_STORAGE_KEY)
      return parseStoredBoolean(current, fallback)
    }

    const legacy = storage.getItem(LEGACY_STRIPE_PAYWALL_STORAGE_KEY)
    if (legacy === null) return fallback
    const migrated = parseStoredBoolean(legacy, fallback)
    storage.setItem(
      LS_KEYS.paymentsPaywallEnabled,
      migrated ? '1' : '0',
    )
    storage.removeItem(LEGACY_STRIPE_PAYWALL_STORAGE_KEY)
    return migrated
  } catch {
    return fallback
  }
}
