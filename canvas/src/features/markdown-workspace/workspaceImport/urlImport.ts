import { findSavedUrlImport, recordUrlImport, type SavedUrlImport } from './incrementalImport'
import { extractYamlFrontmatterHeaderBlock, readYamlFrontmatterValue } from '@/lib/markdown/frontmatter'
import { workspaceImportSourceUrlsMatch } from './sourceUrlIdentity'
import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { WORKSPACE_ROOT_PATH, normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { parseGitHubRepoUrl } from '../githubRepoApi'
import { importGitHubFolder } from '../githubRepoImport'
import type { WorkspaceImportProgress, WorkspaceImportResult } from './types'
import { fetchWorkspaceUrlContent } from './urlContent'
import type { Canvas2dRendererId } from '@/lib/config.render'
import type { WorkspaceUrlImportDocumentModeId } from './canvasPresets'
import { shouldApplyImportedCanvasDocumentToGraph } from './applyPolicy'
import {
  persistImportedShareUrlArtifacts,
  resolveImportedShareUrlArtifactPathsForWrite,
} from './shareUrlExport'
import { persistImportedWebpageUrlArtifact } from './webpageUrlExport'
import { writeWorkspaceFileTextEnsuringFile } from '@/features/chat/chatWorkspaceFsWrite'
import { buildCorpusImportManifest, buildCorpusSourceUnit } from '@/features/queryable-corpus/sourceFilesCorpusManifest'
import {
  buildStrybldrStoryboardDocument,
  buildStrybldrWorkspaceDocumentName,
  serializeStrybldrStoryboardMarkdown,
} from '@/features/strybldr/strybldrStoryboard'
import { importXrImageWorkspaceAssetsFromUrl, isXrImageAssetUrl } from './xrImageAssets'
import { materializeCsvJsonImportArtifacts } from './csvJsonConversion'
import { materializeVideoSequenceTimelineImportDocument } from './videoSequenceTimelineImport'
import { materializeVideoAgentUrlImportDocument } from './videoAgentUrlImport'
import { getYouTubeId } from 'grph-shared/rich-media/providers'

/**
 * This describes the existing repository-aware workspace import route without
 * exposing the provider-specific parser to callers that only need its source
 * classification.
 */
export function isWorkspaceRepositoryImportUrl(rawUrl: string): boolean {
  return parseGitHubRepoUrl(String(rawUrl || '').trim()) !== null
}

async function acceptsSavedVideoAgentImport(saved: SavedUrlImport, requestedUrl: string, requireOwned: boolean): Promise<boolean> {
  if (!workspaceImportSourceUrlsMatch(saved.source.url, requestedUrl)) return true
  const header = extractYamlFrontmatterHeaderBlock(saved.text)
  if (!header || readYamlFrontmatterValue(header.rawBlock, 'kgVideoAgentImport') !== 'true') return !requireOwned
  if (saved.text.length > 500_000
    || !/^kgVideoSequenceAnnotations:[ \t]*(?:\r?$|\[)/m.test(header.rawBlock)) return false
  if (new TextEncoder().encodeInto(saved.text, new Uint8Array(500_000)).read !== saved.text.length) return false
  const [{ readVideoSequenceSourceAnnotations, resolveVideoSequenceSourceAnnotations },
    { readVideoSequenceTimelineModelFromMarkdown }, { parseMarkdownFrontmatter, splitMarkdownLines },
    { isPlainObject }, { buildMermaidGanttTimelineModel }, { readMermaidGanttFrameSamples }, { getNodeMediaSpec }] = await Promise.all([
    import('@/components/timeline/videoSequenceSourceAnnotations'), import('@/components/timeline/videoSequenceTimeline'),
    import('@/lib/markdown'), import('@/lib/graph/value'), import('@/lib/mermaid/mermaidGanttTimelineModel'),
    import('@/lib/mermaid/mermaidGanttFrameThumbnailToken'),
    import('@/lib/canvas/graph-elements/mediaSpec'),
  ])
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(saved.text), { maxNodes: 12000, maxDepth: 32 })
  const diagrams = isPlainObject(parsed.meta.flow_diagrams) ? parsed.meta.flow_diagrams.value : null
  const diagram = isPlainObject(diagrams) ? diagrams.video_media_timeline : null
  const typedNodes = isPlainObject(parsed.meta.flow_nodes) ? parsed.meta.flow_nodes.value : undefined
  const rawNodes = isPlainObject(parsed.meta.flow) ? parsed.meta.flow.nodes : undefined
  const nodes = typedNodes ?? rawNodes
  if (parsed.warnings.length || !isPlainObject(diagram) || diagram.type !== 'mermaid_gantt'
    || typeof diagram.value !== 'string' || !Array.isArray(nodes) || nodes.length > 64
    || (typedNodes !== undefined && rawNodes !== undefined)) return false
  const associations = readVideoSequenceSourceAnnotations(saved.text)
  const sources = readVideoSequenceTimelineModelFromMarkdown(saved.text)?.sources || []
  const groups = resolveVideoSequenceSourceAnnotations({ associations, sources,
    taskSpans: buildMermaidGanttTimelineModel(diagram.value).taskSpans })
  return groups.length > 0 && groups.length === associations.length && groups.every(group => {
    const targets = nodes.filter(node => isPlainObject(node) && node.id === group.association.frameAnalysisNodeId)
    const source = sources.find(item => item.id === group.association.sourceId)
    if (!(group.samples.length > 0 && readMermaidGanttFrameSamples(group.annotationSpan.raw).length <= 16
      && !!source && workspaceImportSourceUrlsMatch(source.sourceUrl, requestedUrl)
      && targets.length === 1 && isPlainObject(targets[0].properties)
      && targets[0].type === 'RichMediaPanel' && targets[0].properties.kind === 'video-agent-frame-analysis'
      && targets[0].properties['flow:widgetFormId'] === 'richMediaPanel'
      && typeof targets[0].properties.sourceUrl === 'string'
      && workspaceImportSourceUrlsMatch(targets[0].properties.sourceUrl, requestedUrl))) return false
    const media = getNodeMediaSpec(targets[0] as Parameters<typeof getNodeMediaSpec>[0])
    const html = media?.kind === 'iframe' ? media.srcDoc || '' : ''
    return /<section\b[^>]*data-kg-video-agent-frame-analysis="1"[^>]*data-kg-video-agent-frame-analysis-exact-samples="1"/.test(html)
      && /<img\b[^>]*data-kg-video-agent-frame-src="[^"]+"/.test(html)
      && /<section\b[^>]*data-kg-video-agent-frame-box-layer="1"/.test(html)
      && /<mark\b[^>]*data-kg-video-agent-detection-index=/.test(html)
      && Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)).some(script =>
        script[1].includes('var frames=[') && script[1].includes('function updateFrameImage(')
        && script[1].includes("'agentic-graph:render-frame'"))
  })
}

