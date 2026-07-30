import type { Canvas2dRendererId } from '@/lib/config.render'
import type { WorkspaceUrlImportDocumentModeId } from '@/features/markdown-workspace/workspaceImport/canvasPresets'
import type { VideoDownloadOptions, VideoDownloadResult } from '@/lib/video-download/types'
import type { WebsiteImportManifestV1 } from '@/lib/websites/server/websiteImportTypes'

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
  createdPaths?: string[]
  removedPaths?: string[]
  websiteImportSummary?: WorkspaceWebsiteImportSummary
  websiteImportManifest?: WebsiteImportManifestV1
}

export type WorkspaceWebsiteImportSummary = {
  importId: string
  processedPages: number
  successfulPages: number
  errorPages: number
  storedFiles: number
}

type WorkspaceBridgeImportReturn = void | WorkspaceBridgeImportResult | Promise<void | WorkspaceBridgeImportResult>

export type MarkdownWorkspaceActionBridge = {
  importLocalFiles?: (files: WorkspaceFileSelection) => WorkspaceBridgeImportReturn
  importLocalImages?: (files: WorkspaceFileSelection) => WorkspaceBridgeImportReturn
  importLocalFolder?: (files: WorkspaceFileSelection) => WorkspaceBridgeImportReturn
  importUrl?: (url: string, opts?: WorkspaceImportUrlOpts) => WorkspaceBridgeImportReturn
  importWebsite?: (url: string, opts?: WorkspaceImportWebsiteOpts) => WorkspaceBridgeImportReturn
  downloadVideo?: (url: string, options: VideoDownloadOptions) => Promise<VideoDownloadResult>
  createNewFolder?: () => void
  save?: () => void

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
    if (bridge.export) {
      merged.export = {
        ...(merged.export || {}),
        ...bridge.export,
      }
    }
  }
  return merged
}
