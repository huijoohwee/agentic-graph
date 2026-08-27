const localProxyPaths = new Set([
  '/__binary_download_proxy',
  '/__chat_asset_proxy',
  '/__fetch_remote',
  '/__media_proxy',
  '/__webpage_asset_path',
  '/__webpage_asset_proxy',
  '/__webpage_proxy',
])

const decodeHtmlUrlEntities = (value: string): string =>
  String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#x26;/gi, '&')

export const normalizeMarkdownLocalProxyUrl = (href: string): string => {
  const raw = String(href || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw, 'https://agenticgraph.local')
    if (!localProxyPaths.has(parsed.pathname) && !parsed.pathname.startsWith('/__webpage_asset_path/')) return raw
    const proxied = parsed.searchParams.get('url')
    if (proxied) parsed.searchParams.set('url', decodeHtmlUrlEntities(proxied))
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return raw
  }
}

const decodeSafe = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const extractUpstreamUrlFromMarkdownLocalProxyUrl = (href: string): string => {
  const raw = normalizeMarkdownLocalProxyUrl(String(href || '').trim())
  if (!raw) return ''
  try {
    const parsed = new URL(raw, 'https://agenticgraph.local')
    if (parsed.pathname.startsWith('/__webpage_asset_path/')) {
      const encodedTarget = parsed.pathname.slice('/__webpage_asset_path/'.length)
      const decodedPathTarget = decodeSafe(encodedTarget)
      const decodedTarget = `${decodedPathTarget}${parsed.search || ''}${parsed.hash || ''}`
      if (/^https?:\/\//i.test(decodedTarget)) return decodedTarget

      const slash = encodedTarget.indexOf('/')
      if (slash > 0) {
        const origin = decodeSafe(encodedTarget.slice(0, slash))
        const path = encodedTarget.slice(slash)
        const target = `${origin}${path}${parsed.search || ''}${parsed.hash || ''}`
        if (/^https?:\/\//i.test(target)) return target
      }
      return ''
    }

    const inner = parsed.searchParams.get('url') || ''
    if (!inner) return ''
    const decoded = decodeSafe(decodeHtmlUrlEntities(inner).trim())
    return /^https?:\/\//i.test(decoded) ? decoded : ''
  } catch {
    return ''
  }
}
