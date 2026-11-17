import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchWorkspaceUrlContent, setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { isFrontmatterOnlyDoc } from '@/lib/markdown/frontmatter'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { installWebpageProxyFetch } from './helpers/workspaceImportUrlFixtures'

function encodeHtmlAttribute(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

test('inline slide deck import recovers slides from raw HTML before script stripping', async () => {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://example.com/slides'
  const slides = [
    '<!-- ai-slides: slot=opening --><!doctype html><html><head><title>Competition Kickoff</title></head><body><main><h1>Competition Kickoff</h1><p>Moomoo x QoderAI Trading AgentChallenge</p></main></body></html>',
    '<!doctype html><html><head><title>Agenda</title></head><body><main><h1>Agenda</h1><ul><li>Overview</li><li>Timeline</li></ul></main></body></html>',
  ]
  const shellHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Moomoo Qoder Kickoff</title></head>',
    '<body>',
    '<main id="stage"><iframe title="Presentation slide" id="slide"></iframe></main>',
    `<script>const slides=${JSON.stringify(slides)};</script>`,
    '</body>',
    '</html>',
  ].join('')
  const proxyCalls: string[] = []
  const restore = installWebpageProxyFetch(new Map([[url, shellHtml]]), proxyCalls)
  setWorkspaceWebpageDomExportForTests(async () => null)
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    assert.equal(isFrontmatterOnlyDoc(res.text), false, 'expected inline slide deck shell import to materialize Markdown')
    for (const expected of [
      'Moomoo Qoder Kickoff',
      '## Slide 1: Competition Kickoff',
      'Moomoo x QoderAI Trading Agent Challenge',
      '## Slide 2: Agenda',
      'Overview',
      'Timeline',
    ]) {
      assert.ok(res.text.includes(expected), `expected inline slide deck import to preserve ${expected}`)
    }
    assert.equal(res.text.includes('Loading'), false, `expected inline slide deck import to avoid loading shell text, got:\n${res.text}`)
    assert.equal(res.text.includes('<iframe'), false, `expected inline slide deck import to avoid iframe shell markup, got:\n${res.text}`)
    assert.ok(proxyCalls.some(call => call.startsWith('/__webpage_proxy?')), 'expected inline slide deck import to reuse the shared webpage proxy')
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
})

test('inline slide deck import recovers iframe srcdoc slides with rendered slide fidelity', async () => {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://example.com/srcdoc-slides'
  const slides = [
    [
      '<!-- ai-slides: slot=slot-1 -->',
      '<!doctype html><html><head><meta charset="UTF-8"><style>body{font-family:sans-serif}</style></head><body>',
      '<main><h1>What is an agent?</h1><p>Instructions / goals</p><p>Task + boundaries</p></main>',
      '<script id="__qw_sel_bridge">/* ai-slides-present-keyforward-v28 */window.__bridge=true;</script>',
      '</body></html>',
    ].join(''),
    [
      '<!-- ai-slides: slot=slot-2 -->',
      '<!doctype html><html><head><meta charset="UTF-8"></head><body>',
      '<main><h1>Build and run your agent</h1><p>QCA hosted agents</p><p>Skills + OAuth Vault</p></main>',
      '<script id="__qw_sel_bridge">/* ai-slides-present-keyforward-v28 */window.__bridge=true;</script>',
      '</body></html>',
    ].join(''),
  ]
  const shellHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Agent Slides</title></head>',
    '<body>',
    '<main id="stage">',
    slides.map((slide, index) => `<iframe title="Presentation slide" id="slide-${index + 1}" srcdoc="${encodeHtmlAttribute(slide)}"></iframe>`).join(''),
    '</main>',
    '</body>',
    '</html>',
  ].join('')
  const proxyCalls: string[] = []
  const restore = installWebpageProxyFetch(new Map([[url, shellHtml]]), proxyCalls)
  setWorkspaceWebpageDomExportForTests(async () => null)
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    assert.equal(isFrontmatterOnlyDoc(res.text), false, 'expected iframe srcdoc slide deck shell import to materialize Markdown')
    for (const expected of [
      '# Agent Slides',
      '## Slide 1: What is an agent?',
      'Instructions / goals',
      'Task + boundaries',
      '## Slide 2: Build and run your agent',
      'QCA hosted agents',
      'Skills + OAuth Vault',
    ]) {
      assert.ok(res.text.includes(expected), `expected iframe srcdoc import to preserve ${expected}`)
    }
    assert.equal(res.text.includes('__qw_sel_bridge'), false, `expected iframe srcdoc import to strip editor bridge markup, got:\n${res.text}`)
    assert.equal(res.text.includes('<iframe'), false, `expected iframe srcdoc import to avoid iframe shell markup, got:\n${res.text}`)
    assert.ok(proxyCalls.some(call => call.startsWith('/__webpage_proxy?')), 'expected iframe srcdoc deck import to reuse the shared webpage proxy')
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
})
