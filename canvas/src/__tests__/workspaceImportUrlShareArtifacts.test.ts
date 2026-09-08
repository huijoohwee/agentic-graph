import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fetchWorkspaceUrlContent, importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { persistImportedShareUrlArtifacts } from '@/features/markdown-workspace/workspaceImport/shareUrlExport'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { readWorkspaceImportShareExportRootPathSetting, writeWorkspaceImportShareExportRootPathSetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
import { installWebpageProxyFetch } from './helpers/workspaceImportUrlFixtures'

const MIROMIND_SHARE_FIXTURE = { token: 'c753877f-7480-4e76-bf75-89fe18358943', url: ['https://', 'dr.miromind.ai', '/share/', 'c753877f-7480-4e76-bf75-89fe18358943'].join('') }

function buildSiblingDocsRootPathsForTests(): { docsRoot: string; shareRoot: string } {
  const root = path.join(tmpdir(), 'agentic-graph-workspace-root-fixture')
  return {
    docsRoot: path.join(root, 'docs'),
    shareRoot: path.join(root, 'docs_'),
  }
}

export async function testWorkspaceImportUrlExportsEligibleShareArtifactsIntoDocsRoot(): Promise<void> {
  const shareUrl = MIROMIND_SHARE_FIXTURE.url
  const exportToken = MIROMIND_SHARE_FIXTURE.token
  const longParagraph = 'Both Goldman Sachs and UBS assume that the current Hormuz-driven shock is a large but ultimately reversible disturbance in an otherwise stationary oil market, and they underweight the midstream hysteresis and policy feedbacks that structurally raise the price floor.'
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'workspace-import-share-'))
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = `${tempRoot}/docs`
    process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = `${tempRoot}/chat-log`
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const importedThinkingText = [
      'The user wants me to:',
      '1. Analyze recent oil market reports from major institutions like Goldman Sachs and UBS',
      '2. Identify a shared logical blind spot',
      '3. Based on this flaw, re-simulate the global oil price trajectory for the next six months',
      '',
      'Conclusion: By ignoring midstream hysteresis and the new $85 floor, both institutions underestimate prices by $20-40/bbl over the next six months.',
      '',
    ].join('\n')
    const result = await importWorkspaceUrl({
      fs,
      urlRaw: shareUrl,
      parentPath: '/',
      fetchUrlContent: async url => ({
        normalizedUrl: url,
        name: `${exportToken}.md`,
        text: [
          '---',
          `kgWebpageUrl: "${url}"`,
          'kgWebpageView: "markdown"',
          '---',
          '',
          '# MiroMind Share',
          '',
          'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS. Identify a shared logical blind spot. Based on this flaw, re-simulate the global oil price trajectory for the next six months. Show thinking trajectory Summary',
          '',
          '## Shared logical blind spot',
          '',
          'Goldman Sachs and UBS stay visible in the imported report body.',
          '',
          longParagraph,
          '',
          '[1] Goldman Sachs raises 2026 Brent average price forecast by $8 to $85 a barrel. https://www.reuters.com/business/energy/goldman-sachs-raises-2026-brent-crude-average-price-forecast/',
          '',
        ].join('\n'),
        thinkingText: importedThinkingText,
      }),
    })
    if (result.createdPaths.length !== 1 || result.createdPaths[0] !== `/docs_/${exportToken}/${exportToken}.md`) {
      throw new Error(`expected primary import path only, got ${JSON.stringify(result.createdPaths)}`)
    }
    const exported = await fs.readFileText(`/docs_/${exportToken}/${exportToken}.md`)
    const thinking = await fs.readFileText(`/docs_/${exportToken}/${exportToken}-thinking.md`)
    const duplicateRootMarkdown = await fs.readFileText(`/${exportToken}.md`)
    const duplicateRootThinking = await fs.readFileText(`/${exportToken}-thinking.md`)
    const expectedThinking = importedThinkingText
    if (!exported?.includes(`kgWebpageUrl: "${shareUrl}"`)) {
      throw new Error('expected share markdown export to preserve the imported share URL')
    }
    if (thinking !== expectedThinking) {
      throw new Error(`expected import-side share thinking export to preserve the imported thinking trajectory exactly\nEXPECTED:\n${expectedThinking}\n\nACTUAL:\n${thinking}`)
    }
    if (duplicateRootMarkdown !== null || duplicateRootThinking !== null) {
      throw new Error('expected share import to avoid duplicate root-level markdown or thinking artifacts')
    }
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    await rm(tempRoot, { recursive: true, force: true })
  }
}