export async function importWorkspaceUrl(args: {
  fs: WorkspaceFs
  urlRaw: string
  parentPath?: WorkspacePath
  onProgress?: (p: WorkspaceImportProgress) => void
  canvas2dRenderer?: Canvas2dRendererId | null
  documentSemanticMode?: WorkspaceUrlImportDocumentModeId | null
  viewHint?: 'markdown' | 'json' | 'html'
  preferDirectFetch?: boolean
  fetchUrlContent?: typeof fetchWorkspaceUrlContent
  mirrorToHost?: boolean
}): Promise<WorkspaceImportResult> {
  const rawUrl = String(args.urlRaw || '').trim()
  if (!rawUrl) return { createdPaths: [], sources: [], skipped: [], failed: [] }
  const parentPath = args.parentPath || WORKSPACE_ROOT_PATH

  if (/^https?:\/\//i.test(rawUrl) && !args.canvas2dRenderer && !args.documentSemanticMode && !args.viewHint) {
    const saved = await findSavedUrlImport(args.fs, rawUrl,
      saved => acceptsSavedVideoAgentImport(saved, rawUrl, !!getYouTubeId(rawUrl)))
    if (saved) {
      args.onProgress?.({ phase: 'writing', current: 1, total: 1, label: 'Reused saved source; Refresh from source checks for updates' })
      return { createdPaths: [saved.path], sources: [{ path: saved.path, source: saved.source }], skipped: [], failed: [],
        corpusManifest: buildCorpusImportManifest({ sourceUnits: [buildCorpusSourceUnit({ workspacePath: saved.path,
          relativePath: saved.path, originalName: saved.path, text: saved.text, status: 'cached', importMode: 'url' })], skipped: [], failed: [] }) }
    }
  }

  const repoRef = parseGitHubRepoUrl(rawUrl)
  if (repoRef) {
    return importGitHubFolder({ fs: args.fs, repoRef, parentPath, onProgress: args.onProgress })
  }

  if (isXrImageAssetUrl(rawUrl)) {
    try {
      args.onProgress?.({ phase: 'fetching', current: 0, label: 'Fetching XR image asset' })
    } catch {
      void 0
    }
    const imported = await importXrImageWorkspaceAssetsFromUrl({
      fs: args.fs,
      url: rawUrl,
      parentPath: '/image/agentic-graph/xr',
    })
    try {
      args.onProgress?.({ phase: 'writing', current: imported.createdPaths.length, total: imported.createdPaths.length, label: 'Writing XR image assets' })
    } catch {
      void 0
    }
    const sourceUnit = buildCorpusSourceUnit({
      workspacePath: imported.createdPaths[0] || rawUrl,
      relativePath: rawUrl,
      originalName: rawUrl,
      text: imported.sourceText,
      mimeHint: 'image/*',
      byteSize: imported.sourceText.length,
      mediaKind: 'image',
      status: 'parsed',
      importMode: 'url',
    })
    return {
      createdPaths: imported.createdPaths,
      sources: imported.sources,
      skipped: [],
      failed: [],
      applyToGraph: true,
      corpusManifest: buildCorpusImportManifest({
        sourceUnits: [sourceUnit],
        skipped: [],
        failed: [],
      }),
    }
  }

  try {
    args.onProgress?.({ phase: 'fetching', current: 0, label: 'Fetching' })
  } catch {
    void 0
  }
  const fetchUrlContentImpl = args.fetchUrlContent || fetchWorkspaceUrlContent
  const fetched = await fetchUrlContentImpl(rawUrl, {
    mode: 'import',
    viewHint: args.viewHint === 'json' ? 'json' : args.viewHint === 'html' ? 'html' : 'markdown',
    canvas2dRenderer: args.canvas2dRenderer,
    documentSemanticMode: args.documentSemanticMode,
    preferDirectFetch: args.preferDirectFetch,
    onProgress: p => {
      try {
        args.onProgress?.({ phase: 'fetching', current: p, total: 100, label: 'Fetching' })
      } catch {
        void 0
      }
    },
  })
  try {
    args.onProgress?.({ phase: 'writing', current: 0, label: 'Writing' })
  } catch {
    void 0
  }
  const sourceUrl = fetched.normalizedUrl || rawUrl
  const sharePrimaryPaths = await resolveImportedShareUrlArtifactPathsForWrite({
    fs: args.fs,
    url: sourceUrl,
    importedName: fetched.name,
    importedTitle: fetched.title,
    importedText: fetched.text,
  })
  const sharePrimaryPath = sharePrimaryPaths?.exportMarkdownPath || null
  const webpageUrlArtifact = sharePrimaryPath
    ? null
    : await persistImportedWebpageUrlArtifact({
        fs: args.fs,
        url: sourceUrl,
        importedName: fetched.name,
        importedText: fetched.text,
        mirrorToHost: args.mirrorToHost,
      })
  const webpageUrlArtifactPath = webpageUrlArtifact?.exportMarkdownPath || null
  const createdPath = sharePrimaryPath
    ? (await writeWorkspaceFileTextEnsuringFile({
        fs: args.fs,
        path: sharePrimaryPath,
        text: fetched.text,
      }), sharePrimaryPath)
    : webpageUrlArtifactPath
      ? webpageUrlArtifactPath
    : await args.fs.createFile({ parentPath, name: fetched.name, text: fetched.text })
  try {
    args.onProgress?.({ phase: 'writing', current: 1, total: 1, label: 'Writing' })
  } catch {
    void 0
  }
  const normalized = normalizeWorkspacePath(createdPath)
  const persistedShareArtifacts = await persistImportedShareUrlArtifacts({
    fs: args.fs,
    url: sourceUrl,
    importedName: fetched.name,
    importedTitle: fetched.title,
    importedText: fetched.text,
    importedThinkingText: fetched.thinkingText,
    ...(fetched.thinkingTextTask ? { importedThinkingTextTask: fetched.thinkingTextTask } : {}),
    importedWorkspacePath: normalized,
    mirrorToHost: args.mirrorToHost,
  })
  const sources: WorkspaceImportResult['sources'] = [{ path: normalized, source: { kind: 'url', url: sourceUrl } }]
  const jsonSourceDocuments: NonNullable<WorkspaceImportResult['jsonSourceDocuments']> = []
  const removedPaths = [
    ...(webpageUrlArtifact?.removedPaths || []),
    ...(persistedShareArtifacts?.removedPaths || []),
  ]
  if (persistedShareArtifacts) {
    const knownSourcePaths = new Set(sources.map(item => normalizeWorkspacePath(item.path)))
    const artifactPaths = [persistedShareArtifacts.exportMarkdownPath, persistedShareArtifacts.exportThinkingPath]
      .filter((path): path is string => typeof path === 'string' && !!path.trim())
    for (const path of artifactPaths) {
      const artifactPath = normalizeWorkspacePath(path)
      if (!artifactPath || knownSourcePaths.has(artifactPath)) continue
      knownSourcePaths.add(artifactPath)
      sources.push({ path: artifactPath, source: { kind: 'url', url: sourceUrl } })
    }
  }
  const sourceUnit = buildCorpusSourceUnit({
    workspacePath: normalized,
    relativePath: fetched.name,
    originalName: fetched.name,
    text: fetched.text,
    mimeHint: fetched.sourceMimeHint || 'text/markdown',
    byteSize: fetched.text.length,
    mediaKind: fetched.sourceMediaKind,
    status: 'parsed',
    importMode: 'url',
  })
  const applyToGraph = shouldApplyImportedCanvasDocumentToGraph({
    path: normalized || fetched.name,
    text: fetched.text,
  })
  const createdPaths: WorkspacePath[] = [normalized]
  const csvJsonDerived = await materializeCsvJsonImportArtifacts({
    fs: args.fs,
    sourcePath: normalized,
    sourceName: fetched.name,
    sourceText: fetched.text,
    source: { kind: 'url', url: sourceUrl },
    options: { sourceKind: 'url', sourceUrl },
  })
  if (csvJsonDerived.createdPaths.length > 0 || csvJsonDerived.jsonSourceDocuments.length > 0) {
    createdPaths.push(...csvJsonDerived.createdPaths)
    sources.push(...csvJsonDerived.sources)
    jsonSourceDocuments.push(...csvJsonDerived.jsonSourceDocuments)
  }
  let effectiveApplyToGraph = applyToGraph
  const removedVideoSourcePaths: WorkspacePath[] = []
  if (sourceUnit.mediaKind === 'video') {
    const materializeVideoAgentImport = async (): Promise<void> => {
      const videoAgentPath = await materializeVideoAgentUrlImportDocument({
        fs: args.fs,
        parentPath,
        sourceName: fetched.name,
        sourceText: fetched.text,
        sourceTranscriptJsonText: fetched.transcriptJsonText,
        sourceUrl,
      })
      await args.fs.deleteEntry(normalized).catch(() => void 0)
      removedVideoSourcePaths.push(normalized)
      const retainedCreatedPaths = createdPaths.filter(path => normalizeWorkspacePath(path) !== normalized)
      createdPaths.splice(0, createdPaths.length, ...retainedCreatedPaths)
      const retainedSources = sources.filter(item => normalizeWorkspacePath(item.path) !== normalized)
      sources.splice(0, sources.length, ...retainedSources)
      createdPaths.unshift(videoAgentPath)
      sources.unshift({ path: videoAgentPath, source: { kind: 'url', url: sourceUrl } })
      effectiveApplyToGraph = true
    }

    const shouldUseVideoAgentImport = args.canvas2dRenderer !== 'storyboard' && !!getYouTubeId(sourceUrl)
    if (shouldUseVideoAgentImport) {
      await materializeVideoAgentImport()
    } else {
      const videoSequencePath = await materializeVideoSequenceTimelineImportDocument({
        fs: args.fs,
        parentPath,
        assets: [{
          workspacePath: normalized,
          relativePath: sourceUrl,
          originalName: fetched.name.replace(/\.source\.md$/i, '') || fetched.name,
          sourceUrl,
          mimeHint: fetched.sourceMimeHint || '',
          byteSize: fetched.text.length,
          importMode: 'url',
        }],
      })
      if (videoSequencePath) {
        await args.fs.deleteEntry(normalized).catch(() => void 0)
        removedVideoSourcePaths.push(normalized)
        const retainedCreatedPaths = createdPaths.filter(path => normalizeWorkspacePath(path) !== normalized)
        createdPaths.splice(0, createdPaths.length, ...retainedCreatedPaths)
        const retainedSources = sources.filter(item => normalizeWorkspacePath(item.path) !== normalized)
        sources.splice(0, sources.length, ...retainedSources)
        createdPaths.unshift(videoSequencePath)
        sources.unshift({ path: videoSequencePath, source: { kind: 'url', url: sourceUrl } })
        effectiveApplyToGraph = true
      }
      if (!videoSequencePath && args.canvas2dRenderer !== 'storyboard') await materializeVideoAgentImport()
    }
  }
  if (args.canvas2dRenderer === 'storyboard') {
    const storyDoc = buildStrybldrStoryboardDocument({
      sourceUnits: [sourceUnit],
      mediaUrlBySourceUnitId: { [sourceUnit.id]: sourceUrl },
    })
    const storySource = storyDoc.sources[0] || null
    if (storySource) {
      const storyName = buildStrybldrWorkspaceDocumentName(storySource)
      const storyPath = await args.fs.createFile({
        parentPath,
        name: storyName,
        text: serializeStrybldrStoryboardMarkdown(storyDoc),
      })
      const normalizedStoryPath = normalizeWorkspacePath(storyPath)
      createdPaths.unshift(normalizedStoryPath)
      sources.unshift({ path: normalizedStoryPath, source: { kind: 'url', url: sourceUrl } })
      effectiveApplyToGraph = true
    }
  }
  // Multi-output format owners retain their own replay semantics; a single row cannot represent that set.
  if (/^https?:\/\//i.test(sourceUrl) && createdPaths.length === 1) await recordUrlImport(args.fs, createdPaths[0], sourceUrl)
  return {
    createdPaths,
    sources,
    ...(removedPaths.length > 0 || removedVideoSourcePaths.length > 0 ? { removedPaths: [...removedPaths, ...removedVideoSourcePaths] } : {}),
    ...(jsonSourceDocuments.length > 0 ? { jsonSourceDocuments } : {}),
    skipped: [],
    failed: [],
    applyToGraph: effectiveApplyToGraph,
    corpusManifest: buildCorpusImportManifest({
      sourceUnits: [sourceUnit],
      skipped: [],
      failed: [],
    }),
  }
}
