import { hostFromUrl } from './websitePathUtils'

export type WebsiteCollectionRecord = {
  sourceUrl: string
  sourcePageUrl?: string
  recordType?: string
  title: string
  location?: string
  status?: string
  timeline?: string
  prize?: string
  participants?: string
  organizer?: string
  tagsText?: string
}

type ConversionPayload = {
  collectionRecords?: unknown
}

const normalizeText = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim()

const cleanMarkdownLabel = (value: string): string => normalizeText(
  String(value || '')
    .replace(/\*\*/g, '')
    .replace(/\\([()[\]{}_])/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&'),
)

const readMarkdownLink = (line: string): { label: string; href: string } | null => {
  const match = String(line || '').trim().match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
  if (!match) return null
  return {
    label: cleanMarkdownLabel(match[1] || ''),
    href: normalizeText(match[2] || ''),
  }
}

const readMarkdownHeadingLink = (line: string): { label: string; href: string } | null => {
  const match = String(line || '').trim().match(/^### \[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
  if (!match) return null
  return {
    label: cleanMarkdownLabel(match[1] || ''),
    href: normalizeText(match[2] || ''),
  }
}

const isDevpostHackathonsUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'devpost.com' && parsed.pathname.replace(/\/+$/, '') === '/hackathons'
  } catch {
    return false
  }
}

const looksLikeDevpostDateRange = (text: string): boolean => /\b[A-Z][a-z]{2} \d{2} - [A-Z][a-z]{2} \d{2}, \d{4}\b/.test(text)

const isLikelyDevpostStatusLine = (text: string): boolean => {
  const lowered = text.toLowerCase()
  return lowered.includes('left')
    || lowered.includes('ended')
    || lowered.includes('submissions')
    || lowered.includes('open')
}

const isLikelyDevpostPrizeLine = (text: string): boolean => /(?:^| )in prizes\b/i.test(text)

const isLikelyDevpostParticipantsLine = (text: string): boolean => /\bparticipants?\b/i.test(text)

const isLikelyDevpostLocationLine = (text: string): boolean => /^(online|in-person)$/i.test(text)

function extractDevpostHackathonCollectionRecordsFromMarkdown(markdown: string): WebsiteCollectionRecord[] {
  const lines = String(markdown || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const records: WebsiteCollectionRecord[] = []
  const seen = new Set<string>()
  for (let index = 0; index < lines.length; index += 1) {
    const heading = readMarkdownHeadingLink(lines[index] || '')
    if (!heading) continue
    const key = `${heading.href}::${heading.label}`
    if (seen.has(key)) continue
    seen.add(key)
    const record: WebsiteCollectionRecord = {
      recordType: 'hackathon',
      sourceUrl: heading.href,
      sourcePageUrl: heading.href,
      title: heading.label,
    }
    for (let lookback = index - 1; lookback >= Math.max(0, index - 3); lookback -= 1) {
      const previous = readMarkdownLink(lines[lookback] || '')
      if (!previous) continue
      if (isLikelyDevpostLocationLine(previous.label)) {
        record.location = previous.label
        break
      }
    }
    for (let next = index + 1; next < lines.length && next < index + 10; next += 1) {
      if (readMarkdownHeadingLink(lines[next] || '')) break
      const link = readMarkdownLink(lines[next] || '')
      if (!link) continue
      const label = link.label
      if (!label || label === 'Featured') continue
      if (!record.location && isLikelyDevpostLocationLine(label)) {
        record.location = label
        continue
      }
      if (!record.status && isLikelyDevpostStatusLine(label) && !looksLikeDevpostDateRange(label)) {
        record.status = label
        continue
      }
      if (!record.timeline && looksLikeDevpostDateRange(label)) {
        record.timeline = label
        continue
      }
      if (!record.prize && isLikelyDevpostPrizeLine(label)) {
        record.prize = label
        continue
      }
      if (!record.participants && isLikelyDevpostParticipantsLine(label)) {
        record.participants = label
        continue
      }
      const couldBeTags = !/[()]/.test(label)
        && /\b(beginner friendly|machine learning\/ai|social good|low\/no code|design|blockchain|health|web|ar\/vr|education|productivity|gaming|fintech|iot|cybersecurity|mobile|devops|databases|enterprise)\b/i.test(label)
      if (!record.tagsText && couldBeTags) {
        record.tagsText = label
        continue
      }
      if (!record.organizer) {
        record.organizer = label
      }
    }
    records.push(record)
  }
  return records
}

export function extractWebsiteCollectionRecords(args: {
  url: string
  markdown?: string | null
}): WebsiteCollectionRecord[] {
  const url = normalizeText(args.url)
  const markdown = String(args.markdown || '')
  if (!url || !markdown) return []
  if (isDevpostHackathonsUrl(url)) return extractDevpostHackathonCollectionRecordsFromMarkdown(markdown)
  return []
}

export function parseWebsiteCollectionRecordsFromConversionJson(raw: string): WebsiteCollectionRecord[] {
  const text = String(raw || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as ConversionPayload
    const rows = Array.isArray(parsed.collectionRecords) ? parsed.collectionRecords : []
    return rows.flatMap(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return []
      const record = row as Record<string, unknown>
      const sourceUrl = normalizeText(record.sourceUrl)
      const title = normalizeText(record.title)
      if (!sourceUrl || !title) return []
      return [{
        sourceUrl,
        sourcePageUrl: normalizeText(record.sourcePageUrl),
        recordType: normalizeText(record.recordType),
        title,
        location: normalizeText(record.location),
        status: normalizeText(record.status),
        timeline: normalizeText(record.timeline),
        prize: normalizeText(record.prize),
        participants: normalizeText(record.participants),
        organizer: normalizeText(record.organizer),
        tagsText: normalizeText(record.tagsText),
      } satisfies WebsiteCollectionRecord]
    })
  } catch {
    return []
  }
}

export function summarizeWebsiteCollectionRecordSource(url: string): string {
  const host = normalizeText(hostFromUrl(url))
  if (!host) return 'collection'
  return host
}
