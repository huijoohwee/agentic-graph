import { parseDelimitedText } from '@/lib/delimited-text/delimitedText'

export type WorkspaceImportUrlContentFormat = 'csv' | 'tsv' | 'json' | 'markdown' | 'html' | 'unknown'

export type WorkspaceImportUrlContentClassification = {
  format: WorkspaceImportUrlContentFormat
  needsBody: boolean
}

const CSV_MIME_TYPES = new Set([
  'application/csv',
  'text/comma-separated-values',
  'text/csv',
])
const TSV_MIME_TYPES = new Set(['text/tab-separated-values'])
const MARKDOWN_MIME_TYPES = new Set(['text/markdown', 'text/md', 'text/x-markdown'])
const HTML_MIME_TYPES = new Set(['application/xhtml+xml', 'text/html'])

export function normalizeWorkspaceImportUrlContentType(value: unknown): string {
  return String(value || '').split(';')[0]?.trim().toLowerCase() || ''
}

function looksLikeHtmlDocument(textRaw: string): boolean {
  const text = String(textRaw || '').trimStart().slice(0, 16_384).toLowerCase()
  if (!text) return false
  if (/^<!doctype\s+html\b/.test(text) || /^<html\b/.test(text)) return true
  if (/^<(?:head|body)\b/.test(text) || (/<html\b/.test(text) && /<(?:head|body|script)\b/.test(text))) return true
  return text.startsWith('<') && /<(?:script|style|meta|link)\b/.test(text)
}

function isValidJson(text: string): boolean {
  if (!String(text || '').trim()) return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

function sniffDelimitedFormat(text: string): 'csv' | 'tsv' | null {
  const parsed = parseDelimitedText(text, {
    delimiterCandidates: [',', '\t', ';'],
    header: true,
    trimEmptyTrailingRows: true,
  })
  const disqualifyingDiagnostics = new Set(['ambiguous-delimiter', 'field-count-mismatch'])
  if (parsed.diagnostics.some(item => item.severity === 'error' || disqualifyingDiagnostics.has(item.code))) return null
  if ((parsed.metadata.fieldCount || 0) < 2 || parsed.metadata.rowCount < 1) return null
  return parsed.metadata.delimiter === '\t' ? 'tsv' : 'csv'
}

function classification(format: WorkspaceImportUrlContentFormat, needsBody = false): WorkspaceImportUrlContentClassification {
  return { format, needsBody }
}

/**
 * Classifies public URL text without provider, tenant, account, or resource
 * knowledge. Full-document HTML wins over every response MIME so login and
 * hydration shells cannot be persisted as CSV, JSON, or Markdown.
 */
export function classifyWorkspaceImportUrlContent(args: {
  contentType?: string | null
  text?: string
}): WorkspaceImportUrlContentClassification {
  const contentType = normalizeWorkspaceImportUrlContentType(args.contentType)
  const hasBody = typeof args.text === 'string'
  const text = hasBody ? String(args.text) : ''

  if (hasBody && looksLikeHtmlDocument(text)) return classification('html')
  if (HTML_MIME_TYPES.has(contentType)) return classification('html')

  if (CSV_MIME_TYPES.has(contentType)) return classification('csv', !hasBody)
  if (TSV_MIME_TYPES.has(contentType)) return classification('tsv', !hasBody)
  if (MARKDOWN_MIME_TYPES.has(contentType)) return classification('markdown', !hasBody)
  if (contentType === 'application/json' || contentType === 'text/json' || contentType.endsWith('+json')) {
    if (!hasBody) return classification('json', true)
    return classification(isValidJson(text) ? 'json' : 'unknown')
  }

  const isGenericText = !contentType || contentType === 'text/plain'
  if (!isGenericText) return classification('unknown')
  if (!hasBody) return classification('unknown', true)
  if (!text.trim()) return classification('unknown')
  if (isValidJson(text)) return classification('json')
  const delimited = sniffDelimitedFormat(text)
  if (delimited) return classification(delimited)
  return classification('markdown')
}

export function workspaceImportUrlContentFormatExtension(format: WorkspaceImportUrlContentFormat): string | null {
  if (format === 'csv') return '.csv'
  if (format === 'tsv') return '.tsv'
  if (format === 'json') return '.json'
  if (format === 'markdown') return '.md'
  return null
}

export function workspaceImportUrlContentFormatMime(format: WorkspaceImportUrlContentFormat): string | null {
  if (format === 'csv') return 'text/csv'
  if (format === 'tsv') return 'text/tab-separated-values'
  if (format === 'json') return 'application/json'
  if (format === 'markdown') return 'text/markdown'
  return null
}
