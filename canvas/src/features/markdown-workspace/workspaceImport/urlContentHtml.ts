import { assertHtmlInputBudget } from '@/lib/markdown/htmlToMarkdownUnified'
import { stripOversizedHydrationAttributes } from '@/lib/markdown/htmlToMarkdownHast'
import { WEBPAGE_HTML_SOURCE_MAX_BYTES } from '@/lib/websites/webpageIframeSrcdoc'

export const WORKSPACE_IMPORT_NORMALIZED_HTML_MAX_CHARS = 10_000_000
const CAPTURE_PARAM_PREFIX = '__ag_local_page_capture_'
const CAPTURE_TTL_MS = 5 * 60_000
const CLIPBOARD_READ_TIMEOUT_MS = 5_000

type PendingWorkspacePageCapture = {
  nonce: string
  markerName: string
  sourceUrl: string
  html: string
  title: string
  expiresAt: number
}

export type WorkspacePageCapturePromptResult = {
  requestUrl: string
  sourceUrl: string
  byteSize: number
  title: string
}

export type WorkspacePageCapture = Pick<PendingWorkspacePageCapture, 'sourceUrl' | 'html' | 'title'>

const pendingWorkspacePageCaptures = new Map<string, PendingWorkspacePageCapture>()

function pruneExpiredWorkspacePageCaptures(): void {
  const now = Date.now()
  for (const [nonce, capture] of pendingWorkspacePageCaptures) {
    if (capture.expiresAt < now) pendingWorkspacePageCaptures.delete(nonce)
  }
  while (pendingWorkspacePageCaptures.size > 16) {
    const oldest = pendingWorkspacePageCaptures.keys().next().value
    if (!oldest) break
    pendingWorkspacePageCaptures.delete(oldest)
  }
}

function normalizeHttpUrl(raw: string): string {
  const url = new URL(String(raw || '').trim())
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS page URL without embedded credentials')
  }
  url.hash = ''
  return url.toString()
}

function readClipboardSourceUrl(html: string): string {
  const header = html.match(/(?:^|\r?\n)SourceURL:([^\r\n]+)/i)?.[1]?.trim() || ''
  if (header) return header
  const base = html.match(/<base\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() || ''
  return base
}

function stripClipboardHtmlTransport(raw: string): string {
  const input = String(raw || '')
  const bytes = new TextEncoder().encode(input)
  const number = (key: string): number => {
    const match = input.match(new RegExp(`(?:^|\\r?\\n)${key}:(-?\\d+)`, 'i'))
    return match ? Number(match[1]) : -1
  }
  const start = number('StartFragment')
  const end = number('EndFragment')
  if (start >= 0 && end > start && end <= bytes.byteLength) {
    return new TextDecoder().decode(bytes.slice(start, end))
  }
  const htmlStart = number('StartHTML')
  const htmlEnd = number('EndHTML')
  if (htmlStart >= 0 && htmlEnd > htmlStart && htmlEnd <= bytes.byteLength) {
    return new TextDecoder().decode(bytes.slice(htmlStart, htmlEnd))
  }
  return input.replace(/^(?:Version|StartHTML|EndHTML|StartFragment|EndFragment|SourceURL):[^\r\n]*\r?\n/gi, '')
}

function escapeHtmlText(value: string): string {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] || char))
}

