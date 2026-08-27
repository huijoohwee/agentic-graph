import fs from 'node:fs'
import path from 'node:path'
import { isPrivateCrawlerAddress, parseNativeCrawlerProxyEndpoints } from '@/lib/websites/server/nativeWebsiteCrawler'
import { buildWebsiteCrawlCanvasMarkdown } from '@/lib/websites/websiteCrawlCanvasMarkdown'
import { executeNativeCrawlerInvocation, listNativeCrawlerRecoveryNodeIds, parseNativeCrawlerInvocation, resolveNativeCrawlerGenerationToken } from '@/features/chat/nativeCrawlerInvocation'
import { registerMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { getNodeMediaSpec } from '@/components/GraphCanvas/helpers'
import { resolveHref } from '@/lib/markdown-core/ui/markdownPreviewLinks.impl'
import { upsertFrontmatterFlowMarkdownText } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import {
  isWebsiteImportGenerationToken,
  resolveWebsiteImportGenerationToken,
  resolveWebsiteImportWorkspaceRoot,
} from '@/lib/websites/server/websiteImportStorage'
import { enhanceLegacyWebsiteCrawlTablePanelSrcDoc, isWebsiteCrawlTablePanelMarkdown } from '@/lib/websites/websiteCrawlTablePanel'
import { ensureStoryboardWidgetWorkflowOutputEdge } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel'

export const testNativeCrawlerBlocksPrivateNetworks = () => {
  for (const address of ['127.0.0.1', '10.0.0.2', '172.16.0.1', '192.168.1.1', '169.254.10.2', '100.64.0.1', '203.0.113.2', '::1', 'fd00::1', 'fe90::1']) {
    if (!isPrivateCrawlerAddress(address)) throw new Error(`expected private address block: ${address}`)
  }
  if (isPrivateCrawlerAddress('8.8.8.8')) throw new Error('expected public IPv4 address to remain crawlable')
  if (isPrivateCrawlerAddress('2606:4700:4700::1111')) throw new Error('expected public IPv6 address to remain crawlable')
}

export const testNativeCrawlerParsesCredentialSafeProxyPool = () => {
  const endpoints = parseNativeCrawlerProxyEndpoints([
    'http://alice:secret@proxy.example:8080',
    'http://alice:other@proxy.example:8080',
    'socks5://[2001:db8::3]:1080',
    'file:///tmp/socket',
  ])
  if (endpoints.length !== 2) throw new Error('expected proxy pool deduplication and protocol filtering')
  if (endpoints[0]?.server !== 'http://proxy.example:8080') throw new Error('expected proxy credentials outside server URL')
  if (endpoints[0]?.username !== 'alice' || endpoints[0]?.password !== 'secret') throw new Error('expected parsed proxy credentials')
  if (String(endpoints[0]?.server).includes('secret')) throw new Error('proxy server metadata leaked credentials')
}

export const testNativeCrawlerStoresArtifactsInSiblingSandbox = () => {
  const resolved = resolveWebsiteImportWorkspaceRoot({
    repoRoot: '/workspace/agenticgraph',
    outputDirRel: 'agenticgraph-workspace/website-imports',
  })
  if (resolved.ok !== true) throw new Error(resolved.error)
  if (resolved.abs !== path.resolve('/workspace/sandbox/agenticgraph-workspace/website-imports')) {
    throw new Error(`expected sibling sandbox website store, received ${resolved.abs}`)
  }
  if (resolved.rel !== 'agenticgraph-workspace/website-imports') throw new Error('expected logical artifact paths to remain portable')
  const legacy = resolveWebsiteImportWorkspaceRoot({ repoRoot: '/workspace/agenticgraph', outputDirRel: '.agenticgraph-workspace/website-imports' })
  if (legacy.ok !== true || legacy.abs !== resolved.abs || legacy.rel !== '.agenticgraph-workspace/website-imports') {
    throw new Error('expected existing dot-prefixed artifact references to resolve into the renamed physical store')
  }
  const escaped = resolveWebsiteImportWorkspaceRoot({ repoRoot: '/workspace/agenticgraph', outputDirRel: '../outside' })
  if (escaped.ok) throw new Error('expected workspace store traversal to remain blocked')
}

export const testNativeCrawlerReusesExistingUtcGenerationToken = () => {
  const existing = '20260715T041633Z'
  if (!isWebsiteImportGenerationToken(existing)) throw new Error('expected valid UTC generation token')
  if (resolveWebsiteImportGenerationToken(existing, Date.UTC(2030, 0, 1)) !== existing) {
    throw new Error('expected the existing UTC token to be reused')
  }
  const generated = resolveWebsiteImportGenerationToken('', Date.UTC(2026, 6, 15, 5, 6, 7))
  if (generated !== '20260715T050607Z') throw new Error(`unexpected generated UTC token: ${generated}`)
  if (isWebsiteImportGenerationToken('20260230T000000Z')) throw new Error('expected impossible UTC date to be rejected')
}

export const testNativeCrawlerBuildsCanvasAndDownloadLinks = async () => {
  const text = buildWebsiteCrawlCanvasMarkdown({
    rootUrl: 'https://example.invalid/',
    importId: 'import-1',
    outputDirRel: 'agenticgraph-workspace/website-imports',
    runtime: { engine: 'playwright', headless: true, proxyMode: 'rotating', proxyPoolSize: 2 },
    nodes: [
      {
        nodeId: 'home',
        url: 'https://example.invalid/',
        title: 'Home',
        status: 'ok',
        links: ['https://example.invalid/docs'],
        artifacts: { rawHtmlRelPath: 'raw.html', downloads: [{ id: 'pdf1', fileName: 'guide.pdf', mimeType: 'application/pdf', bytes: 1024 }, { id: 'png1', fileName: 'hero.png', mimeType: 'image/png', bytes: 2048 }] },
      },
      { nodeId: 'docs', url: 'https://example.invalid/docs', title: 'Docs', status: 'ok', artifacts: { rawHtmlRelPath: 'raw.html' } },
    ],
  })
  for (const expected of ['kgCanvas2dRenderer: "flowchart"', 'page_home -->|links| page_docs', 'Download HTML', 'guide.pdf', 'hero.png', 'kind=download']) {
    if (!text.includes(expected)) throw new Error(`missing Canvas crawl output: ${expected}`)
  }
  if (text.includes('secret@') || text.includes('proxy.example')) throw new Error('Canvas output must not expose proxy endpoints')
  const parsed = await loadGraphDataFromTextViaParser('website.crawl.canvas.md', text, { applyToStore: false, syncMarkdownDocument: false })
  const mermaidNodes = (parsed?.graphData?.nodes || []).filter(node => node.id.includes(':page-') || node.id.includes(':asset-'))
  const mermaidEdges = (parsed?.graphData?.edges || []).filter(edge => edge.label === 'pointsTo')
  if (mermaidNodes.length !== 4 || mermaidEdges.length !== 3) throw new Error('expected extracted website pages and downloads to project into the Canvas graph')
}

export const testNativeCrawlerInvocationUsesAuthoritativeTokens = () => {
  const crawlerAgent = parseNativeCrawlerInvocation('/crawler-agent @url:https://example.invalid/docs @reference-policy #canvas')
  if (!crawlerAgent || crawlerAgent.command !== '/crawler-agent') throw new Error('expected crawler-agent route to invoke the native crawler')
  const parsed = parseNativeCrawlerInvocation('/reference.expand @url:https://example.invalid/docs @reference-policy #canvas')
  if (!parsed || parsed.url !== 'https://example.invalid/docs') throw new Error('expected authoritative crawler invocation')
  const widgetSpaced = parseNativeCrawlerInvocation('/reference.expand @url :https://example.invalid/widget @reference-policy #canvas')
  if (!widgetSpaced || widgetSpaced.url !== 'https://example.invalid/widget') throw new Error('expected Widget Card token spacing to remain executable')
  const presetDecorated = parseNativeCrawlerInvocation('/crawler-agent: @url:https://smemalaysia.org `@reference-policy #canvas`')
  if (!presetDecorated || presetDecorated.command !== '/crawler-agent' || presetDecorated.url !== 'https://smemalaysia.org/') {
    throw new Error('expected the Widget Card prompt preset colon and backtick decoration to remain locally executable')
  }
  if (parseNativeCrawlerInvocation('/reference.expand @url:https://example.invalid/docs #canvas')) throw new Error('expected reference policy binding requirement')
  if (parseNativeCrawlerInvocation('/reference.expand @url:file:///tmp/a @reference-policy #canvas')) throw new Error('expected HTTP(S)-only invocation')
  if (parseNativeCrawlerInvocation('/reference.expand @url:https://user:secret@example.invalid @reference-policy #canvas')) throw new Error('expected credential-bearing URL rejection')

  const reusedGenerationToken = resolveNativeCrawlerGenerationToken({
    nodeProperties: { outputPath: '/website-imports/20260715T041633Z/website.crawl.canvas.md' },
    workspacePath: 'note_20260715T052447Z.md',
    timestampMs: Date.UTC(2026, 6, 15, 6, 30, 0),
  })
  if (reusedGenerationToken !== '20260715T041633Z') throw new Error('expected a repeated Widget Card run to reuse its existing crawl generation token')
}

export const testNativeCrawlerWidgetRunReusesImportUrlBridgeAndPublishesRichMedia = async () => {
  const upgradedLegacyPanel = enhanceLegacyWebsiteCrawlTablePanelSrcDoc('<main data-kg-website-crawl-table-panel="1" data-import-id="legacy-run"><table><tbody><tr><td>Page</td><td>Successful</td><td><a href="https://example.invalid/docs/guide">source</a></td><td></td><td><a href="/__website_import/artifact?kind=markdown">Markdown</a></td></tr></tbody></table></main>')
  if (!upgradedLegacyPanel.includes('kgCrawlArtifact=') || !upgradedLegacyPanel.includes('target="_top"')) {
    throw new Error('expected persisted legacy crawl tables to gain the Source Files navigation bridge after restart')
  }
  const existingDeepHref = '/?kgDoc=%2Fwebsites%2Fexample.invalid%2Flegacy-run%2Fdocs%2Fguide.md&amp;kgCrawlArtifact=%2F__website_import%2Fartifact%3Fkind%3Dmarkdown&amp;kgCrawlSourceUrl=https%3A%2F%2Fexample.invalid%2Fdocs%2Fguide'
  const alreadyDeepLegacyPanel = `<main data-kg-website-crawl-table-panel="1" data-import-id="legacy-run"><table><tbody><tr><td>Page</td><td>Successful</td><td><a href="https://example.invalid/docs/guide">source</a></td><td></td><td><a href="${existingDeepHref}" target="_blank" rel="noreferrer">Markdown</a></td></tr></tbody></table></main>`
  const normalizedDeepLegacyPanel = enhanceLegacyWebsiteCrawlTablePanelSrcDoc(alreadyDeepLegacyPanel)
  if (!normalizedDeepLegacyPanel.includes(`href="${existingDeepHref}"`)
    || !normalizedDeepLegacyPanel.includes('target="_top"')
    || normalizedDeepLegacyPanel.includes('target="_blank"')
    || enhanceLegacyWebsiteCrawlTablePanelSrcDoc(normalizedDeepLegacyPanel) !== normalizedDeepLegacyPanel) {
    throw new Error('expected an existing durable crawl deep link to keep its href while normalizing idempotently to top-level navigation')
  }
  let receivedUrl = ''
  let receivedOptions: Record<string, unknown> | undefined
  let receivedProgress = ''
  const unregister = registerMarkdownWorkspaceActionBridge('native-crawler-widget-test', {
    importWebsite: async (url, options) => {
      receivedUrl = url
      receivedOptions = options as Record<string, unknown>
      options?.onProgress?.({ stage: 'converting', total: 100, processed: 48, ok: 47, error: 1, running: true })
      return {
        createdPaths: ['/websites/example/website.crawl.canvas.md', '/websites/example/index.md'],
        websiteImportManifest: {
          version: 1,
          importId: '20260715T041633Z',
          rootUrl: 'https://example.invalid/widget',
          status: 'done',
          startedAtMs: 1,
          finishedAtMs: 2,
          progress: { stage: 'done', total: 100, processed: 100, ok: 94, error: 6, queued: 0, updatedAtMs: 2 },
          runtime: { engine: 'playwright', headless: true, proxyMode: 'rotating', proxyPoolSize: 2, downloadAssets: true, maxDownloads: 500, maxDownloadBytes: 1024 },
          nodes: [{
            nodeId: 'home', url: 'https://example.invalid/widget', path: '/', title: 'Widget home', status: 'ok', links: [],
            artifacts: {
              rawHtmlRelPath: 'nodes/home/raw.html', markdownRelPath: 'nodes/home/page.md', conversionJsonRelPath: 'nodes/home/conversion.json',
              downloads: Array.from({ length: 399 }, (_, index) => ({ id: `asset-${index}`, url: `https://example.invalid/asset-${index}.png`, fileName: `asset-${index}.png`, storedFileName: `asset-${index}.png`, mimeType: 'image/png', bytes: 1, sha256: `${index}` })),
            },
          }],
          errors: [],
        },
        websiteImportSummary: {
          importId: '20260715T041633Z',
          processedPages: 100,
          successfulPages: 94,
          errorPages: 6,
          storedFiles: 403,
        },
      }
    },
  })
  try {
    const invocation = parseNativeCrawlerInvocation('/reference.expand @url :https://example.invalid/widget @reference-policy #canvas')
    if (!invocation) throw new Error('expected Widget Card crawler invocation to parse')
    const result = await executeNativeCrawlerInvocation(invocation, {
      generationToken: '20260715T041633Z',
      onProgress: progress => { receivedProgress = `${progress.processed}/${progress.total}` },
    })
    if (receivedUrl !== 'https://example.invalid/widget') throw new Error('expected Widget Card run to use the shared workspace website import bridge')
    if (receivedOptions?.headless !== true || receivedOptions?.proxyRotation !== true || receivedOptions?.downloadAssets !== true) {
      throw new Error('expected Widget Card run to reuse automatic Import URL crawler options')
    }
    if (receivedOptions?.applyToCanvas !== false || receivedOptions?.preserveActiveDocument !== true) {
      throw new Error('expected Widget Card crawling to preserve its originating Canvas while generating the crawl Canvas document')
    }
    if (receivedOptions?.source !== 'invocation') throw new Error('expected invocation source attribution')
    if (receivedOptions?.generationToken !== '20260715T041633Z') throw new Error('expected Widget Card run to reuse its existing UTC generation token')
    if (receivedProgress !== '48/100') throw new Error('expected native crawl progress to reach the Widget Card Rich Media publisher')
    if (result.outputPath !== '/websites/example/website.crawl.canvas.md') throw new Error('expected crawler Canvas document to become the Rich Media output path')
    if (!result.outputText.includes('# Website crawl imported') || !result.outputText.includes('Canvas projection: complete')) {
      throw new Error('expected a completed native crawl to publish its terminal Rich Media summary')
    }
    if (!result.outputText.includes('Completed with 100 pages: 94 successful, 6 errors, 403 stored files.')) {
      throw new Error('expected terminal Rich Media output to summarize pages, successes, errors, and stored files')
    }
    if (!isWebsiteCrawlTablePanelMarkdown(result.panelMarkdown)) {
      throw new Error('expected the import bridge manifest to produce the shared Markdown table without a second manifest request')
    }
    if (!result.panelMarkdown?.includes('| Page | Status | Source URL | HTML | Markdown | Downloads | Error |')) {
      throw new Error('expected crawl output to reuse the canonical Markdown pipe-table format')
    }
    if (!result.panelMarkdown.includes('kgDoc=%2Fwebsites%2Fexample.invalid%2F20260715T041633Z%2Findex.md')) {
      throw new Error('expected crawl Markdown cells to target their persisted Source Files path')
    }
    if (!result.panelMarkdown.includes('kgCrawlArtifact=')) {
      throw new Error('expected crawl Markdown links to use the durable workspace artifact deep link')
    }
    if (/<(?:main|table|a|br)\b/i.test(result.panelMarkdown)) {
      throw new Error('crawl-table persistence must contain Markdown only, never generated HTML')
    }
    const markdownDeepLink = result.panelMarkdown.match(/\[Markdown\]\((\/\?[^)]+)\)/)?.[1] || ''
    if (!markdownDeepLink || resolveHref(markdownDeepLink, '/__rich_media_panel/crawl-table.md') !== markdownDeepLink) {
      throw new Error('expected the shared Markdown link resolver to preserve the crawl workspace deep link')
    }
    const persistedPanelProperties = {
      workflowOutputKey: 'crawl-table',
      output: result.panelMarkdown,
      outputMimeType: 'text/markdown; charset=utf-8',
      richMediaActiveTab: 'text',
    }
    if ('outputSrcDoc' in persistedPanelProperties) throw new Error('crawl table properties must not persist HTML srcdoc')
    const runtimeSpec = getNodeMediaSpec({
      id: 'crawl-table-panel',
      type: 'RichMediaPanel',
      label: 'Crawl multi-dimensional table',
      properties: persistedPanelProperties,
    } as Parameters<typeof getNodeMediaSpec>[0])
    if (!runtimeSpec || runtimeSpec.kind !== 'iframe' || runtimeSpec.srcDoc) {
      throw new Error('expected Markdown-only crawl panels to use the native Rich Media text surface without materializing iframe HTML')
    }
    const persistedCanvasMarkdown = upsertFrontmatterFlowMarkdownText('# Canvas\n', {
      type: 'Graph',
      nodes: [{
        id: 'crawl-table-panel',
        type: 'RichMediaPanel',
        label: 'Crawl multi-dimensional table',
        properties: {
          ...persistedPanelProperties,
          'frontmatter:widgetFields': [{ fieldKey: 'output', fieldType: 'textarea', schemaPath: 'properties.output' }],
        },
      }],
      edges: [],
    })
    if (!persistedCanvasMarkdown.includes('type: textarea')
      || !persistedCanvasMarkdown.includes('value: |')
      || !persistedCanvasMarkdown.includes('| Page | Status | Source URL | HTML | Markdown | Downloads | Error |')) {
      throw new Error('expected YAML frontmatter to persist the crawl table through the shared Markdown textarea contract')
    }
    if (persistedCanvasMarkdown.includes('outputSrcDoc:') || persistedCanvasMarkdown.includes('<main')) {
      throw new Error('expected YAML frontmatter to exclude generated crawl-table HTML')
    }
  } finally {
    unregister()
  }

  const workflowSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction.ts'), 'utf8')
  const nativeCrawlerRunSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowNativeCrawlerRun.ts'), 'utf8')
  if (!nativeCrawlerRunSource.includes('const run = await executeNativeCrawlerInvocation(invocation, {')) {
    throw new Error('expected Widget Card Run to execute the shared native crawler invocation')
  }
  const nativeDispatchIndex = workflowSource.indexOf('await runStoryboardWidgetNativeCrawlerInvocation({')
  const providerDispatchIndex = workflowSource.indexOf('await runHeadlessTextGeneration(textGeneration', nativeDispatchIndex)
  if (nativeDispatchIndex < 0 || providerDispatchIndex < 0 || nativeDispatchIndex >= providerDispatchIndex) {
    throw new Error('expected Widget Card crawler syntax to dispatch before any chat provider or API-key path')
  }
  if (!nativeCrawlerRunSource.includes('websiteImportGenerationToken: generationToken')) {
    throw new Error('expected Widget Card Run to persist its crawl generation token for repeated runs')
  }
  if (!nativeCrawlerRunSource.includes('workflowOutputPanelOnly: true')) {
    throw new Error('expected native crawler Widget Cards to keep their prompt as input while the Rich Media Panel owns the output')
  }
  if (!nativeCrawlerRunSource.includes("updateStatus('done')") || !nativeCrawlerRunSource.includes("updateStatus('error')")) {
    throw new Error('expected terminal crawler runs to persist a non-loading status before refresh or restart')
  }
  const nativeCrawlerBranchSource = nativeCrawlerRunSource
  if (nativeCrawlerBranchSource.includes('...buildTextWidgetOutputPatch({') || nativeCrawlerBranchSource.includes('setRunLoadingStateForKnownNodeIds({ loading: true')) {
    throw new Error('native crawler terminal output and loading state must not be mirrored into the source Widget Card')
  }
  if (!nativeCrawlerBranchSource.includes('...clearRichMediaOutputProperties(nodeProps)') || !nativeCrawlerBranchSource.includes('args.publishOutput({')) {
    throw new Error('expected native crawler runs to clear legacy source output while retaining Rich Media Panel publication')
  }
  if (!workflowSource.includes('await args.persistDraftGraphData(durableGraph, runOptions?.sourcePersistence)')) {
    throw new Error('expected terminal Widget Card workflow state to await the required durable Markdown persistence path')
  }
  if (!nativeCrawlerRunSource.includes("loadingLabel: progressLabel")) {
    throw new Error('expected Widget Card Run to publish native crawl progress instead of a generic text-generation skeleton')
  }
  if (!nativeCrawlerRunSource.includes('formatMarkdownWorkspaceStatusLabel({')) {
    throw new Error('expected Widget Card crawl progress to reuse the Markdown workspace progress display utility')
  }
  if (!nativeCrawlerRunSource.includes("model: 'native-web-crawler'") || !nativeCrawlerRunSource.includes('args.publishOutput({')) {
    throw new Error('expected Widget Card crawler runs to publish a Rich Media Panel')
  }
  if (!nativeCrawlerBranchSource.includes("outputKey: 'crawl-report'") || !nativeCrawlerBranchSource.includes("outputKey: 'crawl-table'")) {
    throw new Error('expected one crawler input Widget Card to publish separate report and multi-dimensional-table Rich Media Panels')
  }
  if (!nativeCrawlerBranchSource.includes('terminalMarkdown = run.panelMarkdown')
    || !nativeCrawlerBranchSource.includes('outputText: terminalMarkdown')
    || nativeCrawlerBranchSource.includes('srcDoc: terminalMarkdown')) {
    throw new Error('expected the crawl table panel to persist Markdown output without HTML srcdoc')
  }
  const cardInlineTextDisplaySource = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/cards/CardInlineTextDisplaySurface.tsx'), 'utf8')
  if (!cardInlineTextDisplaySource.includes('if (props.shouldIgnoreInlineEditTarget(event.target)) return')) {
    throw new Error('expected Rich Media Markdown table links to navigate without activating the inline editor')
  }
  const richMediaPublicationSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPublication.ts'), 'utf8')
  const richMediaPanelSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel.ts'), 'utf8')
  const richMediaOutputPublisherSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetTextRunOutputPublisher.ts'), 'utf8')
  if (!richMediaOutputPublisherSource.includes('outputKey?: string') || !richMediaPublicationSource.includes('workflowOutputAnchorNodeId: readWorkflowString(panelArgs.anchorNode.id)')) {
    throw new Error('expected named Rich Media output slots to persist their source Widget ownership')
  }
  if (!richMediaPublicationSource.includes('materializeSrcDoc: false')) {
    throw new Error('expected Markdown-only panel publication to avoid generating discarded HTML')
  }
  if (!richMediaPanelSource.includes('cleanString(p.workflowOutputAnchorNodeId) === anchorNodeId && cleanString(p.workflowOutputKey) === outputKey')) {
    throw new Error('expected repeated runs to reuse each source Widget output slot independently')
  }
  if (!richMediaPublicationSource.includes('ensureStoryboardWidgetWorkflowOutputEdge({')
    || !richMediaPanelSource.includes('export function ensureStoryboardWidgetWorkflowOutputEdge(args: {')) {
    throw new Error('expected generated Rich Media outputs to persist idempotent source-to-panel edges')
  }
  const invocationSource = fs.readFileSync(path.resolve(process.cwd(), 'src/features/chat/nativeCrawlerInvocation.ts'), 'utf8')
  if (!invocationSource.includes("importWebsiteViaWorkspaceRuntime(invocation.url, options)")) {
    throw new Error('expected Widget Card crawler runs to retain the shared website-import fallback when the React bridge is unavailable')
  }
  const websiteImportActionSource = fs.readFileSync(path.resolve(process.cwd(), 'src/features/markdown-workspace/useWorkspaceFileActions/websiteImportAction.ts'), 'utf8')
  if (!websiteImportActionSource.includes('startedAtMs > 30 * 60_000')) {
    throw new Error('expected production-size native crawls to remain attached beyond the old ten-minute timeout')
  }
  if (!websiteImportActionSource.includes('ensureWorkspaceFolderTreeIfMissing({ folderPath: normalized, fs })')) {
    throw new Error('expected repeat crawl materialization to reuse canonical persisted workspace folders')
  }
  if (websiteImportActionSource.includes('await fs.createFolder({ parentPath: parent, name })')) {
    throw new Error('website materialization must not blindly create numbered duplicate folders after restart')
  }
  if (!websiteImportActionSource.includes('upsertWorkspaceTextDocument({ fs, parentPath: rootFolder')) {
    throw new Error('expected same-token crawl documents to update canonical files instead of creating duplicate files')
  }
  const workflowActionsSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetWorkflowActions.ts'), 'utf8')
  if (!workflowActionsSource.includes('persistDraftGraphData: args.persistDraftGraphData')) {
    throw new Error('expected workflow actions to forward terminal graph persistence')
  }
  const canvasRuntimeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas.runtime.tsx'), 'utf8')
  const crawlerRecoverySource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useNativeCrawlerWorkflowRecovery.ts'), 'utf8')
  if (!canvasRuntimeSource.includes('persistDraftGraphData: commitStoryboardCardMediaGraph')) {
    throw new Error('expected workflow completion to reuse the existing durable Canvas Markdown writer')
  }
  if (!crawlerRecoverySource.includes('listNativeCrawlerRecoveryNodeIds(args.graphData)')) {
    throw new Error('expected a refreshed Canvas to recover interrupted crawls and backfill missing completed crawl tables')
  }
  if (crawlerRecoverySource.indexOf('recoveredDocumentsRef.current.add(documentKey)')
    < crawlerRecoverySource.indexOf('if (nodeIds.length === 0) return')) {
    throw new Error('expected crawler recovery deduplication to wait until hydrated properties expose an actionable recovery candidate')
  }
  const mediaOverlayPoolSource = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/render/mediaOverlayPool.ts'), 'utf8')
  if (!mediaOverlayPoolSource.includes('const isRichMediaPanel = isRichMediaPanelNode(n0)')
    || !mediaOverlayPoolSource.includes('workflow-output\\n${candidate.id}\\n${candidate.workflowOutputKey}')) {
    throw new Error('expected every persisted typed named output panel to remain visible after a Canvas refresh')
  }
  if (!crawlerRecoverySource.includes('nativeCrawlerRecovery: true') || !invocationSource.includes("recoveredManifest?.status === 'done'")) {
    throw new Error('expected restart recovery to read the terminal manifest without rematerializing every page')
  }
  const websiteImportServerSource = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/websites/server/websiteImportServer.ts'), 'utf8')
  if (!websiteImportServerSource.includes("existingManifest.status === 'done' || existingRunIsFresh")) {
    throw new Error('expected repeated UTC-token runs to attach to the existing crawl instead of overwriting it')
  }
  if (!websiteImportServerSource.includes('nodes: [...nodes], errors: [...errors]')) {
    throw new Error('expected crawl manifests to retain incremental nodes for interrupted-run recovery')
  }
}

