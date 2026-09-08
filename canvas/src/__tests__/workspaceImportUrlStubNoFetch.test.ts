import path from 'node:path'
import { fetchWorkspaceUrlContent, importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { shouldApplyImportedCanvasDocumentToGraph } from '@/features/markdown-workspace/workspaceImport/applyPolicy'
import { pickFirstCreatedFilePathForImportFocus, resolveImportedCanvasDocumentApplyToGraph } from '@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { buildStrybldrVideoHandoffFromGraphData } from '@/features/strybldr/strybldrStoryboard'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { useGraphStore } from '@/hooks/useGraphStore'
import { type GlobalWithFetch, webpageHtml, installWebpageProxyFetch, installUnavailableWebpageDomFixture } from './helpers/workspaceImportUrlFixtures'

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
  const urls = ['https://example.com/', 'https://vercel.com/']
  const domFixture = installUnavailableWebpageDomFixture(urls)
  try {
    for (const url of urls) await assertFetchedImportFor(url)
    domFixture.assertRequests()
  } finally { domFixture.restore() }
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

export {
  testWorkspaceImportUrlExportsEligibleShareArtifactsIntoDocsRoot,
  testWorkspaceImportUrlExportsClaudeChatArtifactsIntoDocsRoot,
  testWorkspaceImportShareExportRootSettingNormalizesSiblingAbsolutePath,
  testWorkspaceSourceRootPathsIncludeConfiguredShareExportRoot,
  testWorkspaceImportUrlUsesConfiguredShareExportRootSetting,
  testWorkspaceImportUrlShareThinkingTrajectoryUsesClickedSiblingExport,
  testWorkspaceImportUrlShareThinkingTrajectoryDoesNotUseWholeDocumentHtmlFallback,
  testWorkspaceImportUrlShareArtifactPersistNormalizesThinkingMarkdown,
  testWorkspaceImportUrlShareArtifactDoesNotBackfillThinkingFromMainMarkdown,
} from './workspaceImportUrlShareArtifacts.test'

export {
  testWorkspaceImportUrlPrefersHigherCoverageMarkdownFallback,
  testWorkspaceImportUrlDomChooserIgnoresShellChromeDuringCoverage,
  testWorkspaceImportUrlChromePruningDoesNotTruncateSubstantiveAboutLines,
  testWorkspaceImportUrlDomChooserRepairsMergedLeadingBoundariesFromRenderedText,
  testWorkspaceImportUrlImportPreservesFullTextFallbackBody,
  testWorkspaceImportUrlImportRecoversJsRenderedContentViaDomExportFallback,
  testWorkspaceImportUrlImportRecoversLongLoadingShellViaDomExportFallback,
  testWorkspaceImportUrlImportRecoversProxyFetchFailureViaDomExportFallback,
  testWorkspaceImportUrlImportDoesNotReuseCachedConnectionShellMarkdown,
  testWorkspaceImportUrlImportUsesApiNativeBrowserSessionMarkdownWhenProxyAndDomStayLowFidelity,
} from './workspaceImportUrlRecovery.test'

export {
  testWorkspaceImportUrlImportPrefersScriptDisabledTextProbeWhenHtmlRecoveryIsInsufficient,
  testWorkspaceImportUrlImportRetriesScriptEnabledHtmlProbeWhenScriptDisabledHtmlIsHydrationShell,
  testWorkspaceImportUrlImportRetriesScriptEnabledHtmlProbeWhenScriptDisabledHtmlIsConnectionShell,
  testWorkspaceImportUrlImportPrefersStructuredDomMarkdownWhenItPreservesRenderedContent,
  testWorkspaceImportUrlImportSkipsTextDomProbeWhenStructuredHtmlRecoveryIsAlreadySufficient,
  testPlainTextToMarkdownPreservesThinkingTranscriptMarkdownStructure,
  testPlainTextToMarkdownSplitsThinkingNarrativeTailsFromInlineListLines,
  testWorkspaceImportUrlRestoresVisibleMarkdownSyntaxTokens,
} from './workspaceImportUrlDomRecovery.test'
