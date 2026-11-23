import { normalizeInline } from '@/lib/websites/webpageMarkdownArtifactUtils'
import { stripTrailingPunctuation } from '@/lib/websites/webpageMarkdownArtifactUtils'
import { normalizeMarkdownAsciiBlocks } from 'grph-shared/markdown/asciiBlocks'
import { findMarkdownPipeTableEnd, serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

type PricingTier = { title: string; audience: string; lines: string[] }

const PRICING_TIER_TITLES = ['Free License', 'Company License', 'Enterprise License']
const PRICING_FEATURE_LINES = [
  'Create and automate',
  'Commercial use allowed',
  'Unlimited use',
  'Must upgrade when your team grows',
  'Pay according to usage',
  'Prioritized Support',
  '$250 Mux credits',
  'Everything in Company License',
  'Private Slack or Discord',
  'Monthly consulting session',
  'Custom terms, billing and pricing',
  'Compliance forms',
  'Prioritized feature requests',
]

const explodePricingBlob = (raw: string): string[] => {
  const text = normalizeInline(raw)
  if (!text) return []

  const markers = [
    'For individuals and companies of up to 3 people',
    'For collaborations and companies of 4+ people',
    'For advanced needs',
    ...PRICING_TIER_TITLES,
    ...PRICING_FEATURE_LINES,
    'Starting at $500 per month',
    '$100/month',
  ]
  const markerSet = new Set(markers.map(m => m.toLowerCase()))
  const splitRe = new RegExp(`(${markers.map(m => m.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')).join('|')})`, 'gi')

  const parts = text.split(splitRe).map(s => normalizeInline(s)).filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (markerSet.has(key)) {
      if (PRICING_FEATURE_LINES.some(x => x.toLowerCase() === key)) {
        out.push(`- ${p}`)
      } else {
        out.push(p)
      }
      continue
    }
    if (/\]\([^)]+\)/.test(p)) {
      out.push(p)
      continue
    }
    if (/\$\s?\d/.test(p) || /\bper\s+(seat|render|month)\b/i.test(p)) {
      out.push(p)
      continue
    }
    const sentences = p.split(/(?<=[.!?])\s+/).map(s => normalizeInline(s)).filter(Boolean)
    out.push(...sentences)
  }
  return out.filter(Boolean)
}

const normalizePricingSectionLines = (sectionLines: string[]): string[] => {
  const withoutHeading = sectionLines
    .map(l => String(l || ''))
    .filter(l => !/^##\s+Pricing\s*$/i.test(l.trim()))
    .map(l => l.trimEnd())

  const nonEmpty = withoutHeading.filter(l => l.trim() !== '')
  const combined = normalizeInline(nonEmpty.join(' '))
  const hasFree = /Free\s+License/i.test(combined)
  const hasCompany = /Company\s+License/i.test(combined)
  const hasEnterprise = /Enterprise\s+License/i.test(combined)
  const looksCollapsed =
    combined.length >= 250 &&
    (/(?:people|person|companies)Free\s+License/i.test(combined) ||
      /License(?:Create|Commercial|Unlimited|Must)/i.test(combined) ||
      /peopleCompany\s+License/i.test(combined))
  if (hasFree && hasCompany && (hasEnterprise || looksCollapsed)) return explodePricingBlob(combined)
  return withoutHeading
}

const extractPricingSection = (markdown: string): { start: number; end: number; lines: string[] } | null => {
  const lines = String(markdown || '').split(/\r?\n/)
  const start = lines.findIndex(l => /^##\s+Pricing\s*$/i.test(String(l || '').trim()))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(String(lines[i] || '').trim())) {
      end = i
      break
    }
  }
  return { start, end, lines: lines.slice(start, end) }
}

