import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { getObjectPath } from '@/lib/data/objectPath'

export type MarkdownVariableToken = {
  start: number
  end: number
  raw: string
  key: string
  declaredValue: string | null
  fallback: string | null
}
export type MarkdownVariableBrowseRow = {
  key: string
  value: string | null
  source: 'frontmatter' | 'inline' | 'unresolved'
}
export type MarkdownVariableSsotEntry = {
  key: string
  line: number
  source: 'frontmatter' | 'inline'
}

const VAR_KEY_RE = /^[A-Za-z0-9_.-]{1,64}$/
const VAR_TOKEN_RE = /\{\{([^{}]+)\}\}/g

export const parseMarkdownVariableTokenExpr = (rawExpr: string): { key: string; declaredValue: string | null; fallback: string | null } | null => {
  const expr = String(rawExpr || '').trim()
  if (!expr) return null
  const declMatch = /^([A-Za-z0-9_.-]{1,64})\s*:\s*([^}]+)$/.exec(expr)
  if (declMatch) {
    const key = String(declMatch[1] || '').trim()
    const declaredValue = String(declMatch[2] || '').trim()
    if (!VAR_KEY_RE.test(key) || !declaredValue) return null
    return { key, declaredValue, fallback: null }
  }
  const fallbackMatch = /^([A-Za-z0-9_.-]{1,64})\s*\|\s*([^}]+)$/.exec(expr)
  if (fallbackMatch) {
    const key = String(fallbackMatch[1] || '').trim()
    const fallback = String(fallbackMatch[2] || '').trim()
    if (!VAR_KEY_RE.test(key) || !fallback) return null
    return { key, declaredValue: null, fallback }
  }
  if (!VAR_KEY_RE.test(expr)) return null
  return { key: expr, declaredValue: null, fallback: null }
}

export const parseMarkdownVariableTokens = (text: string): MarkdownVariableToken[] => {
  const rawText = String(text || '')
  const out: MarkdownVariableToken[] = []
  VAR_TOKEN_RE.lastIndex = 0
  for (;;) {
    const m = VAR_TOKEN_RE.exec(rawText)
    if (!m) break
    const parsed = parseMarkdownVariableTokenExpr(String(m[1] || ''))
    if (!parsed) continue
    const start = Number(m.index || 0)
    const full = String(m[0] || '')
    const end = start + full.length
    out.push({
      start,
      end,
      raw: full,
      key: parsed.key,
      declaredValue: parsed.declaredValue,
      fallback: parsed.fallback,
    })
  }
  return out
}

export const findMarkdownVariableTokenAtOffset = (args: { text: string; offset: number }): MarkdownVariableToken | null => {
  const text = String(args.text || '')
  const offset = Math.max(0, Math.min(text.length, Math.floor(args.offset)))
  const tokens = parseMarkdownVariableTokens(text)
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]
    if (offset >= t.start && offset <= t.end) return t
  }
  return null
}

const flattenFrontmatterKeys = (obj: unknown, maxDepth: number = 4, prefix: string = ''): string[] => {
  if (maxDepth < 0) return []
  const out: string[] = []
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i += 1) {
      const key = prefix ? `${prefix}.${i}` : String(i)
      out.push(key)
      out.push(...flattenFrontmatterKeys(obj[i], maxDepth - 1, key))
    }
    return out
  }
  if (!obj || typeof obj !== 'object') return out
  const rec = obj as Record<string, unknown>
  const keys = Object.keys(rec)
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i]
    const next = prefix ? `${prefix}.${k}` : k
    out.push(next)
    out.push(...flattenFrontmatterKeys(rec[k], maxDepth - 1, next))
  }
  return out
}

const stringifyVariableValue = (value: unknown): string | null => {
  if (typeof value === 'undefined') return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const primitiveOnly = value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    if (primitiveOnly) return value.map(v => String(v)).join(', ')
    try {
      return JSON.stringify(value)
    } catch {
      return null
    }
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return null
    }
  }
  return null
}

const collectInlineDeclarationMap = (text: string): Map<string, string> => {
  const out = new Map<string, string>()
  const tokens = parseMarkdownVariableTokens(text)
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!token || !token.declaredValue) continue
    const key = token.key.toLowerCase()
    if (!key || out.has(key)) continue
    out.set(key, token.declaredValue)
  }
  return out
}

