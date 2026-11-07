import type { SanitizeMarkdownResult } from './sanitizeImportedMarkdownTypes'

export function stripHeadingPermalinkArtifacts(raw: string, opts?: { sourceUrl?: string }): SanitizeMarkdownResult {
  const sourceUrl = String(opts?.sourceUrl || '').trim()
  const text = String(raw || '')
  const lines = text.split(/\r?\n/g)
  let inFence = false
  let fence = ''
  let changed = false
  const out: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    const m = trimmed.match(/^(```+|~~~+)(.*)$/)
    if (m) {
      if (!inFence) {
        inFence = true
        fence = m[1] || '```'
      } else if (trimmed.startsWith(fence)) {
        inFence = false
        fence = ''
      }
      out.push(line)
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }
    if (!/^#{1,6}\s+/.test(line)) {
      out.push(line)
      continue
    }
    if (!/data:image\/svg\+xml;base64,/i.test(line)) {
      out.push(line)
      continue
    }
    let next = line
    next = next.replace(/!\[[^\]]*\]\(data:image\/svg\+xml;base64,[^)]+\)/gi, '')
    next = next.replace(/\[\s*\]\(data:image\/svg\+xml;base64,[^)]+\)/gi, '')
    if (sourceUrl) {
      const escaped = sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      next = next.replace(/\)\s*\((https?:\/\/[^)]+)\)\s*$/i, (full, href: string) => {
        const h = String(href || '').trim()
        if (!h) return full
        if (h === sourceUrl || h.startsWith(`${sourceUrl}#`)) return ''
        return full
      })
      next = next.replace(new RegExp(`\\s*\\(${escaped}(#[^)]+)?\\)\\s*$`, 'i'), '')
    }
    next = next.replace(/\s{2,}/g, ' ').replace(/\s+$/, '')
    if (next !== line) changed = true
    out.push(next)
  }
  return { text: out.join('\n'), changed }
}

const parseBalanced = (
  s: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
): { end: number } | null => {
  if (s[openIndex] !== openChar) return null
  let depth = 0
  for (let i = openIndex; i < s.length; i += 1) {
    const ch = s[i] || ''
    if (ch === openChar) depth += 1
    else if (ch === closeChar) {
      depth -= 1
      if (depth === 0) return { end: i }
    }
  }
  return null
}

const removeImagesFromMarkdownLabel = (label: string): { text: string; removed: boolean } => {
  const src = String(label || '')
  let out = ''
  let i = 0
  let removed = false
  while (i < src.length) {
    const bang = src.indexOf('![', i)
    if (bang < 0) {
      out += src.slice(i)
      break
    }
    out += src.slice(i, bang)
    const labelStart = bang + 1
    if (src[labelStart] !== '[') {
      i = bang + 2
      continue
    }
    const labelEnd = parseBalanced(src, labelStart, '[', ']')
    if (!labelEnd) {
      i = bang + 2
      continue
    }
    const destOpen = labelEnd.end + 1
    if (src.slice(destOpen, destOpen + 1) !== '(') {
      i = labelEnd.end + 1
      continue
    }
    const destEnd = parseBalanced(src, destOpen, '(', ')')
    if (!destEnd) {
      i = destOpen + 1
      continue
    }
    removed = true
    i = destEnd.end + 1
  }
  const normalized = out.replace(/\s+/g, ' ').trim()
  return { text: normalized, removed }
}

export function removeImagesInsideLinkLabelsWhenTextExists(raw: string): SanitizeMarkdownResult {
  const s = String(raw || '')
  let out = ''
  let i = 0
  let changed = false
  while (i < s.length) {
    const start = s.indexOf('[', i)
    if (start < 0) {
      out += s.slice(i)
      break
    }
    out += s.slice(i, start)
    const labelEnd = parseBalanced(s, start, '[', ']')
    if (!labelEnd) {
      out += s[start]
      i = start + 1
      continue
    }
    const afterLabel = labelEnd.end + 1
    if (s.slice(afterLabel, afterLabel + 1) !== '(') {
      out += s.slice(start, afterLabel)
      i = afterLabel
      continue
    }
    const destEnd = parseBalanced(s, afterLabel, '(', ')')
    if (!destEnd) {
      out += s.slice(start, afterLabel + 1)
      i = afterLabel + 1
      continue
    }
    const rawLabel = s.slice(start + 1, labelEnd.end)
    const { text: labelNoImages, removed } = removeImagesFromMarkdownLabel(rawLabel)
    const hasText = /[\p{L}\p{N}]/u.test(labelNoImages)
    if (removed && hasText) {
      out += `[${labelNoImages}]${s.slice(afterLabel, destEnd.end + 1)}`
      changed = true
    } else {
      out += s.slice(start, destEnd.end + 1)
    }
    i = destEnd.end + 1
  }
  return { text: out, changed }
}
