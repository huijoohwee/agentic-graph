import { hashStringToHex } from '../hash/stringHash'

export const safeWebsitePathSegment = (raw: string): string => {
  const s = String(raw || '').trim()
  if (!s) return 'item'
  const cleaned = s
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
  const segment = cleaned.slice(0, 64).replace(/[.-]+$/, '') || 'item'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment) ? '_' + segment : segment
}

export const hostFromUrl = (url: string): string => {
  try {
    return new URL(String(url || '')).host
  } catch {
    return ''
  }
}

export const resolveWebsiteImportNodeRelativeDocumentPath = (args: {
  nodeUrl: string
  nodePath?: string | null
}): string => {
  const rawPath = (() => {
    const declared = String(args.nodePath || '').trim()
    if (declared) return declared
    try {
      return new URL(String(args.nodeUrl || '')).pathname
    } catch {
      return ''
    }
  })()
  const parts = rawPath.split('/').filter(Boolean).map(safeWebsitePathSegment)
  const leaf = parts[parts.length - 1] || 'index'
  const folderParts = parts.slice(0, Math.max(0, parts.length - 1))
  const nameBase = leaf.replace(/\.md$/i, '') || 'index'
  // A pathname can represent many separately captured pages. Keep its query identity
  // in both workspace writes and the shared crawl-table links.
  let query = ''
  try { query = new URL(args.nodeUrl).search } catch { /* Local imports have no URL query. */ }
  const suffix = query ? `--${hashStringToHex(query)}` : ''
  return [...folderParts, `${nameBase}${suffix}.md`].join('/')
}

/** One portable bundle per HTTP source, independent of provider, title and import time. */
export function websiteSourceBundlePath(sourceUrl: string, parent = '/'): string {
  const url = new URL(sourceUrl)
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('A website source requires an HTTP URL.')
  url.hash = ''
  const leaf = safeWebsitePathSegment(url.pathname.split('/').filter(Boolean).pop() || 'index')
  const root = parent === '/' ? `/websites/${safeWebsitePathSegment(url.host)}` : parent
  return `${root}/${leaf}--${hashStringToHex(url.href)}`
}
