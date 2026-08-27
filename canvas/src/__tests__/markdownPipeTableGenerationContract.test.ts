import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'

import { buildCanonicalKgcTemplateFixtureDocument } from '@/__tests__/helpers/neutralKgcFixture'
import { getNodeMediaSpec } from '@/components/GraphCanvas/helpers'
import { buildResolvableVarKeySet, validateChatMarkdown } from '@/features/chat/chatMarkdownValidation'
import { extractChatResponseStructuredSurface } from '@/features/chat/chatResponseStructuredContent'
import { buildChatResponseSurfaceFlowPatch } from '@/features/chat/chatResponseStructuredContentProjector'
import { normalizeGeneratedRichMediaTableProperties } from '@/features/rich-media/richMediaTablePersistence'
import { upsertFrontmatterFlowMarkdownText } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config'
import type { GraphData } from '@/lib/graph/types'

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'])
const ROOT_NAMES = [
  'canvas/src',
  'canvas/scripts',
  'canvas/vite.config.ts',
  'agenticgraph_parser',
  'grph-shared/src',
  'web/src',
  'web/scripts',
  'cloudflare',
  'contracts',
  'mcp',
]

const shouldSkipPath = (path: string): boolean => {
  const normalized = path.replace(/\\/g, '/')
  return /(?:^|\/)(?:__tests__|__pbt__|tests?|fixtures?|node_modules|dist|build|coverage)(?:\/|$)/.test(normalized)
    || /(?:\.test|\.spec|_test)\.[^.]+$/.test(normalized)
}

const collectCodeFiles = (path: string, out: string[]) => {
  if (shouldSkipPath(path)) return
  const stat = statSync(path)
  if (stat.isFile()) {
    if (CODE_EXTENSIONS.has(extname(path))) out.push(path)
    return
  }
  if (!stat.isDirectory()) return
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    collectCodeFiles(resolve(path, entry.name), out)
  }
}

export function testGeneratedTablesCannotHandAuthorMarkdownDelimiterRows() {
  const repoRoot = resolve(process.cwd(), '..')
  const files: string[] = []
  for (const name of ROOT_NAMES) collectCodeFiles(resolve(repoRoot, name), files)

  const violations: string[] = []
  const literalDelimiter = /['"`][^'"`]*\|\s*:?-{3,}:?\s*\|/
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      if (literalDelimiter.test(line)) violations.push(`${relative(repoRoot, file)}:${index + 1}`)
    })
  }

  if (violations.length > 0) {
    throw new Error([
      'Generated tables must reuse serializeMarkdownPipeTable (TypeScript) or serialize_markdown_pipe_table (Python); hand-authored Markdown delimiter rows found:',
      ...violations,
    ].join('\n'))
  }
}

export function testValidateChatMarkdownRejectsAuthoredHtmlTablesOutsideFencedCode() {
  const base = buildCanonicalKgcTemplateFixtureDocument()
  const authoredHtml = [base, '<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alpha</td></tr></tbody></table>'].join('\n')
  const rejected = validateChatMarkdown({
    markdown: authoredHtml,
    resolvableVarKeys: buildResolvableVarKeySet({ frontmatter: null, markdown: authoredHtml }),
  })
  if (rejected.ok || rejected.failedRuleId !== 'V-10') throw new Error(`Expected authored table HTML to fail V-10, got ${rejected.failedRuleId || 'ok'}`)

  for (const authoredCompanion of [
    base.replace(/\n---\n/, '\ngenerated_table: |-\n  | Name | Status |\n  | --- | --- |\n  | Alpha<br>Beta | Ready |\n---\n'),
    base.replace(/\n---\n/, '\noutput: |-\n  | Name | Status |\n  | --- | --- |\n  | Alpha | Ready |\noutputSrcDoc: "<main>duplicate</main>"\n---\n'),
  ]) {
    const validation = validateChatMarkdown({
      markdown: authoredCompanion,
      resolvableVarKeys: buildResolvableVarKeySet({ frontmatter: null, markdown: authoredCompanion }),
    })
    if (validation.ok || validation.failedRuleId !== 'V-10') throw new Error(`Expected authored HTML table companion state to fail V-10, got ${validation.failedRuleId || 'ok'}`)
  }

  const persistedMarkdownTable = base.replace(/\n---\n/, '\ngenerated_table: |-\n  | Name | Status |\n  | --- | --- |\n  | Alpha | Ready |\n---\n')
  const markdownAccepted = validateChatMarkdown({
    markdown: persistedMarkdownTable,
    resolvableVarKeys: buildResolvableVarKeySet({ frontmatter: null, markdown: persistedMarkdownTable }),
  })
  if (!markdownAccepted.ok) throw new Error(`Expected YAML block-scalar Markdown pipe table to validate, got ${markdownAccepted.errors[0]?.ruleId}: ${markdownAccepted.errors[0]?.message}`)

  const fencedHtmlExample = [base, '```html', '<table><tr><td>Runtime-only example</td></tr></table>', '```'].join('\n')
  const fencedAccepted = validateChatMarkdown({
    markdown: fencedHtmlExample,
    resolvableVarKeys: buildResolvableVarKeySet({ frontmatter: null, markdown: fencedHtmlExample }),
  })
  if (!fencedAccepted.ok) throw new Error(`Expected fenced HTML example to remain outside V-10 enforcement, got ${fencedAccepted.errors[0]?.ruleId}: ${fencedAccepted.errors[0]?.message}`)
}

