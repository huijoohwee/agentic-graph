import type { SanitizeMarkdownResult } from './sanitizeImportedMarkdownTypes'

const SVG_OMITTED_PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="32" role="img" aria-label="Image exceeds inline limit"><rect width="200" height="32" fill="#eee"/><text x="8" y="21" fill="#222" font-size="12">Image exceeds inline limit</text></svg>'

const encodeUtf8ToBase64 = (text: string): string => {
  const raw = String(text ?? '')
  const anyGlobal = globalThis as unknown as {
    Buffer?: { from: (input: string, enc: string) => { toString: (enc: string) => string } }
  }
  if (anyGlobal.Buffer && typeof anyGlobal.Buffer.from === 'function') {
    return anyGlobal.Buffer.from(raw, 'utf8').toString('base64')
  }
  const encoder = new TextEncoder()
  const bytes = encoder.encode(raw)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk))
    binary += String.fromCharCode(...Array.from(slice))
  }
  return btoa(binary)
}

export const SVG_OMITTED_PLACEHOLDER_DATA_URI = `data:image/svg+xml;base64,${encodeUtf8ToBase64(SVG_OMITTED_PLACEHOLDER_SVG)}`

const makeSvgOmittedDataUri = (_label: string): string => {
  return SVG_OMITTED_PLACEHOLDER_DATA_URI
}

const isBase64ish = (line: string): boolean => {
  const s = String(line || '').trim()
  if (!s) return false
  if (s.length < 256) return false
  if (!/^[A-Za-z0-9+/=]+$/.test(s)) return false
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0
  if (pad > 0 && s.slice(0, -pad).includes('=')) return false
  return true
}

export function stripEmbeddedBase64ImageSrc(raw: string): SanitizeMarkdownResult {
  const s = String(raw || '')
  const needle = 'data:image/'
  const base64Needle = ';base64,'
  const maxSvgBase64Chars = 32_000
  let i = 0
  let changed = false
  let out = ''
  while (i < s.length) {
    const start = s.indexOf(needle, i)
    if (start < 0) {
      out += s.slice(i)
      break
    }
    const base64Pos = s.indexOf(base64Needle, start)
    if (base64Pos < 0) {
      out += s.slice(i)
      break
    }
    out += s.slice(i, start)

    const afterBase64 = base64Pos + base64Needle.length
    const mime = s.slice(start, base64Pos).toLowerCase()
    const maxScan = Math.min(s.length, afterBase64 + 3_000_000)
    let end = afterBase64
    let payloadChars = 0
    let hadWhitespace = false
    let payload = ''
    const shouldCollect = mime.includes('image/svg+xml')
    for (; end < maxScan; end += 1) {
      const ch = s[end] || ''
      const code = s.charCodeAt(end)
      if (code === 41 || code === 34 || code === 39) break
      if (code === 32 || code === 10 || code === 13 || code === 9) {
        hadWhitespace = true
        continue
      }
      if (!/[A-Za-z0-9+/=]/.test(ch)) break
      payloadChars += 1
      if (shouldCollect && payloadChars <= maxSvgBase64Chars) payload += ch
    }
    const isSvg = mime.includes('image/svg+xml')
    const allowSmallInlineSvg = isSvg && payloadChars > 0 && payloadChars <= maxSvgBase64Chars
    if (allowSmallInlineSvg) {
      if (hadWhitespace) changed = true
      out += `${s.slice(start, afterBase64)}${payload}`
    } else {
      out += isSvg ? makeSvgOmittedDataUri('') : 'data:,'
      changed = true
    }
    i = end
  }
  return { text: out, changed }
}

export function stripLargeBase64Fences(raw: string): SanitizeMarkdownResult {
  const text = String(raw || '')
  const lines = text.split(/\r?\n/g)
  let inFence = false
  let fence = ''
  let changed = false
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()
    if (!inFence) {
      const m = trimmed.match(/^(```+|~~~+)(.*)$/)
      if (m) {
        inFence = true
        fence = m[1] || '```'
        out.push(line)
        continue
      }
      if (isBase64ish(line)) {
        out.push('<omitted>')
        changed = true
        continue
      }
      out.push(line)
      continue
    }

    if (trimmed.startsWith(fence)) {
      inFence = false
      fence = ''
      out.push(line)
      continue
    }
    if (isBase64ish(line)) {
      out.push('<omitted>')
      changed = true
      continue
    }
    out.push(line)
  }
  return { text: out.join('\n'), changed }
}

