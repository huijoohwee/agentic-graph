import { hashStringToHex } from '@/lib/hash/stringHash'

export const safeWebsitePathSegment = (raw: string): string => {
  const s = String(raw || '').trim()
  if (!s) return 'item'
  const cleaned = s
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
  return cleaned.slice(0, 64) || 'item'
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
