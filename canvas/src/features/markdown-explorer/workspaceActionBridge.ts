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

export type WorkspaceAgentGraphCounts = {
  sources: number
  nodes: number
  edges: number
}

export type WorkspaceAgentGraphProjection = {
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
export type WorkspaceAgentGraphImportProgress = {
  schema: 'agentic-graph-agent-graph-import-progress/v1'
  kind: 'source-parsed'
  graphId: string
  parserRegistryDigest: string
  sourcePath: string
  sourceIndex: number
  sourceTotal: number
  truncated: boolean
  graphData: GraphData
}

export type WorkspaceAgentGraphImportResult = {
  handled: true
  kind: 'agent-graph'
  graphId: string
  snapshotDigest: string
  parserRegistryDigest: string
  complete: boolean
  counts: WorkspaceAgentGraphCounts
  projection: WorkspaceAgentGraphProjection
}

export type WorkspaceAgentGraphArtifactRequest = {
  repositoryUrl: string
  invocation: WorkspaceAgentGraphInvocation
  result: WorkspaceAgentGraphImportResult
}

export type WorkspaceAgentGraphArtifactResult = {
  path: string
}

export type WorkspaceAgentGraphInvocation = {
  schema: 'agentic-graph-agent-graph-invocation/v1'
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

export type WorkspaceAgentGraphBridge = {
  importFolder?: () => Promise<WorkspaceAgentGraphImportResult>
  importRepositoryUrl?: (
    url: string,
    opts?: WorkspaceImportUrlOpts,
    invocation?: WorkspaceAgentGraphInvocation,
    onProgress?: (progress: WorkspaceAgentGraphImportProgress) => void,
  ) => Promise<WorkspaceAgentGraphImportResult>
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
  materializeAgentGraphImport?: (
    args: WorkspaceAgentGraphArtifactRequest,
  ) => Promise<WorkspaceAgentGraphArtifactResult>
  agentGraph?: WorkspaceAgentGraphBridge

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
    if (bridge.materializeAgentGraphImport) {
      merged.materializeAgentGraphImport = bridge.materializeAgentGraphImport
    }
    if (bridge.agentGraph) {
      merged.agentGraph = {
        ...(merged.agentGraph || {}),
        ...bridge.agentGraph,
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
