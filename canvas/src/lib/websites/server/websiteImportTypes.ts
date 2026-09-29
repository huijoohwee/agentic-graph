export type WebsiteImportStatus = 'queued' | 'running' | 'done' | 'failed'

export type WebsiteImportProgress = {
  stage: 'queued' | 'discovering' | 'crawling' | 'converting' | 'done' | 'failed'
  total: number
  processed: number
  ok: number
  error: number
  queued: number
  lastUrl?: string
  updatedAtMs: number
}

export type WebsiteImportDownloadArtifact = {
  id: string
  url: string
  fileName: string
  storedFileName: string
  mimeType: string
  bytes: number
  sha256: string
}

export type WebsiteImportNode = {
  nodeId: string
  url: string
  path: string
  title?: string
  status: 'ok' | 'error'
  links?: string[]
  artifacts: {
    rawHtmlRelPath?: string
    rawHtmlBytes?: number
    rawHtmlSha256?: string
    markdownRelPath?: string
    markdownBytes?: number
    markdownSha256?: string
    conversionJsonRelPath?: string
    conversionJsonBytes?: number
    conversionJsonSha256?: string
    downloads?: WebsiteImportDownloadArtifact[]
  }
}

export type WebsiteImportRuntime = {
  engine: 'http' | 'playwright'
  headless: boolean
  proxyMode: 'direct' | 'rotating'
  proxyPoolSize: number
  downloadAssets: boolean
  maxDownloads: number
  maxDownloadBytes: number
}

export type WebsiteImportManifestV1 = {
  selectedUrls?: string[]
  version: 1
  importId: string
  rootUrl: string
  sitemapUrl?: string
  status: WebsiteImportStatus
  startedAtMs: number
  finishedAtMs?: number
  progress?: WebsiteImportProgress
  runtime?: WebsiteImportRuntime
  nodes: WebsiteImportNode[]
  errors: Array<{ url: string; error: string }>
}

export type WebsiteImportOptions = {
  /** Exact page selection. When present, link following is disabled. */
  selectedUrls?: string[]
  discoverSitemap?: boolean
  sitemapUrl?: string
  maxPages?: number
  concurrency?: number
  includeImages?: boolean
  generateMarkdownArtifacts?: boolean
  outputDirRel?: string
  browserMode?: 'http' | 'headless'
  proxyRotation?: boolean
  downloadAssets?: boolean
  maxDownloads?: number
  maxDownloadBytes?: number
  generationToken?: string
}
