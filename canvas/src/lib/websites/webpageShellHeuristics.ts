const WEBPAGE_SHELL_PATTERN_SOURCES = [
  'failed\\s+to\\s+load\\s+posts',
  'enable[-\\s]*javascript\\.com',
  'requires\\s+java\\s*script',
  "can't\\s+reach\\s+[a-z0-9._-]+",
  'check\\s+your\\s+connection',
  '\\bloading\\s+(shared|report|document|page|workspace|content|article|post|chat|thread|conversation)\\b',
  '^loading\\s*(?:\\.\\.\\.)?(?:\\s|<|$)',
  '\\b(open|get|download|install)\\s+app\\b',
  '\\bplease\\s+wait\\b',
] as const

export const WEBPAGE_SHELL_PATTERN_REGEX_SOURCES = [...WEBPAGE_SHELL_PATTERN_SOURCES]

const WEBPAGE_SHELL_PATTERNS = WEBPAGE_SHELL_PATTERN_SOURCES.map(source => new RegExp(source, 'i'))
const WEBPAGE_CONNECTION_FAILURE_PATTERN = /failed\s+to\s+load\s+posts|enable[-\s]*javascript\.com|requires\s+java\s*script|can't\s+reach\s+[a-z0-9._-]+|check\s+your\s+connection/i

const WEBPAGE_SHELL_CHROME_CUE_REGEX =
  /\b(get|open|download|install|launch|continue)\s+app\b|\b(sign\s*in|sign\s*up|log\s*in|log\s*on|visit\s+website|visit\s+site|app\s+store|google\s+play)\b/gi

const WEBPAGE_SHELL_SHARED_SURFACE_REGEX = /\bshared\s+(chat|conversation|report|document|page|thread)\b/i

const WEBPAGE_SHELL_HTML_CHROME_TAG_REGEX = /<\/?(div|span|header|nav|footer|main|section|aside|button|svg|dialog|menu)\b/gi

const WEBPAGE_SHELL_ACTION_ELEMENT_REGEX = /\[[^\]]{1,80}\]\([^)]+\)|<a\b|<button\b/gi

const WEBPAGE_SHELL_PROMO_LINE_REGEX =
  /\b(?:app\s+is\s+now\s+available|critical\s+review\s+is\s+advised)\b/i

const WEBPAGE_SHELL_COOKIE_LINE_REGEX =
  /\b(?:we\s+use\s+cookies|cookie\s+policy|manage\s+cookies|reject\s+non-essential|accept\s+all)\b/i

const WEBPAGE_COOKIE_CONSENT_CATEGORY_REGEXES = [
  /\bessential\b/i,
  /\bperformance\b/i,
  /\bfunctional\b/i,
  /\badvertising\b/i,
  /\banalytics\b/i,
  /\btargeting\b/i,
] as const

const WEBPAGE_COOKIE_CONSENT_ACTION_REGEX =
  /\b(?:allowed|always\s+active|accept\s+all|reject\s+(?:all|non-essential)|save\s+(?:settings|preferences)|privacy\s+preferences)\b/i

const WEBPAGE_COOKIE_CONSENT_COPY_REGEX =
  /\b(?:cookies?\s+are\s+necessary|cannot\s+be\s+deactivated|third\s+part(?:y|ies)|our\s+site\s+and\s+services|site\s+features|marketing\s+content|anonymous\s+statistics|similar\s+tools)\b/i

const WEBPAGE_SHELL_CHROME_ACTION_LINE_REGEX =
  /^(?:get|open|download|install)\s+app$|^(?:sign\s*in|sign\s*up|log\s*in|log\s*on)$|^(?:click\s+to\s+view|copy|new\s+chat|visit\s+website|visit\s+site|view\s+github|join\s+discord|view\s+hugging\s*face|got\s+it!?|close)$|^(?:web\s+report|view\s*\/\s*share\s+web\s+report)$/i

