import { lexMarkdown } from '@/features/markdown/ui/markdownPreviewLex'
import { resolveHref } from '@/features/markdown/ui/markdownPreviewLinks'

export function testMarkdownResolveHrefPreservesInternalAssetRoutes() {
  const href = '/__pdf_assets/123e4567-e89b-12d3-a456-426614174000/page-0001.jpg'
  const resolved = resolveHref(href, 'notes/document.md')
  if (resolved !== href) throw new Error(`Expected internal route to remain unchanged: got ${resolved}`)

  const viteHref = '/@fs/Users/example/file.md'
  const viteResolved = resolveHref(viteHref, 'notes/document.md')
  if (viteResolved !== viteHref) throw new Error(`Expected Vite internal route to remain unchanged: got ${viteResolved}`)
}

export function testMarkdownResolveHrefCoercesAbsoluteWorkspaceDocumentPath() {
  const prev = process.env.VITE_CODEBASE_ROOT
  process.env.VITE_CODEBASE_ROOT = '/tmp/kg-codebase-root'
  try {
    const href = 'images/a.png'
    const active = '/tmp/kg-codebase-root/data/test-data/md-demo-00.md'
    const resolved = resolveHref(href, active)
    const expected = '/__codebase_asset?path=data%2Ftest-data%2Fimages%2Fa.png'
    if (resolved !== expected) {
      throw new Error(`Expected absolute workspace base to resolve to ${expected}, got ${resolved}`)
    }
  } finally {
    if (typeof prev === 'string') process.env.VITE_CODEBASE_ROOT = prev
    else delete process.env.VITE_CODEBASE_ROOT
  }
}

export function testMarkdownResolveHrefAvoidsDuplicatedDocsPrefixesInWorkspaceDocs() {
  const active = 'huijoohwee/docs/workspace-readme.md'
  const expected = '/__codebase_asset?path=huijoohwee%2Fdocs%2Fagentic-graph-maps-places.md'
  const fromDocsRelative = resolveHref('docs/agentic-graph-maps-places.md', active)
  if (fromDocsRelative !== expected) {
    throw new Error(`Expected docs-relative href to resolve to ${expected}, got ${fromDocsRelative}`)
  }
  const fromRepoRelative = resolveHref('huijoohwee/docs/agentic-graph-maps-places.md', active)
  if (fromRepoRelative !== expected) {
    throw new Error(`Expected repo-relative docs href to resolve to ${expected}, got ${fromRepoRelative}`)
  }
}

export function testMarkdownLargeDocFastModeParsesHtmlTables() {
  const filler = 'x'.repeat(200_010)
  const table = [
    '<table>',
    '<thead><tr><th>A</th><th>B</th></tr></thead>',
    '<tbody><tr><td>1</td><td>2</td></tr></tbody>',
    '</table>',
  ].join('')
  const markdown = `${filler}\n\n${table}\n`
  const { tokens } = lexMarkdown(markdown)
  const hasHtmlTable = tokens.some(t => {
    const anyTok = t as unknown as { type?: unknown; text?: unknown }
    return anyTok.type === 'html' && typeof anyTok.text === 'string' && anyTok.text.includes('<table')
  })
  if (!hasHtmlTable) throw new Error('Expected large-document fast mode to preserve HTML table blocks')
}

export function testMarkdownPipeTablesLexAsTableTokens() {
  const md = [
    '| Name | Qty | Price |',
    '| --- | --- | --- |',
    '| Apple | 2 | $3 |',
    '',
  ].join('\n')
  const { tokens } = lexMarkdown(md)
  const hasTable = tokens.some(t => {
    const anyTok = t as unknown as { type?: unknown }
    return anyTok.type === 'table'
  })
  if (!hasTable) throw new Error('Expected pipe table markdown to lex as table tokens')
}
