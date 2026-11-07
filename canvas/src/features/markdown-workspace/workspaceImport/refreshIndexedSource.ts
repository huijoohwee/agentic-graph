import { load as loadYaml, dump as dumpYaml } from 'js-yaml'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { importContentDigest, loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { extractYamlFrontmatterHeaderBlock, readYamlFrontmatterValue } from '@/lib/markdown/frontmatter'
import { looksLowFidelityWebpageMarkdown } from '@/lib/websites/webpageClientConvert'
import { saveWorkspaceWebsiteLocalCopy } from '@/features/workspace-fs/workspaceRevealInFileManager'

/** User-requested remote revalidation, separate from offline reuse of a saved source. */
export async function refreshIndexedSource(fs: WorkspaceFs, path: string, url: string, options?: { mirrorToHost?: boolean }) {
  const previous = await fs.readFileText(path)
  if (previous === null) throw new Error('The saved source no longer exists')
  const prior = loadWorkspaceSourceIndex()[path]?.importState
  const outputDigest = await importContentDigest(previous)
  if (prior && outputDigest !== prior.outputDigest) throw new Error('The saved source was edited locally; its content was preserved')
  const header = extractYamlFrontmatterHeaderBlock(previous)
  const priorDigest = prior?.inputDigest || (header ? readYamlFrontmatterValue(header.rawBlock, 'kgWebsiteRawHtmlSha256') : '')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 35_000)
  try {
    const response = await fetch('/__website_import/revalidate', { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, options: {
        digest: priorDigest, etag: prior?.etag, lastModified: prior?.lastModified,
      } }) })
    const result = await response.json()
    if (!response.ok || result.ok !== true) throw new Error(result.error || `Source check failed (${response.status})`)
    if (!/^[a-f0-9]{64}$/.test(result.digest || '')) throw new Error('Source check returned no content digest')
    let text = previous
    if (result.unchanged !== true) {
      if (typeof result.text !== 'string') throw new Error('Source check returned no content')
      const contentType = String(result.contentType || '').split(';')[0].trim()
      if (contentType && !/^text\//.test(contentType) && !['application/json', 'application/xml', 'application/xhtml+xml'].includes(contentType)) throw new Error('This source requires its existing format-specific importer; the saved document was preserved')
      let body = result.text
      if (/html/.test(contentType) || /^\s*(?:<!doctype html|<html)/i.test(body)) {
        const { convertHtmlToMarkdownUnified } = await import('@/lib/markdown/htmlToMarkdownUnified')
        const converted = await convertHtmlToMarkdownUnified({ html: body, baseUrl: url, fidelityLevel: 4, maxInputChars: 8 * 1024 * 1024, includeImages: true })
        if (!converted.ok || !converted.markdown.trim()) throw new Error('Source conversion failed; the saved document was preserved')
        if (looksLowFidelityWebpageMarkdown(converted.markdown)) throw new Error('The refreshed page did not contain usable content; the saved document was preserved')
        body = converted.markdown
      }
      const metadata = header ? loadYaml(header.yamlText) : {}
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('The saved source metadata is invalid')
      const next = metadata as Record<string, unknown>
      // Old capture references cannot describe the new body. Historical artifacts remain intact.
      for (const key of Object.keys(next)) if (key.startsWith('kgWebsite')) delete next[key]
      next.kgWebpageUrl = url; next.kgWebpageView = 'markdown'
      text = `---\n${dumpYaml(next).trimEnd()}\n---\n\n${body.trim()}\n`
    }
    if (await fs.readFileText(path) !== previous) throw new Error('The saved source changed while checking for updates')
    if (text !== previous) await fs.writeFileText(path, text, { expectedText: previous })
    if (options?.mirrorToHost !== false) await saveWorkspaceWebsiteLocalCopy(path, text)
    setWorkspaceEntrySource(path, { kind: 'url', url, importState: { identity: `url:${new URL(url).href}`, inputDigest: result.digest,
      outputDigest: text === previous ? outputDigest : await importContentDigest(text), checkedAt: result.checkedAt,
      status: result.unchanged === true ? 'unchanged' : 'imported', etag: result.etag, lastModified: result.lastModified } }, { persist: 'sync' })
    return { text, unchanged: text === previous }
  } finally { clearTimeout(timeout) }
}
