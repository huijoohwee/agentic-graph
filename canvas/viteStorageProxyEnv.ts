const normalizeString = (value: unknown): string => String(value || '').trim()

export const resolveAgenticGraphStorageDevProxyTarget = (args: {
  processEnv: Record<string, string | undefined>
  fileEnv: Record<string, string | undefined>
}): string => normalizeString(
  args.processEnv.AGENTIC_OS_STORAGE_DEV_PROXY_TARGET
    || args.fileEnv.AGENTIC_OS_STORAGE_DEV_PROXY_TARGET
    || 'https://airvio.co',
).replace(/\/+$/, '') || 'https://airvio.co'

/** Preserve the cookie CSRF boundary through the loopback development proxy. */
export const resolveStorageDevProxyOrigin = (args: {
  origin: string | undefined; host: string | undefined; target: string
}): string | null => {
  if (!args.origin || !args.host) return null
  try {
    const browser = new URL(args.origin)
    const upstream = new URL(args.target)
    if (args.origin !== browser.origin || !['127.0.0.1', 'localhost', '[::1]'].includes(browser.hostname)
      || browser.host !== args.host || !['http:', 'https:'].includes(browser.protocol)
      || !['http:', 'https:'].includes(upstream.protocol)) return null
    return upstream.origin
  } catch { return null }
}
