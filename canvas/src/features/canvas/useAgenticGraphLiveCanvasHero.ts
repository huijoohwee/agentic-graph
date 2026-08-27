import React from 'react'
import { getSourceFileTextHash } from '@/features/source-files/sourceFilesSignatures'
import {
  isDefaultWorkspaceSeedSourcePath,
  resolveWorkspaceSeedSourcePath,
  WORKSPACE_README_PUBLIC_SOURCE_PATH,
  WORKSPACE_README_SOURCE_ID,
  WORKSPACE_README_SOURCE_PATH,
} from '@/features/source-files/workspaceSeedSourceFiles'
import type { SourceFile } from '@/hooks/store/types'
import type { GraphData } from '@/lib/graph/types'
import { isRouterRootAliasRuntime, resolveLiveCanvasHeroEnterHref } from '@/lib/routing/basePath'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { hasLiveCanvasHeroBlockingSearchParams, shouldShowLiveCanvasHero } from './liveCanvasHeroVisibility'
import {
  LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT,
  readPersistedLiveCanvasHeroSourceSelection,
  readLiveCanvasHeroSourceSelection,
  type LiveCanvasHeroSourceSelection,
} from './liveCanvasHeroSourceSelection'
import { resolveLiveCanvasHeroEmbedUrl } from './liveCanvasHeroEmbed'
import { deriveLiveCanvasHeroCommandRouteGraph } from './liveCanvasHeroProjection'
import {
  CANONICAL_STARTUP_DOCUMENT_PATH,
  resolveCanonicalStartupCanvasEmbedRuntimeUrl,
} from './canvasEmbedPresets'

export type LiveCanvasHeroWorkspaceSourceState = {
  defaultSeedOnly: boolean
  defaultSeedContentSignature: string | null
  meaningfulSourceFilesPresent: boolean
}

export type LiveCanvasHeroSource = {
  sourceFileId: string
  sourcePath: string
  graphData: GraphData
  canvasGraphData: GraphData
  graphRevision: number
  graphId: string
  schema: string
  sourceLayerHash: string
  embedUrl?: string
}

const LIVE_CANVAS_HERO_INITIALIZATION_SOURCE_BASENAME = 'knowgrph-agentic-video-canvas-demo.md'

const normalizeLiveCanvasHeroSourceIdentity = (value: unknown): string => String(value || '')
  .trim()
  .replace(/\\/g, '/')
  .replace(/^[a-z]+:\/+/i, '')
  .replace(/^\/+/, '')
  .replace(/\/+$/, '')
  .toLowerCase()

const resolvePreferredLiveCanvasHeroSourceFile = (
  sourceFiles: SourceFile[],
  preferredSourcePath: string,
): SourceFile | null => {
  const preferred = normalizeLiveCanvasHeroSourceIdentity(preferredSourcePath)
  if (!preferred) return null
  const preferredBasename = preferred.split('/').pop() || preferred
  const ranked = sourceFiles.map(sourceFile => {
    const identities = [sourceFile.id, sourceFile.name, sourceFile.source?.path, sourceFile.source?.url]
      .map(normalizeLiveCanvasHeroSourceIdentity)
      .filter(Boolean)
    const exact = identities.some(identity => identity === preferred)
    const suffix = identities.some(identity => identity.endsWith(`/${preferred}`) || preferred.endsWith(`/${identity}`))
    const basename = identities.some(identity => identity.split('/').pop() === preferredBasename)
    return { sourceFile, rank: exact ? 3 : suffix ? 2 : basename ? 1 : 0 }
  }).filter(candidate => candidate.rank > 0)
  ranked.sort((left, right) => right.rank - left.rank)
  const bestRank = ranked[0]?.rank || 0
  const bestMatches = ranked.filter(candidate => candidate.rank === bestRank)
  return bestMatches.length === 1 ? bestMatches[0]?.sourceFile || null : null
}

const isLiveCanvasHeroInitializationSourcePath = (path: string): boolean => (
  isDefaultWorkspaceSeedSourcePath(path)
  || path.replace(/\\/g, '/').toLowerCase().startsWith('workspace:/docs/')
  || path.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === LIVE_CANVAS_HERO_INITIALIZATION_SOURCE_BASENAME
)