const resolveVariableValue = (args: { frontmatter: Record<string, unknown>; inlineDeclMap: Map<string, string>; key: string }): MarkdownVariableBrowseRow => {
  const key = String(args.key || '').trim()
  if (!key) return { key: '', value: null, source: 'unresolved' }
  const fmValue = getObjectPath(args.frontmatter, key.replace(/\.(\d+)(?=\.|$)/g, '[$1]'))
  const fmString = stringifyVariableValue(fmValue)
  if (fmString != null) return { key, value: fmString, source: 'frontmatter' }
  const inlineValue = args.inlineDeclMap.get(key.toLowerCase())
  if (typeof inlineValue === 'string' && inlineValue.trim()) {
    return { key, value: inlineValue, source: 'inline' }
  }
  return { key, value: null, source: 'unresolved' }
}

export const collectMarkdownVariableSuggestions = (args: { sourceLines?: string[]; draftText: string }): string[] => {
  const out = new Set<string>()
  const addKey = (raw: string) => {
    const k = String(raw || '').trim()
    if (!k || !VAR_KEY_RE.test(k)) return
    out.add(k)
  }
  const draft = String(args.draftText || '')
  const draftTokens = parseMarkdownVariableTokens(draft)
  for (let i = 0; i < draftTokens.length; i += 1) addKey(draftTokens[i]?.key || '')
  const source = Array.isArray(args.sourceLines) ? args.sourceLines.join('\n') : ''
  if (source) {
    const sourceTokens = parseMarkdownVariableTokens(source)
    for (let i = 0; i < sourceTokens.length; i += 1) addKey(sourceTokens[i]?.key || '')
    const { meta } = parseMarkdownFrontmatter(splitMarkdownLines(source))
    const frontmatterKeys = flattenFrontmatterKeys(meta)
    for (let i = 0; i < frontmatterKeys.length; i += 1) addKey(frontmatterKeys[i] || '')
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b))
}

export const collectMarkdownVariableBrowseRows = (args: { sourceLines?: string[]; draftText: string }): MarkdownVariableBrowseRow[] => {
  const source = Array.isArray(args.sourceLines) ? args.sourceLines.join('\n') : ''
  const { meta } = parseMarkdownFrontmatter(splitMarkdownLines(source))
  const frontmatter = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta as Record<string, unknown> : {}
  const inlineDeclMap = collectInlineDeclarationMap(source || String(args.draftText || ''))
  const keys = collectMarkdownVariableSuggestions(args)
  const rows = keys
    .map(key => resolveVariableValue({ frontmatter, inlineDeclMap, key }))
    .filter(row => !!row.key)
  rows.sort((a, b) => a.key.localeCompare(b.key))
  return rows
}

export const buildMarkdownVariableToken = (args: {
  mode: 'ref' | 'create' | 'update' | 'fallback'
  key: string
  value?: string
  fallback?: string
}): string => {
  const key = String(args.key || '').trim()
  if (!VAR_KEY_RE.test(key)) return ''
  if (args.mode === 'create' || args.mode === 'update') {
    const value = String(args.value || '').trim()
    if (!value) return ''
    return `{{${key}:${value}}}`
  }
  if (args.mode === 'fallback') {
    const fallback = String(args.fallback || '').trim()
    if (!fallback) return ''
    return `{{${key}|${fallback}}}`
  }
  return `{{${key}}}`
}

export const buildMarkdownVariableSsotAnchorId = (key: string): string => {
  const normalized = String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
  return `kg-var-ssot-${normalized || 'unknown'}`
}

export const collectMarkdownVariableSsotEntries = (sourceText: string): MarkdownVariableSsotEntry[] => {
  const text = String(sourceText || '')
  const lines = splitMarkdownLines(text)
  const byKey = new Map<string, MarkdownVariableSsotEntry>()
  const upsert = (entry: MarkdownVariableSsotEntry) => {
    const lower = entry.key.toLowerCase()
    if (!lower || byKey.has(lower)) return
    byKey.set(lower, entry)
  }
  if ((lines[0] || '').trim() === '---') {
    let fmEnd = -1
    for (let i = 1; i < lines.length; i += 1) {
      if ((lines[i] || '').trim() === '---') {
        fmEnd = i
        break
      }
    }
    if (fmEnd > 0) {
      for (let i = 1; i < fmEnd; i += 1) {
        const raw = String(lines[i] || '')
        const trimStart = raw.trimStart()
        if (!trimStart || trimStart.startsWith('#') || trimStart.startsWith('-')) continue
        const m = /^([A-Za-z0-9_.-]{1,64})\s*:/.exec(trimStart)
        if (!m) continue
        upsert({ key: String(m[1] || ''), line: i + 1, source: 'frontmatter' })
      }
    }
  }
  const tokens = parseMarkdownVariableTokens(text)
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!token || !token.declaredValue) continue
    const before = text.slice(0, Math.max(0, token.start))
    const line = before.split('\n').length
    upsert({ key: token.key, line, source: 'inline' })
  }
  return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key))
}