export async function testWorkspaceImportUrlExportsClaudeChatArtifactsIntoDocsRoot(): Promise<void> {
  const chatUrl = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const urlToken = '6706219f-f8d2-418a-90a9-aae18de752a7', exportToken = 'MiroThinker-global-oil-price-trajectory-simulation-20260407'
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'workspace-import-claude-chat-'))
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = `${tempRoot}/docs`
    process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = `${tempRoot}/chat-log`
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const importedThinkingText = [
      'First, I need to examine the recent oil market reports.',
      '',
      '## Shared blind spot',
      '',
      'The models anchor on a symmetric recovery timeline.',
      '',
    ].join('\n')
    const result = await importWorkspaceUrl({
      fs,
      urlRaw: chatUrl,
      parentPath: '/docs_',
      fetchUrlContent: async url => ({
        normalizedUrl: url,
        name: `${urlToken}.md`, title: 'MiroThinker global oil price trajectory simulation 20260407 - Claude',
        text: [
          '# Oil market blind spot analysis and price forecast',
          '',
          '## The shared blind spot: symmetric recovery fallacy + resolution anchoring',
          '',
          'The deepest flaw is not being wrong about prices.',
          '',
        ].join('\n'),
        thinkingText: importedThinkingText,
      }),
    })
    if (result.createdPaths.length !== 1 || result.createdPaths[0] !== `/docs_/${exportToken}/${exportToken}.md`) {
      throw new Error(`expected Claude chat import to land under /docs_ export root, got ${JSON.stringify(result.createdPaths)}`)
    }
    const exported = await fs.readFileText(`/docs_/${exportToken}/${exportToken}.md`)
    const thinking = await fs.readFileText(`/docs_/${exportToken}/${exportToken}-thinking.md`)
    if (!exported?.includes('# Oil market blind spot analysis and price forecast')) {
      throw new Error('expected Claude chat markdown export to persist the imported body')
    }
    if (thinking !== importedThinkingText) {
      throw new Error(`expected Claude chat thinking export to preserve the imported thinking trajectory\nEXPECTED:\n${importedThinkingText}\n\nACTUAL:\n${thinking}`)
    }
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    await rm(tempRoot, { recursive: true, force: true })
  }
}

export function testWorkspaceImportShareExportRootSettingNormalizesSiblingAbsolutePath(): void {
  const { restore } = initJsdomHarness()
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousValue = readWorkspaceImportShareExportRootPathSetting()
  try {
    const { docsRoot, shareRoot } = buildSiblingDocsRootPathsForTests()
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = docsRoot
    writeWorkspaceImportShareExportRootPathSetting(shareRoot)
    const normalized = readWorkspaceImportShareExportRootPathSetting()
    if (normalized !== '/docs_') {
      throw new Error(`expected sibling absolute docs_ path to normalize to workspace root /docs_, got ${normalized}`)
    }
  } finally {
    writeWorkspaceImportShareExportRootPathSetting(previousValue)
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    restore()
  }
}

export function testWorkspaceSourceRootPathsIncludeConfiguredShareExportRoot(): void {
  const { restore } = initJsdomHarness()
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousValue = readWorkspaceImportShareExportRootPathSetting()
  try {
    const { docsRoot, shareRoot } = buildSiblingDocsRootPathsForTests()
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = docsRoot
    writeWorkspaceImportShareExportRootPathSetting(shareRoot)
    const roots = resolveWorkspaceSourceRootPaths()
    if (!roots.includes('/docs_')) {
      throw new Error(`expected configured share export root /docs_ to participate in workspace source roots, got ${roots.join(', ')}`)
    }
    if (!roots.includes('/docs')) {
      throw new Error(`expected canonical docs root /docs to remain visible alongside share export root, got ${roots.join(', ')}`)
    }
  } finally {
    writeWorkspaceImportShareExportRootPathSetting(previousValue)
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    restore()
  }
}

