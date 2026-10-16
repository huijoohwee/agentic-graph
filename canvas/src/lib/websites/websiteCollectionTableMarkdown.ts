import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import type { WebsiteCollectionRecord } from './websiteCollectionRecords'

export type WebsiteCollectionTableRow = WebsiteCollectionRecord & {
  nodeId?: string
  docLink?: string
}

const quote = (value: unknown): string => JSON.stringify(String(value || ''))

const trim = (value: unknown): string => String(value || '').replace(/\r?\n/g, ' ').trim()

const markdownLink = (href: string, label: string): string => {
  const safeHref = String(href || '').replace(/\)/g, '%29').replace(/\s/g, '%20').trim()
  const safeLabel = trim(label).replace(/\[/g, '\\[').replace(/\]/g, '\\]')
  return safeHref ? `[${safeLabel || safeHref}](${safeHref})` : safeLabel
}

export function buildWebsiteCollectionTableMarkdown(args: {
  rootUrl: string
  importId: string
  outputDirRel?: string
  rows: WebsiteCollectionTableRow[]
}): string {
  const rows = args.rows.filter(row => trim(row.title) && trim(row.sourceUrl))
  const host = (() => {
    try {
      return new URL(args.rootUrl).host || 'website'
    } catch {
      return 'website'
    }
  })()
  const tableRows = rows.map(row => [
    trim(row.title),
    trim(row.location),
    trim(row.status),
    trim(row.timeline),
    trim(row.prize),
    trim(row.participants),
    trim(row.organizer),
    trim(row.tagsText),
    markdownLink(trim(row.sourceUrl), 'Open'),
    row.docLink ? markdownLink(trim(row.docLink), 'Doc') : '',
  ])
  return [
    '---',
    'title: "Website collection table"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "multiDimTable"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgMultiDimTableModeEnabled: true',
    `kgWebsiteImportId: ${quote(args.importId)}`,
    `kgWebsiteRootUrl: ${quote(args.rootUrl)}`,
    `kgWebsiteOutputDirRel: ${quote(args.outputDirRel || '')}`,
    `kgWebsiteCollectionHost: ${quote(host)}`,
    `kgWebsiteCollectionRowCount: ${rows.length}`,
    '---',
    '',
    '# Website collection table',
    '',
    `Source: ${args.rootUrl}`,
    '',
    `Rows: ${rows.length}`,
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Title', 'Location', 'Status', 'Dates', 'Prize', 'Participants', 'Organizer', 'Tags', 'Source', 'Doc'],
      rows: tableRows,
    }),
    '',
  ].join('\n')
}