export function testChatResponseStructuredContentPersistsTablesAsMarkdownBlockScalars() {
  const assistantText = JSON.stringify({ response: { structuredContent: { tables: [{
    id: 'crawl-table', label: 'Crawl Table',
    columns: [{ key: 'name', label: 'Name' }, { key: 'status', label: 'Status' }],
    rows: [{ name: 'Home | Primary', status: 'Success<br>Cached' }, { name: 'About', status: 'Success' }],
    outputSrcDoc: '<main><table><tr><th>Name</th><th>Status</th></tr></table></main>',
  }] } } }, null, 2)
  const surface = extractChatResponseStructuredSurface(assistantText)
  if (!surface || surface.nodes.length !== 1) throw new Error(`Expected one structured table node, got: ${JSON.stringify(surface)}`)
  const table = surface.nodes[0]
  const output = String(table?.properties.output || '')
  for (const token of ['| Name | Status |', '| ---- | ------ |', '| Home \\| Primary | Success Cached |', '| About | Success |']) {
    if (!output.includes(token)) throw new Error(`Expected structured table Markdown token ${token}, got: ${output}`)
  }
  if (table.kind !== 'text' || table.sourceHandle !== 'output' || table.targetHandle !== 'output') throw new Error(`Expected structured table to use Markdown output handles, got: ${JSON.stringify(table)}`)
  if (Object.prototype.hasOwnProperty.call(table.properties, 'outputSrcDoc') || /<table\b|<br\s*\/?>/i.test(output)) throw new Error(`Expected structured table to omit authored HTML, got: ${JSON.stringify(table.properties)}`)
  const projected = buildChatResponseSurfaceFlowPatch(surface).nodeLines.join('\n')
  if (!projected.includes('output: |-') || !projected.includes('          | Name | Status |')) throw new Error(`Expected structured table output to project through a YAML block scalar, got: ${projected}`)
  if (/<table\b|outputSrcDoc:/i.test(projected)) throw new Error(`Expected projected structured table artifact to contain no authored table HTML: ${projected}`)
}

export function testGeneratedRichMediaTablesPersistAsMarkdownBlockScalars() {
  const tableMarkdown = ['## Crawl rows', '', '| Page | Status |', '| ---- | ------ |', '| Home | Success |'].join('\n')
  const authoredTableHtml = '<main><table><tr><th>Page</th><th>Status</th></tr><tr><td>Home</td><td>Success</td></tr></table></main>'
  const tableProperties = normalizeGeneratedRichMediaTableProperties({
    nodeType: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    nodeLabel: 'Crawl rows',
    properties: { output: tableMarkdown, outputSrcDoc: authoredTableHtml, kind: 'multi-dimensional-table', tableFormat: 'markdown-pipe-table', 'flow:portTypes': { in: { outputSrcDoc: 'rich_media_inline_html' }, out: { outputSrcDoc: 'rich_media_inline_html' } } },
  })
  if (Object.prototype.hasOwnProperty.call(tableProperties, 'outputSrcDoc') || String(tableProperties.output || '') !== tableMarkdown) throw new Error('expected table normalizer to keep Markdown and delete authored table HTML')
  const ports = tableProperties['flow:portTypes'] as { in?: Record<string, unknown>; out?: Record<string, unknown> }
  if (ports.in?.outputSrcDoc || ports.out?.outputSrcDoc || ports.out?.output !== 'markdown_table') throw new Error('expected table normalizer to rewrite table ports from outputSrcDoc to output')
  const implicit = normalizeGeneratedRichMediaTableProperties({ nodeType: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, properties: { output: tableMarkdown, outputSrcDoc: '<main><svg></svg></main>', kind: 'report' } }) as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(implicit, 'outputSrcDoc') || implicit.kind !== 'markdown-table' || implicit.tableFormat !== 'markdown-pipe-table') throw new Error('expected implicit Markdown table output to become canonical')
  const chart = { output: 'Chart summary', outputSrcDoc: '<main><svg></svg></main>', kind: 'chart' }
  if (normalizeGeneratedRichMediaTableProperties({ nodeType: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, properties: chart }) !== chart) throw new Error('expected non-table Rich Media HTML to remain byte-identical')
  const tableNode = { id: 'crawl-table', type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, label: 'Crawl rows', properties: tableProperties }
  const persisted = upsertFrontmatterFlowMarkdownText('---\ntitle: "Table persistence"\n---\n', { type: 'flow', nodes: [{ ...tableNode, properties: { ...tableProperties, outputSrcDoc: authoredTableHtml } }], edges: [], metadata: { frontmatterFlow: true } } as GraphData)
  if (/<table\b/i.test(persisted) || /outputSrcDoc:/.test(persisted) || !persisted.includes('tableFormat: {key: tableFormat, type: string, value: "markdown-pipe-table"') || !persisted.includes('value: |-\n          ## Crawl rows')) throw new Error('expected graph persistence to store only the Markdown table block scalar')
  const tableSpec = getNodeMediaSpec(tableNode as Parameters<typeof getNodeMediaSpec>[0])
  if (tableSpec?.kind !== 'iframe' || tableSpec.srcDoc) throw new Error('expected Markdown table UI to be renderer-derived without persisted iframe HTML')
}
