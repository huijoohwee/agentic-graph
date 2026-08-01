import {
  getMarkdownWorkspaceActionBridge,
  type WorkspaceBridgeImportResult,
  type WorkspaceWebsiteImportProgress,
  type WorkspaceWebsiteImportSummary,
} from '@/features/markdown-explorer/workspaceActionBridge'
import { buildAutoWebsiteImportOptions } from '@/lib/toolbar/importUrlWebsiteMode'
import { splitInvocationTokenSegments } from '@/lib/markdown/invocationTokens'
import type { ChatMessage } from './FloatingPanelChatSections'
import type { FloatingPanelChatSubmitArgs } from './floatingPanelChat/floatingPanelChatSubmitTypes'
import { formatWorkspaceUtcSessionTimestamp, readWorkspaceUtcSessionTimestamp } from '@/features/workspace-fs/workspaceTimestamp'
import type { WebsiteImportManifestV1 } from '@/lib/websites/server/websiteImportTypes'
import { buildWebsiteImportManifestSummary } from '@/lib/websites/websiteImportManifestSummary'
import { buildWebsiteCrawlTablePanelMarkdown, isWebsiteCrawlTablePanelMarkdown } from '@/lib/websites/websiteCrawlTablePanel'
import { safeWebsitePathSegment } from '@/lib/websites/websitePathUtils'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'

export const NATIVE_CRAWLER_COMMAND = '/crawler-agent' as const
export const NATIVE_CRAWLER_SEMANTIC = '#canvas' as const
export const NATIVE_CRAWLER_POLICY = '@reference-policy' as const
export const NATIVE_CRAWLER_BINDING = '@url:' as const
export const NATIVE_CRAWLER_INVOCATION_TEMPLATE =
  `${NATIVE_CRAWLER_COMMAND} ${NATIVE_CRAWLER_BINDING}https://example.com ${NATIVE_CRAWLER_POLICY} ${NATIVE_CRAWLER_SEMANTIC}` as const

export type NativeCrawlerInvocation = {
  command: typeof NATIVE_CRAWLER_COMMAND | '/reference.expand'
  url: string
  semantic: typeof NATIVE_CRAWLER_SEMANTIC
  policy: typeof NATIVE_CRAWLER_POLICY
}

export type NativeCrawlerInvocationRunResult = {
  invocation: NativeCrawlerInvocation
  createdPaths: string[]
  outputPath: string | null
  outputText: string
  summary: WorkspaceWebsiteImportSummary | null
  panelMarkdown: string | null
}

type NativeCrawlerRecoveryGraph = {
  nodes?: ReadonlyArray<{
    id?: unknown
    type?: unknown
    properties?: Record<string, unknown> | null
  }>
  edges?: ReadonlyArray<{
    source?: unknown
    target?: unknown
  }>
}

const readRecoveryValue = (value: unknown): unknown => unwrapGraphCellValue(value)
const readRecoveryString = (value: unknown): string => String(readRecoveryValue(value) || '').trim()
const readRecoveryCanonicalId = (value: unknown): string => {
  const id = readRecoveryString(value)
  const parts = id.split('::').map(part => part.trim()).filter(Boolean)
  return parts[parts.length - 1] || id
}

