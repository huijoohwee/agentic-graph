import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

export type ResponsibilityMarkdownRow = {
  key: string
  area: string
  responsibility: string
  modules: string[]
  classes: string[]
  functions: string[]
  imports: string[]
  notes: string
  lineRange: string
}

export type ResponsibilityMarkdownArtifact = {
  relativePath: string
  content: string
}

export const RESPONSIBILITY_MARKDOWN_DIRECTORY = 'docs/agentic-graph-codebase-responsibility-flow'
export const RESPONSIBILITY_MARKDOWN_PART_PATTERN = /^part-\d{3}\.md$/
export const RESPONSIBILITY_ROWS_PER_PART = 200

function buildPart(rows: readonly ResponsibilityMarkdownRow[], partNumber: number): string {
  const table = serializeMarkdownPipeTable({
    columns: [
      'Area',
      'Responsibility',
      'Modules',
      'Classes/Objects',
      'Functions/Methods',
      'Key',
      'Imports',
      'Notes',
      'Line Range',
    ],
    rows: rows.map(row => [
      row.area,
      row.responsibility,
      `\`${row.modules.join(', ')}\``,
      `\`${row.classes.join(', ')}\``,
      `\`${row.functions.join(', ')}\``,
      `\`${row.key}\``,
      `\`${row.imports.join(', ')}\``,
      row.notes,
      `\`${row.lineRange}\``,
    ]),
  })
  return [`# Settings Registry Responsibility Flow — Part ${partNumber}`, '', ...table, ''].join('\n')
}

export function buildResponsibilityMarkdownArtifacts(
  rows: readonly ResponsibilityMarkdownRow[],
): ResponsibilityMarkdownArtifact[] {
  const partCount = Math.ceil(rows.length / RESPONSIBILITY_ROWS_PER_PART)
  const parts = Array.from({ length: partCount }, (_, index) => {
    const partNumber = index + 1
    const filename = `part-${String(partNumber).padStart(3, '0')}.md`
    const start = index * RESPONSIBILITY_ROWS_PER_PART
    return {
      relativePath: `${RESPONSIBILITY_MARKDOWN_DIRECTORY}/${filename}`,
      content: buildPart(rows.slice(start, start + RESPONSIBILITY_ROWS_PER_PART), partNumber),
    }
  })
  const links = parts.map((part, index) => {
    const start = index * RESPONSIBILITY_ROWS_PER_PART + 1
    const end = Math.min(start + RESPONSIBILITY_ROWS_PER_PART - 1, rows.length)
    const filename = part.relativePath.split('/').at(-1) ?? ''
    return `- [Rows ${start}–${end}](agentic-graph-codebase-responsibility-flow/${filename})`
  })
  const index = [
    '# agentic-graph Settings Registry Responsibility Flow',
    '',
    `This generated index covers the ${rows.length} entries declared by \`settingsRegistry\`.`,
    'It does not claim coverage of runtime flags or configuration that are not registered there.',
    'Area and Responsibility are deterministic taxonomy labels; Modules and Line Range are source provenance.',
    '',
    '## Shards',
    '',
    ...links,
    '',
  ].join('\n')
  return [
    { relativePath: 'docs/agentic-graph-codebase-responsibility-flow.md', content: index },
    ...parts,
  ]
}
