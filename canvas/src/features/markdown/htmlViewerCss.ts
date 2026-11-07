import { UI_FONT_MONO, UI_FONT_SANS } from 'grph-shared/ui/typography'
import { resolveCssVarWithKgFallback } from '@/lib/ui/tokens-ssot'
import { normalizeSemanticHtmlContainers } from '@/lib/html/semanticHtml'

const escapeHtmlText = (raw: string): string =>
  String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export function buildMarkdownHtmlViewerDocument(args: { title: string; bodyHtml: string }): string {
  const bg = resolveCssVarWithKgFallback('--kg-panel-bg')
  const text = resolveCssVarWithKgFallback('--kg-text-primary')
  const textSecondary = resolveCssVarWithKgFallback('--kg-text-secondary')
  const border = resolveCssVarWithKgFallback('--kg-border')
  const link = resolveCssVarWithKgFallback('--kg-canvas-accent')
  const codeBg = resolveCssVarWithKgFallback('--kg-code-bg')
  const codeBorder = resolveCssVarWithKgFallback('--kg-code-border')
  const codeText = resolveCssVarWithKgFallback('--kg-code-text')

  const css = `html{color-scheme:dark light}body{margin:0;padding:0;font-family:${UI_FONT_SANS};background:${bg};color:${text}}main{max-width:980px;margin:0 auto;padding:16px}a{color:${link}}pre,code{font-family:${UI_FONT_MONO}}pre{background:${codeBg};border:1px solid ${codeBorder};border-radius:8px;padding:12px;overflow:auto;color:${codeText}}code{background:${codeBg};border:1px solid ${codeBorder};border-radius:6px;padding:1px 4px;color:${codeText}}table{border-collapse:collapse;width:100%}th,td{border:1px solid ${border};padding:6px 8px;vertical-align:top}blockquote{border-left:3px solid ${border};margin:0;padding:0 0 0 12px;color:${textSecondary}}hr{border:0;border-top:1px solid ${border};margin:16px 0}img,video{max-width:100%;height:auto}`
  const title = escapeHtmlText(args.title)
  const bodyHtml = normalizeSemanticHtmlContainers(args.bodyHtml)
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body><main>${bodyHtml}</main></body></html>`
}