export async function testWorkspaceImportUrlUsesConfiguredShareExportRootSetting(): Promise<void> {
  const { restore } = initJsdomHarness()
  const shareUrl = MIROMIND_SHARE_FIXTURE.url
  const exportToken = MIROMIND_SHARE_FIXTURE.token
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousValue = readWorkspaceImportShareExportRootPathSetting()
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'workspace-import-share-custom-root-'))
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = `${tempRoot}/docs`
    process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = `${tempRoot}/chat-log`
    writeWorkspaceImportShareExportRootPathSetting('/import-share-artifacts')
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    await importWorkspaceUrl({
      fs,
      urlRaw: shareUrl,
      parentPath: '/',
      fetchUrlContent: async url => ({
        normalizedUrl: url,
        name: 'miromind-share.md',
        text: [
          '---',
          `kgWebpageUrl: "${url}"`,
          'kgWebpageView: "markdown"',
          '---',
          '',
          '# MiroMind Share',
          '',
          'Configured export root should win.',
          '',
        ].join('\n'),
      }),
    })
    const exported = await fs.readFileText(`/import-share-artifacts/${exportToken}/${exportToken}.md`)
    if (!exported?.includes('Configured export root should win.')) {
      throw new Error('expected import share artifacts to honor the configured export root setting')
    }
  } finally {
    writeWorkspaceImportShareExportRootPathSetting(previousValue)
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    await rm(tempRoot, { recursive: true, force: true })
    restore()
  }
}