export const testNativeCrawlerRecoveryBackfillsMissingCompletedTable = () => {
  const sourceNode = {
    id: 'n1',
    type: 'TextGeneration',
    properties: {
      prompt: '/crawler-agent @url:https://example.invalid @reference-policy #canvas',
      workflowRunStatus: 'done',
    },
  }
  const reportPanel = {
    id: 'n2',
    type: 'RichMediaPanel',
    properties: {
      workflowOutputAnchorNodeId: 'n1',
      workflowOutputKey: 'crawl-report',
      output: '# Website crawl imported',
    },
  }
  const missing = listNativeCrawlerRecoveryNodeIds({ nodes: [sourceNode, reportPanel] })
  if (missing.length !== 1 || missing[0] !== 'n1') throw new Error(`expected completed crawl table backfill, got ${JSON.stringify(missing)}`)

  const tablePanel = {
    id: 'n3',
    type: 'RichMediaPanel',
    properties: {
      workflowOutputAnchorNodeId: { key: 'workflowOutputAnchorNodeId', type: 'string', value: 'n1' },
      workflowOutputKey: { key: 'workflowOutputKey', type: 'string', value: 'crawl-table' },
      output: {
        key: 'output',
        type: 'textarea',
        value: [
          '## Website crawl multi-dimensional table',
          '',
          '| Page | Status | Source URL | HTML | Markdown | Downloads | Error |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Home | **Successful** | [Source](https://example.invalid/) | [HTML](/__website_import/artifact?kind=rawHtml) | [Markdown](/?kgDoc=%2Fwebsites%2Fexample.invalid%2Findex.md) | None |',
        ].join('\n'),
      },
    },
  }
  const edgeLessComplete = listNativeCrawlerRecoveryNodeIds({ nodes: [sourceNode, reportPanel, tablePanel], edges: [] })
  if (edgeLessComplete.length !== 1 || edgeLessComplete[0] !== 'n1') {
    throw new Error(`expected completed crawl edge backfill, got ${JSON.stringify(edgeLessComplete)}`)
  }

  let draft = { nodes: [sourceNode, reportPanel, tablePanel], edges: [] as Array<Record<string, unknown>> }
  const commitDraftGraphDataUpdate = (_currentDraft: unknown, nextDraft: unknown) => {
    draft = nextDraft as typeof draft
  }
  const readLiveDraftGraphData = () => draft as never
  const scheduleWorkflowOutputEdgeRefresh = () => void 0
  const reportEdgeAdded = ensureStoryboardWidgetWorkflowOutputEdge({
    anchorNodeId: 'n1', panelNodeId: 'n2', outputKey: 'crawl-report',
    readLiveDraftGraphData, commitDraftGraphDataUpdate: commitDraftGraphDataUpdate as never, scheduleWorkflowOutputEdgeRefresh,
  })
  const tableEdgeAdded = ensureStoryboardWidgetWorkflowOutputEdge({
    anchorNodeId: 'n1', panelNodeId: 'n3', outputKey: 'crawl-table',
    readLiveDraftGraphData, commitDraftGraphDataUpdate: commitDraftGraphDataUpdate as never, scheduleWorkflowOutputEdgeRefresh,
  })
  const duplicateAdded = ensureStoryboardWidgetWorkflowOutputEdge({
    anchorNodeId: 'n1', panelNodeId: 'n3', outputKey: 'crawl-table',
    readLiveDraftGraphData, commitDraftGraphDataUpdate: commitDraftGraphDataUpdate as never, scheduleWorkflowOutputEdgeRefresh,
  })
  if (!reportEdgeAdded || !tableEdgeAdded || duplicateAdded || draft.edges.length !== 2) {
    throw new Error(`expected two idempotent output edges, got ${JSON.stringify(draft.edges)}`)
  }

  const complete = listNativeCrawlerRecoveryNodeIds({ nodes: [sourceNode, reportPanel, tablePanel], edges: draft.edges })
  if (complete.length !== 0) throw new Error(`expected persisted crawl table to suppress recovery, got ${JSON.stringify(complete)}`)

  const legacyHtmlTablePanel = {
    ...tablePanel,
    properties: {
      ...tablePanel.properties,
      output: { key: 'output', type: 'textarea', value: '# Website crawl imported' },
      outputSrcDoc: { key: 'outputSrcDoc', type: 'string', value: '<main data-kg-website-crawl-table-panel="1"></main>' },
    },
  }
  const legacyMigration = listNativeCrawlerRecoveryNodeIds({ nodes: [sourceNode, reportPanel, legacyHtmlTablePanel], edges: draft.edges })
  if (legacyMigration.length !== 1 || legacyMigration[0] !== 'n1') {
    throw new Error(`expected legacy HTML crawl table to backfill into Markdown, got ${JSON.stringify(legacyMigration)}`)
  }

  const legacySourceWithoutStatus = {
    ...sourceNode,
    properties: {
      prompt: sourceNode.properties.prompt,
    },
  }
  const legacyMigrationWithoutStatus = listNativeCrawlerRecoveryNodeIds({
    nodes: [legacySourceWithoutStatus, reportPanel, legacyHtmlTablePanel],
    edges: draft.edges,
  })
  if (legacyMigrationWithoutStatus.length !== 1 || legacyMigrationWithoutStatus[0] !== 'n1') {
    throw new Error(`expected completed legacy crawler output to migrate even before workflowRunStatus existed, got ${JSON.stringify(legacyMigrationWithoutStatus)}`)
  }

  const running = listNativeCrawlerRecoveryNodeIds({
    nodes: [{ ...sourceNode, properties: { ...sourceNode.properties, workflowRunStatus: 'running' } }, reportPanel],
  })
  if (running.length !== 1 || running[0] !== 'n1') throw new Error('expected interrupted crawl recovery to remain active')
}