export const listNativeCrawlerRecoveryNodeIds = (graph: NativeCrawlerRecoveryGraph | null | undefined): string[] => {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const readyTableAnchorIds = new Set<string>()
  const loadingCrawlerAnchorIds = new Set<string>()
  const completedCrawlerOutputAnchorIds = new Set<string>()
  const outputPanelIdsByAnchorId = new Map<string, Set<string>>()
  for (const node of nodes) {
    const properties = node.properties || {}
    const anchorNodeId = readRecoveryCanonicalId(properties.workflowOutputAnchorNodeId)
    const outputKey = readRecoveryString(properties.workflowOutputKey)
    const output = readRecoveryString(properties.output)
    if (anchorNodeId && outputKey === 'crawl-table' && isWebsiteCrawlTablePanelMarkdown(output)) readyTableAnchorIds.add(anchorNodeId)
    if (anchorNodeId && (outputKey === 'crawl-report' || outputKey === 'crawl-table')) {
      const panelNodeId = readRecoveryCanonicalId(node.id)
      if (panelNodeId) {
        const panelIds = outputPanelIdsByAnchorId.get(anchorNodeId) || new Set<string>()
        panelIds.add(panelNodeId)
        outputPanelIdsByAnchorId.set(anchorNodeId, panelIds)
      }
      const hasCompletedCrawlerOutput = readRecoveryString(properties.outputModel) === 'native-web-crawler'
        || Boolean(readWorkspaceUtcSessionTimestamp(properties.outputPath))
        || output.includes('# Website crawl imported')
        || readRecoveryString(properties.outputSrcDoc).includes('data-kg-website-crawl-table-panel="1"')
      if (hasCompletedCrawlerOutput) completedCrawlerOutputAnchorIds.add(anchorNodeId)
    }
    if (readRecoveryValue(properties.outputLoading) === true && readRecoveryString(properties.outputModel) === 'native-web-crawler') {
      if (anchorNodeId) loadingCrawlerAnchorIds.add(anchorNodeId)
    }
  }
  const persistedConnections = new Set((Array.isArray(graph?.edges) ? graph!.edges : []).map(edge => {
    return `${readRecoveryCanonicalId(edge.source)}\u0000${readRecoveryCanonicalId(edge.target)}`
  }))
  const out: string[] = []
  for (const node of nodes) {
    const nodeId = readRecoveryString(node.id)
    if (!nodeId) continue
    const canonicalNodeId = readRecoveryCanonicalId(nodeId)
    const properties = node.properties || {}
    if (!parseNativeCrawlerInvocation(readRecoveryValue(properties.prompt))) continue
    const runStatus = readRecoveryString(properties.workflowRunStatus)
    const needsRunningRecovery = runStatus === 'running' || loadingCrawlerAnchorIds.has(canonicalNodeId)
    const outputPanelIds = outputPanelIdsByAnchorId.get(canonicalNodeId) || new Set<string>()
    const hasCompletedCrawlerRun = runStatus === 'done'
      || (!runStatus && completedCrawlerOutputAnchorIds.has(canonicalNodeId))
    const needsCompletedTableBackfill = hasCompletedCrawlerRun && !readyTableAnchorIds.has(canonicalNodeId)
    const needsOutputEdgeBackfill = hasCompletedCrawlerRun && [...outputPanelIds].some(panelNodeId => {
      return !persistedConnections.has(`${canonicalNodeId}\u0000${panelNodeId}`)
    })
    if (needsRunningRecovery || needsCompletedTableBackfill || needsOutputEdgeBackfill) out.push(nodeId)
  }
  return out
}

export const resolveNativeCrawlerGenerationToken = (args: {
  nodeProperties?: Record<string, unknown> | null
  workspacePath?: unknown
  timestampMs?: number
}): string => {
  const properties = args.nodeProperties || {}
  return readWorkspaceUtcSessionTimestamp(properties.websiteImportGenerationToken)
    || readWorkspaceUtcSessionTimestamp(properties.outputPath)
    || readWorkspaceUtcSessionTimestamp(args.workspacePath)
    || formatWorkspaceUtcSessionTimestamp(args.timestampMs ?? Date.now())
}