export async function testWorkspaceImportUrlShareThinkingTrajectoryUsesClickedSiblingExport(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = MIROMIND_SHARE_FIXTURE.url
  const shellHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Shared Chat - MiroThinker</title></head>',
    '<body>',
    '<main><p>Loading shared chat...</p></main>',
    '</body>',
    '</html>',
  ].join('')
  const renderedText = [
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS. Identify a shared logical blind spot. Based on this flaw, re-simulate the global oil price trajectory for the next six months.',
    'Show thinking trajectory',
    '',
    'Summary',
    '',
    'Shared logical blind spot in recent Goldman Sachs and UBS oil reports.',
  ].join('\n')
  const renderedThinkingText = [
    'The user wants me to:',
    '1. Analyze recent oil market reports from major institutions like Goldman Sachs and UBS',
    '2. Identify a shared logical blind spot',
    '3. Based on this flaw, re-simulate the global oil price trajectory for the next six months',
  ].join('\n')
  const recoveredHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Shared Chat - MiroThinker</title></head>',
    '<body>',
    '<main>',
    '<h1>Analyze recent oil market reports from major institutions like Goldman Sachs and UBS. Identify a shared logical blind spot. Based on this flaw, re-simulate the global oil price trajectory for the next six months.</h1>',
    '<h2>Show thinking trajectory</h2>',
    '<h3>Summary</h3>',
    '<ol><li>Shared logical blind spot in recent Goldman Sachs and UBS oil reports.</li></ol>',
    '</main>',
    '</body>',
    '</html>',
  ].join('')
  const recoveredThinkingHtml = [
    '<section class="wk-main-content">',
    '<blockquote><p>The user wants me to compare the current report against the Goldman Sachs and UBS baselines.</p></blockquote>',
    '<ol>',
    '<li>Analyze recent oil market reports from major institutions like Goldman Sachs and UBS</li>',
    '<li>Identify a shared logical blind spot</li>',
    '<li>Re-simulate the global oil price trajectory for the next six months</li>',
    '</ol>',
    '<p>Key link: <a href="https://www.reuters.com/example">Reuters</a></p>',
    '<p><img alt="oil chart" src="https://example.com/oil-chart.png" /></p>',
    '<table><thead><tr><th>Institution</th><th>Price</th></tr></thead><tbody><tr><td>Goldman</td><td>$85/bbl</td></tr></tbody></table>',
    '<pre><code class="language-python">print("Brent", 85)</code></pre>',
    '<p>Inline math $x+y$ stays visible.</p>',
    '</section>',
  ].join('')
  const proxyCalls: string[] = []
  const domCalls: Array<{ mode: string; clickTextHints: string[]; textCaptureTarget: string }> = []
  const restore = installWebpageProxyFetch(new Map([[url, shellHtml]]), proxyCalls)
  setWorkspaceWebpageDomExportForTests(async args => {
    domCalls.push({
      mode: String(args.mode || ''),
      clickTextHints: Array.isArray(args.clickTextHints) ? args.clickTextHints.map(value => String(value || '')) : [],
      textCaptureTarget: String(args.textCaptureTarget || ''),
    })
    if (args.mode === 'html' && args.textCaptureTarget === 'clicked-next-sibling') {
      return { text: recoveredThinkingHtml, title: 'Shared Chat - MiroThinker', clipped: false }
    }
    if (args.mode === 'html') return { text: recoveredHtml, title: 'Shared Chat - MiroThinker', clipped: false }
    if (args.textCaptureTarget === 'clicked-next-sibling') {
      return { text: renderedThinkingText, title: 'Shared Chat - MiroThinker', clipped: false }
    }
    return { text: renderedText, title: 'Shared Chat - MiroThinker', clipped: false }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.thinkingText || !res.thinkingText.includes('> The user wants me to compare the current report against the Goldman Sachs and UBS baselines.')) {
      throw new Error(`expected share import to preserve structured blockquote thinking content, got:\n${String(res.thinkingText || '')}`)
    }
    if (!res.thinkingText.includes('1. Analyze recent oil market reports from major institutions like Goldman Sachs and UBS')) {
      throw new Error(`expected share import to preserve ordered-list thinking content, got:\n${String(res.thinkingText || '')}`)
    }
    if (!res.thinkingText.includes('[Reuters](https://www.reuters.com/example)')) {
      throw new Error(`expected share import to preserve markdown links in thinking content, got:\n${String(res.thinkingText || '')}`)
    }
    if (!res.thinkingText.includes('![oil chart](https://example.com/oil-chart.png)')) {
      throw new Error(`expected share import to preserve markdown images in thinking content, got:\n${String(res.thinkingText || '')}`)
    }
    if (!res.thinkingText.includes('| Institution | Price |') || !res.thinkingText.includes('| Goldman | $85/bbl |')) {
      throw new Error(`expected share import to preserve markdown tables in thinking content, got:\n${String(res.thinkingText || '')}`)
    }
    if (!res.thinkingText.includes('```python') || !res.thinkingText.includes('print("Brent", 85)')) {
      throw new Error(`expected share import to preserve fenced code blocks in thinking content, got:\n${String(res.thinkingText || '')}`)
    }
    if (!res.thinkingText.includes('Inline math $x+y$ stays visible.')) {
      throw new Error(`expected share import to preserve inline math markers in thinking content, got:\n${String(res.thinkingText || '')}`)
    }
    if (res.thinkingText.includes('The user wants me to:\n1. Analyze recent oil market reports')) {
      throw new Error(`expected share import to avoid collapsing structured thinking content to plain rendered text, got:\n${String(res.thinkingText || '')}`)
    }
    if (!res.text.includes('### Summary') || !res.text.includes('1. Shared logical blind spot in recent Goldman Sachs and UBS oil reports.')) {
      throw new Error(`expected share import markdown body to remain the structured summary export, got:\n${res.text}`)
    }
    if (res.thinkingText === res.text) {
      throw new Error('expected thinking trajectory export to remain distinct from the markdown summary body')
    }
    const thinkingHtmlCall = domCalls.find(call => call.mode === 'html' && call.textCaptureTarget === 'clicked-next-sibling') || null
    if (!thinkingHtmlCall) {
      throw new Error(`expected share thinking recovery to request clicked sibling html capture, got ${JSON.stringify(domCalls)}`)
    }
    const thinkingCall = domCalls.find(call => call.textCaptureTarget === 'clicked-next-sibling') || null
    if (!thinkingCall) {
      throw new Error(`expected share thinking recovery to request clicked sibling capture, got ${JSON.stringify(domCalls)}`)
    }
    if (!thinkingCall.clickTextHints.includes('Show thinking trajectory')) {
      throw new Error(`expected share thinking recovery to request the trajectory toggle hint, got ${JSON.stringify(thinkingCall.clickTextHints)}`)
    }
    if (!proxyCalls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('expected share thinking import to exercise the shared webpage proxy path')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlShareThinkingTrajectoryDoesNotUseWholeDocumentHtmlFallback(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = MIROMIND_SHARE_FIXTURE.url
  const shellHtml = [
    '<!doctype html>',
    '<html><body>',
    '<main>',
    '<p>Analyze recent oil market reports from major institutions like Goldman Sachs and UBS.</p>',
    '<h2>Show thinking trajectory</h2>',
    '<section>The user wants me to:</section>',
    '<h2>Summary</h2>',
    '<h3>1. Shared logical blind spot in recent Goldman Sachs & UBS oil reports</h3>',
    '</main>',
    '</body></html>',
  ].join('')
  const recoveredHtml = [
    '<section class="report-container">',
    '<h2>Summary</h2>',
    '<h3>1. Shared logical blind spot in recent Goldman Sachs & UBS oil reports</h3>',
    '<p>This belongs to the main report, not the thinking trajectory.</p>',
    '</section>',
  ].join('')
  const renderedThinkingText = [
    'The user wants me to:',
    '1. Analyze recent oil market reports from major institutions like Goldman Sachs and UBS',
    '2. Identify a shared logical blind spot',
    '3. Re-simulate the global oil price trajectory for the next six months',
  ].join('\n')
  const restore = installWebpageProxyFetch(new Map([[url, shellHtml]]), [])
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode === 'html' && args.textCaptureTarget === 'clicked-next-sibling') {
      return { text: recoveredHtml, title: 'Shared Chat - MiroThinker', clipped: false }
    }
    if (args.mode === 'html') return { text: recoveredHtml, title: 'Shared Chat - MiroThinker', clipped: false }
    if (args.textCaptureTarget === 'clicked-next-sibling') {
      return { text: renderedThinkingText, title: 'Shared Chat - MiroThinker', clipped: false }
    }
    return { text: shellHtml, title: 'Shared Chat - MiroThinker', clipped: false }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.thinkingText?.includes('The user wants me to:')) {
      throw new Error(`expected share thinking recovery to preserve clicked-sibling rendered text when scoped html falls back to report content, got:\n${String(res.thinkingText || '')}`)
    }
    if (res.thinkingText.includes('## Summary') || res.thinkingText.includes('Shared logical blind spot in recent Goldman Sachs & UBS oil reports')) {
      throw new Error(`expected share thinking recovery to reject whole-document/report html fallback, got:\n${String(res.thinkingText || '')}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlShareArtifactPersistNormalizesThinkingMarkdown(): Promise<void> {
  const fs = createMemoryWorkspaceFs()
  const rootFolderPath = await mkdtemp(path.join(tmpdir(), 'kg-share-thinking-export-'))
  try {
    const persisted = await persistImportedShareUrlArtifacts({
      fs,
      url: MIROMIND_SHARE_FIXTURE.url,
      importedName: `${MIROMIND_SHARE_FIXTURE.token}.md`,
      importedText: '# Summary\n',
      importedThinkingText: [
        '<section class="flex items-center gap-2"><section></section><section><span class="text-p text-secondary">Found 6 results</span></section></section>',
        '- <section class="flex items-center gap-2"><section></section><section><span class="text-p text-secondary">Run Code</span></section></section>',
        '```python',
        '- import numpy as np',
        '```',
      ].join('\n'),
      importedWorkspacePath: `/docs_/${MIROMIND_SHARE_FIXTURE.token}/${MIROMIND_SHARE_FIXTURE.token}.md`,
      rootFolderPath,
    })
    if (!persisted) throw new Error('expected eligible share url to persist markdown artifacts')
    const thinkingText = String(await fs.readFileText(persisted.exportThinkingPath || '') || '')
    if (thinkingText.includes('<section class=')) {
      throw new Error(`expected persisted thinking markdown to drop raw html wrappers, got:\n${thinkingText}`)
    }
    if (!thinkingText.includes('Found 6 results')) {
      throw new Error(`expected persisted thinking markdown to preserve visible wrapper text, got:\n${thinkingText}`)
    }
    if (!thinkingText.includes('- Run Code')) {
      throw new Error(`expected persisted thinking markdown to preserve list markers around wrapper text, got:\n${thinkingText}`)
    }
    if (!thinkingText.includes('```python\nimport numpy as np\n```')) {
      throw new Error(`expected persisted thinking markdown to normalize fenced code lines, got:\n${thinkingText}`)
    }
  } finally {
    await rm(rootFolderPath, { recursive: true, force: true })
  }
}

