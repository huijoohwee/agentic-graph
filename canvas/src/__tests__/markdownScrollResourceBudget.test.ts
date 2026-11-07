import test from 'node:test'
import assert from 'node:assert/strict'
import { lexMarkdown } from '@/features/markdown/ui/markdownPreviewLex'
import { deriveMarkdownPreviewDocumentMode } from '@/lib/markdown-core/ui/markdownPreviewViewerMode'
import { builtInParsers } from '@/features/parsers/default'

const mode = (sourceMarkdownText: string) => deriveMarkdownPreviewDocumentMode({
  sourceMarkdownText, tokens: lexMarkdown(sourceMarkdownText).tokens,
}).markdownLargeDocumentMode

test('a short document with a dense nested list uses the bounded preview', () => {
  const text = Array.from({ length: 900 }, (_, i) => `- **Entry ${i}** [Open](https://example.invalid/${i})`).join('\n')
  assert.ok(text.length < 100_000)
  assert.ok(lexMarkdown(text).tokens.length < 10)
  assert.equal(mode(text), true)
  assert.equal(mode('# Small document\n\n- **One** entry\n- Two'), false)
})

test('table cells count toward preview complexity', () => {
  const text = '| A | B |\n| --- | --- |\n' + '| **First** | Second |\n'.repeat(700)
  assert.equal(mode(text), true)
})

test('generated document graphs are bounded in both parser paths', async () => {
  const parser = builtInParsers.find(parser => parser.id === 'markdown')!
  const text = '---\nkgCanvasRenderMode: 2d\nkgCanvas2dRenderer: d3\n---\n\n# Search results\n\n' + Array.from({ length: 600 }, (_, i) => `- Result ${i}`).join('\n')
  for (const result of [parser.parse('results.md', text), await parser.parseAsync!('results.md', text)]) {
    assert.equal(result.graphData.context, 'markdown-large')
    assert.equal(result.graphData.nodes.length, 1)
    assert.equal(result.graphData.edges.length, 0)
    assert.equal(result.graphData.nodes[0].properties?.length, text.length)
    assert.equal(result.graphData.nodes[0].metadata?.summaryReason, 'structure')
    assert.equal(result.graphData.nodes[0].properties?.preview, text)
  }
  assert.notEqual(parser.parse('small.md', '# Title\n\n- One\n- Two').graphData.context, 'markdown-large')
})