const readGraphMetadata = (graphData: GraphData | null | undefined): Record<string, unknown> => {
  const metadata = graphData?.metadata
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
}

const readFrontmatterMetadata = (graphData: GraphData): Record<string, unknown> => {
  const frontmatter = readGraphMetadata(graphData).frontmatterMeta
  return frontmatter && typeof frontmatter === 'object' && !Array.isArray(frontmatter)
    ? frontmatter as Record<string, unknown>
    : {}
}

export function resolveLiveCanvasHeroSource(args: {
  sourceFiles: SourceFile[]
  activeGraphData: GraphData | null | undefined
  preferredSourcePath?: string | null
}): LiveCanvasHeroSource | null {
  const sourceFiles = Array.isArray(args.sourceFiles) ? args.sourceFiles : []
  const preferredSourcePath = String(args.preferredSourcePath || '').trim()
  const sourceFile = preferredSourcePath
    ? resolvePreferredLiveCanvasHeroSourceFile(sourceFiles, preferredSourcePath)
    : sourceFiles.find(file => {
    if (!file) return false
    const sourcePath = file.source?.path || file.source?.url || file.name
    return resolveWorkspaceSeedSourcePath(sourcePath) === WORKSPACE_README_SOURCE_PATH
  })
  if (!sourceFile || sourceFile.status === 'error') return null

  const sourceFileId = String(sourceFile.id || '').trim()
  const text = String(sourceFile.text || '')
  if (!sourceFileId) return null
  const sourceTextGraphData = text.trim()
    ? tryParseMarkdownFrontmatterFlowGraph(String(sourceFile.name || 'workspace-readme.md'), text)?.graphData || null
    : null
  const graphDataCandidates = [
    sourceTextGraphData,
    sourceFile.parsedGraphData,
    preferredSourcePath ? null : args.activeGraphData,
  ]
    .filter((candidate): candidate is GraphData => candidate != null)
  const resolvedGraph = graphDataCandidates
    .map(graphData => ({ graphData, canvasGraphData: deriveLiveCanvasHeroCommandRouteGraph(graphData) }))
    .find(candidate => candidate.canvasGraphData != null)
  if (!resolvedGraph) return null

  const { graphData, canvasGraphData } = resolvedGraph
  const graphItemCount = (graphData.nodes?.length || 0) + (graphData.edges?.length || 0)
  const sourceLayerHash = String(readGraphMetadata(graphData).sourceLayerHash || getSourceFileTextHash(sourceFile)).trim()
  if (graphItemCount === 0 || !sourceLayerHash) return null

  const frontmatter = readFrontmatterMetadata(graphData)
  return {
    sourceFileId,
    sourcePath: preferredSourcePath || WORKSPACE_README_SOURCE_PATH,
    graphData,
    canvasGraphData: canvasGraphData as GraphData,
    graphRevision: Number.isFinite(sourceFile.parsedGraphRevision) ? Number(sourceFile.parsedGraphRevision) : 0,
    graphId: String(frontmatter.graphId || '').trim(),
    schema: String(frontmatter.schema || '').trim(),
    sourceLayerHash,
  }
}

export function resolveWorkspaceReadmeTextLiveCanvasHeroSource(text: string): LiveCanvasHeroSource | null {
  return resolveLiveCanvasHeroSource({
    sourceFiles: [{
      id: WORKSPACE_README_SOURCE_ID,
      name: 'workspace-readme.md',
      text,
      enabled: true,
      status: 'parsed',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: WORKSPACE_README_SOURCE_PATH },
    }],
    activeGraphData: null,
  })
}