const extractPricingTiers = (sectionLines: string[]): PricingTier[] => {
  const lines = sectionLines.map(l => String(l || '')).map(l => l.trimEnd())

  const tiers: PricingTier[] = []
  let pendingAudience = ''
  let current: PricingTier | null = null

  const flush = () => {
    if (!current) return
    const seen = new Set<string>()
    const cleaned = current.lines
      .map(s => normalizeInline(s))
      .filter(Boolean)
      .filter(s => {
        const k = s.toLowerCase()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    tiers.push({
      title: stripTrailingPunctuation(normalizeInline(current.title)),
      audience: stripTrailingPunctuation(normalizeInline(current.audience)),
      lines: cleaned,
    })
    current = null
  }

  const isTierTitle = (s: string): boolean => {
    const t = stripTrailingPunctuation(normalizeInline(s))
    if (!t) return false
    if (/^(free|company|enterprise)\s+license$/i.test(t)) return true
    return false
  }

  for (const rawLine of lines) {
    const l = rawLine.trim()
    if (!l) continue

    if (/^for\s+\S/i.test(l) && !current) {
      pendingAudience = normalizeInline(l)
      continue
    }
    if (isTierTitle(l)) {
      flush()
      current = { title: normalizeInline(l), audience: pendingAudience, lines: [] }
      pendingAudience = ''
      continue
    }

    if (!current) continue

    if (/^for\s+\S/i.test(l) && !current.audience) {
      current.audience = normalizeInline(l)
      continue
    }

    const bullet = l.match(/^\s*[-*+]\s+(.+?)\s*$/)
    if (bullet) {
      current.lines.push(`- ${bullet[1] || ''}`)
      continue
    }

    if (/^\[\s*[xX ]\s*\]\s+/.test(l)) {
      current.lines.push(l)
      continue
    }

    if (/\$\s?\d/.test(l) || /per\s+(seat|render|month)/i.test(l)) {
      current.lines.push(l)
      continue
    }

    if (current.lines.length < 8) current.lines.push(l)
  }
  flush()
  return tiers
}

const renderPricingTiersMarkdownTable = (tiers: PricingTier[]): string => {
  const wanted = ['free license', 'company license', 'enterprise license']
  const picked = tiers
    .filter(t => wanted.includes(t.title.toLowerCase()))
    .sort((a, b) => wanted.indexOf(a.title.toLowerCase()) - wanted.indexOf(b.title.toLowerCase()))
    .slice(0, 3)

  if (picked.length < 2) return ''

  const cols = 3
  while (picked.length < cols) picked.push({ title: '', audience: '', lines: [] })

  const header = picked.map(t => t.title || '')
  const bodies = picked.map(t => {
    const out: string[] = []
    if (t.audience) out.push(t.audience)
    for (const ln of t.lines) {
      if (out.length >= 7) break
      out.push(ln)
    }
    return out
  })
  const rowCount = Math.max(2, ...bodies.map(b => b.length))
  const rows = Array.from({ length: rowCount }, (_, index) => [
    bodies[0]?.[index] || '',
    bodies[1]?.[index] || '',
    bodies[2]?.[index] || '',
  ])
  return serializeMarkdownPipeTable({ columns: header, rows }).join('\n')
}

const splitNonEmptyLines = (text: string): string[] => {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
}

const escapeMarkdownText = (raw: string): string => {
  const s = String(raw || '')
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim()
}

const coalesceNavLinksToTable = (markdown: string): string => {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n')
  let inFence = false
  const maxScan = Math.min(lines.length, 140)
  const linkRe = /(!?\[[^\]]+\]\([^)]+\))/g
  for (let i = 0; i < maxScan; i += 1) {
    const rawLine = String(lines[i] || '')
    const trimmed = rawLine.trim()
    if (/^```/.test(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (!trimmed) continue
    if (trimmed.includes('|')) continue

    const matches = trimmed.match(linkRe) || []
    if (matches.length < 4 || matches.length > 8) continue

    const remainder = trimmed.replace(linkRe, '').replace(/\s+/g, '')
    if (remainder) continue

    const cells = matches.map(m => m.trim()).filter(Boolean)
    if (cells.length < 4) continue

    const [header = '', sep = ''] = serializeMarkdownPipeTable({ columns: cells, rows: [] })
    lines[i] = header
    lines.splice(i + 1, 0, sep, '')
    break
  }
  for (let i = 0; i < maxScan; i += 1) {
    const trimmed = String(lines[i] || '').trim()
    if (!trimmed || trimmed.includes('|')) continue
    const cells: string[] = []
    let consumed = 0
    for (let j = i; j < maxScan && cells.length < 8; j += 1) {
      const candidate = String(lines[j] || '').trim()
      if (!candidate || candidate.includes('|')) break
      const matches = candidate.match(linkRe) || []
      const remainder = candidate.replace(linkRe, '').replace(/\s+/g, '')
      if (matches.length !== 1 || remainder) break
      cells.push(matches[0].trim())
      consumed += 1
    }
    if (cells.length < 4) continue
    const [header = '', sep = ''] = serializeMarkdownPipeTable({ columns: cells, rows: [] })
    lines.splice(i, consumed, header, sep, '')
    break
  }
  return lines.join('\n')
}

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

const stripHtmlTags = (html: string): string => {
  const s = String(html || '')
  const noTags = s.replace(/<[^>]+>/g, ' ')
  return decodeHtmlEntitiesBasic(noTags).replace(/\s+/g, ' ').trim()
}

const coalesceHtmlNavOrGridBlockToTable = (markdown: string): string => {
  const raw = String(markdown || '').replace(/\r/g, '').trim()
  if (!raw) return ''
  const blocks = raw.split(/\n{2,}/g).map(b => String(b || '').trim()).filter(Boolean)
  const out: string[] = []

  for (const b of blocks) {
    const lower = b.toLowerCase()
    const looksHtmlBlock = b.startsWith('<') && b.includes('>') && !b.startsWith('```')
    const looksGrid =
      /display\s*:\s*(grid|inline-grid|flex|inline-flex)/i.test(lower) ||
      /grid-template-columns|grid-template-rows|grid-auto-flow|column-count|column-width|flex-wrap/i.test(lower) ||
      /\bclass\s*=\s*["'][^"']*(?:\bgrid\b|\binline-grid\b|\bgrid-cols-\d+|\bgrid-rows-\d+|\bflex\b|\binline-flex\b|\bflex-wrap\b)[^"']*["']/.test(
        lower,
      )
    if (!looksHtmlBlock || !looksGrid) {
      out.push(b)
      continue
    }

    const anchors: Array<{ href: string; text: string; imgSrc?: string; imgAlt?: string }> = []
    const aRe = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi
    let m: RegExpExecArray | null
    aRe.lastIndex = 0
    while ((m = aRe.exec(b))) {
      const href = String(m[1] || m[2] || m[3] || '').trim()
      const inner = String(m[4] || '')
      const imgSrc = (() => {
        const mm =
          inner.match(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i) ||
          inner.match(/<img\b[^>]*\bdata-src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)
        return mm ? String(mm[1] || mm[2] || mm[3] || '').trim() : ''
      })()
      const imgAlt = (() => {
        const mm = inner.match(/<img\b[^>]*\balt\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)
        return mm ? String(mm[1] || mm[2] || mm[3] || '').trim() : ''
      })()
      const text = stripHtmlTags(inner) || imgAlt || ''
      if (!href) continue
      if (!text && !imgSrc) continue
      anchors.push({ href, text, imgSrc: imgSrc || undefined, imgAlt: imgAlt || undefined })
      if (anchors.length >= 24) break
    }

    const candidates = anchors.filter(a => {
      if (!a.href || a.href.length > 600) return false
      if (a.imgSrc) return a.imgSrc.length <= 600
      return !!a.text && a.text.length <= 64
    })

    const mkCell = (a: { href: string; text: string; imgSrc?: string; imgAlt?: string }): string => {
      const href = escapeMarkdownText(a.href)
      const imgSrc = a.imgSrc ? escapeMarkdownText(a.imgSrc) : ''
      const label = (() => {
        if (!imgSrc) return escapeMarkdownText(a.text || '')
        const alt = escapeMarkdownText(String(a.imgAlt || a.text || ''))
        return `![${alt}](${imgSrc})`
      })()
      return `[${label}](${href})`
    }
    const cells = candidates.map(mkCell)
    const anyImages = candidates.some(c => !!c.imgSrc)

    if (cells.length >= 4 && cells.length <= 8 && !anyImages) {
      out.push(serializeMarkdownPipeTable({ columns: cells, rows: [] }).join('\n'))
      continue
    }

    if (cells.length >= 4) {
      const n = cells.length
      const colCount = n >= 9 ? 4 : n >= 7 ? 4 : n >= 5 ? 3 : 2
      const rows: string[][] = []
      for (let i = 0; i < cells.length; i += colCount) {
        const row = cells.slice(i, i + colCount)
        while (row.length < colCount) row.push(' ')
        rows.push(row)
      }
      out.push(serializeMarkdownPipeTable({ columns: new Array(colCount).fill(' '), rows }).join('\n'))
      continue
    }

    if (candidates.length >= 3) {
      out.push(candidates.map(a => `- ${mkCell(a)}`).join('\n'))
      continue
    }

    out.push(b)
  }

  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

const isPlainCardBlock = (block: string): boolean => {
  const raw = String(block || '').trim()
  if (!raw) return false
  if (
    raw.startsWith('```') ||
    findMarkdownPipeTableEnd(raw.split('\n', 2), 0) > 0 ||
    raw.startsWith('#') ||
    raw.startsWith('* ') ||
    raw.startsWith('- ') ||
    raw.startsWith('> ')
  ) {
    return false
  }
  if (raw.includes('<') || raw.includes('](')) return false
  const lines = splitNonEmptyLines(raw)
  if (lines.length < 3 || lines.length > 16) return false
  const tooLong = lines.some(l => l.length > 96)
  if (tooLong) return false
  const avg = lines.reduce((s, l) => s + l.length, 0) / Math.max(1, lines.length)
  if (avg > 64) return false
  return true
}

const isPlainListBlock = (block: string): boolean => {
  const raw = String(block || '').trim()
  if (!raw) return false
  if (
    raw.startsWith('```') ||
    findMarkdownPipeTableEnd(raw.split('\n', 2), 0) > 0 ||
    raw.startsWith('#') ||
    raw.startsWith('* ') ||
    raw.startsWith('- ') ||
    raw.startsWith('> ')
  ) {
    return false
  }
  if (raw.includes('<') || raw.includes('](')) return false
  const lines = splitNonEmptyLines(raw)
  if (lines.length < 3 || lines.length > 24) return false
  const tooLong = lines.some(l => l.length > 96)
  if (tooLong) return false
  const avg = lines.reduce((s, l) => s + l.length, 0) / Math.max(1, lines.length)
  if (avg > 72) return false
  return true
}

const pickCardTitle = (lines: string[]): { title: string; rest: string[] } => {
  const first = lines.slice(0, 3)
  let bestIdx = 0
  let bestLen = Number.POSITIVE_INFINITY
  for (let i = 0; i < first.length; i += 1) {
    const l = first[i] || ''
    const len = l.length
    if (len >= 3 && len <= 48 && len < bestLen) {
      bestLen = len
      bestIdx = i
    }
  }
  const title = lines[bestIdx] || lines[0] || 'Card'
  const rest = lines.filter((_, i) => i !== bestIdx)
  return { title, rest }
}

const escapeTableCell = (text: string): string => {
  return escapeMarkdownText(String(text || '')).replace(/\\\|/g, '|').trim()
}

const formatPlainLinesAsBulletsInTableCell = (lines: string[]): string => {
  const items = lines.map(l => String(l || '').trim()).filter(Boolean)
  if (!items.length) return ''
  return items.map(it => escapeTableCell(it)).join(' · ')
}

const normalizeBlockMarkdown = (block: string): string => {
  const raw = String(block || '').trim()
  if (!raw) return ''
  if (isPlainListBlock(raw)) {
    const lines = splitNonEmptyLines(raw)
    return lines.map(l => `- ${escapeMarkdownText(l)}`).join('\n')
  }
  return raw
}

const coalesceCardBlocksToMarkdownTable = (blocks: string[]): string[] => {
  const out: string[] = []
  let i = 0
  while (i < blocks.length) {
    const cur = blocks[i] || ''
    if (!isPlainCardBlock(cur)) {
      out.push(normalizeBlockMarkdown(cur))
      i += 1
      continue
    }
    const group: string[] = []
    let j = i
    while (j < blocks.length && group.length < 4) {
      const b = blocks[j] || ''
      if (!isPlainCardBlock(b)) break
      group.push(b)
      j += 1
    }
    if (group.length < 2) {
      out.push(normalizeBlockMarkdown(cur))
      i += 1
      continue
    }
    const parsed = group.map(b => splitNonEmptyLines(b))
    const cards = parsed.map(lines => pickCardTitle(lines))
    const headers = cards.map(c => escapeTableCell(c.title))
    const cells = cards.map(c => formatPlainLinesAsBulletsInTableCell(c.rest))
    out.push(serializeMarkdownPipeTable({ columns: headers, rows: [cells] }).join('\n'))
    i = j
  }
  return out
}

const coalesceWebpageMarkdownBlocks = (markdown: string): string => {
  const raw = String(markdown || '').replace(/\r/g, '').trim()
  if (!raw) return ''
  const blocks = raw.split(/\n{2,}/g).map(b => String(b || '').trim()).filter(Boolean)
  const coalesced = coalesceCardBlocksToMarkdownTable(blocks)
  return coalesced.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function postprocessWebpageMarkdownSsot(markdown: string): string {
  let base = normalizeMarkdownAsciiBlocks(markdown)
  base = coalesceNavLinksToTable(base)
  base = coalesceHtmlNavOrGridBlockToTable(base)
  base = coalesceWebpageMarkdownBlocks(base)

  const pricing = extractPricingSection(base)
  if (!pricing) return base

  const sectionText = pricing.lines.join('\n')
  if (/\|\s*Free License\s*\|[\s\S]*\|\s*:?-{3,}/m.test(sectionText)) return base

  const normalizedPricingLines = normalizePricingSectionLines(pricing.lines)
  const tiers = extractPricingTiers(normalizedPricingLines)
  const table = renderPricingTiersMarkdownTable(tiers)
  if (!table) return base

  const lines = base.split(/\r?\n/)
  const before = lines.slice(0, pricing.start)
  const after = lines.slice(pricing.end)
  const replacement = ['## Pricing', '', table, ''].join('\n')
  return [...before, replacement.trimEnd(), ...after].join('\n').replace(/\n{3,}/g, '\n\n')
}