export const parseNativeCrawlerInvocation = (input: unknown): NativeCrawlerInvocation | null => {
  const text = String(input || '').trim()
  const tokens = new Set(splitInvocationTokenSegments(text)
    .filter(segment => segment.kind === 'token')
    .map(segment => segment.value.toLowerCase()))
  const command = tokens.has(NATIVE_CRAWLER_COMMAND)
    ? NATIVE_CRAWLER_COMMAND
    : tokens.has('/reference.expand')
      ? '/reference.expand'
      : null
  if (!command || !tokens.has(NATIVE_CRAWLER_SEMANTIC) || !tokens.has(NATIVE_CRAWLER_POLICY)) return null
  const rawUrl = /(?:^|\s)@url\s*:\s*(https?:\/\/\S+)/i.exec(text)?.[1]?.replace(/[),.;]+$/, '') || ''
  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return { command, url: url.toString(), semantic: NATIVE_CRAWLER_SEMANTIC, policy: NATIVE_CRAWLER_POLICY }
  } catch {
    return null
  }
}

const readCreatedPaths = (result: void | WorkspaceBridgeImportResult): string[] => {
  if (!result || !Array.isArray(result.createdPaths)) return []
  return result.createdPaths
    .map(path => String(path || '').trim())
    .filter((path, index, paths) => Boolean(path) && paths.indexOf(path) === index)
}

export const executeNativeCrawlerInvocation = async (
  invocation: NativeCrawlerInvocation,
  args?: { generationToken?: string; onProgress?: (progress: WorkspaceWebsiteImportProgress) => void; recoveryOnly?: boolean },
): Promise<NativeCrawlerInvocationRunResult> => {
  const readManifest = async (): Promise<WebsiteImportManifestV1 | null> => {
    const importId = readWorkspaceUtcSessionTimestamp(args?.generationToken)
    if (!importId) return null
    try {
      const response = await fetch(`/__website_import/manifest?importId=${encodeURIComponent(importId)}`, { headers: { Accept: 'application/json' } })
      if (!response.ok) return null
      const json = await response.json() as { ok?: unknown; manifest?: unknown }
      if (json.ok !== true || !json.manifest || typeof json.manifest !== 'object') return null
      return json.manifest as WebsiteImportManifestV1
    } catch {
      return null
    }
  }
  const buildResult = (args: {
    createdPaths: string[]
    manifest: WebsiteImportManifestV1 | null
    fallbackSummary: WorkspaceWebsiteImportSummary | null
  }): NativeCrawlerInvocationRunResult => {
    const authoritativeSourceUrl = typeof args.manifest?.rootUrl === 'string' && args.manifest.rootUrl.trim()
      ? args.manifest.rootUrl.trim()
      : invocation.url
    const authoritativeInvocation = authoritativeSourceUrl === invocation.url
      ? invocation
      : { ...invocation, url: authoritativeSourceUrl }
    const outputPath = args.createdPaths.find(path => /website\.crawl\.canvas\.md$/i.test(path)) || args.createdPaths[0] || null
    const summary = args.manifest ? buildWebsiteImportManifestSummary(args.manifest) : args.fallbackSummary
    const crawlErrors = (args.manifest?.errors || []).map(item => ({ url: String(item.url || '').trim(), error: String(item.error || '').trim() })).filter(item => item.error)
    const pageArtifactCount = Math.max(0, Number(summary?.storedFiles || 0) - (args.manifest ? 1 : 0))
    const proxyMode = args.manifest?.runtime?.proxyMode === 'rotating' ? 'rotating' : 'direct'
    const outputText = [
      '# Website crawl imported',
      '',
      ...(summary ? [`Completed with ${summary.processedPages} pages: ${summary.successfulPages} successful, ${summary.errorPages} errors, ${summary.storedFiles} stored files.`, ''] : []),
      `- Source URL: ${authoritativeSourceUrl}`,
      '- Runtime: native headless browser automation',
      `- Proxy routing: ${proxyMode}`,
      '- Canvas projection: complete',
      `- Page artifacts stored: ${pageArtifactCount}`,
      ...(outputPath ? [`- Canvas document: ${outputPath}`] : []),
      ...(crawlErrors.length ? ['', '## Crawl errors', '', ...crawlErrors.slice(0, 20).map(item => `- ${item.url || authoritativeSourceUrl}: ${item.error}`)] : []),
    ].join('\n')
    return {
      invocation: authoritativeInvocation,
      createdPaths: args.createdPaths,
      outputPath,
      outputText,
      summary,
      panelMarkdown: args.manifest ? buildWebsiteCrawlTablePanelMarkdown(args.manifest) : null,
    }
  }
  const recoveredManifest = args?.recoveryOnly ? await readManifest() : null
  if (recoveredManifest?.status === 'done') {
    const host = safeWebsitePathSegment(new URL(recoveredManifest.rootUrl || invocation.url).hostname)
    const root = `/websites/${host}/${recoveredManifest.importId}`
    return buildResult({
      createdPaths: [`${root}/website.crawl.canvas.md`, `${root}/website.sitemap.md`],
      manifest: recoveredManifest,
      fallbackSummary: null,
    })
  }
  const importWebsite = getMarkdownWorkspaceActionBridge().importWebsite
  const options = {
    ...buildAutoWebsiteImportOptions(),
    applyToCanvas: false,
    preserveActiveDocument: true,
    generationToken: args?.generationToken,
    source: 'invocation' as const,
    onProgress: args?.onProgress,
  }
  const result = importWebsite
    ? await importWebsite(invocation.url, options)
    : await (async () => {
        const { importWebsiteViaWorkspaceRuntime } = await import('@/features/markdown-workspace/useWorkspaceFileActions/websiteImportAction')
        return importWebsiteViaWorkspaceRuntime(invocation.url, options)
      })()
  const createdPaths = readCreatedPaths(result)
  const fallbackSummary = result && typeof result === 'object' && result.websiteImportSummary
    ? result.websiteImportSummary
    : null
  const resultManifest = result && typeof result === 'object' && result.websiteImportManifest
    ? result.websiteImportManifest
    : null
  const manifest = resultManifest || await readManifest()
  return buildResult({ createdPaths, manifest, fallbackSummary })
}

