import type { TokensCode } from './MarkdownTokens'

export type CodeHighlightRange = {
  start: number
  end: number
}

export type CodeStepSpec = {
  ranges: CodeHighlightRange[]
}

export type CodeInfoMeta = {
  lang?: string
  id?: string
  highlightRanges: CodeHighlightRange[]
  steps: CodeStepSpec[]
  showLineNumbers: boolean
}

const parseRangeToken = (token: string): CodeHighlightRange | null => {
  const trimmed = token.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === 'all') {
    return { start: 1, end: Number.MAX_SAFE_INTEGER }
  }
  const m = trimmed.match(/^(\d+)(-(\d+))?$/)
  if (!m) return null
  const start = Number.parseInt(m[1] || '', 10)
  const end = m[3] ? Number.parseInt(m[3] || '', 10) : start
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start <= 0 || end <= 0) return null
  const s = Math.min(start, end)
  const e = Math.max(start, end)
  return { start: s, end: e }
}

const parseHighlightList = (expr: string | null | undefined): CodeHighlightRange[] => {
  if (!expr) return []
  const raw = String(expr || '')
  if (!raw.trim()) return []
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean)
  const out: CodeHighlightRange[] = []
  for (const p of parts) {
    const r = parseRangeToken(p)
    if (r) out.push(r)
  }
  return out
}

const parseStepSpec = (expr: string | null | undefined): CodeStepSpec[] => {
  if (!expr) return []
  const raw = String(expr || '')
  if (!raw.trim()) return []
  const stepParts = raw.split('|').map(part => part.trim()).filter(Boolean)
  const steps: CodeStepSpec[] = []
  for (const part of stepParts) {
    const ranges = parseHighlightList(part)
    steps.push({ ranges })
  }
  return steps
}

const parseObjectLike = (expr: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const raw = expr.trim().replace(/^\{/, '').replace(/\}$/, '')
  if (!raw.trim()) return out
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean)
  for (const part of parts) {
    const idx = part.indexOf(':')
    if (idx === -1) {
      const key = part.trim()
      if (key) out[key] = 'true'
      continue
    }
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!key) continue
    out[key] = value
  }
  return out
}

const parseTrailingBraces = (infoRemainder: string): {
  highlightExpr: string | null
  stepExpr: string | null
  showLineNumbers: boolean
  id: string | null
} => {
  const trimmed = infoRemainder.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return { highlightExpr: null, stepExpr: null, showLineNumbers: false, id: null }
  }
  const inner = trimmed.slice(1, -1).trim()
  if (!inner) {
    return { highlightExpr: null, stepExpr: null, showLineNumbers: false, id: null }
  }
  if (!inner.includes(':')) {
    if (inner.includes('|')) {
      return {
        highlightExpr: null,
        stepExpr: inner,
        showLineNumbers: false,
        id: null,
      }
    }
    return {
      highlightExpr: inner,
      stepExpr: null,
      showLineNumbers: false,
      id: null,
    }
  }
  const content = trimmed
  const obj = parseObjectLike(content)
  const singleKey = Object.keys(obj)
  if (singleKey.length === 1 && !singleKey[0].includes(':')) {
    const key = singleKey[0]
    if (key.toLowerCase() === 'lines' || key.toLowerCase() === 'lines:true') {
      return { highlightExpr: null, stepExpr: null, showLineNumbers: true, id: null }
    }
  }
  let showLineNumbers = false
  let highlightExpr: string | null = null
  let stepExpr: string | null = null
  let id: string | null = null
  
  const linesRaw = obj.lines ?? obj.lineNumbers
  if (typeof linesRaw === 'string') {
    const v = linesRaw.trim().toLowerCase()
    if (v === 'true' || v === '1') showLineNumbers = true
  }
  const highlightRaw = obj.highlight ?? obj.highlights
  if (typeof highlightRaw === 'string' && highlightRaw.trim()) {
    highlightExpr = highlightRaw
  }
  const stepsRaw = obj.steps ?? obj.stepRanges
  if (typeof stepsRaw === 'string' && stepsRaw.trim()) {
    stepExpr = stepsRaw
  }
  const idRaw = obj.id
  if (typeof idRaw === 'string' && idRaw.trim()) {
    id = idRaw.trim()
  }
  
  return { highlightExpr, stepExpr, showLineNumbers, id }
}

