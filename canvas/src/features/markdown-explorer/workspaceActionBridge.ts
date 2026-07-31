import type { Canvas2dRendererId } from '@/lib/config.render'
import type { WorkspaceUrlImportDocumentModeId } from '@/features/markdown-workspace/workspaceImport/canvasPresets'
import type { VideoDownloadOptions, VideoDownloadResult } from '@/lib/video-download/types'
import type { WebsiteImportManifestV1 } from '@/lib/websites/server/websiteImportTypes'
import type { GraphData } from '@/lib/graph/types'

export type WorkspaceImportUrlOpts = {
  canvas2dRenderer?: Canvas2dRendererId | null
  documentSemanticMode?: WorkspaceUrlImportDocumentModeId | null
}

export type WorkspaceImportWebsiteOpts = {
  generateArtifactDocs?: boolean
  browserEnhance?: boolean
  headless?: boolean
  proxyRotation?: boolean
  downloadAssets?: boolean
  applyToCanvas?: boolean
  preserveActiveDocument?: boolean
  maxDownloads?: number
  maxDownloadBytes?: number
  maxPages?: number
  minPages?: number
  generationToken?: string
  source?: 'import-url' | 'website' | 'invocation'
  onProgress?: (progress: WorkspaceWebsiteImportProgress) => void
}

export type WorkspaceWebsiteImportProgress = {
  stage: string
  total: number | null
  processed: number | null
  ok: number | null
  error: number | null
  running: boolean
}

export type WorkspaceFileSelection = FileList | ReadonlyArray<File> | null

export type WorkspaceBridgeImportResult = {
  handled?: boolean
  error?: string
  /** An explicit, source-classified recovery route; never inferred from a raw URL error. */
  recovery?: {
    kind: 'repository-graph'
  }
  createdPaths?: string[]
  removedPaths?: string[]
  websiteImportSummary?: WorkspaceWebsiteImportSummary
  websiteImportManifest?: WebsiteImportManifestV1
}

export type WorkspaceKnowledgeGraphCounts = {
  sources: number
  nodes: number
  edges: number
}

export type WorkspaceKnowledgeGraphProjection = {
  token: string
  readOnly: true
  graphData: GraphData
  complete: boolean
  truncated: boolean
  limit: number
  reason?: string
}

/**
 * A bounded, source-local fragment emitted while a repository graph is being
 * built. It is deliberately not a snapshot: callers must treat it as a
 * read-only visual preview until the canonical import result arrives.
 */
export type WorkspaceKnowledgeGraphImportProgress = {
  schema: 'knowgrph-knowledge-graph-import-progress/v1'
  kind: 'source-parsed'
  graphId: string
  parserRegistryDigest: string
  sourcePath: string
  sourceIndex: number
  sourceTotal: number
  truncated: boolean
  graphData: GraphData
}

export type WorkspaceKnowledgeGraphImportResult = {
  handled: true
  kind: 'knowledge-graph'
  graphId: string
  snapshotDigest: string
  parserRegistryDigest: string
  complete: boolean
  counts: WorkspaceKnowledgeGraphCounts
  projection: WorkspaceKnowledgeGraphProjection
}

export type WorkspaceKnowledgeGraphInvocation = {
  schema: 'knowgrph-knowledge-graph-invocation/v1'
  tool: string
  action: string
  semantics: readonly string[]
  bindings: readonly string[]
  sourceRevision: string
  catalogDigest: string
  routingSchema: 'agentic-canvas-os-docs-routing/v1'
  routingDigest: string
}

export type WorkspaceWebsiteImportSummary = {
  importId: string
  processedPages: number
  successfulPages: number
  errorPages: number
  storedFiles: number
}

type WorkspaceBridgeImportReturn = void | WorkspaceBridgeImportResult | Promise<void | WorkspaceBridgeImportResult>

export type WorkspaceKnowledgeGraphBridge = {
  importFolder?: () => Promise<WorkspaceKnowledgeGraphImportResult>
  importRepositoryUrl?: (
    url: string,
    opts?: WorkspaceImportUrlOpts,
    invocation?: WorkspaceKnowledgeGraphInvocation,
    onProgress?: (progress: WorkspaceKnowledgeGraphImportProgress) => void,
  ) => Promise<WorkspaceKnowledgeGraphImportResult>
}

export type MarkdownWorkspaceActionBridge = {
  importLocalFiles?: (files: WorkspaceFileSelection) => WorkspaceBridgeImportReturn
  importLocalImages?: (files: WorkspaceFileSelection) => WorkspaceBridgeImportReturn
  importLocalFolder?: (files: WorkspaceFileSelection) => WorkspaceBridgeImportReturn
  importUrl?: (url: string, opts?: WorkspaceImportUrlOpts) => WorkspaceBridgeImportReturn
  importWebsite?: (url: string, opts?: WorkspaceImportWebsiteOpts) => WorkspaceBridgeImportReturn
  downloadVideo?: (url: string, options: VideoDownloadOptions) => Promise<VideoDownloadResult>
  createNewFolder?: () => void
  save?: () => void
  knowledgeGraph?: WorkspaceKnowledgeGraphBridge

  export?: {
    duplicateInWorkspace?: () => void
    workspaceFileJsonLd?: () => void
    markdown?: () => void
    png?: () => void
    gltf?: () => void
    glb?: () => void
    htmlWorkspace?: () => void
    htmlViewer?: () => void
    htmlCanvas?: () => void
    json?: () => void
    svg?: () => void
    pdfPortrait?: () => void
    pdfLandscape?: () => void
  }
}

const bridgeById = new Map<string, MarkdownWorkspaceActionBridge>()

export function registerMarkdownWorkspaceActionBridge(id: string, bridge: MarkdownWorkspaceActionBridge): () => void {
  const key = String(id || '').trim() || 'default'
  bridgeById.set(key, bridge)
  return () => {
    bridgeById.delete(key)
  }
}

export function getMarkdownWorkspaceActionBridge(): MarkdownWorkspaceActionBridge {
  const merged: MarkdownWorkspaceActionBridge = {}
  for (const bridge of bridgeById.values()) {
    if (bridge.importLocalFiles) merged.importLocalFiles = bridge.importLocalFiles
    if (bridge.importLocalImages) merged.importLocalImages = bridge.importLocalImages
    if (bridge.importLocalFolder) merged.importLocalFolder = bridge.importLocalFolder
    if (bridge.importUrl) merged.importUrl = bridge.importUrl
    if (bridge.importWebsite) merged.importWebsite = bridge.importWebsite
    if (bridge.downloadVideo) merged.downloadVideo = bridge.downloadVideo
    if (bridge.createNewFolder) merged.createNewFolder = bridge.createNewFolder
    if (bridge.save) merged.save = bridge.save
    if (bridge.knowledgeGraph) {
      merged.knowledgeGraph = {
        ...(merged.knowledgeGraph || {}),
        ...bridge.knowledgeGraph,
      }
    }
    if (bridge.export) {
      merged.export = {
        ...(merged.export || {}),
        ...bridge.export,
      }
    }
  }
  return merged
}