export const tryActivateNativeCrawlerInvocation = async (args: {
  input: string
  submitArgs: FloatingPanelChatSubmitArgs
}): Promise<boolean> => {
  const invocation = parseNativeCrawlerInvocation(args.input)
  if (!invocation) return false
  const { submitArgs } = args
  submitArgs.setErrorText(null)
  submitArgs.setInput('')
  submitArgs.setIsLoading(true)
  const timestampMs = Date.now()
  let response = `Crawling ${invocation.url} with the native headless website importer.`
  let status: 'ok' | 'error' = 'ok'
  try {
    const result = await executeNativeCrawlerInvocation(invocation, { generationToken: formatWorkspaceUtcSessionTimestamp(timestampMs) })
    response = result.outputText
    submitArgs.pushUiLog?.({ kind: 'success', message: `Native web crawl finished: ${invocation.url}`, source: 'chat:nativeCrawler' })
  } catch (error) {
    status = 'error'
    response = error instanceof Error ? error.message : 'Native web crawl failed.'
    submitArgs.setErrorText(response)
    submitArgs.pushUiLog?.({ kind: 'error', message: response, source: 'chat:nativeCrawler' })
  } finally {
    submitArgs.setIsLoading(false)
  }
  const identity = timestampMs.toString(36)
  const exchange: ChatMessage[] = [
    { id: `native-crawler-user-${identity}`, role: 'user', content: args.input },
    { id: `native-crawler-assistant-${identity}`, role: 'assistant', content: response },
  ]
  submitArgs.setMessages(previous => [...previous, ...exchange])
  submitArgs.pushChatExchangeLog({ request: args.input, response, status, model: 'native-web-crawler', tsMs: timestampMs })
  await submitArgs.persistChatExchangeLog({ request: args.input, response, status, model: 'native-web-crawler', timestampMs }).catch(() => void 0)
  return true
}
