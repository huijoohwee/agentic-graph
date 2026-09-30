import { extractYamlFrontmatterHeaderBlock, parseWebsiteImportFrontmatterMeta } from '@/lib/markdown/frontmatter'
import { fetchWebsiteImportArtifact } from '@/lib/websites/webpageIframeSrcdoc'

/** Rebuild derived Markdown from the saved capture without losing its provenance. */
export async function refreshWebsiteImportMarkdown(text: string, url: string): Promise<string | null> {
  const meta = parseWebsiteImportFrontmatterMeta(text)
  if (!meta) return null
  const header = extractYamlFrontmatterHeaderBlock(text)
  if (!header) throw new Error('The imported document has no source metadata')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const html = await fetchWebsiteImportArtifact({ ...meta, kind: 'rawHtml', signal: controller.signal })
    if (!html.trim()) throw new Error('The saved HTML capture is empty')
    if (html.length > 32_000_000) throw new Error('The saved HTML exceeds the conversion limit; the original content was kept')
    const { convertHtmlToMarkdownUnified } = await import('@/lib/markdown/htmlToMarkdownUnified')
    const result = await convertHtmlToMarkdownUnified({ html, baseUrl: url, fidelityLevel: 4,
      maxInputChars: 10_000_000, includeImages: true })
    if (result.ok === false && result.code === 'HTML_INPUT_LIMIT_EXCEEDED') throw new Error('The saved HTML exceeds the conversion limit; the original content was kept')
    if (result.ok !== true || !result.markdown.trim()) throw new Error(result.ok === false ? result.error : 'The saved capture produced no Markdown')
    return `${header.rawBlock.trimEnd()}\n\n${result.markdown.trim()}\n`
  } finally { clearTimeout(timeout) }
}
