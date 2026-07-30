import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const repoRoot = resolve(process.cwd(), '..')
const docsRoot = resolve(repoRoot, 'docs/documents')

function listMarkdownFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const abs = resolve(dir, entry)
    const stat = statSync(abs)
    if (stat.isDirectory()) {
      out.push(...listMarkdownFiles(abs))
      continue
    }
    if (stat.isFile() && entry.endsWith('.md')) out.push(abs)
  }
  return out
}

export function testDocsDocumentsForbidDraftAndProposedPrdTadMarkers(): void {
  const forbidden: Array<{ label: string; pattern: RegExp; preambleOnly?: boolean }> = [
    { label: 'draft frontmatter status', pattern: /^status:\s*["']?draft["']?\s*$/im },
    { label: 'proposed frontmatter status', pattern: /^status:\s*["']?proposed["']?\s*$/im },
    { label: 'draft display status', pattern: /^\*\*Status\*\*:\s*Draft\b/im, preambleOnly: true },
    { label: 'proposed display status', pattern: /^\*\*Status\*\*:\s*Proposed\b/im, preambleOnly: true },
    { label: 'proposed PRD/TAD filename token', pattern: /prd-tad-proposed/i },
    { label: 'pending-review draft marker', pattern: /Draft\s*->\s*Pending Review|Draft\s*→\s*Pending Review/i },
    { label: 'proposed title marker', pattern: /\(Proposed\)/i },
  ]

  const matches: string[] = []
  for (const filePath of listMarkdownFiles(docsRoot)) {
    const text = readFileSync(filePath, 'utf8')
    const firstSectionIndex = text.search(/^##\s/m)
    const preamble = firstSectionIndex === -1 ? text : text.slice(0, firstSectionIndex)
    for (const item of forbidden) {
      const target = item.preambleOnly ? preamble : text
      if (item.pattern.test(target)) {
        matches.push(`${relative(repoRoot, filePath)}: ${item.label}`)
      }
    }
  }

  if (matches.length > 0) {
    throw new Error(`docs/documents contains draft/proposed PRD/TAD markers:\n${matches.join('\n')}`)
  }
}