export function fixBrokenMarkdownImageSyntax(raw: string): SanitizeMarkdownResult {
  const text = String(raw || '')
  const next = text.replace(/!\s+\[([^\]]*)\]\(/g, '![$1](')
  return { text: next, changed: next !== text }
}

const looksDecorativeSvgHtml = (svg: string): boolean => {
  const lower = String(svg || '').toLowerCase()
  if (!lower.includes('<svg')) return false
  if (/\baria-hidden\s*=\s*["']?\s*true\b/.test(lower)) return true
  if (/\brole\s*=\s*["']\s*presentation\s*["']/.test(lower)) return true
  if (/\bdata-icon\b/.test(lower)) return true
  if (/\bwidth\s*=\s*["'][^"']*em\b/.test(lower) || /\bheight\s*=\s*["'][^"']*em\b/.test(lower)) return true
  if (/<\s*use\b/.test(lower)) {
    const hasSymbol = /<\s*symbol\b/.test(lower) && /\bid\s*=/.test(lower)
    if (!hasSymbol) return true
  }
  return false
}

const extractSvgAlt = (svg: string): string => {
  const s = String(svg || '')
  const m =
    s.match(/\baria-label\s*=\s*["']([^"']+)["']/i) ||
    s.match(/\btitle\s*=\s*["']([^"']+)["']/i) ||
    s.match(/<\s*title[^>]*>([^<]{1,80})<\/\s*title\s*>/i)
  return String(m?.[1] || '').trim()
}

const isGenericSvgAlt = (value: string): boolean => !String(value || '').trim() || /^(插图|图片|image|img|illustration|svg|icon)$/i.test(String(value || '').trim())

export function convertOrDropInlineSvgHtmlBlocks(raw: string): SanitizeMarkdownResult {
  const text = String(raw || '')
  const lines = text.split(/\r?\n/g)
  let inFence = false
  let fence = ''
  let changed = false
  const out: string[] = []
  const maxSvgBase64Chars = 32_000
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()
    if (!inFence) {
      const m = trimmed.match(/^(```+|~~~+)(.*)$/)
      if (m) {
        inFence = true
        fence = m[1] || '```'
        out.push(line)
        continue
      }
      if (/^<\s*svg\b/i.test(trimmed)) {
        const start = i
        let end = -1
        for (let j = i; j < lines.length && j - start < 220; j += 1) {
          if (/<\/\s*svg\s*>/i.test(lines[j] || '')) {
            end = j
            break
          }
        }
        if (end < 0) {
          out.push(line)
          continue
        }
        const svg = lines.slice(start, end + 1).join('\n')
        if (looksDecorativeSvgHtml(svg)) {
          changed = true
          i = end
          continue
        }
        const maxSvgCharsForDataUri = 24_000
        if (svg.length <= maxSvgCharsForDataUri && !/<\s*script\b/i.test(svg)) {
          const alt = extractSvgAlt(svg)
          const b64 = encodeUtf8ToBase64(svg)
          if (b64.length > maxSvgBase64Chars && isGenericSvgAlt(alt)) { changed = true; i = end; continue }
          const url = b64.length <= maxSvgBase64Chars ? `data:image/svg+xml;base64,${b64}` : makeSvgOmittedDataUri(alt)
          out.push(`![${alt}](${url})`)
          changed = true
          i = end
          continue
        }
        out.push(...lines.slice(start, end + 1))
        i = end
        continue
      }
      out.push(line)
      continue
    }
    if (trimmed.startsWith(fence)) {
      inFence = false
      fence = ''
      out.push(line)
      continue
    }
    out.push(line)
  }
  return { text: out.join('\n'), changed }
}
