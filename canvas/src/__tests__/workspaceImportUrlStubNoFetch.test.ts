import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fetchWorkspaceUrlContent, importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { isFrontmatterOnlyDoc } from '@/lib/markdown/frontmatter'
import { setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { shouldApplyImportedCanvasDocumentToGraph } from '@/features/markdown-workspace/workspaceImport/applyPolicy'
import { pickFirstCreatedFilePathForImportFocus, resolveImportedCanvasDocumentApplyToGraph } from '@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { buildStrybldrVideoHandoffFromGraphData } from '@/features/strybldr/strybldrStoryboard'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import {
  chooseDomRecoveredMarkdown,
  chooseWebpageMarkdownByContentCoverage,
} from '@/features/markdown-workspace/workspaceImport/webpageMarkdownFidelity'
import { pruneWebpageChromeText } from '@/lib/websites/webpageShellHeuristics'
import { plainTextToMarkdown } from '@/lib/markdown/plainTextToMarkdown'
import { restoreWebpageMarkdownSyntaxFidelity } from '@/lib/markdown/webpageMarkdownSyntaxFidelity'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { persistImportedShareUrlArtifacts } from '@/features/markdown-workspace/workspaceImport/shareUrlExport'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  readWorkspaceImportShareExportRootPathSetting,
  writeWorkspaceImportShareExportRootPathSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import { resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
type GlobalWithFetch = typeof globalThis & { fetch?: typeof fetch }; const MIROMIND_SHARE_FIXTURE = { token: 'c753877f-7480-4e76-bf75-89fe18358943', url: ['https://', 'dr.miromind.ai', '/share/', 'c753877f-7480-4e76-bf75-89fe18358943'].join('') }
const webpageHtml = (title: string, extraHead = '') => [
  '<!doctype html>',
  '<html>',
  '<head>',
  `<title>${title}</title>`,
  extraHead,
  '</head>',
  '<body>',
  `<main><h1>${title}</h1><p>Imported URL parsing renders body content through the shared webpage pipeline.</p></main>`,
  '</body>',
  '</html>',
].join('')
function createMinimalGlbBytes(): Uint8Array {
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
  })
  const jsonRaw = new TextEncoder().encode(json)
  const jsonLength = Math.ceil(jsonRaw.byteLength / 4) * 4
  const totalLength = 12 + 8 + jsonLength
  const bytes = new Uint8Array(totalLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, totalLength, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.set(jsonRaw, 20)
  bytes.fill(0x20, 20 + jsonRaw.byteLength, 20 + jsonLength)
  return bytes
}
function buildSiblingDocsRootPathsForTests(): { docsRoot: string; shareRoot: string } {
  const root = path.join(tmpdir(), 'agentic-graph-workspace-root-fixture')
  return {
    docsRoot: path.join(root, 'docs'),
    shareRoot: path.join(root, 'docs_'),
  }
}
function installWebpageProxyFetch(htmlByUrl: Map<string, string>, calls: string[]) {
  const g = globalThis as GlobalWithFetch
  const prev = g.fetch
  g.fetch = (async (input: unknown) => {
    const url = input instanceof URL ? input.toString() : String(input || '')
    calls.push(url)
    if (url.startsWith('/__fetch_remote?url=')) {
      throw new Error(`unexpected legacy remote fetch for webpage import: ${url}`)
    }
    if (!url.startsWith('/__webpage_proxy?')) {
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }
    const qs = new URLSearchParams(url.slice(url.indexOf('?') + 1))
    const sourceUrl = qs.get('url') || ''
    const first = htmlByUrl.values().next()
    const html = htmlByUrl.get(sourceUrl) || (first.done ? '' : first.value) || ''
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }) as unknown as typeof fetch
  return () => {
    g.fetch = prev
  }
}
function installYouTubeTranscriptFetch(calls: string[]) {
  const g = globalThis as GlobalWithFetch
  const prev = g.fetch
  g.fetch = (async (input: unknown) => {
    const url = input instanceof URL ? input.toString() : String(input || '')
    calls.push(url)
    if (!url.startsWith('/__youtube_transcript?')) {
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }
    const qs = new URLSearchParams(url.slice(url.indexOf('?') + 1))
    const sourceUrl = qs.get('url') || ''
    const parsed = new URL(sourceUrl)
    const videoId = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean)[0] || ''
    const title = `Transcript ${videoId}`
    return new Response(JSON.stringify({
      ok: true,
      name: `youtube-${videoId}.md`,
      markdown: `# ${title}\n\n${sourceUrl};\n\nTranscript body.\n`,
      transcript: {
        ok: true,
        title,
        video_id: videoId,
        source_url: sourceUrl,
        segment_count: 1,
        segments: [{ text: 'Transcript body.', start: 0, duration: 1 }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return () => {
    g.fetch = prev
  }
}
async function assertFetchedImportFor(url: string) {
  resetWorkspaceUrlContentCacheForTests()
  const calls: string[] = []
  const restore = installWebpageProxyFetch(new Map([[url, webpageHtml('Import URL Fixture')]]), calls)
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import' })
    if (!res || typeof res.text !== 'string') throw new Error('Expected result text')
    if (!res.text.includes('kgWebpageUrl:')) throw new Error('Expected webpage frontmatter')
    if (!res.text.includes(url)) throw new Error('Expected URL in stub')
    if (!res.text.includes('kgWebpageView:')) throw new Error('Expected view in stub')
    if (res.text.includes('Fetching content in background')) throw new Error('Import must not leave a background hydration placeholder')
    if (res.text.includes('kgWebpageHydrate')) throw new Error('Import must not create self-hydrating webpage stubs')
    if (!res.text.includes('Imported URL parsing renders body content')) throw new Error('Expected parsed webpage body content')
    if (res.text.includes('<html') || res.text.includes('<script')) throw new Error('Import must not embed raw HTML')
    if (!calls.some(call => call.startsWith('/__webpage_proxy?'))) throw new Error('Expected shared webpage proxy ingestion')
  } finally {
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlImportFetchesAndParsesWebpage(): Promise<void> {
  await assertFetchedImportFor('https://example.com/')
  await assertFetchedImportFor('https://vercel.com/')
}
export async function testWorkspaceImportUrlViewHintsUseSingleIngestionPass(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const jsonUrl = 'https://example.com/json'
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'JSON Import Fixture',
    url: jsonUrl,
  })
  const urls = {
    json: jsonUrl,
    markdown: 'https://example.com/markdown',
    html: 'https://example.com/html',
  } as const
  const calls: string[] = []
  const restore = installWebpageProxyFetch(
    new Map([
      [urls.json, webpageHtml('JSON Import Fixture', `<script type="application/ld+json">${jsonLd}</script>`)],
      [urls.markdown, webpageHtml('Markdown Import Fixture')],
      [urls.html, webpageHtml('HTML Import Fixture')],
    ]),
    calls,
  )
  try {
    const views = ['json', 'markdown', 'html'] as const
    for (const view of views) {
      const res = await fetchWorkspaceUrlContent(urls[view], { mode: 'import', viewHint: view })
      if (!res || typeof res.text !== 'string') throw new Error(`expected ${view} import result`)
      if (!res.text.includes(`kgWebpageView: "${view}"`)) {
        throw new Error(`expected ${view} import to preserve view frontmatter`)
      }
      if (res.text.includes('Fetching content in background')) {
        throw new Error(`expected ${view} import to avoid background hydration placeholder`)
      }
      if (res.text.includes('kgWebpageHydrate')) {
        throw new Error(`expected ${view} import to avoid hydrate frontmatter`)
      }
      if (res.text.includes('<html') || res.text.includes('<script')) {
        throw new Error(`expected ${view} import to avoid embedding fetched HTML`)
      }
    }
    if (!calls.some(call => call.startsWith('/__webpage_proxy?'))) throw new Error('expected webpage proxy import fetches')
  } finally {
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlYouTubePreservesPaneContentFormats(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const calls: string[] = []
  const restore = installYouTubeTranscriptFetch(calls)
  try {
    const fakeId = 'AbC_DeF1234'
    const watchUrl = `https://www.youtube.com/watch?v=${fakeId}&t=42`
    const markdownRes = await fetchWorkspaceUrlContent(watchUrl, { mode: 'import', viewHint: 'markdown' })
    if (!markdownRes.text.includes(`kgYoutubeVideoId: "${fakeId}"`)) {
      throw new Error('expected YouTube workspace import to preserve the case-sensitive video id in frontmatter')
    }
    if (!markdownRes.text.includes('kgYoutubeFormat: "markdown"')) {
      throw new Error('expected markdown import to preserve markdown format frontmatter')
    }
    if (!markdownRes.text.includes(`[![Transcript ${fakeId}](https://i.ytimg.com/vi/${fakeId}/hqdefault.jpg)](${watchUrl})`)) {
      throw new Error('expected markdown import to render the source URL as a linked thumbnail image')
    }
    const jsonUrl = `https://www.youtube.com/watch?v=${fakeId}&t=42&pane=json`
    const jsonRes = await fetchWorkspaceUrlContent(jsonUrl, { mode: 'import', viewHint: 'json' })
    if (!jsonRes.text.includes(`kgYoutubeVideoId: "${fakeId}"`)) {
      throw new Error('expected JSON import to preserve the case-sensitive video id in frontmatter')
    }
    if (!jsonRes.text.includes('kgYoutubeFormat: "json"')) {
      throw new Error('expected JSON import to preserve json format frontmatter')
    }
    if (!jsonRes.text.includes('```json') || !jsonRes.text.includes(`"video_id": "${fakeId}"`)) {
      throw new Error('expected JSON import to keep transcript JSON visible in the workspace file')
    }
    const rendererRes = await fetchWorkspaceUrlContent(watchUrl, {
      mode: 'import',
      viewHint: 'html',
      canvas2dRenderer: 'd3',
      documentSemanticMode: 'keyword',
    })
    if (shouldApplyImportedCanvasDocumentToGraph({ path: '/youtube-transcript.md', text: rendererRes.text })) {
      throw new Error('expected renderer-selected YouTube imports to avoid graph parsing without canvas frontmatter')
    }
    const fs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        {
          path: '/youtube-transcript.md',
          parentPath: '/',
          kind: 'file',
          name: 'youtube-transcript.md',
          text: rendererRes.text,
          updatedAtMs: 2,
        },
      ],
    })
    const applyToGraph = await resolveImportedCanvasDocumentApplyToGraph({
      fs,
      createdPaths: ['/youtube-transcript.md'],
    })
    if (applyToGraph) throw new Error('expected imported YouTube transcript content to remain a workspace document')
    const transcriptRequestCount = calls.filter(call => call.startsWith('/__youtube_transcript?')).length; if (transcriptRequestCount !== 2) throw new Error(`expected renderer-selected import to reuse the cached YouTube conversion, got ${transcriptRequestCount} transcript requests`)
  } finally {
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlYouTubeStrybldrCreatesStoryboardDocument(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const calls: string[] = []
  const restore = installYouTubeTranscriptFetch(calls)
  try {
    const fakeId = 'StRyB1dR234'
    const watchUrl = `https://www.youtube.com/watch?v=${fakeId}`
    const fs = createMemoryWorkspaceFs()
    const res = await importWorkspaceUrl({
      fs,
      urlRaw: watchUrl,
      canvas2dRenderer: 'storyboard',
      documentSemanticMode: 'document',
    })
    if (res.applyToGraph !== true) throw new Error('expected Strybldr URL import to apply the generated storyboard graph')
    if (res.createdPaths.length !== 2) throw new Error(`expected source plus Strybldr document, got ${res.createdPaths.join(', ')}`)
    const storyPath = res.createdPaths[0] || ''
    const sourcePath = res.createdPaths[1] || ''
    if (!storyPath.endsWith('.strybldr.md')) throw new Error(`expected first created path to be Strybldr document, got ${storyPath}`)
    if (!sourcePath.includes(`youtube-${fakeId}.md`)) throw new Error(`expected second created path to be YouTube source markdown, got ${sourcePath}`)
    const focusPath = await pickFirstCreatedFilePathForImportFocus(fs, res.createdPaths)
    if (focusPath !== storyPath) throw new Error(`expected import focus helper to preserve created path priority, got ${String(focusPath || '<none>')}`)
    const storyText = String((await fs.readFileText(storyPath)) || '')
    if (!storyText.includes('kgCanvas2dRenderer: "storyboard"')) throw new Error('expected generated Strybldr frontmatter')
    if (!/mediaKind:\s*["']?video["']?/.test(storyText)) throw new Error('expected URL source unit to preserve video media kind')
    if (!storyText.includes(watchUrl)) throw new Error('expected generated Strybldr source to preserve normalized URL provenance')
    const parsed = await loadGraphDataFromTextViaParser('youtube.strybldr.md', storyText, { applyToStore: false })
    if (parsed?.parserId !== 'strybldr-storyboard') throw new Error(`expected Strybldr parser, got ${String(parsed?.parserId || '')}`)
    if (String(parsed.graphData?.metadata && (parsed.graphData.metadata as Record<string, unknown>).kgCanvas2dRenderer || '') !== 'storyboard') throw new Error('expected parsed storyboard graph to activate Storyboard renderer metadata')
    const board = buildStoryboardBoardModel({ graphData: parsed.graphData, graphRevision: 1 })
    const cards = board.lanes.flatMap(lane => lane.cards)
    if (!cards.some(card => card.media?.kind === 'iframe' && /\/embed\//i.test(card.media.url))) throw new Error(`expected generated Strybldr YouTube graph to expose renderable iframe media, got ${JSON.stringify(cards.map(card => card.media))}`)
    const frameReference = cards.flatMap(card => card.references).find(reference => reference.kind === 'image' && reference.url.startsWith('/__video_frame?'))
    if (!frameReference) throw new Error(`expected generated Strybldr YouTube graph to expose frame-extraction image references, got ${JSON.stringify(cards.map(card => card.references))}`)
    const frameRequest = new URL(frameReference.url, 'https://example.test')
    if (frameRequest.searchParams.get('url') !== watchUrl || frameRequest.searchParams.get('time') !== '0') throw new Error(`expected frame extraction request to preserve input URL and default timestamp, got ${frameReference.url}`)
    if (!cards.some(card => card.references.some(reference => reference.kind === 'image' && reference.url.includes(`/vi/${fakeId}/`)))) throw new Error(`expected generated Strybldr YouTube graph to keep provider-safe fallback thumbnail references, got ${JSON.stringify(cards.map(card => card.references))}`)
    const handoff = buildStrybldrVideoHandoffFromGraphData(parsed.graphData)
    if (handoff.cards.length < 1 || !handoff.prompt) throw new Error('expected generated Strybldr storyboard graph to be runnable by Toolbar Run all')
    if (!handoff.cards.some(card => card.references.some(reference => reference.startsWith('/__video_frame?')))) throw new Error(`expected Toolbar Run all handoff cards to carry frame-extraction references, got ${JSON.stringify(handoff.cards)}`)
    if (!String(handoff.referenceImageUrl || '').includes(`/vi/${fakeId}/`)) throw new Error(`expected Toolbar Run all handoff to retain an external provider-safe reference image, got ${String(handoff.referenceImageUrl || '')}`)
    if (!res.corpusManifest || res.corpusManifest.sourceUnits.length !== 1) throw new Error('expected URL import result to expose one neutral corpus source unit')
    const sourceUnit = res.corpusManifest.sourceUnits[0]
    if (sourceUnit?.mediaKind !== 'video' || sourceUnit.provenance.importMode !== 'url') {
      throw new Error(`expected video URL source-unit provenance, got ${JSON.stringify(sourceUnit)}`)
    }
  } finally {
    restore()
    resetWorkspaceUrlContentCacheForTests()
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
export async function testWorkspaceImportApplyPolicyIgnoresBodyOnlyCanvasWords(): Promise<void> {
  const transcriptText = [
    '---',
    'kgYoutubeVideoId: "neutralVideoId"',
    'kgYoutubeFormat: "markdown"',
    '---',
    '',
    '# Transcript',
    '',
    'The spoken transcript can contain YAML-looking words.',
    'flow:',
    'widget_bundle:',
    '$schema: "agentic-os-pipeline/v1"',
    '',
  ].join('\n')
  if (shouldApplyImportedCanvasDocumentToGraph({ path: '/youtube-transcript.md', text: transcriptText })) {
    throw new Error('expected import graph-apply policy to inspect only the frontmatter header')
  }
  const canvasText = [
    '---',
    'flow:',
    '  nodes: []',
    '---',
    '',
    '# Canvas document',
    '',
  ].join('\n')
  if (!shouldApplyImportedCanvasDocumentToGraph({ path: '/canvas.md', text: canvasText })) {
    throw new Error('expected frontmatter flow documents to apply to graph')
  }
}
export async function testWorkspaceImportToCanvasRespectsApplyToGraphFalseForTranscripts(): Promise<void> {
  const prevSourceFiles = useGraphStore.getState().sourceFiles
  try {
    useGraphStore.getState().setSourceFiles([])
    const fs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        {
          path: '/youtube-transcript.md',
          parentPath: '/',
          kind: 'file',
          name: 'youtube-transcript.md',
          text: '# Transcript\n\nTranscript body.',
          updatedAtMs: 2,
        },
      ],
    })
    const result = await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: ['/youtube-transcript.md' as never],
      opts: { applyToGraph: false },
    })
    if (result.parsedCount !== 0) throw new Error(`expected no parser work when applyToGraph=false, got ${result.parsedCount}`)
    const file = useGraphStore.getState().sourceFiles.find(item => item.name === 'youtube-transcript.md')
    if (!file) throw new Error('expected imported transcript to stay visible in Source Files')
    if (file.status === 'parsed' || file.status === 'error') {
      throw new Error(`expected transcript Source File to avoid auto-parse status churn, got ${String(file.status)}`)
    }
  } finally {
    useGraphStore.getState().setSourceFiles(prevSourceFiles)
  }
}
export async function testWorkspaceImportUrlPrefersHigherCoverageMarkdownFallback(): Promise<void> {
  const converted = [
    '# Session 32',
    '',
    'A later section survived conversion, but the opening agenda and most transcripts are missing.',
  ].join('\n')
  const fallback = [
    '# Conference Day',
    '',
    'Opening agenda, venue notes, and source overview.',
    '',
    ...Array.from({ length: 180 }, (_, index) => [
      `## Session ${index + 1}`,
      '',
      `Transcript paragraph ${index + 1} preserves source-visible content across the whole page.`,
    ].join('\n')),
  ].join('\n\n')
  const selected = chooseWebpageMarkdownByContentCoverage({
    mode: 'import',
    convertedMarkdown: converted,
    fallbackMarkdown: fallback,
  })
  if (selected.source !== 'fallback') {
    throw new Error(`expected high-coverage fallback selection, got ${selected.source}`)
  }
  if (!selected.markdown.includes('Opening agenda')) {
    throw new Error('expected first source section to be preserved by fallback selection')
  }
  if (!selected.markdown.includes('Session 180')) {
    throw new Error('expected late source section to be preserved by fallback selection')
  }
}
export async function testWorkspaceImportUrlDomChooserIgnoresShellChromeDuringCoverage(): Promise<void> {
  const convertedMarkdown = [
    '# Analyze recent oil market reports from major institutions like Goldman Sachs and UBS.',
    '',
    '## Summary',
    '',
    '1. Shared logical blind spot in recent Goldman Sachs and UBS oil reports.',
    '2. Shipping risk, inventory lag, and policy feedbacks raise the price floor.',
  ].join('\n')
  const renderedTextMarkdown = [
    'MiroMind App is now available - access MiroMind wherever you are.',
    'Get App',
    'Sign In',
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS.',
    'Summary',
    'Shared logical blind spot in recent Goldman Sachs and UBS oil reports.',
    'Shipping risk, inventory lag, and policy feedbacks raise the price floor.',
    'We use cookies',
    "What's New",
    'Release notes and changelog',
  ].join('\n')
  const selected = chooseDomRecoveredMarkdown({
    mode: 'import',
    convertedMarkdown,
    renderedTextMarkdown,
  })
  if (selected.source !== 'converted') {
    throw new Error(`expected shell-pruned DOM chooser to preserve structured markdown, got ${selected.source}`)
  }
  if (selected.renderedCoverageRatio < 0.72) {
    throw new Error(`expected shell-pruned rendered coverage to stay high, got ${selected.renderedCoverageRatio}`)
  }
}
export async function testWorkspaceImportUrlChromePruningDoesNotTruncateSubstantiveAboutLines(): Promise<void> {
  const pruned = pruneWebpageChromeText([
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS.',
    'Summary',
    'What Goldman Sachs is assuming',
    '',
    'Goldman has raised its 2026 Brent average to about $85/bbl from $77 after the disruption.',
    'Core assumptions:',
    'Hormuz flows are severely disrupted for several weeks before gradual normalization.',
    'High near-term prices give way to a lower plateau in the original bank scenario.',
    'Demand adjusts in a smooth, price-responsive way in that baseline.',
    'What UBS is assuming',
    'UBS projects 2026 global oil demand growth of ~1.2 mbpd.',
    "What's New",
    'Release notes and changelog',
  ].join('\n'))
  if (!pruned.includes('about $85/bbl from $77')) {
    throw new Error(`expected substantive lines containing "about" to survive chrome pruning, got:\n${pruned}`)
  }
  if (pruned.includes("What's New") || pruned.includes('Release notes and changelog')) {
    throw new Error(`expected low-value tail sections to be pruned, got:\n${pruned}`)
  }
}
export async function testWorkspaceImportUrlDomChooserRepairsMergedLeadingBoundariesFromRenderedText(): Promise<void> {
  const convertedMarkdown = [
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS. Identify a shared logical blind spot. Based on this flaw, re-simulate the global oil price trajectory for the next six months.Show thinking trajectory Summary',
    '',
    '## 1. Shared logical blind spot in recent Goldman Sachs & UBS oil reports',
  ].join('\n')
  const renderedTextMarkdown = [
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS. Identify a shared logical blind spot. Based on this flaw, re-simulate the global oil price trajectory for the next six months.',
    'Show thinking trajectory',
    'Summary',
    '1. Shared logical blind spot in recent Goldman Sachs & UBS oil reports',
  ].join('\n')
  const selected = chooseDomRecoveredMarkdown({
    mode: 'import',
    convertedMarkdown,
    renderedTextMarkdown,
  })
  if (!selected.markdown.includes('next six months.\n\nShow thinking trajectory\n\nSummary')) {
    throw new Error(`expected chooser to repair merged leading boundaries, got:\n${selected.markdown}`)
  }
}
export async function testWorkspaceImportUrlImportPreservesFullTextFallbackBody(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://example.com/conference'
  const first = 'Opening agenda source-visible content'
  const last = 'Closing transcript source-visible content'
  const manyScripts = Array.from({ length: 25 }, () => '<script>var shell=1;</script>').join('')
  const paragraphs = [
    `<p>${first}</p>`,
    ...Array.from({ length: 160 }, (_, index) => `<p>Transcript segment ${index + 1} remains part of the imported source text.</p>`),
    `<p>${last}</p>`,
  ].join('')
  const calls: string[] = []
  const restore = installWebpageProxyFetch(
    new Map([[url, `<!doctype html><html><head><title>Conference</title>${manyScripts}</head><body><main><h1>Conference</h1>${paragraphs}</main></body></html>`]]),
    calls,
  )
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res || typeof res.text !== 'string') throw new Error('expected import result')
    if (!res.text.includes(first)) throw new Error('expected first source-visible paragraph')
    if (!res.text.includes(last)) throw new Error('expected last source-visible paragraph')
    if (res.text.includes('…(clipped')) throw new Error('expected import fallback body to avoid refresh clipping')
    if (!calls.some(call => call.startsWith('/__webpage_proxy?'))) throw new Error('expected shared webpage proxy ingestion')
    if (calls.some(call => call.startsWith('/__fetch_remote?'))) throw new Error('unexpected legacy fetch endpoint')
  } finally {
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlImportRecoversJsRenderedContentViaDomExportFallback(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://example.com/shared-report'
  const shellHtml = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<title>Shared Report</title>',
    ...Array.from({ length: 24 }, (_, index) => `<script>window.__shell_${index}=true;</script>`),
    '</head>',
    '<body>',
    '<section class="banner">Get App</section>',
    '<section id="__next">Loading shared report...</section>',
    '</body>',
    '</html>',
  ].join('')
  const recoveredTitle = 'Shared Oil Report'
  const recoveredParagraphs = Array.from({ length: 8 }, (_, index) =>
    `Supporting section ${index + 1} expands the report with source-visible details about price floors, shipping risk, inventory lag, and transition feedback loops.`,
  )
  const recoveredText = [
    recoveredTitle,
    '',
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS.',
    '',
    'Identify a shared logical blind spot and re-simulate the next six-month trajectory.',
    '',
    ...recoveredParagraphs,
  ].join('\n')
  const recoveredHtml = [
    '<!doctype html>',
    '<html>',
    '<head>',
    `<title>${recoveredTitle}</title>`,
    '</head>',
    '<body>',
    `<main><h1>${recoveredTitle}</h1><p>Analyze recent oil market reports from major institutions like Goldman Sachs and UBS.</p><p>Identify a shared logical blind spot and re-simulate the next six-month trajectory.</p>${recoveredParagraphs.map(paragraph => `<p>${paragraph}</p>`).join('')}</main>`,
    '</body>',
    '</html>',
  ].join('')
  const proxyCalls: string[] = []
  const domModes: string[] = []
  const restore = installWebpageProxyFetch(new Map([[url, shellHtml]]), proxyCalls)
  setWorkspaceWebpageDomExportForTests(async args => {
    domModes.push(String(args.mode || ''))
    if (args.mode === 'html') {
      return { text: recoveredHtml, title: recoveredTitle, clipped: false }
    }
    return { text: recoveredText, title: recoveredTitle, clipped: false }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import' })
    if (isFrontmatterOnlyDoc(res.text)) {
      throw new Error('expected import fallback to recover non-empty DOM-rendered content')
    }
    if (!res.text.includes('Goldman Sachs and UBS')) {
      throw new Error('expected import fallback to preserve the DOM-rendered report body')
    }
    if (!res.text.includes('logical blind spot')) {
      throw new Error('expected import fallback to preserve later DOM-rendered report sections')
    }
    if (res.text.includes('Loading shared report')) {
      throw new Error('expected DOM export fallback to replace raw app-shell placeholder text')
    }
    if (!proxyCalls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('expected shared webpage proxy fetch before DOM export fallback')
    }
    if (!domModes.includes('html')) {
      throw new Error(`expected DOM export fallback to probe the hydrated html mode, got ${JSON.stringify(domModes)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlImportRecoversLongLoadingShellViaDomExportFallback(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://example.com/shared-conversation'
  const shellLinks = Array.from(
    { length: 60 },
    (_, index) => `<a href="/shortcut-${index + 1}">Open App Shortcut ${index + 1}</a>`,
  ).join('')
  const shellHtml = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<title>Shared Conversation</title>',
    '</head>',
    '<body>',
    '<header><a href="/app">Get App</a><a href="/sign-in">Sign in</a><a href="/install">Install App</a></header>',
    '<main>',
    '<h1>Shared Conversation</h1>',
    '<p>Loading shared chat...</p>',
    `<nav>${shellLinks}</nav>`,
    '</main>',
    '</body>',
    '</html>',
  ].join('')
  const recoveredText = [
    'Shared Conversation Analysis',
    '',
    'This imported body preserves the substantive discussion after the live share finishes hydrating.',
    '',
    'It includes the longer paragraphs that should replace the loading shell and shortcut chrome.',
    '',
    ...Array.from({ length: 6 }, (_, index) => `Detailed section ${index + 1} captures the underlying report body with concrete evidence and reasoning.`),
  ].join('\n')
  const recoveredHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Shared Conversation Analysis</title></head>',
    '<body>',
    '<main>',
    '<h1>Shared Conversation Analysis</h1>',
    '<p>This imported body preserves the substantive discussion after the live share finishes hydrating.</p>',
    '<p>It includes the longer paragraphs that should replace the loading shell and shortcut chrome.</p>',
    ...Array.from({ length: 6 }, (_, index) => `<p>Detailed section ${index + 1} captures the underlying report body with concrete evidence and reasoning.</p>`),
    '</main>',
    '</body>',
    '</html>',
  ].join('')
  const proxyCalls: string[] = []
  const domModes: string[] = []
  const restore = installWebpageProxyFetch(new Map([[url, shellHtml]]), proxyCalls)
  setWorkspaceWebpageDomExportForTests(async args => {
    domModes.push(String(args.mode || ''))
    if (args.mode === 'html') return { text: recoveredHtml, title: 'Shared Conversation Analysis', clipped: false }
    return { text: recoveredText, title: 'Shared Conversation Analysis', clipped: false }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import' })
    if (!res.text.includes('substantive discussion after the live share finishes hydrating')) {
      throw new Error('expected long loading-shell imports to recover the hydrated report body')
    }
    if (res.text.includes('Loading shared chat')) {
      throw new Error('expected long loading-shell imports to replace the loading placeholder text')
    }
    if (!proxyCalls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('expected long loading-shell import to probe the shared webpage proxy first')
    }
    if (!domModes.includes('html')) {
      throw new Error(`expected long loading-shell fallback to probe the hydrated html mode, got ${JSON.stringify(domModes)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlImportRecoversProxyFetchFailureViaDomExportFallback(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const proxyCalls: string[] = []
  const domModes: string[] = []
  const htmlPreferScriptDisabledFlags: boolean[] = []
  const substantiveParagraphs = Array.from({ length: 6 }, (_, index) =>
    `Detailed section ${index + 1} preserves the Claude-visible reasoning about recovery asymmetry, refinery lag, inventory draw timing, sanctions elasticity, and how forward curves can anchor analysts to the wrong base case.`,
  )
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    proxyCalls.push(requestUrl)
    if (requestUrl.startsWith('/__webpage_proxy?')) {
      throw new Error('Timeout')
    }
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async args => {
    domModes.push(String(args.mode || ''))
    if (args.mode === 'html') htmlPreferScriptDisabledFlags.push(args.preferScriptDisabled === true)
    if (args.mode === 'html') {
      return {
        text: [
          '<!doctype html>',
          '<html>',
          '<head><title>Claude Chat Export</title></head>',
          '<body>',
          '<main>',
          '<h1>Oil market blind spot analysis and price forecast</h1>',
          '<h2>The shared blind spot: symmetric recovery fallacy + resolution anchoring</h2>',
          '<p>The deepest flaw is not being wrong about prices.</p>',
          ...substantiveParagraphs.map(paragraph => `<p>${paragraph}</p>`),
          '</main>',
          '</body>',
          '</html>',
        ].join(''),
        title: 'Claude Chat Export',
        clipped: false,
      }
    }
    return {
      text: [
        'Oil market blind spot analysis and price forecast',
        '',
        'The shared blind spot: symmetric recovery fallacy + resolution anchoring',
        '',
        'The deepest flaw is not being wrong about prices.',
        '',
        ...substantiveParagraphs,
      ].join('\n'),
      title: 'Claude Chat Export',
      clipped: false,
    }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected proxy fetch failure import to recover the Claude body through DOM export, got:\n${res.text}`)
    }
    if (res.text.includes(`[](${url})`)) {
      throw new Error('expected proxy fetch failure recovery to avoid falling back to a synthetic source-link stub')
    }
    if (!proxyCalls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('expected proxy fetch failure recovery to attempt the shared webpage proxy first')
    }
    if (!domModes.includes('html')) {
      throw new Error(`expected proxy fetch failure recovery to escalate into DOM export html mode, got ${JSON.stringify(domModes)}`)
    }
    if (!htmlPreferScriptDisabledFlags.includes(true)) {
      throw new Error(`expected proxy fetch failure recovery to prefer script-disabled html export, got ${JSON.stringify(htmlPreferScriptDisabledFlags)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlImportDoesNotReuseCachedConnectionShellMarkdown(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  let currentHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Claude</title></head>',
    '<body>',
    '<main>',
    '<h1>Can&apos;t reach Claude</h1>',
    '<p>Check your connection.</p>',
    '<button>Try again</button>',
    '</main>',
    '</body>',
    '</html>',
  ].join('')
  const proxyCalls: string[] = []
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    proxyCalls.push(requestUrl)
    if (!requestUrl.startsWith('/__webpage_proxy?')) {
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }
    return new Response(currentHtml, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async () => null)
  try {
    const rejectedConnectionShell = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' }).then(() => false, e => String((e as { message?: unknown })?.message || e).includes('Authenticated browser session required'))
    if (!rejectedConnectionShell) throw new Error('expected first import fetch to reject the low-fidelity connection shell before persistence')
    currentHtml = [
      '<!doctype html>',
      '<html>',
      '<head><title>Claude Chat Export</title></head>',
      '<body>',
      '<main>',
      '<h1>Oil market blind spot analysis and price forecast</h1>',
      '<p>The shared blind spot is a symmetric recovery assumption applied to an asymmetric supply chain.</p>',
      '<p>Fresh proxy content should replace any previously cached connection shell for the same URL.</p>',
      '</main>',
      '</body>',
      '</html>',
    ].join('')
    const second = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!second.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected second import fetch to bypass stale cached shell content, got:\n${second.text}`)
    }
    if (second.text.includes("Can't reach Claude") || second.text.includes('Check your connection.')) {
      throw new Error(`expected second import fetch to discard stale cached connection shell content, got:\n${second.text}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlImportUsesApiNativeBrowserSessionMarkdownWhenProxyAndDomStayLowFidelity(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const fetchCalls: string[] = []
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown, init?: RequestInit) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    fetchCalls.push(requestUrl)
    if (requestUrl.startsWith('/__webpage_proxy?')) {
      return new Response([
        '<!doctype html>',
        '<html>',
        '<head><title>Claude</title></head>',
        '<body>',
        '<main>',
        '<h1>Can&apos;t reach Claude</h1>',
        '<p>Check your connection.</p>',
        '<button>Try again</button>',
        '</main>',
        '</body>',
        '</html>',
      ].join(''), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    if (requestUrl === 'http://localhost:6969/v1/sessions') {
      return new Response(JSON.stringify({
        sessions: [
          {
            id: 'claude-session-1',
            url,
            domain: 'claude.ai',
            title: 'Oil market blind spot analysis and price forecast - Claude',
          },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (requestUrl === 'http://localhost:6969/v1/browser/markdown') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      if (body.session_id !== 'claude-session-1' || body.url !== url) {
        throw new Error(`expected browser markdown fallback to target the matching claude session, got ${JSON.stringify(body)}`)
      }
      return new Response(JSON.stringify({
        markdown: [
          '# Oil market blind spot analysis and price forecast',
          '',
          '## The shared blind spot: symmetric recovery fallacy + resolution anchoring',
          '',
          'Every major institution shares the same structural flaw wired into its model.',
          '',
          'The re-simulated trajectory shows why the symmetric recovery assumption breaks once supply chokepoints and demand destruction interact.',
        ].join('\n'),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async () => ({
    text: "Can't reach Claude\n\nCheck your connection.\n\nTry again",
    title: 'Claude',
    clipped: false,
  }))
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected browser-session markdown fallback to recover the Claude body, got:\n${res.text}`)
    }
    if (res.text.includes("Can't reach Claude") || res.text.includes('Check your connection.')) {
      throw new Error(`expected browser-session markdown fallback to replace the Claude connection shell, got:\n${res.text}`)
    }
    if (res.title !== 'Oil market blind spot analysis and price forecast - Claude') throw new Error(`expected browser-session title to survive import content recovery, got ${JSON.stringify(res.title)}`)
    if (!fetchCalls.includes('http://localhost:6969/v1/sessions')) {
      throw new Error(`expected browser-session markdown fallback to enumerate local sessions, got ${JSON.stringify(fetchCalls)}`)
    }
    if (!fetchCalls.includes('http://localhost:6969/v1/browser/markdown')) {
      throw new Error(`expected browser-session markdown fallback to request markdown from the local browser runtime, got ${JSON.stringify(fetchCalls)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlImportPrefersScriptDisabledTextProbeWhenHtmlRecoveryIsInsufficient(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const textPreferScriptDisabledFlags: boolean[] = []
  const substantiveParagraphs = Array.from({ length: 6 }, (_, index) =>
    `Detailed section ${index + 1} preserves the Claude-visible reasoning about refinery lag, sanctions elasticity, forward-curve anchoring, and inventory draw timing.`,
  )
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    if (requestUrl.startsWith('/__webpage_proxy?')) throw new Error('Timeout')
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode === 'text') textPreferScriptDisabledFlags.push(args.preferScriptDisabled === true)
    if (args.mode === 'html') {
      return {
        text: [
          '<!doctype html>',
          '<html>',
          '<head><title>Claude Chat Export</title></head>',
          '<body>',
          '<main><h1>Claude Chat Export</h1></main>',
          '</body>',
          '</html>',
        ].join(''),
        title: 'Claude Chat Export',
        clipped: false,
      }
    }
    return {
      text: [
        'Oil market blind spot analysis and price forecast',
        '',
        'The shared blind spot: symmetric recovery fallacy + resolution anchoring',
        '',
        'The deepest flaw is not being wrong about prices.',
        '',
        ...substantiveParagraphs,
      ].join('\n'),
      title: 'Claude Chat Export',
      clipped: false,
    }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected text DOM recovery to preserve the Claude body when html recovery is insufficient, got:\n${res.text}`)
    }
    if (!textPreferScriptDisabledFlags.includes(true)) {
      throw new Error(`expected text DOM recovery to prefer script-disabled export, got ${JSON.stringify(textPreferScriptDisabledFlags)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlImportRetriesScriptEnabledHtmlProbeWhenScriptDisabledHtmlIsHydrationShell(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const htmlPreferScriptDisabledFlags: boolean[] = []
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    if (requestUrl.startsWith('/__webpage_proxy?')) throw new Error('Timeout')
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode === 'text') {
      throw new Error('expected script-enabled html retry to satisfy recovery before the text probe')
    }
    htmlPreferScriptDisabledFlags.push(args.preferScriptDisabled === true)
    if (args.preferScriptDisabled) {
      return {
        text: [
          '<!doctype html>',
          '<html>',
          '<head><title>Claude Chat Export</title></head>',
          '<body><section id="root"></section></body>',
          '</html>',
        ].join(''),
        title: 'Claude Chat Export',
        clipped: false,
      }
    }
    return {
      text: [
        '<!doctype html>',
        '<html>',
        '<head><title>Claude Chat Export</title></head>',
        '<body>',
        '<main>',
        '<h1>Oil market blind spot analysis and price forecast</h1>',
        '<p>The shared blind spot is a symmetric recovery assumption applied to an asymmetric supply chain.</p>',
        '<p>Rendered script-enabled fallback preserves the Claude-visible body when the stripped page is only a hydration shell.</p>',
        '</main>',
        '</body>',
        '</html>',
      ].join(''),
      title: 'Claude Chat Export',
      clipped: false,
    }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected script-enabled html retry to recover rendered body content, got:\n${res.text}`)
    }
    if (htmlPreferScriptDisabledFlags.length < 2 || htmlPreferScriptDisabledFlags[0] !== true || !htmlPreferScriptDisabledFlags.includes(false)) {
      throw new Error(`expected html DOM recovery to retry without script-disabled mode after a hydration shell, got ${JSON.stringify(htmlPreferScriptDisabledFlags)}`)
    }
    if (res.text.includes(`[](${url})`)) {
      throw new Error('expected html retry recovery to avoid falling back to a synthetic source-link stub')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlImportRetriesScriptEnabledHtmlProbeWhenScriptDisabledHtmlIsConnectionShell(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const htmlPreferScriptDisabledFlags: boolean[] = []
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    if (requestUrl.startsWith('/__webpage_proxy?')) throw new Error('Timeout')
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode === 'text') {
      throw new Error('expected script-enabled html retry to recover the Claude body before the text probe')
    }
    htmlPreferScriptDisabledFlags.push(args.preferScriptDisabled === true)
    if (args.preferScriptDisabled) {
      return {
        text: [
          '<!doctype html>',
          '<html>',
          '<head><title>Claude</title></head>',
          '<body>',
          '<main>',
          '<h1>Can&apos;t reach Claude</h1>',
          '<p>Check your connection.</p>',
          '<button>Try again</button>',
          '</main>',
          '</body>',
          '</html>',
        ].join(''),
        title: 'Claude',
        clipped: false,
      }
    }
    return {
      text: [
        '<!doctype html>',
        '<html>',
        '<head><title>Claude Chat Export</title></head>',
        '<body>',
        '<main>',
        '<h1>Oil market blind spot analysis and price forecast</h1>',
        '<p>The shared blind spot is a symmetric recovery assumption applied to an asymmetric supply chain.</p>',
        '<p>Rendered script-enabled fallback preserves the Claude-visible body when the stripped page only shows the short connection error shell.</p>',
        '</main>',
        '</body>',
        '</html>',
      ].join(''),
      title: 'Claude Chat Export',
      clipped: false,
    }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected script-enabled html retry to recover rendered body content after a connection shell, got:\n${res.text}`)
    }
    if (res.text.includes("Can't reach Claude") || res.text.includes('Check your connection.')) {
      throw new Error(`expected connection shell recovery to exclude Claude error chrome, got:\n${res.text}`)
    }
    if (htmlPreferScriptDisabledFlags.length < 2 || htmlPreferScriptDisabledFlags[0] !== true || !htmlPreferScriptDisabledFlags.includes(false)) {
      throw new Error(`expected html DOM recovery to retry without script-disabled mode after a connection shell, got ${JSON.stringify(htmlPreferScriptDisabledFlags)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlImportPrefersStructuredDomMarkdownWhenItPreservesRenderedContent(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://example.com/rendered-share'
  const shellLinks = Array.from(
    { length: 60 },
    (_, index) => `<a href="/shortcut-${index + 1}">Open App Shortcut ${index + 1}</a>`,
  ).join('')
  const shellHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Rendered Share</title></head>',
    '<body>',
    '<header><a href="/app">Get App</a><a href="/sign-in">Sign in</a><a href="/install">Install App</a></header>',
    '<main><h1>Rendered Share</h1><p>Loading shared chat...</p><nav>',
    shellLinks,
    '</nav></main>',
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
  const recoveredHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Rendered Share</title></head>',
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
  const proxyCalls: string[] = []
  const restore = installWebpageProxyFetch(new Map([[url, shellHtml]]), proxyCalls)
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode === 'html') return { text: recoveredHtml, title: 'Rendered Share', clipped: false }
    return { text: renderedText, title: 'Rendered Share', clipped: false }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('# Analyze recent oil market reports from major institutions like Goldman Sachs and UBS. Identify a shared logical blind spot. Based on this flaw, re-simulate the global oil price trajectory for the next six months.')) {
      throw new Error(`expected import DOM recovery to prefer structured markdown heading output, got:\n${res.text}`)
    }
    if (!res.text.includes('## Show thinking trajectory') || !res.text.includes('### Summary')) {
      throw new Error(`expected import DOM recovery to preserve rendered text as markdown headings, got:\n${res.text}`)
    }
    if (!res.text.includes('1. Shared logical blind spot in recent Goldman Sachs and UBS oil reports.')) {
      throw new Error(`expected import DOM recovery to preserve rendered list content, got:\n${res.text}`)
    }
    if (res.text.includes(`[](${url})`)) {
      throw new Error('expected DOM recovery to avoid injecting a synthetic source-link line into the body')
    }
    if (res.text.includes('months.Show thinking trajectory') || res.text.includes('trajectory Summary')) {
      throw new Error('expected import DOM recovery to avoid reconstructed HTML text merges when structured DOM markdown is available')
    }
    if (!proxyCalls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('expected structured DOM recovery test to exercise the shared webpage proxy path')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}
export async function testWorkspaceImportUrlImportSkipsTextDomProbeWhenStructuredHtmlRecoveryIsAlreadySufficient(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const substantiveParagraphs = Array.from({ length: 6 }, (_, index) =>
    `Detailed section ${index + 1} preserves the Claude-visible reasoning about recovery asymmetry, refinery lag, inventory draw timing, sanctions elasticity, and how forward curves can anchor analysts to the wrong base case.`,
  )
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    if (requestUrl.startsWith('/__webpage_proxy?')) throw new Error('Timeout')
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode === 'text') {
      throw new Error('expected structured html recovery to skip the secondary text DOM probe')
    }
    return {
      text: [
        '<!doctype html>',
        '<html>',
        '<head><title>Claude Chat Export</title></head>',
        '<body>',
        '<main>',
        '<h1>Oil market blind spot analysis and price forecast</h1>',
        '<h2>The shared blind spot: symmetric recovery fallacy + resolution anchoring</h2>',
        '<p>The deepest flaw is not being wrong about prices.</p>',
        ...substantiveParagraphs.map(paragraph => `<p>${paragraph}</p>`),
        '</main>',
        '</body>',
        '</html>',
      ].join(''),
      title: 'Claude Chat Export',
      clipped: false,
    }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected structured html recovery to succeed without the text DOM probe, got:\n${res.text}`)
    }
    if (res.text.includes(`[](${url})`)) {
      throw new Error('expected structured html recovery to avoid falling back to a synthetic source-link stub')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
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
export async function testPlainTextToMarkdownPreservesThinkingTranscriptMarkdownStructure(): Promise<void> {
  const markdown = restoreWebpageMarkdownSyntaxFidelity(plainTextToMarkdown([
    '- The user wants me to: 1. Analyze recent oil market reports 2. Identify a shared logical blind spot 3. Re-simulate the global oil price trajectory for the next six months',
    'Goldman Sachs: - Focuses on Strait of Hormuz disruption - Assumes supply disruptions are temporary',
    'Shared blind spot: 1. It is circular reasoning 2. It ignores transition feedback loops',
    '> Existing quote stays quoted.',
    '[Reuters](https://www.reuters.com/example)',
    '![oil chart](https://example.com/oil-chart.png)',
    '| Institution | Price |',
    '| Goldman | $85/bbl |',
    '```python',
    'print("Brent", 85)',
    '  ```',
    '    ````',
    'raw',
    '  ````',
    'Inline math $x+y$ stays visible.',
  ].join('\n')))
  if (!markdown.includes('- The user wants me to:\n1. Analyze recent oil market reports\n2. Identify a shared logical blind spot\n3. Re-simulate the global oil price trajectory for the next six months')) {
    throw new Error(`expected transcript prose plus ordered markers to expand into markdown list lines, got:\n${markdown}`)
  }
  if (!markdown.includes('Goldman Sachs:\n- Focuses on Strait of Hormuz disruption\n- Assumes supply disruptions are temporary')) {
    throw new Error(`expected inline bullet markers to expand into markdown bullet lines, got:\n${markdown}`)
  }
  if (!markdown.includes('Shared blind spot:\n1. It is circular reasoning\n2. It ignores transition feedback loops')) {
    throw new Error(`expected inline ordered markers to expand into markdown ordered lines, got:\n${markdown}`)
  }
  if (!markdown.includes('> Existing quote stays quoted.')) throw new Error(`expected blockquote marker to be preserved, got:\n${markdown}`)
  if (!markdown.includes('[Reuters](https://www.reuters.com/example)')) throw new Error(`expected markdown link to be preserved, got:\n${markdown}`)
  if (!markdown.includes('![oil chart](https://example.com/oil-chart.png)')) throw new Error(`expected markdown image to be preserved, got:\n${markdown}`)
  if (!markdown.includes('| Institution | Price |') || !markdown.includes('| Goldman | $85/bbl |')) {
    throw new Error(`expected markdown table lines to be preserved, got:\n${markdown}`)
  }
  if (!markdown.includes('```python\nprint("Brent", 85)\n```')) {
    throw new Error(`expected fenced code block to be preserved, got:\n${markdown}`)
  }
  if (!markdown.includes('````\nraw\n````')) {
    throw new Error(`expected plain-text markdown conversion to normalize indented fence delimiters, got:\n${markdown}`)
  }
  if (!markdown.includes('Inline math $x+y$ stays visible.')) throw new Error(`expected inline math markers to be preserved, got:\n${markdown}`)
}

export async function testPlainTextToMarkdownSplitsThinkingNarrativeTailsFromInlineListLines(): Promise<void> {
  const markdown = restoreWebpageMarkdownSyntaxFidelity(plainTextToMarkdown([
    '1. Analyze recent oil market reports 2. Identify a shared logical blind spot 3. Re-simulate the global oil price trajectory for the next six months First, I need to search for recent oil market reports.',
    '- Baseline scenario assumes 21 days low flows then recovery UBS:',
    '- Focuses on supply-demand balance',
  ].join('\n')))
  if (!markdown.includes('3. Re-simulate the global oil price trajectory for the next six months\nFirst, I need to search for recent oil market reports.')) {
    throw new Error(`expected trailing transcript narrative to split away from the final ordered-list item, got:\n${markdown}`)
  }
  if (!markdown.includes('- Baseline scenario assumes 21 days low flows then recovery\nUBS:\n- Focuses on supply-demand balance')) {
    throw new Error(`expected inline section labels after bullet items to split into standalone lines, got:\n${markdown}`)
  }
}

export async function testWorkspaceImportUrlRestoresVisibleMarkdownSyntaxTokens(): Promise<void> {
  const restored = restoreWebpageMarkdownSyntaxFidelity([
    '\\> quoted line',
    '\\- bullet line',
    '\\[1]\\[2] citation refs',
    'approx. \\~$85/bbl and \\$x+y\\$',
    '| left \\| right | value \\| more |',
    'inline \\`code\\` and \\*emphasis\\*',
    '- The user wants me to: 1. Analyze reports 2. Identify a blind spot 3. Re-simulate prices',
    'Goldman Sachs: - Focuses on supply shocks - Assumes demand stays resilient',
    '<section class="flex items-center gap-2"><section></section><section><span class="text-p text-secondary">Found 9 results</span></section></section>',
    '- <section class="flex items-center gap-2"><section></section><section><span class="text-p text-secondary">Run Code</span></section></section>',
    '```python',
    '- import numpy as np',
    'print("ok")',
    '  ```',
    '    ````',
    'value',
    '  ````',
  ].join('\n'))

  if (!restored.includes('> quoted line')) throw new Error(`expected blockquote marker to be restored, got:\n${restored}`)
  if (!restored.includes('- bullet line')) throw new Error(`expected bullet marker to be restored, got:\n${restored}`)
  if (!restored.includes('[1][2] citation refs')) throw new Error(`expected citation brackets to be restored, got:\n${restored}`)
  if (!restored.includes('approx. ~$85/bbl and $x+y$')) throw new Error(`expected tilde and dollar tokens to be restored, got:\n${restored}`)
  if (!restored.includes('| left | right | value | more |')) throw new Error(`expected table pipes to be restored, got:\n${restored}`)
  if (!restored.includes('inline `code` and *emphasis*')) throw new Error(`expected inline markdown tokens to be restored, got:\n${restored}`)
  if (!restored.includes('- The user wants me to:\n1. Analyze reports\n2. Identify a blind spot\n3. Re-simulate prices')) {
    throw new Error(`expected inline ordered transcript markers to expand into markdown list lines, got:\n${restored}`)
  }
  if (!restored.includes('Goldman Sachs:\n- Focuses on supply shocks\n- Assumes demand stays resilient')) {
    throw new Error(`expected inline bullet transcript markers to expand into markdown bullet lines, got:\n${restored}`)
  }
  if (!restored.includes('Found 9 results') || restored.includes('<section class=')) {
    throw new Error(`expected generic html wrappers to collapse to visible text, got:\n${restored}`)
  }
  if (!restored.includes('- Run Code')) throw new Error(`expected list-prefixed html wrappers to preserve the list marker, got:\n${restored}`)
  if (!restored.includes('```python\nimport numpy as np\nprint("ok")\n```')) {
    throw new Error(`expected recovered fenced code blocks to keep code lines instead of list markers, got:\n${restored}`)
  }
  if (!restored.includes('````\nvalue\n````')) {
    throw new Error(`expected indented fence delimiters to be normalized without indent, got:\n${restored}`)
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

export async function testWorkspaceImportUrlAcceptsAbsoluteFsPathViaViteFsFetch(): Promise<void> {
  const g = globalThis as GlobalWithFetch
  const prev = g.fetch
  let calledUrl = ''
  g.fetch = (async (input: unknown) => {
    calledUrl = input instanceof URL ? input.toString() : String(input || '')
    return {
      ok: true,
      status: 200,
      text: async () => '# Local Demo\n',
    } as Response
  }) as unknown as typeof fetch
  try {
    const inputPath = path.resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'synthetic-local-import.md')
    const normalizedFsPath = inputPath.replace(/\\/g, '/')
    const res = await fetchWorkspaceUrlContent(inputPath, { mode: 'import' })
    if (calledUrl !== `/@fs${normalizedFsPath}`) {
      throw new Error(`expected absolute filesystem import to fetch through Vite /@fs, got ${String(calledUrl)}`)
    }
    if (res.normalizedUrl !== inputPath) {
      throw new Error(`expected absolute filesystem import to preserve the original source path, got ${String(res.normalizedUrl)}`)
    }
    if (res.name !== 'synthetic-local-import.md') {
      throw new Error(`expected absolute filesystem import to derive the source basename, got ${String(res.name)}`)
    }
    if (res.text !== '# Local Demo\n') {
      throw new Error('expected absolute filesystem import to return fetched markdown text verbatim')
    }
  } finally {
    g.fetch = prev
  }
}

export async function testWorkspaceImportUrlFetchesRootRelativeStorageMarkdownAsUrl(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const g = globalThis as GlobalWithFetch
  const prev = g.fetch
  const calls: string[] = []
  g.fetch = (async (input: unknown) => {
    const calledUrl = input instanceof URL ? input.toString() : String(input || '')
    calls.push(calledUrl)
    return new Response('# Shared Storage Doc\n\nFetched from storage.\n', {
      status: 200,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    })
  }) as unknown as typeof fetch
  try {
    const sourceUrl = '/api/storage/doc-default/huijoohwee%2Fdocs%2Fshared-storage-doc.md'
    const res = await fetchWorkspaceUrlContent(sourceUrl, { mode: 'import', viewHint: 'markdown' })
    if (calls.join(',') !== sourceUrl) {
      throw new Error(`expected root-relative storage markdown to fetch directly as a URL, got ${calls.join(',')}`)
    }
    if (calls.some(call => call.includes('/__codebase_file') || call.includes('/@fs') || call.includes('/__fetch_remote'))) {
      throw new Error(`expected storage URL import to avoid local/proxy fetch fallbacks, got ${calls.join(',')}`)
    }
    if (res.name !== 'shared-storage-doc.md') {
      throw new Error(`expected filename from root-relative storage URL, got ${res.name}`)
    }
    if (res.normalizedUrl !== sourceUrl) {
      throw new Error(`expected root-relative storage URL identity to be preserved, got ${res.normalizedUrl}`)
    }
    if (!res.text.includes('Shared Storage Doc')) {
      throw new Error('expected storage markdown body to be imported verbatim')
    }
  } finally {
    g.fetch = prev
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlGlbFetchesBinaryManifest(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const g = globalThis as GlobalWithFetch
  const prev = g.fetch
  let calledUrl = ''
  g.fetch = (async (input: unknown) => {
    calledUrl = input instanceof URL ? input.toString() : String(input || '')
    return new Response(createMinimalGlbBytes(), {
      status: 200,
      headers: { 'Content-Type': 'model/gltf-binary' },
    })
  }) as unknown as typeof fetch
  try {
    const sourceUrl = 'https://assets.example/models/scene.glb'
    const res = await fetchWorkspaceUrlContent(sourceUrl, { mode: 'import' })
    if (!calledUrl.startsWith('/__chat_asset_proxy?url=')) {
      throw new Error(`expected remote GLB URL import to fetch through binary proxy, got ${calledUrl}`)
    }
    if (res.name !== 'scene.glb') {
      throw new Error(`expected GLB URL import to preserve scene.glb, got ${res.name}`)
    }
    if (res.normalizedUrl !== sourceUrl) {
      throw new Error(`expected GLB URL import to preserve source URL, got ${res.normalizedUrl}`)
    }
    if (!res.text.includes('kgAssetFormat: "glb"')) throw new Error('expected GLB asset format frontmatter')
    if (!res.text.includes('kgAssetSource: "url"')) throw new Error('expected GLB URL source marker')
    if (!res.text.includes('kgAssetValidGlbMagic: true')) throw new Error('expected GLB magic validation flag')
    if (!res.text.includes('kgAssetValidGlbContainer: true')) throw new Error('expected GLB container validation flag')
    if (!res.text.includes('kgAssetValidGltfAsset: true')) throw new Error('expected GLB JSON chunk to validate as a glTF asset')
    if (!res.text.includes('kgAssetEncoding: "base64-body"')) {
      throw new Error('expected GLB URL manifest to keep encoded model data outside frontmatter')
    }
    if (!res.text.includes('```kg-glb-base64')) {
      throw new Error('expected GLB URL manifest to embed chunked model data in a fenced payload')
    }
  } finally {
    g.fetch = prev
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlGltfFetchesJsonManifest(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const g = globalThis as GlobalWithFetch
  const prev = g.fetch
  let calledUrl = ''
  g.fetch = (async (input: unknown) => {
    calledUrl = input instanceof URL ? input.toString() : String(input || '')
    const gltf = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [] })
    return new Response(gltf, {
      status: 200,
      headers: { 'Content-Type': 'model/gltf+json' },
    })
  }) as unknown as typeof fetch
  try {
    const sourceUrl = 'https://assets.example/models/scene.gltf'
    const res = await fetchWorkspaceUrlContent(sourceUrl, { mode: 'import' })
    if (!calledUrl.startsWith('/__chat_asset_proxy?url=')) {
      throw new Error(`expected remote GLTF URL import to fetch through model proxy, got ${calledUrl}`)
    }
    if (res.name !== 'scene.gltf') {
      throw new Error(`expected GLTF URL import to preserve scene.gltf, got ${res.name}`)
    }
    if (res.normalizedUrl !== sourceUrl) {
      throw new Error(`expected GLTF URL import to preserve source URL, got ${res.normalizedUrl}`)
    }
    if (!res.text.includes('kgAssetFormat: "gltf"')) throw new Error('expected GLTF asset format frontmatter')
    if (!res.text.includes('kgAssetSource: "url"')) throw new Error('expected GLTF URL source marker')
    if (!res.text.includes('kgAssetValidGltfJson: true')) throw new Error('expected GLTF JSON validation flag')
    if (!res.text.includes('kgAssetValidGltfAsset: true')) throw new Error('expected GLTF asset version validation flag')
    if (!res.text.includes('kgAssetGltfVersion: "2.0"')) throw new Error('expected GLTF version metadata')
    if (!res.text.includes('kgAssetEncoding: "json-body"')) {
      throw new Error('expected GLTF URL manifest to keep model JSON outside frontmatter')
    }
    if (!res.text.includes('```kg-gltf-base64')) {
      throw new Error('expected GLTF URL manifest to embed chunked model JSON in a fenced payload')
    }
  } finally {
    g.fetch = prev
    resetWorkspaceUrlContentCacheForTests()
  }
}
