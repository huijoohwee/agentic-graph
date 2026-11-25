import { createPageCaptureStore, readCopiedPage, type PageCapture, type StagedPageCapture } from 'agentic-gateway/transfer/copied-page'
import { assertHtmlInputBudget } from '@/lib/markdown/htmlToMarkdownUnified'
import { stripOversizedHydrationAttributes } from '@/lib/markdown/htmlToMarkdownHast'
import { WEBPAGE_HTML_SOURCE_MAX_BYTES } from '@/lib/websites/webpageHtmlPreviewBudget'

export const WORKSPACE_IMPORT_NORMALIZED_HTML_MAX_CHARS = 10_000_000
const captures = createPageCaptureStore({ maxBytes: WEBPAGE_HTML_SOURCE_MAX_BYTES, parameterPrefix: '__ag_local_page_capture_' })
export type WorkspacePageCapturePromptResult = StagedPageCapture
export type WorkspacePageCapture = PageCapture

export async function captureWorkspacePageFromClipboard(rawUrl: string): Promise<WorkspacePageCapturePromptResult> {
  const { html, text } = await readCopiedPage()
  return captures.stage(rawUrl, html, text)
}

export const captureWorkspacePageFromContent = captures.stage
export const consumeWorkspacePageCapture = captures.consume

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