export const parseCodeInfoMeta = (token: TokensCode): CodeInfoMeta => {
  const anyToken = token as unknown as { lang?: unknown; info?: unknown }
  const langRaw = String(anyToken.lang || '').trim()
  const infoRaw = String(anyToken.info || '').trim()
  let lang = langRaw
  let highlightRanges: CodeHighlightRange[] = []
  let steps: CodeStepSpec[] = []
  let showLineNumbers = false
  let id: string | undefined

  if (infoRaw) {
    const parts = infoRaw.split(/\s+/)
    const head = parts[0] || ''
    const tail = infoRaw.slice(head.length).trim()
    if (!lang) lang = head
    if (tail) {
      const braceStart = tail.indexOf('{')
      if (braceStart >= 0) {
        const before = tail.slice(0, braceStart).trim()
        const braceExpr = tail.slice(braceStart).trim()
        const parsed = parseTrailingBraces(braceExpr)
        showLineNumbers = parsed.showLineNumbers
        id = parsed.id || undefined
        
        if (parsed.highlightExpr) {
          highlightRanges = parseHighlightList(parsed.highlightExpr)
        } else if (!parsed.stepExpr) {
          highlightRanges = parseHighlightList(before || null)
        }
        if (parsed.stepExpr) {
          steps = parseStepSpec(parsed.stepExpr)
        }
      } else {
        highlightRanges = parseHighlightList(tail || null)
      }
    }
  }

  return {
    lang: lang || undefined,
    id,
    highlightRanges,
    steps,
    showLineNumbers,
  }
}

export const CODE_FENCE_LANGUAGE_AUTO_VALUE = '__auto__'
const CODE_FENCE_LANGUAGE_OPTIONS = [
  { value: CODE_FENCE_LANGUAGE_AUTO_VALUE, label: 'auto' },
  { value: 'plaintext', label: 'plaintext' },
  { value: 'javascript', label: 'javascript' },
  { value: 'typescript', label: 'typescript' },
  { value: 'json', label: 'json' },
  { value: 'yaml', label: 'yaml' },
  { value: 'markdown', label: 'markdown' },
  { value: 'bash', label: 'bash' },
  { value: 'python', label: 'python' },
  { value: 'sql', label: 'sql' },
  { value: 'html', label: 'html' },
  { value: 'css', label: 'css' },
  { value: 'xml', label: 'xml' },
]

export function codeFenceLanguageOptions(language: string) {
  if (!language || CODE_FENCE_LANGUAGE_OPTIONS.some(option => option.value === language)) return CODE_FENCE_LANGUAGE_OPTIONS
  return [{ value: language, label: language }, ...CODE_FENCE_LANGUAGE_OPTIONS]
}

export function codeFenceBodyRange(src: readonly string[] | undefined, startLine: number, endLine?: number) {
  if (!Array.isArray(src) || src.length === 0) return null
  const start = Math.max(1, Math.floor(startLine || 1))
  const end = Math.max(start, Math.floor(endLine || start))
  const openLine = src[start - 1] || ''
  const mOpen = openLine.match(/^(\s*)(```+|~~~+)(.*)$/)
  if (!mOpen) return null
  const fence = mOpen[2] || '```'
  let closeIdx = -1
  for (let i = Math.min(src.length - 1, end - 1); i > start - 1; i -= 1) {
    const line = src[i] || ''
    if (String(line || '').trimStart().startsWith(fence)) {
      closeIdx = i
      break
    }
  }
  if (closeIdx < 0) return null
  const innerStart = start + 1
  const innerEnd = closeIdx
  if (innerStart > innerEnd) return null
  return { startLine: innerStart, endLine: innerEnd }
}

export function changeFenceLanguage(openLine: string, infoRaw: string, existingLangToken: string, nextValue: string) {
  const fenceMatch = openLine.match(/^(\s*)(`{3,}|~{3,})([\s\S]*)$/)
  if (!fenceMatch) return null
  const indent = String(fenceMatch[1] || '')
  const fence = String(fenceMatch[2] || '```')
  const originalInfoChunk = String(fenceMatch[3] || '')
  const prefersInfoSeparator = /^\s+/.test(originalInfoChunk)
  const trailingInfo = (() => {
    if (!infoRaw) return ''
    if (!existingLangToken) return infoRaw
    if (infoRaw.toLowerCase().startsWith(existingLangToken.toLowerCase())) {
      return infoRaw.slice(existingLangToken.length).trimStart()
    }
    return infoRaw
  })()
  const nextLanguageToken =
    nextValue && nextValue !== CODE_FENCE_LANGUAGE_AUTO_VALUE ? String(nextValue).trim().toLowerCase() : ''
  const nextInfo = [nextLanguageToken, trailingInfo].filter(Boolean).join(' ').trim()
  return `${indent}${fence}${nextInfo ? `${prefersInfoSeparator ? ' ' : ''}${nextInfo}` : ''}`
}