export function resolveLiveCanvasHeroWorkspaceSourceState(args: {
  sourceFiles: SourceFile[]
  markdownDocumentName: string | null | undefined
}): LiveCanvasHeroWorkspaceSourceState {
  const enabledSources = (Array.isArray(args.sourceFiles) ? args.sourceFiles : [])
    .filter(sourceFile => sourceFile?.enabled !== false)
  const sourcePaths = enabledSources.map(sourceFile => (
    String(sourceFile?.source?.path || sourceFile?.source?.url || sourceFile?.name || '').trim()
  ))
  const meaningfulSourceFilesPresent = sourcePaths.some(path => !isLiveCanvasHeroInitializationSourcePath(path))
  const defaultSeedDocumentActive = isLiveCanvasHeroInitializationSourcePath(String(args.markdownDocumentName || ''))
  const hasDefaultSeedSource = sourcePaths.some(path => isLiveCanvasHeroInitializationSourcePath(path))
  const defaultSeedContentSignature = enabledSources
    .filter((sourceFile, index) => isLiveCanvasHeroInitializationSourcePath(sourcePaths[index]))
    .map(sourceFile => [
      String(sourceFile.id || ''),
      String(sourceFile.source?.path || sourceFile.source?.url || sourceFile.name || ''),
      getSourceFileTextHash(sourceFile),
    ].join(':'))
    .sort()
    .join('|') || null
  return {
    meaningfulSourceFilesPresent,
    defaultSeedOnly: !meaningfulSourceFilesPresent && (hasDefaultSeedSource || defaultSeedDocumentActive),
    defaultSeedContentSignature,
  }
}

