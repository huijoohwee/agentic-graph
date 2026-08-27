import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import {
  BYTEPLUS_VIDEO_GENERATION_DOC_ROWS,
  type BytePlusVideoApiDocRow,
} from '@/features/integrations/byteplusVideoGenerationSsot'

function buildJoinedCell(values: readonly string[]): string {
  return values.map(value => `\`${value}\``).join('; ')
}

function buildRow(row: BytePlusVideoApiDocRow): string[] {
  return [
    row.key,
    row.typeLabel,
    row.value,
    row.keyDescription,
    row.valueDescription,
    row.ssot,
    buildJoinedCell(row.module),
    buildJoinedCell(row.className),
    buildJoinedCell(row.functionName),
  ]
}

function getSortedRows(): BytePlusVideoApiDocRow[] {
  return [...BYTEPLUS_VIDEO_GENERATION_DOC_ROWS].sort((left, right) => left.key.localeCompare(right.key))
}

function buildMarkdown(): string {
  return [
    '# agenticgraph - BytePlus OpenArk Video Generation API Reference (SSOT + Codebase Map)',
    '',
    'App SSOT entrypoint: `canvas/src/features/integrations/byteplusVideoGenerationSsot.ts`',
    'Vendor docs: https://api.byteplus.com/api-explorer/?action=CreateContentsGenerationsTasks&groupName=Video%20Generation%20API&serviceCode=ark&version=2024-01-01',
    '',
    'Generated file: `docs/documents/agenticgraph-byteplus-openark-video-generation-api-reference.md`.',
    '',
    'Table columns:',
    '- `key | type | value | key-description | value-description`: curated BytePlus video request-surface SSOT',
    '- `module | class | function`: where the row is anchored in the agenticgraph codebase',
    '- Rows are sorted by `key` in ascending `a-z` order for static-reference scanability.',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['key', 'type', 'value', 'key-description', 'value-description', 'ssot', 'module', 'class', 'function'],
      rows: getSortedRows().map(buildRow),
    }),
    '',
  ].join('\n')
}

function main(): void {
  const filePath = fileURLToPath(import.meta.url)
  const rootDir = path.resolve(path.dirname(filePath), '../../..')
  const outputPath = path.join(rootDir, 'docs/documents/agenticgraph-byteplus-openark-video-generation-api-reference.md')
  fs.writeFileSync(outputPath, buildMarkdown(), 'utf8')
  process.stdout.write(`Wrote ${outputPath}\n`)
}

main()
