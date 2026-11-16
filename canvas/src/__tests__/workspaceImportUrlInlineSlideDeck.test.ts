import { fetchWorkspaceUrlContent } from '@/features/markdown-workspace/workspaceImport'
import { isFrontmatterOnlyDoc } from '@/lib/markdown/frontmatter'
import { setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { installWebpageProxyFetch } from './helpers/workspaceImportUrlFixtures'

export async function testWorkspaceImportUrlImportRecoversInlineSlideDeckShellWithoutDomExport(): Promise<void> {
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
    if (isFrontmatterOnlyDoc(res.text)) {
      throw new Error('expected inline slide deck shell import to materialize non-empty Markdown')
    }
    for (const expected of ['Moomoo Qoder Kickoff', '## Slide 1: Competition Kickoff', 'Moomoo x QoderAI Trading AgentChallenge', '## Slide 2: Agenda', 'Overview', 'Timeline']) {
      if (!res.text.includes(expected)) throw new Error(`expected inline slide deck import to preserve ${expected}`)
    }
    if (res.text.includes('Loading') || res.text.includes('<iframe')) {
      throw new Error(`expected inline slide deck import to avoid preserving shell markup, got:\n${res.text}`)
    }
    if (!proxyCalls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('expected inline slide deck import to reuse the shared webpage proxy')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}