export const testNativeCrawlerRecoveryUsesManifestTableWithoutRematerializing = async () => {
  const originalFetch = globalThis.fetch
  let importCalls = 0
  const unregister = registerMarkdownWorkspaceActionBridge('native-crawler-recovery-test', {
    importWebsite: async () => {
      importCalls += 1
      throw new Error('recovery must not rematerialize a completed crawl')
    },
  })
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true,
    manifest: {
      version: 1,
      importId: '20260715T052447Z',
      rootUrl: 'https://example.invalid/',
      status: 'done',
      startedAtMs: 1,
      finishedAtMs: 2,
      progress: { stage: 'done', total: 1, processed: 1, ok: 1, error: 0, queued: 0, updatedAtMs: 2 },
      runtime: { engine: 'playwright', headless: true, proxyMode: 'rotating', proxyPoolSize: 2, downloadAssets: true, maxDownloads: 10, maxDownloadBytes: 1024 },
      nodes: [{
        nodeId: 'home', url: 'https://example.invalid/', path: '/', title: 'Home', status: 'ok', links: [],
        artifacts: {
          rawHtmlRelPath: 'nodes/home/raw.html', markdownRelPath: 'nodes/home/page.md', conversionJsonRelPath: 'nodes/home/conversion.json',
          downloads: [{ id: 'guide', url: 'https://example.invalid/guide.pdf', fileName: 'guide.pdf', storedFileName: 'guide.pdf', mimeType: 'application/pdf', bytes: 100, sha256: 'abc' }],
        },
      }],
      errors: [],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
  try {
    const invocation = parseNativeCrawlerInvocation('/crawler-agent @url:https://example.invalid @reference-policy #canvas')
    if (!invocation) throw new Error('expected recovery invocation')
    const result = await executeNativeCrawlerInvocation(invocation, { generationToken: '20260715T052447Z', recoveryOnly: true })
    if (importCalls !== 0) throw new Error(`expected zero rematerialization calls, received ${importCalls}`)
    if (!result.outputText.includes('Completed with 1 pages: 1 successful, 0 errors, 5 stored files.')) throw new Error('expected manifest summary')
    for (const token of ['## Website crawl multi-dimensional table', '| Page | Status | Source URL | HTML | Markdown | Downloads | Error |', '[guide.pdf](', '[Markdown](', 'kgCrawlArtifact=']) {
      if (!String(result.panelMarkdown || '').includes(token)) throw new Error(`expected recovered Markdown table token: ${token}`)
    }
    if (/<(?:main|table|a|br)\b/i.test(String(result.panelMarkdown || ''))) {
      throw new Error('recovered crawl table must remain Markdown-only persistence')
    }
  } finally {
    globalThis.fetch = originalFetch
    unregister()
  }
}

export const testNativeCrawlerTerminalErrorManifestPublishesReasonWithoutBackfill = async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true,
    manifest: {
      version: 1,
      importId: '20260715T144607Z',
      rootUrl: 'https://smecorp.gov.my/',
      status: 'done',
      startedAtMs: 1,
      finishedAtMs: 2,
      progress: { stage: 'done', total: 1, processed: 1, ok: 0, error: 1, queued: 0, updatedAtMs: 2 },
      runtime: { engine: 'playwright', headless: true, proxyMode: 'direct', proxyPoolSize: 0, downloadAssets: true, maxDownloads: 120, maxDownloadBytes: 1024 },
      nodes: [{ nodeId: 'home', url: 'https://smecorp.gov.my/', path: '/', status: 'error', artifacts: {} }],
      errors: [{ url: 'https://smecorp.gov.my/', error: 'HTTP 403' }],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
  try {
    const invocation = parseNativeCrawlerInvocation('/crawler-agent @url:https://smecorp.gov.my/ @reference-policy #canvas')
    if (!invocation) throw new Error('expected terminal-error crawler invocation')
    const result = await executeNativeCrawlerInvocation(invocation, { generationToken: '20260715T144607Z', recoveryOnly: true })
    for (const token of ['0 successful, 1 errors, 1 stored files', 'Proxy routing: direct', 'Page artifacts stored: 0', '## Crawl errors', 'HTTP 403']) {
      if (!result.outputText.includes(token)) throw new Error(`expected manifest-owned terminal report token: ${token}`)
    }
    for (const token of ['| Page | Status | Source URL | HTML | Markdown | Downloads | Error |', '**Error**', 'HTTP 403']) {
      if (!String(result.panelMarkdown || '').includes(token)) throw new Error(`expected manifest-owned terminal table token: ${token}`)
    }
    if (result.outputText.includes('Crawler finished with a terminal workspace error.')) {
      throw new Error('terminal crawler output must not backfill from a Widget Card')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export const testNativeCrawlerHasNoExternalCrawlerDependency = () => {
  const repoRoot = path.resolve(process.cwd(), '..')
  const manifests = ['package.json', 'package-lock.json', 'canvas/package.json', 'canvas/package-lock.json']
    .map(name => path.join(repoRoot, name))
    .filter(file => fs.existsSync(file))
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n')
  if (/"(?:@apify\/|@crawlee\/|crawlee)\w*"\s*:/i.test(manifests)) throw new Error('external crawler dependency is forbidden')
}