export function useKnowgrphLiveCanvasHero(args: {
  graphData: GraphData | null | undefined
  sourceFiles: SourceFile[]
  markdownDocumentName: string | null | undefined
  markdownDocumentText: string | null | undefined
  sourceFilesBootstrapReady: boolean
  isEmbeddedPreview: boolean
  workspaceEditorOverlayOpen: boolean
  workspaceDocumentSwitchPending: boolean
  floatingPanelOpen: boolean
  alternateCanvasSurfaceActive: boolean
}) {
  const [selectedEmbedSource, setSelectedEmbedSource] = React.useState<LiveCanvasHeroSourceSelection | null>(readPersistedLiveCanvasHeroSourceSelection)
  const [landingExited, setLandingExited] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handleSourceSelection = (event: Event) => {
      const selection = readLiveCanvasHeroSourceSelection(event)
      if (!selection) return
      setSelectedEmbedSource(selection)
      setLandingExited(false)
    }
    window.addEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, handleSourceSelection)
    return () => window.removeEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, handleSourceSelection)
  }, [])
  const sourceState = resolveLiveCanvasHeroWorkspaceSourceState({
    sourceFiles: args.sourceFiles,
    markdownDocumentName: args.markdownDocumentName,
  })
  const liveCanvasHeroSource = React.useMemo(() => (
    resolveLiveCanvasHeroSource({
      sourceFiles: args.sourceFiles,
      activeGraphData: args.graphData,
      preferredSourcePath: selectedEmbedSource?.sourcePath,
    }) || resolveLiveCanvasHeroSource({
      sourceFiles: args.sourceFiles,
      activeGraphData: args.graphData,
    })
  ), [args.graphData, args.sourceFiles, selectedEmbedSource?.sourcePath])
  const graphItemCount = (args.graphData?.nodes?.length || 0) + (args.graphData?.edges?.length || 0)
  const hasDocumentText = String(args.markdownDocumentText || '').trim().length > 0
  const [defaultSeedBaselineSignature, setDefaultSeedBaselineSignature] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!args.sourceFilesBootstrapReady || !sourceState.defaultSeedContentSignature) return
    setDefaultSeedBaselineSignature(current => current ?? sourceState.defaultSeedContentSignature)
  }, [args.sourceFilesBootstrapReady, sourceState.defaultSeedContentSignature])
  const defaultSeedContentChanged = defaultSeedBaselineSignature != null
    && sourceState.defaultSeedContentSignature != null
    && defaultSeedBaselineSignature !== sourceState.defaultSeedContentSignature
  const meaningfulWorkspaceContent = sourceState.meaningfulSourceFilesPresent
    || defaultSeedContentChanged
    || (!sourceState.defaultSeedOnly && (graphItemCount > 0 || hasDocumentText))
  const isRootAlias = isRouterRootAliasRuntime(import.meta.env.BASE_URL)
  const [rootAliasFallbackSource, setRootAliasFallbackSource] = React.useState<LiveCanvasHeroSource | null>(null)
  React.useEffect(() => {
    if (!isRootAlias || liveCanvasHeroSource) {
      setRootAliasFallbackSource(null)
      return
    }
    let active = true
    void fetch(WORKSPACE_README_PUBLIC_SOURCE_PATH, { cache: 'no-store' })
      .then(response => response.ok ? response.text() : '')
      .then(text => {
        if (!active) return
        setRootAliasFallbackSource(resolveWorkspaceReadmeTextLiveCanvasHeroSource(text))
      })
      .catch(() => {
        if (active) setRootAliasFallbackSource(null)
      })
    return () => { active = false }
  }, [isRootAlias, liveCanvasHeroSource])
  const effectiveLiveCanvasHeroSource = React.useMemo(() => {
    const source = liveCanvasHeroSource || rootAliasFallbackSource
    const sourcePath = selectedEmbedSource?.sourcePath
      || (isRootAlias ? CANONICAL_STARTUP_DOCUMENT_PATH : source?.sourcePath)
      || ''
    const embedUrl = selectedEmbedSource?.embedUrl
      || (isRootAlias ? resolveCanonicalStartupCanvasEmbedRuntimeUrl() : resolveLiveCanvasHeroEmbedUrl({
        sourcePath,
        baseUrl: import.meta.env.BASE_URL,
      }))
      || undefined
    if (!selectedEmbedSource && !embedUrl) return source
    return {
      ...(source || {
        sourceFileId: `embed:${sourcePath}`,
        graphData: { type: 'GraphData', nodes: [], edges: [] },
        canvasGraphData: { type: 'GraphData', nodes: [], edges: [] },
        graphRevision: 0,
        graphId: '',
        schema: '',
        sourceLayerHash: `embed:${embedUrl || sourcePath}`,
      }),
      sourcePath,
      embedUrl,
    }
  }, [liveCanvasHeroSource, rootAliasFallbackSource, selectedEmbedSource])
  const authoredOwnershipReady = args.sourceFilesBootstrapReady
    && args.workspaceDocumentSwitchPending !== true
    && args.graphData?.metadata?.pending !== true
    && meaningfulWorkspaceContent

  // The workspace route always owns authored content. A selected embed changes
  // Home's background source only; it must never promote /knowgrph into Home.
  React.useEffect(() => {
    if (authoredOwnershipReady && !isRootAlias) setLandingExited(true)
  }, [authoredOwnershipReady, isRootAlias])

  const hasSearchParams = typeof window !== 'undefined' && hasLiveCanvasHeroBlockingSearchParams(
    window.location.search,
    resolveLiveCanvasHeroEnterHref(import.meta.env.BASE_URL),
  )
  const visible = shouldShowLiveCanvasHero({
    isRootAlias,
    // The apex root owns Home from the first React render. Its canonical Share
    // Canvas Embed URL is source-addressable before workspace hydration.
    sourceFilesBootstrapReady: isRootAlias || args.sourceFilesBootstrapReady,
    liveWorkspaceSourceReady: effectiveLiveCanvasHeroSource != null,
    dismissed: landingExited || (!isRootAlias && defaultSeedContentChanged),
    // A selected source can replace Home's background only. It cannot take
    // ownership from a routed workspace document (including kgPath routes).
    hasSearchParams,
    isEmbeddedPreview: args.isEmbeddedPreview,
    workspaceEditorOverlayOpen: args.workspaceEditorOverlayOpen,
    workspaceDocumentSwitchPending: isRootAlias ? false : args.workspaceDocumentSwitchPending,
    floatingPanelOpen: args.floatingPanelOpen,
    alternateCanvasSurfaceActive: args.alternateCanvasSurfaceActive,
    defaultSeedOnly: sourceState.defaultSeedOnly,
    meaningfulSourceFilesPresent: sourceState.meaningfulSourceFilesPresent,
    graphData: args.graphData,
    markdownDocumentText: args.markdownDocumentText,
  })
  return {
    liveCanvasHeroVisible: visible,
    liveCanvasHeroSource: effectiveLiveCanvasHeroSource,
    dismissLiveCanvasHero: () => setLandingExited(true),
  }
}
