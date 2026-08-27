import path from 'node:path'
import { buildMarkdownJsonLd } from '@/features/parsers/markdownJsonLd'
import { parseJsonLd } from '@/lib/graph/jsonld'
import { deriveMarkdownTableGraphForFrontmatterMode } from '@/features/markdown/tableGraph/deriveMarkdownTableGraph'
import { writeWorkspaceDataViewState } from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import { existsSync, readFileSync } from 'node:fs'
import { parseBacktickJsonStringArray } from '@/lib/markdown/tableCellConventions'

export function testMultiDimTableGuidelinesBacktickJsonArraysAreRespected() {
  const md = [
    '| Task | Category | Dependency |',
    '| --- | --- | --- |',
    '| A | `["X","Y"]` | `["B"]` |',
    '| B | `["Y"]` | — |',
    '| C | A,B | TBD |',
    '',
  ].join('\n')

  const jsonld = buildMarkdownJsonLd('multi-d-guidelines.md', md)
  const baseGraph = parseJsonLd(jsonld)

  const docNode = (baseGraph.nodes || []).find(n => String((n as any)?.type || '') === 'Document') as any
  const documentPath = String(docNode?.properties?.path || 'multi-d-guidelines.md')
  const tableNode = (baseGraph.nodes || []).find(n => String((n as any)?.type || '') === 'Table') as any
  const lineStart = Math.max(1, Math.floor(Number(tableNode?.metadata?.lineStart || 1)))
  const lineEnd = Math.max(lineStart, Math.floor(Number(tableNode?.metadata?.lineEnd || lineStart)))
  const tableId = `md-block:${lineStart}-${lineEnd}`

  writeWorkspaceDataViewState({
    activeDocumentPath: documentPath,
    tableId,
    value: {
      sv: 1,
      activeViewId: 'v0',
      views: [
        {
          v: 2,
          id: 'v0',
          name: 'Table',
          layout: 'table',
          groupByColumnId: null,
          visibleColumnIds: null,
          columnTypesById: null,
          filterGroups: [{ id: 'g0', rules: [] }],
          sortRules: [],
          graphEnabled: true,
          graphRolesByColumnId: {
            col_0: 'node',
            col_1: 'group',
            col_2: 'dependsOn',
          },
        },
      ],
    },
  })

  const derived = deriveMarkdownTableGraphForFrontmatterMode({ graphData: baseGraph })
  if (!derived) throw new Error('expected derived table graph')

  const nodes = derived.nodes || []
  const edges = derived.edges || []
  const byLabel = new Map(nodes.map(n => [String((n as any).label || ''), n]))
  if (!byLabel.has('A') || !byLabel.has('B') || !byLabel.has('C')) {
    throw new Error('expected Task nodes A, B, C')
  }

  const nodeC = byLabel.get('C') as any
  const category = nodeC?.properties?.['md:table:category']
  if (!Array.isArray(category) || category.length !== 1 || String(category[0] || '') !== 'A,B') {
    throw new Error('expected Category prose scalar to not split on commas')
  }

  const hasEdgeAToB = edges.some(e => String((e as any).label || '') === 'dependsOn' && String((e as any).source) === String((byLabel.get('A') as any).id) && String((e as any).target) === String((byLabel.get('B') as any).id))
  if (!hasEdgeAToB) throw new Error('expected dependsOn edge from A to B from backtick array')

  const hasTbdPlaceholder = nodes.some(n => String((n as any).label || '').trim().toLowerCase() === 'tbd')
  if (hasTbdPlaceholder) throw new Error('expected TBD cells to be omitted (no placeholder node)')

  const meta = (derived.metadata || {}) as Record<string, unknown>
  const subgraphs = meta['kg:subgraphs']
  if (!Array.isArray(subgraphs) || subgraphs.length < 1) {
    throw new Error('expected at least one cluster subgraph from Category=Y shared across rows')
  }
}

export function testMultiDimTableGuidelinesExternalFileParsesSampleTableWhenPresent() {
  const envPath = String(process.env.AG_MULTI_DIM_TABLE_GUIDELINES_FILE || '').trim()
  const defaultPath = path.resolve(process.cwd(), '..', '..', 'huijoohwee.github.io', 'guidelines', 'multi-dimensional-table-guidelines.md')
  const filePath = envPath || defaultPath
  if (!filePath || !existsSync(filePath)) return

  const markdown = readFileSync(filePath, 'utf8')
  const jsonld = buildMarkdownJsonLd(filePath, markdown)
  const graph = parseJsonLd(jsonld)
  const tables = (graph.nodes || []).filter(n => String((n as any)?.type || '') === 'Table') as any[]
  if (tables.length < 1) throw new Error('expected at least one Table node in guidelines file')

  const target = tables.find(t => {
    const header = (t?.properties?.['table:header'] as unknown) || null
    if (!Array.isArray(header)) return false
    return header.some((h: unknown) => String(h || '').trim().toLowerCase() === 'product')
  })
  if (!target) throw new Error('expected a sample table with Product column in guidelines file')

  const header = Array.isArray(target.properties?.['table:header']) ? (target.properties['table:header'] as unknown[]).map(String) : []
  const rows = Array.isArray(target.properties?.['table:rows']) ? (target.properties['table:rows'] as unknown[]) : []
  const productIdx = header.findIndex(h => String(h || '').trim().toLowerCase() === 'product')
  const idIdx = header.findIndex(h => String(h || '').trim().toLowerCase() === 'id')
  if (productIdx < 0 || idIdx < 0) throw new Error('expected id and product columns')

  const demoRow = rows.find(r => Array.isArray(r) && String((r as any[])[idIdx] || '').trim() === 'demo-015') as any[] | undefined
  if (!demoRow) throw new Error('expected demo-015 row in sample table')

  const rawProduct = String(demoRow[productIdx] ?? '')
  const parsed = parseBacktickJsonStringArray(rawProduct)
  if (!parsed || parsed.length < 2) throw new Error('expected Product cell to parse as a JSON array per guidelines')
}
