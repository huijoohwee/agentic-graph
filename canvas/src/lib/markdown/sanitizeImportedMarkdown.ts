import { sanitizeImportedMarkdownUnsafeMediaLinks } from './sanitizeImportedMarkdownSafety'
import { normalizeStandaloneHtmlLayoutBlocksToMarkdown } from './sanitizeImportedMarkdownHtmlLayout'
import { normalizeLeadingStrongTitleToH1, normalizeMarkdownDecorationResidue, normalizeMarkdownImageProseAdjacency, normalizeVerticalCjkHeadingRuns } from './sanitizeImportedMarkdownStructure'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

export type SanitizeMarkdownResult = { text: string; changed: boolean }

export type SanitizeImportedMarkdownOptions = { sourceUrl?: string }

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

const SVG_OMITTED_PLACEHOLDER_DATA_URI = `data:image/svg+xml;base64,${encodeUtf8ToBase64(SVG_OMITTED_PLACEHOLDER_SVG)}`

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

export function sanitizeImportedMarkdownText(raw: string, opts?: SanitizeImportedMarkdownOptions): SanitizeMarkdownResult {
  const sourceUrl = String(opts?.sourceUrl || '').trim()
  const decodeHtmlEntitiesBasic = (text: string): string => {
    const src = String(text || '')
    if (!src.includes('&')) return src
    return src
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
  }
  const isLikelyImageHref = (href: string): boolean => {
    const raw = String(href || '').trim()
    if (!raw) return false
    if (/^data:image\//i.test(raw)) return true
    return /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(raw)
  }

  const normalizeStandaloneImageAutolinks = (text: string): SanitizeMarkdownResult => {
    const lines = String(text || '').split(/\r?\n/g)
    let inFence = false
    let fence = ''
    let changed = false
    const out: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      const mFence = trimmed.match(/^(```+|~~~+)(.*)$/)
      if (mFence) {
        if (!inFence) {
          inFence = true
          fence = mFence[1] || '```'
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
      const mAngle = trimmed.match(/^<\s*(https?:\/\/[^>\s]+)\s*>$/i)
      if (mAngle) {
        const url = String(mAngle[1] || '').trim()
        if (isLikelyImageHref(url)) {
          out.push(`![](${url})`)
          changed = true
          continue
        }
      }
      const mBare = trimmed.match(/^(https?:\/\/\S+)$/i)
      if (mBare) {
        const url = String(mBare[1] || '').trim()
        const cleaned = url.replace(/[)\].,;:!?]+$/g, v => (v === ')' || v === ']' ? v : ''))
        if (cleaned && isLikelyImageHref(cleaned)) {
          out.push(`![](${cleaned})`)
          changed = true
          continue
        }
      }
      out.push(line)
    }
    return { text: out.join('\n'), changed }
  }

  const normalizeStandaloneHtmlHeadingsToAtx = (text: string): SanitizeMarkdownResult => {
    const raw = String(text || '')
    if (!raw) return { text: raw, changed: false }
    if (!/<h[1-6]\b/i.test(raw)) return { text: raw, changed: false }
    const lines = raw.split(/\r?\n/g)
    let inFence = false
    let fence = ''
    let changed = false
    const out: string[] = []
    const simplifyInlineHtml = (s: string): string => {
      let x = String(s || '')
      x = x.replace(/<\s*br\s*\/?\s*>/gi, '\n')
      x = x.replace(/<\s*(strong|b)\s*>/gi, '**').replace(/<\s*\/\s*(strong|b)\s*>/gi, '**')
      x = x.replace(/<\s*(em|i)\s*>/gi, '_').replace(/<\s*\/\s*(em|i)\s*>/gi, '_')
      x = x.replace(/<[^>]+>/g, '')
      x = x.replace(/&nbsp;/gi, ' ')
      x = x.replace(/\s+/g, ' ').trim()
      return x
    }
    for (const line of lines) {
      const trimmed = line.trim()
      const mFence = trimmed.match(/^(```+|~~~+)(.*)$/)
      if (mFence) {
        if (!inFence) {
          inFence = true
          fence = mFence[1] || '```'
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
      const m = trimmed.match(/^<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>\s*$/i)
      if (!m) {
        out.push(line)
        continue
      }
      const depth = Number(m[1]) || 1
      const inner = simplifyInlineHtml(m[2] || '')
      if (!inner) {
        out.push(line)
        continue
      }
      out.push(`${'#'.repeat(Math.min(6, Math.max(1, depth)))} ${inner}`)
      changed = true
    }
    return { text: changed ? out.join('\n') : raw, changed }
  }

  const normalizeStandaloneHtmlTablesToMarkdown = (text: string): SanitizeMarkdownResult => {
    const raw = String(text || '')
    if (!/<table\b/i.test(raw)) return { text: raw, changed: false }

    const tableBlockToMarkdown = (block: string): string => {
      const html = String(block || '')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<\s*(script|style)\b[\s\S]*?<\/\s*\1\s*>/gi, ' ')

      const normalizeCellText = (cellHtml: string): string => {
        const withBreaks = String(cellHtml || '').replace(/<\s*br\s*\/?>/gi, ' ')
        const textOnly = decodeHtmlEntitiesBasic(withBreaks.replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim()
        return textOnly || ' '
      }

      const rows: Array<{ cells: string[]; header: boolean }> = []
      const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi
      let rowMatch: RegExpExecArray | null
      while ((rowMatch = rowRe.exec(html))) {
        const rowHtml = String(rowMatch[1] || '')
        const cells: string[] = []
        let header = false
        const cellRe = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi
        let cellMatch: RegExpExecArray | null
        while ((cellMatch = cellRe.exec(rowHtml))) {
          const tag = String(cellMatch[1] || '').toLowerCase()
          if (tag === 'th') header = true
          cells.push(normalizeCellText(String(cellMatch[2] || '')))
        }
        if (cells.length > 0) rows.push({ cells, header })
      }

      if (rows.length === 0) {
        return decodeHtmlEntitiesBasic(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
      }

      const columnCount = rows.reduce((max, row) => Math.max(max, row.cells.length), 0)
      const padCells = (cells: string[]): string[] => {
        const next = cells.slice()
        while (next.length < columnCount) next.push(' ')
        return next
      }

      const headerRowIndex = rows.findIndex(row => row.header)
      const headerCells =
        headerRowIndex === 0
          ? padCells(rows[0]?.cells || [])
          : Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`)
      const bodyRows =
        headerRowIndex === 0
          ? rows.slice(1).map(row => padCells(row.cells))
          : rows.map(row => padCells(row.cells))

      return serializeMarkdownPipeTable({
        columns: headerCells,
        rows: bodyRows,
      }).join('\n').trim()
    }

    const lines = raw.split(/\r?\n/g)
    let inFence = false
    let fence = ''
    let changed = false
    const out: string[] = []

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? ''
      const trimmed = line.trim()
      const mFence = trimmed.match(/^(```+|~~~+)(.*)$/)
      if (mFence) {
        if (!inFence) {
          inFence = true
          fence = mFence[1] || '```'
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
      if (!/<table\b/i.test(line)) {
        out.push(line)
        continue
      }

      let end = i
      let foundEnd = /<\/table\s*>/i.test(line)
      while (!foundEnd && end + 1 < lines.length && end - i < 240) {
        end += 1
        foundEnd = /<\/table\s*>/i.test(String(lines[end] || ''))
      }
      if (!foundEnd) {
        out.push(line)
        continue
      }

      const block = lines.slice(i, end + 1).join('\n')
      const next = tableBlockToMarkdown(block)
      if (next && next !== block.trim()) changed = true
      out.push(next || '')
      i = end
    }

    return { text: changed ? out.join('\n') : raw, changed }
  }

  const normalizeStandaloneInteractiveHtmlBlocks = (text: string): SanitizeMarkdownResult => {
    const raw = String(text || '')
    if (!/<(?:div|button|a)\b/i.test(raw)) return { text: raw, changed: false }

    const interactiveBlockToMarkdown = (block: string): string => {
      const html = String(block || '')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<\s*(script|style)\b[\s\S]*?<\/\s*\1\s*>/gi, ' ')
      let next = html
      next = next.replace(/<\s*br\s*\/?>/gi, '\n')
      next = next.replace(/<\/\s*(div|p|li|button|a|section|article|header|footer|h[1-6])\s*>/gi, '\n')
      next = next.replace(/<\s*(div|p|li|button|a|section|article|header|footer|h[1-6])\b[^>]*>/gi, '\n')
      next = decodeHtmlEntitiesBasic(next.replace(/<[^>]+>/g, ' '))
      const lines = next
        .split(/\r?\n/g)
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
      const deduped = lines.filter((line, index) => line !== lines[index - 1])
      return deduped.join('\n').trim()
    }

    const countTagMatches = (source: string, pattern: RegExp): number => {
      const matches = source.match(pattern)
      return matches ? matches.length : 0
    }

    const lines = raw.split(/\r?\n/g)
    let inFence = false
    let fence = ''
    let changed = false
    const out: string[] = []

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? ''
      const trimmed = line.trim()
      const mFence = trimmed.match(/^(```+|~~~+)(.*)$/)
      if (mFence) {
        if (!inFence) {
          inFence = true
          fence = mFence[1] || '```'
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

      const startMatch = trimmed.match(
        /^<(div|button|a)\b[^>]*(role\s*=\s*["']button["']|tabindex\s*=\s*["']0["']|aria-disabled\s*=|cursor-pointer|hover:)[^>]*>/i,
      )
      if (!startMatch) {
        out.push(line)
        continue
      }

      const rootTag = String(startMatch[1] || '').toLowerCase()
      let end = i
      let depth =
        countTagMatches(line, new RegExp(`<${rootTag}\\b`, 'gi'))
        - countTagMatches(line, new RegExp(`</${rootTag}\\s*>`, 'gi'))

      while (depth > 0 && end + 1 < lines.length && end - i < 240) {
        end += 1
        const nextLine = String(lines[end] || '')
        depth += countTagMatches(nextLine, new RegExp(`<${rootTag}\\b`, 'gi'))
        depth -= countTagMatches(nextLine, new RegExp(`</${rootTag}\\s*>`, 'gi'))
      }

      const block = lines.slice(i, end + 1).join('\n')
      const next = interactiveBlockToMarkdown(block)
      if (next && next !== block.trim()) changed = true
      out.push(next || '')
      i = end
    }

    return { text: changed ? out.join('\n') : raw, changed }
  }

  const normalizeAtxHeadingWhitespace = (text: string): SanitizeMarkdownResult => {
    const raw = String(text || '')
    if (!raw) return { text: raw, changed: false }
    const needsNormalize =
      /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF\u200B\u200C\u200D]/.test(raw) || /^#{1,6}\S/m.test(raw)
    if (!needsNormalize) return { text: raw, changed: false }
    const lines = raw.split(/\r?\n/g)
    let inFence = false
    let fence = ''
    let changed = false
    const out: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      const mFence = trimmed.match(/^(```+|~~~+)(.*)$/)
      if (mFence) {
        if (!inFence) {
          inFence = true
          fence = mFence[1] || '```'
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
      if (/^[ \t]{4,}/.test(line)) {
        out.push(line)
        continue
      }
      const m = line.match(
        /^([ \t]{0,3})([\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF\u200B\u200C\u200D]*)(#{1,6})([ \t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]*)(.*)$/,
      )
      if (!m) {
        out.push(line)
        continue
      }
      const indent = m[1] || ''
      const prefix = m[2] || ''
      const hashes = m[3] || '#'
      const ws = m[4] || ''
      const rest = m[5] || ''
      if (rest.trim() === '') {
        out.push(line)
        continue
      }
      const hadWeirdWs = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/.test(ws)
      const hasAnyWs = ws.length > 0
      if (prefix || !hasAnyWs || hadWeirdWs) {
        const next = `${indent}${hashes} ${rest.replace(/^\s+/, '')}`
        if (next !== line) changed = true
        out.push(next)
        continue
      }
      out.push(line)
    }
    return { text: out.join('\n'), changed }
  }

  const normalizeHeadingsSingleH1 = (text: string): SanitizeMarkdownResult => {
    const lines = String(text || '').split(/\r?\n/g)
    let inFence = false
    let fence = ''
    let seenTitle = false
    let demote = 0
    let changed = false
    let totalH1 = 0
    const out: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      const fm = trimmed.match(/^(```+|~~~+)(.*)$/)
      if (fm) {
        if (!inFence) {
          inFence = true
          fence = fm[1] || '```'
        } else if (trimmed.startsWith(fence)) {
          inFence = false
          fence = ''
        }
        continue
      }
      if (inFence) continue
      if (/^#\s+\S/.test(trimmed)) totalH1 += 1
    }
    if (totalH1 < 2) return { text, changed: false }

    inFence = false
    fence = ''
    for (const line of lines) {
      const trimmed = line.trim()
      const fm = trimmed.match(/^(```+|~~~+)(.*)$/)
      if (fm) {
        if (!inFence) {
          inFence = true
          fence = fm[1] || '```'
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
      const m = line.match(/^(#{1,6})(\s+)(.*)$/)
      if (!m) {
        out.push(line)
        continue
      }
      const hashes = m[1] || '#'
      const ws = m[2] || ' '
      const rest = m[3] || ''
      const depth = hashes.length
      if (depth === 1 && !seenTitle) {
        seenTitle = true
        out.push(line)
        continue
      }
      if (depth === 1) demote = 1
      if (demote <= 0) {
        out.push(line)
        continue
      }
      const nextDepth = Math.min(6, depth + demote)
      const nextLine = `${'#'.repeat(nextDepth)}${ws}${rest}`
      if (nextLine !== line) changed = true
      out.push(nextLine)
    }
    return { text: out.join('\n'), changed }
  }

  const a0 = fixBrokenMarkdownImageSyntax(raw)
  const a1 = removeImagesInsideLinkLabelsWhenTextExists(a0.text)
  const a1b = sanitizeImportedMarkdownUnsafeMediaLinks(a1.text)
  const a2 = convertOrDropInlineSvgHtmlBlocks(a1b.text)
  const a3 = stripHeadingPermalinkArtifacts(a2.text, { sourceUrl })
  const a4 = normalizeStandaloneImageAutolinks(a3.text)
  const a4b = normalizeStandaloneHtmlLayoutBlocksToMarkdown(a4.text)
  const a4c = normalizeMarkdownImageProseAdjacency(a4b.text), a4d = normalizeLeadingStrongTitleToH1(a4c.text)
  const a4e = normalizeVerticalCjkHeadingRuns(a4d.text), a4f = normalizeMarkdownDecorationResidue(a4e.text)
  const a5 = normalizeStandaloneHtmlTablesToMarkdown(a4f.text), a6 = normalizeStandaloneInteractiveHtmlBlocks(a5.text)
  const a7 = normalizeStandaloneHtmlHeadingsToAtx(a6.text), a8 = normalizeAtxHeadingWhitespace(a7.text)
  const b = stripEmbeddedBase64ImageSrc(a8.text), c = stripLargeBase64Fences(b.text)
  const d = (() => {
    const text = c.text
    if (!sourceUrl) return { text, changed: false }
    const lines = String(text || '').split(/\r?\n/g)
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
      if (
        line.includes(SVG_OMITTED_PLACEHOLDER_DATA_URI) &&
        /!\[[^\]]*\]\(data:image\/svg\+xml;base64,[^)]+\)/i.test(line) &&
        !/\[source\]\(/i.test(line)
      ) {
        out.push(`${line} ([source](${sourceUrl}))`)
        changed = true
        continue
      }
      out.push(line)
    }
    return { text: out.join('\n'), changed }
  })()
  const e = normalizeHeadingsSingleH1(d.text)
  const changed = a0.changed || a1.changed || a1b.changed || a2.changed || a3.changed || a4.changed || a4b.changed || a4c.changed || a4d.changed || a4e.changed || a4f.changed || a5.changed || a6.changed || a7.changed || a8.changed || b.changed || c.changed || d.changed || e.changed
  return { text: e.text, changed }
}