function readTitleFromHtml(html: string): string {
  return String(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || '')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function nonceValue(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
}

export async function captureWorkspacePageFromClipboard(rawUrl: string): Promise<WorkspacePageCapturePromptResult> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.read !== 'function') {
    throw new Error('Clipboard reading is unavailable. Copy the rendered page, then paste it into the page-content field.')
  }
  let timeout: ReturnType<typeof setTimeout> | undefined
  let items: ClipboardItems
  try {
    items = await Promise.race([
      navigator.clipboard.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(
          'Clipboard access is blocked or taking too long. Copy the rendered page, then paste it into the page-content field.',
        )), CLIPBOARD_READ_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
  let clipboardHtml = ''
  let clipboardText = ''
  for (const item of items) {
    if (!clipboardHtml && item.types.includes('text/html')) clipboardHtml = await (await item.getType('text/html')).text()
    if (!clipboardText && item.types.includes('text/plain')) clipboardText = await (await item.getType('text/plain')).text()
  }
  return stageWorkspacePageCapture(rawUrl, clipboardHtml, clipboardText)
}

export function captureWorkspacePageFromContent(
  rawUrl: string,
  clipboardHtml: string,
  clipboardText = '',
): WorkspacePageCapturePromptResult {
  return stageWorkspacePageCapture(rawUrl, clipboardHtml, clipboardText)
}

function stageWorkspacePageCapture(
  rawUrl: string,
  clipboardHtml: string,
  clipboardText: string,
): WorkspacePageCapturePromptResult {
  const sourceHint = String(rawUrl || '').trim() || readClipboardSourceUrl(clipboardHtml)
  if (!sourceHint) throw new Error('Enter the page URL before capturing its copied content')
  const sourceUrl = normalizeHttpUrl(sourceHint)
  if ([...new URL(sourceUrl).searchParams.keys()].some(key => key.startsWith(CAPTURE_PARAM_PREFIX))) {
    throw new Error('This URL uses a reserved local capture parameter. Remove it and capture the page again.')
  }
  let html = stripClipboardHtmlTransport(clipboardHtml)
  if (!html.trim() && clipboardText.trim()) html = `<article><pre>${escapeHtmlText(clipboardText)}</pre></article>`
  if (!html.trim()) throw new Error('Clipboard has no copied webpage content. Copy the rendered page first, then try again.')
  const byteSize = new TextEncoder().encode(html).byteLength
  if (byteSize > WEBPAGE_HTML_SOURCE_MAX_BYTES) {
    throw new Error(`Copied page exceeds the ${Math.floor(WEBPAGE_HTML_SOURCE_MAX_BYTES / (1024 * 1024))} MiB capture limit`)
  }
  const visibleText = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|#160|#x[aA]0);/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos);/g, ' ')
    .replace(/\s+/g, ' ').trim()
  if (!visibleText) throw new Error('Copied page has no readable text or media')

  const nonce = nonceValue()
  const markerName = CAPTURE_PARAM_PREFIX + nonce.slice(0, 12)
  const request = new URL(sourceUrl)
  request.searchParams.set(markerName, nonce)
  pruneExpiredWorkspacePageCaptures()
  pendingWorkspacePageCaptures.set(nonce, {
    nonce, markerName, sourceUrl, html, title: readTitleFromHtml(html), expiresAt: Date.now() + CAPTURE_TTL_MS,
  })
  pruneExpiredWorkspacePageCaptures()
  const title = pendingWorkspacePageCaptures.get(nonce)?.title || ''
  return { requestUrl: request.toString(), sourceUrl, byteSize, title }
}

export function consumeWorkspacePageCapture(requestUrl: string): WorkspacePageCapture | null {
  const url = new URL(String(requestUrl || ''))
  const markerNames = [...url.searchParams.keys()].filter(key => key.startsWith(CAPTURE_PARAM_PREFIX))
  if (markerNames.length === 0) return null
  const nonce = markerNames.length === 1 ? url.searchParams.get(markerNames[0]!) || '' : ''
  const pending = nonce ? pendingWorkspacePageCaptures.get(nonce) : undefined
  if (nonce) pendingWorkspacePageCaptures.delete(nonce)
  if (markerNames.length !== 1 || !pending || pending.expiresAt < Date.now()) {
    throw new Error('The copied page capture expired. Copy the page and capture it again.')
  }
  const markerName = markerNames[0]!
  url.searchParams.delete(markerName)
  url.hash = ''
  if (markerName !== pending.markerName || nonce !== pending.nonce || url.toString() !== pending.sourceUrl) {
    throw new Error('The copied page capture no longer matches this URL. Capture it again before importing.')
  }
  return { sourceUrl: pending.sourceUrl, html: pending.html, title: pending.title }
}

export async function convertWorkspacePageCapture(args: WorkspacePageCapture): Promise<string> {
  const html = prepareWorkspaceImportHtml(args.html)
  const { convertHtmlToMarkdownUnified } = await import('@/lib/markdown/htmlToMarkdownUnified')
  const converted = await convertHtmlToMarkdownUnified({
    html,
    baseUrl: args.sourceUrl,
    maxInputChars: WORKSPACE_IMPORT_NORMALIZED_HTML_MAX_CHARS,
    includeImages: true,
    fidelityLevel: 4,
    includeHeadSection: false,
    preferContentRoot: false,
  })
  if (converted.ok === false) throw new Error(converted.error)
  if (!converted.markdown.trim()) throw new Error('Copied page did not produce readable Markdown')
  return converted.markdown
}

export function prepareWorkspaceImportHtml(source: string): string {
  const input = String(source || '')
  assertHtmlInputBudget(input, WEBPAGE_HTML_SOURCE_MAX_BYTES)
  const renderable = input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
  const normalized = stripOversizedHydrationAttributes(renderable)
  assertHtmlInputBudget(normalized, WORKSPACE_IMPORT_NORMALIZED_HTML_MAX_CHARS)
  return normalized
}
