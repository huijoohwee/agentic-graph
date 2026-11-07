export type LinkSignalKind = 'cta' | 'nav' | 'lnk'

const normalizeInline = (raw: string) => String(raw || '').replace(/\s+/g, ' ').trim()

const truncate = (raw: string, max: number) => {
  const s = normalizeInline(raw)
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export function classifyLinkLabel(labelRaw: string): LinkSignalKind {
  const s = normalizeInline(labelRaw).toLowerCase()
  if (!s) return 'lnk'
  const ctaWords = [
    'sign up',
    'signup',
    'sign in',
    'signin',
    'log in',
    'login',
    'get started',
    'start',
    'try',
    'download',
    'install',
    'create',
    'open',
    'join',
    'contact',
    'request',
    'book a demo',
    'demo',
    'buy',
    'subscribe',
    'watch',
    'play',
  ]
  for (const w of ctaWords) {
    if (s === w) return 'cta'
  }
  if (s.startsWith('get started')) return 'cta'
  if (s.startsWith('download')) return 'cta'
  if (s.startsWith('prompt')) return 'cta'
  if (s.startsWith('sign up') || s.startsWith('signup')) return 'cta'
  if (s.startsWith('log in') || s.startsWith('login')) return 'cta'
  if (s.startsWith('subscribe')) return 'cta'
  const navWords = [
    'docs',
    'documentation',
    'user guide',
    'guide',
    'learn',
    'learning',
    'tutorials',
    'blog',
    'community',
    'resources',
    'products',
    'product',
    'pricing',
    'features',
    'changelog',
    'about',
    'github',
    'api',
    'support',
    'help',
    'commercial',
    'store',
    'contact',
    'discord',
  ]
  for (const w of navWords) {
    if (s === w) return 'nav'
  }
  if (s.startsWith('docs')) return 'nav'
  if (s.startsWith('github')) return 'nav'
  if (s.startsWith('discord')) return 'nav'
  return 'lnk'
}

export function extractLinkSignalLabelsFromLine(line: string, opts?: { maxLabelLen?: number }): string[] {
  const maxLabelLen = opts?.maxLabelLen ?? 52
  const s = String(line || '')
  const out: string[] = []
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(s))) {
    const idx = m.index
    if (idx > 0 && s.charCodeAt(idx - 1) === 33) continue
    const text = truncate(m[1] || 'link', maxLabelLen)
    const kind = classifyLinkLabel(text)
    const prefix = kind === 'cta' ? '[CTA]' : kind === 'nav' ? '[NAV]' : '[LINK]'
    out.push(`${prefix} ${text}`)
  }
  return out
}

export function extractPriceSignalLabelsFromLine(line: string, opts?: { maxLabelLen?: number }): string[] {
  const maxLabelLen = opts?.maxLabelLen ?? 52
  const s = String(line || '')
  const out: string[] = []
  const priceRe = /(\$\s?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:billion|million|thousand|[kmbt])\b)?(?:\s*\/\s*(?:month|year|mo|yr))?)/gi
  let m: RegExpExecArray | null
  while ((m = priceRe.exec(s))) {
    const token = truncate(m[1] || '', maxLabelLen)
    if (!token) continue
    out.push(`[PRICE] ${token}`)
  }
  const withoutCurrency = s.replace(priceRe, token => ' '.repeat(token.length))
  const perRe = /\b\d+(?:\.\d+)?\s*\/\s*(?:mo|month|yr|year)\b/gi
  while ((m = perRe.exec(withoutCurrency))) {
    if (typeof m.index === 'number' && m.index > 0 && s.charCodeAt(m.index - 1) === 36) continue
    const token = truncate(m[0] || '', maxLabelLen)
    if (!token) continue
    out.push(`[PRICE] ${token}`)
  }
  return out
}

export function extractTimeSignalLabelsFromLine(line: string, opts?: { maxLabelLen?: number }): string[] {
  const maxLabelLen = opts?.maxLabelLen ?? 52
  const s = String(line || '')
  const out: string[] = []
  const timeRe = /\b\d{1,3}:[0-5]\d(?::[0-5]\d)?\b/g
  let m: RegExpExecArray | null
  while ((m = timeRe.exec(s))) {
    const token = truncate(m[0] || '', maxLabelLen)
    if (!token) continue
    out.push(`[TIME] ${token}`)
  }
  return out
}

