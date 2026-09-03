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