const WEBPAGE_LOW_VALUE_TAIL_SECTION_HEADING_REGEX =
  /^(?:🎉\s*)?(?:what'?s\s+new|release\s+notes?(?:\s+and\s+changelog)?|changelog|product\s+updates?|other\s+improvements?|login(?:\s*&\s*account)?|account|chat\s+experience|subscription(?:\s+page)?|billing|faq|about)$/i

const normalizeWebpageShellProbeText = (text: string): string =>
  String(text || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201b\u2032]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

export function looksLikeCookieConsentWallText(text: string): boolean {
  const raw = String(text || '')
  const normalized = normalizeWebpageShellProbeText(raw)
  if (!normalized || !WEBPAGE_SHELL_COOKIE_LINE_REGEX.test(normalized)) return false

  const categoryMatches = WEBPAGE_COOKIE_CONSENT_CATEGORY_REGEXES
    .filter(pattern => pattern.test(raw))
    .length
  const allowedCount = (normalized.match(/\ballowed\b/g) || []).length
  const actionCueCount =
    (WEBPAGE_COOKIE_CONSENT_ACTION_REGEX.test(normalized) ? 1 : 0)
    + (/\b(?:manage\s+cookies|privacy\s+preferences)\b/i.test(normalized) ? 1 : 0)
  const copyCueCount = WEBPAGE_COOKIE_CONSENT_COPY_REGEX.test(normalized)
    ? (normalized.match(/\b(?:cookies?\s+are\s+necessary|cannot\s+be\s+deactivated|third\s+part(?:y|ies)|our\s+site\s+and\s+services|site\s+features|marketing\s+content|anonymous\s+statistics|similar\s+tools)\b/gi) || []).length
    : 0

  return (
    categoryMatches >= 3 && (allowedCount >= 2 || actionCueCount >= 1 || copyCueCount >= 3)
  ) || (
    categoryMatches >= 2 && allowedCount >= 3 && copyCueCount >= 2
  )
}

export function looksLikeWebpageShellText(text: string): boolean {
  const raw = String(text || '')
  const normalized = normalizeWebpageShellProbeText(raw)
  if (!normalized) return false
  if (looksLikeCookieConsentWallText(raw)) return true
  if (WEBPAGE_SHELL_PATTERNS.some(pattern => pattern.test(normalized)) === false) return false

  const lines = raw
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const substantiveLineCount = lines.filter(line => line.length >= 80 || line.split(/\s+/).length >= 12).length
  const sentenceCount = (normalized.match(/[.!?](?:\s|$)/g) || []).length
  const chromeCueCount = (normalized.match(WEBPAGE_SHELL_CHROME_CUE_REGEX) || []).length
  const actionElementCount = (raw.match(WEBPAGE_SHELL_ACTION_ELEMENT_REGEX) || []).length
  const htmlChromeTagCount = (raw.match(WEBPAGE_SHELL_HTML_CHROME_TAG_REGEX) || []).length
  const hasLoadingCue = /\bloading\b/i.test(normalized)
  const hasSharedSurfaceCue = WEBPAGE_SHELL_SHARED_SURFACE_REGEX.test(normalized)
  const hasWaitCue = /\bplease\s+wait\b/i.test(normalized)
  const hasNarrativeDensity = sentenceCount >= 10 || substantiveLineCount >= 6

  if (WEBPAGE_CONNECTION_FAILURE_PATTERN.test(normalized)) {
    return true
  }
  if ((hasLoadingCue || hasWaitCue || hasSharedSurfaceCue) && chromeCueCount >= 2) return true
  if ((hasLoadingCue || chromeCueCount >= 3) && actionElementCount >= 8 && !hasNarrativeDensity) return true
  if ((hasLoadingCue || chromeCueCount >= 3) && htmlChromeTagCount >= 16 && sentenceCount < 12) return true
  if (normalized.length <= 8_000 && sentenceCount < 6 && substantiveLineCount < 4) return true
  if (/\bloading\b/i.test(normalized) && substantiveLineCount < 2) return true
  return false
}

export const looksLikeConnectionFailureWebpageShellText = (text: string): boolean =>
  WEBPAGE_CONNECTION_FAILURE_PATTERN.test(normalizeWebpageShellProbeText(text))

const normalizeWebpageChromeTextLine = (value: string): string =>
  String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

const countWords = (value: string): number => {
  const trimmed = normalizeWebpageChromeTextLine(value)
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

const isSubstantiveWebpageContentLine = (value: string): boolean => {
  const line = normalizeWebpageChromeTextLine(value)
  if (!line) return false
  if (/^(?:#{1,6}\s|[-*+]\s|\d+\.\s)/.test(line)) return true
  return line.length >= 48 || countWords(line) >= 8
}

export function isLikelyWebpageChromeTextLine(value: string): boolean {
  const line = normalizeWebpageChromeTextLine(value)
  if (!line) return false
  if (WEBPAGE_SHELL_COOKIE_LINE_REGEX.test(line)) return true
  if (WEBPAGE_SHELL_CHROME_ACTION_LINE_REGEX.test(line)) return true
  if (WEBPAGE_SHELL_PROMO_LINE_REGEX.test(line)) return true
  if (/^shared\s+(?:chat|conversation|report|document|page|thread)$/i.test(line)) return true
  if (/^(?:view|show)\s+(?:thinking\s+trajectory|share|report|website)\b/i.test(line)) return true
  if (/^(?:manage|open|visit|download|install)\b/i.test(line) && countWords(line) <= 4) return true
  return false
}

export function pruneWebpageChromeText(text: string): string {
  const rawLines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(normalizeWebpageChromeTextLine)

  if (rawLines.length === 0) return ''

  let startIndex = 0
  let sawCookieConsentLead = false
  while (startIndex < rawLines.length) {
    const line = rawLines[startIndex] || ''
    if (!line || isLikelyWebpageChromeTextLine(line)) {
      sawCookieConsentLead = sawCookieConsentLead || WEBPAGE_SHELL_COOKIE_LINE_REGEX.test(line)
      startIndex += 1
      continue
    }
    if (
      sawCookieConsentLead
      && (
        WEBPAGE_COOKIE_CONSENT_ACTION_REGEX.test(line)
        || WEBPAGE_COOKIE_CONSENT_COPY_REGEX.test(line)
        || WEBPAGE_COOKIE_CONSENT_CATEGORY_REGEXES.some(pattern => pattern.test(line))
      )
    ) {
      startIndex += 1
      continue
    }
    if (isSubstantiveWebpageContentLine(line)) break
    startIndex += 1
  }

  const kept: string[] = []
  let substantiveLineCount = 0
  let pendingBlank = false
  for (let i = startIndex; i < rawLines.length; i += 1) {
    const line = rawLines[i] || ''
    if (!line) {
      pendingBlank = kept.length > 0
      continue
    }
    if (substantiveLineCount >= 6 && (WEBPAGE_SHELL_COOKIE_LINE_REGEX.test(line) || WEBPAGE_LOW_VALUE_TAIL_SECTION_HEADING_REGEX.test(line))) {
      break
    }
    if (isLikelyWebpageChromeTextLine(line)) continue
    if (pendingBlank && kept.length > 0) kept.push('')
    pendingBlank = false
    kept.push(line)
    if (isSubstantiveWebpageContentLine(line)) substantiveLineCount += 1
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