export function summarizeCategorizedSignalsFromMarkdown(markdown: string, opts?: { maxLines?: number; maxPerKind?: number }): {
  nav: Array<{ label: string; count: number }>
  cta: Array<{ label: string; count: number }>
  price: Array<{ label: string; count: number }>
  time: Array<{ label: string; count: number }>
} {
  const index = indexDocumentSignals(markdown, { maxLines: opts?.maxLines, maxGroups: opts?.maxPerKind ?? 6 })
  const counts = (matches: DocumentSignalMatch[]) => matches.map(({ label, count }) => ({ label, count }))
  return { nav: counts(index.nav), cta: counts(index.cta), price: counts(index.price), time: counts(index.time) }
}

export type DocumentSignalKind = 'nav' | 'cta' | 'price' | 'time'
export type DocumentSignalMatch = { label: string; count: number; lines: number[] }
export type DocumentSignalIndex = Record<DocumentSignalKind, DocumentSignalMatch[]> & { truncated: boolean; scannedLines: number }

/** Bounded, source-addressable heuristics. Line numbers always refer to the original text. */
export function indexDocumentSignals(markdown: string, opts?: { maxLines?: number; maxGroups?: number }): DocumentSignalIndex {
  const boundedLimit = (value: number | undefined, cap: number) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(cap, Math.floor(value))) : cap
  const maxChars = 2_000_000, maxLines = boundedLimit(opts?.maxLines, 8000), maxGroups = boundedLimit(opts?.maxGroups, 24), maxLocations = 10
  const bounded = markdown.slice(0, maxChars)
  const sourceLines = bounded.split(/\r\n|\n|\r/, maxLines + 1)
  const maps = { nav: new Map<string, DocumentSignalMatch>(), cta: new Map<string, DocumentSignalMatch>(), price: new Map<string, DocumentSignalMatch>(), time: new Map<string, DocumentSignalMatch>() }
  let frontmatter = /^\uFEFF?---\s*$/.test(sourceLines[0] || '')
  let fence = '', fenceLength = 0
  const scannedLines = Math.min(sourceLines.length, maxLines)
  let omittedLocations = false, omittedLongLines = false
  for (let index = 0; index < scannedLines; index++) {
    const raw = sourceLines[index]
    if (frontmatter) {
      if (index > 0 && /^(---|\.\.\.)\s*$/.test(raw)) frontmatter = false
      continue
    }
    const marker = raw.match(/^ {0,3}(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) { fence = marker[1][0]; fenceLength = marker[1].length }
      else if (marker[1][0] === fence && marker[1].length >= fenceLength && !raw.slice(marker[0].length).trim()) fence = ''
      continue
    }
    if (fence || /^( {4}|\t)/.test(raw)) continue
    if (raw.length > 4096) { omittedLongLines = true; continue }
    const content = raw.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/`[^`]*`/g, '')
    const labels = extractLinkSignalLabelsFromLine(content)
    const visible = content.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+|data:\S+/gi, '').replace(/<[^>]*>/g, '')
    labels.push(...extractPriceSignalLabelsFromLine(visible), ...extractTimeSignalLabelsFromLine(visible))
    for (const label of labels) {
      const kind = label.slice(1, label.indexOf(']')).toLowerCase() as DocumentSignalKind
      if (!(kind in maps)) continue
      const map = maps[kind]
      const item = map.get(label) || { label, count: 0, lines: [] }
      item.count++
      if (!item.lines.includes(index + 1)) {
        if (item.lines.length < maxLocations) item.lines.push(index + 1)
        else omittedLocations = true
      }
      map.set(label, item)
    }
  }
  let truncated = omittedLocations || omittedLongLines || markdown.length > maxChars || sourceLines.length > maxLines
  const result = {} as DocumentSignalIndex
  for (const kind of ['nav', 'cta', 'price', 'time'] as const) {
    const all = [...maps[kind].values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    if (all.length > maxGroups) truncated = true
    result[kind] = all.slice(0, maxGroups)
  }
  return { ...result, truncated, scannedLines }
}