export async function testWorkspaceImportUrlShareArtifactDoesNotBackfillThinkingFromMainMarkdown(): Promise<void> {
  const fs = createMemoryWorkspaceFs()
  const rootFolderPath = await mkdtemp(path.join(tmpdir(), 'kg-share-thinking-no-backfill-'))
  try {
    const persisted = await persistImportedShareUrlArtifacts({
      fs,
      url: MIROMIND_SHARE_FIXTURE.url,
      importedName: `${MIROMIND_SHARE_FIXTURE.token}.md`,
      importedText: [
        '---',
        `kgWebpageUrl: "${MIROMIND_SHARE_FIXTURE.url}"`,
        'kgWebpageView: "markdown"',
        '---',
        '',
        '# Summary',
        '',
        'This content belongs only in the main markdown artifact.',
      ].join('\n'),
      importedThinkingText: '',
      importedWorkspacePath: `/docs_/${MIROMIND_SHARE_FIXTURE.token}/${MIROMIND_SHARE_FIXTURE.token}.md`,
      rootFolderPath,
    })
    if (!persisted) throw new Error('expected eligible share url to persist markdown artifacts')
    if (persisted.exportThinkingPath) {
      throw new Error(`expected share import without thinking payload to avoid a thinking artifact path, got ${persisted.exportThinkingPath}`)
    }
  } finally {
    await rm(rootFolderPath, { recursive: true, force: true })
  }
}
