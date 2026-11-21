import assert from 'node:assert/strict'
import { buildMarkdownTokensKey, lexMarkdown } from '@/features/markdown/ui/markdownPreviewLex'
import { buildDataViewCandidates } from '@/features/markdown-workspace/main/viewer/markdownWorkspaceDataViewCandidates'

export function testLargeDocumentsKeepCompleteSourceTables() {
  const prose = 'Long source text. '.repeat(20_000)
  const header = '| Item | Quantity |\n| --- | --- |'
  const small = `${header}\n| Copper | 3 |`
  const oversized = `${header}\n| ${prose} | 4 |`
  const text = [prose, '## **Stock**', small, '## Stock', oversized, '## **Stock**', small].join('\n\n')
  const { tokens } = lexMarkdown(text)
  const candidates = buildDataViewCandidates(text, buildMarkdownTokensKey(text), tokens, false)
  assert.deepEqual(candidates.map(view => view.label), ['**Stock**', '**Stock** (2)'])
  for (const { table, view, id } of candidates) {
    assert.equal(text.split('\n').slice(table.startLine - 1, table.endLine).join('\n'), small)
    assert.equal(id, `md-block:${table.startLine}-${table.endLine}`)
    assert.deepEqual(view.rows.map(record => record.cells), [['Copper', '3']])
  }
}
