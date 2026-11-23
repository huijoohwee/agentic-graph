import { getMarkdownIt } from '@/features/markdown/markdownIt'
import { markdownPipeRowCells } from '@/features/markdown/ui/markdownDataViewSerialize'
import { extractYamlFrontmatterHeaderBlock } from '@/lib/markdown/frontmatter'

type TableBlock = { start: number; rows: string[]; keys: string[]; heading: string; valid: boolean }

function scan(text: string) {
  const prefix = extractYamlFrontmatterHeaderBlock(text)?.rawBlock || ''
  const lines = text.slice(prefix.length).match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || []
  const content = lines.map(line => line.replace(/[\r\n]+$/, ''))
  const blocks: TableBlock[] = []
  const headings: string[] = []
  for (const token of getMarkdownIt().parse(content.join('\n'), {})) {
    if (token.level || !token.map) continue
    const [start, end] = token.map
    if (token.type === 'heading_open') {
      const level = Number(token.tag.slice(1))
      headings.length = level
      headings[level - 1] = content[start]!.trim()
      continue
    }
    if (token.type !== 'table_open' && token.type !== 'paragraph_open') continue
    const rows = content.slice(start, end)
    // Only a whole pipe-row paragraph can represent a damaged table. Markdown's block
    // parser excludes code fences, indented examples, quotes and embedded HTML.
    if (rows.some(row => !row.includes('|'))) continue
    const keys = rows.map(row => JSON.stringify(markdownPipeRowCells(row)))
    blocks.push({ start, rows, keys, heading: headings.join('\n'), valid: token.type === 'table_open' })
  }
  return { prefix, lines, blocks }
}

function indexRows(tables: TableBlock[]) {
  const index = new Map<string, Set<TableBlock>>()
  for (const table of tables) {
    for (const key of [table.keys[0]!, ...table.keys.slice(2)]) {
      let matches = index.get(key)
      if (!matches) index.set(key, matches = new Set())
      matches.add(table)
    }
  }
  return index
}

function matchTable(local: TableBlock, index: Map<string, Set<TableBlock>>) {
  const scores = new Map<TableBlock, number>()
  for (const key of new Set(local.keys)) {
    for (const source of index.get(key) || []) scores.set(source, (scores.get(source) || 0) + 1)
  }
  const candidates = [...scores.keys()]
  const sameSection = candidates.filter(source => local.heading && source.heading === local.heading)
  const matches = sameSection.length ? sameSection : candidates
  const best = matches.reduce((score, source) => Math.max(score, scores.get(source)!), 0)
  const strongest = matches.filter(source => scores.get(source) === best)
  if (strongest.length === 1) return strongest[0]
}

/** Repair structural lines only. All authored bytes, including mixed line endings, stay in place. */
export function repairCapturedMarkdownTables(current: string, regenerated: string) {
  const local = scan(current)
  const sources = scan(regenerated).blocks.filter(block => block.valid)
  const index = indexRows(sources)
  const matches = new Map<TableBlock, TableBlock[]>()
  for (const block of local.blocks) {
    const source = matchTable(block, index)
    if (source) {
      const group = matches.get(source) || []
      group.push(block)
      matches.set(source, group)
    }
  }

  const insertions = new Map<number, string[]>()
  let unresolved = 0
  for (const source of sources) {
    const group = matches.get(source)
    if (group?.length !== 1) { unresolved++; continue }
    const block = group[0]!
    if (block.valid) continue
    const [head, delimiter] = source.rows as [string, string, ...string[]]
    const width = markdownPipeRowCells(head).length
    if (block.rows.some(row => markdownPipeRowCells(row).length !== width)) { unresolved++; continue }
    const bodyKeys = new Set(source.keys.slice(2))
    const first = block.keys[0]!
    if (first === source.keys[0]) {
      insertions.set(block.start + 1, [delimiter])
    } else if (first === source.keys[1] && block.keys.slice(1).some(key => bodyKeys.has(key))) {
      insertions.set(block.start, [head])
    } else if (bodyKeys.has(first)) {
      insertions.set(block.start, [head, delimiter])
    } else if (block.keys.slice(1).some(key => bodyKeys.has(key)) && block.rows.length === source.rows.length - 1) {
      // A locally renamed header followed by recognizable data.
      insertions.set(block.start + 1, [delimiter])
    } else unresolved++
  }
  if (!insertions.size) return { text: current, repaired: 0, unresolved }
  for (const [at, lines] of insertions) {
    const previous = local.lines[at - 1] || ''
    const eol = previous.match(/(\r\n|\n|\r)$/)?.[0] || local.lines[at]?.match(/(\r\n|\n|\r)$/)?.[0] || '\n'
    const atEnd = at === local.lines.length && !/[\r\n]$/.test(previous)
    local.lines[at] = atEnd ? eol + lines.join(eol) : lines.join(eol) + eol + (local.lines[at] || '')
  }
  return { text: local.prefix + local.lines.join(''), repaired: insertions.size, unresolved }
}
