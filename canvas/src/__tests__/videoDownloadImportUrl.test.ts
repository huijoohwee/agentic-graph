import fs from 'node:fs'
import path from 'node:path'
import { isVideoDownloadEligible, VIDEO_DOWNLOAD_ELIGIBLE_DOMAINS } from '@/lib/video-download/isVideoDownloadEligible'
import { parseVideoDownloadResult, printVideoDownloadResult } from '@/lib/video-download/videoDownloadResultCodec'
import { registerVideoDownloadInWorkspace } from '@/lib/video-download/registerVideoDownloadInWorkspace'
import { resolveVideoDownload, resolveVideoDownloadEndpoint, sanitizeVideoDownloadError } from '@/lib/video-download/videoDownloadResolver'
import type { VideoDownloadResultOk } from '@/lib/video-download/types'
import { normalizeImportUrlInput } from '@/lib/url'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { resolveMediaImportUrlFile } from '@/lib/storage/uploadedMediaPanelImportUrl'

const rootDir = process.cwd()

function readSource(...parts: string[]): string {
  return fs.readFileSync(path.resolve(rootDir, 'src', ...parts), 'utf8')
}

function okResult(sourceUrl: string): VideoDownloadResultOk {
  const filePath = path.resolve(rootDir, '..', 'huijoohwee', 'video', 'download-test', 'sample.mp4')
  return {
    ok: true,
    filePath,
    fileName: 'sample.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 12,
    sourceUrl,
    fileUrl: '/__video_download_file?path=huijoohwee%2Fvideo%2Fdownload-test%2Fsample.mp4',
  }
}

export function testVideoDownloadEligibilityIsPureAndDomainOwned() {
  const values: unknown[] = [null, undefined, '', 42, {}, [], 'not a url', 'ftp://example.test/video']
  for (const value of values) {
    const first = isVideoDownloadEligible(value)
    const second = isVideoDownloadEligible(value)
    if (typeof first !== 'boolean') throw new Error('expected eligibility result to be boolean')
    if (first !== second) throw new Error('expected eligibility to be idempotent')
  }
  for (const domain of VIDEO_DOWNLOAD_ELIGIBLE_DOMAINS) {
    if (!isVideoDownloadEligible(`https://${domain}/watch`)) throw new Error(`expected ${domain} to be eligible`)
    if (!isVideoDownloadEligible(`https://media.${domain}/watch`)) throw new Error(`expected subdomain of ${domain} to be eligible`)
  }
  if (isVideoDownloadEligible('https://example.test/watch')) throw new Error('expected unrelated domain to be ineligible')
}

export function testVideoDownloadResultCodecRoundTripAndErrors() {
  const result = okResult('https://example.test/source')
  const printed = printVideoDownloadResult(result)
  const parsed = parseVideoDownloadResult(printed)
  if (JSON.stringify(parsed) !== JSON.stringify(result)) throw new Error('expected codec round trip to preserve result')

  const invalid = parseVideoDownloadResult('{')
  if (!('kind' in invalid) || invalid.kind !== 'parse_error') throw new Error('expected invalid JSON to return parse_error')

  const missing = parseVideoDownloadResult({ ok: true, fileName: 'x.mp4' })
  if (!('kind' in missing) || !missing.missingFields?.includes('filePath')) {
    throw new Error('expected missing fields to be reported')
  }
}

export async function testVideoDownloadResolverRequestDedupAndSanitization() {
  const sourceUrl = 'https://example.test/source'
  const response = JSON.stringify({ result: okResult(sourceUrl) })
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
  let release: (() => void) | null = null
  const pending = new Promise<void>(resolve => {
    release = resolve
  })
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ input, init })
    await pending
    return new Response(response, { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const first = resolveVideoDownload(sourceUrl, { format: 'mp4', mediaKind: 'video-audio', quality: '720p', subtitleLang: 'en' }, { endpoint: 'https://download.example.test/api', fetchImpl })
  const second = resolveVideoDownload(sourceUrl, { format: 'mp4', mediaKind: 'video-audio', quality: '720p', subtitleLang: 'en' }, { endpoint: 'https://download.example.test/api', fetchImpl })
  if (first !== second) throw new Error('expected in-flight duplicate calls to share a promise')
  release?.()
  const resolved = await first
  if (!resolved.ok || resolved.result.fileName !== 'sample.mp4') throw new Error('expected successful resolver result')
  if (calls.length !== 1) throw new Error(`expected one fetch call, got ${calls.length}`)
  const body = JSON.parse(String(calls[0]?.init?.body || '{}')) as Record<string, unknown>
  if (body.url !== sourceUrl || body.format !== 'mp4' || body.mediaKind !== 'video-audio' || body.quality !== '720p' || body.subtitleLang !== 'en') {
    throw new Error('expected resolver request body to match schema')
  }
  if ('outputDir' in body) {
    throw new Error('expected the portable default to defer output directory resolution to the local server')
  }
  const headers = calls[0]?.init?.headers as Record<string, string>
  if (headers['Content-Type'] !== 'application/json' || headers.Accept !== 'application/json') {
    throw new Error('expected JSON request headers')
  }

  const notConfigured = await resolveVideoDownload(sourceUrl, {}, { endpoint: 'relative/path', fetchImpl })
  if (notConfigured.ok) throw new Error('expected invalid endpoint to fail')
  if (!('errorCode' in notConfigured) || notConfigured.errorCode !== 'not_configured') {
    throw new Error('expected invalid endpoint to return not_configured')
  }
  const sanitized = sanitizeVideoDownloadError('boom\n    at handler (/private/tmp/server.ts:10:2) file:///private/tmp/server.ts')
  if (sanitized.includes('/private/') || sanitized.includes(' at ')) throw new Error('expected stack/internal path sanitization')
  if (sanitized.length > 256) throw new Error('expected sanitized error length bound')
}

export function testVideoDownloadResolverDerivesLocalBrowserEndpoint() {
  const globals = globalThis as unknown as Record<string, unknown>
  const previousWindow = globals.window
  try {
    globals.window = {
      location: { origin: 'http://localhost:5174' },
    }
    const endpoint = resolveVideoDownloadEndpoint(null)
    if (endpoint !== 'http://localhost:5174/__video_download') {
      throw new Error(`expected derived local endpoint, got ${endpoint}`)
    }
  } finally {
    globals.window = previousWindow
  }
}

export async function testVideoDownloadWorkspaceRegistrationPreservesFields() {
  const fs = createMemoryWorkspaceFs()
  const result = okResult('https://example.test/source')
  const registration = await registerVideoDownloadInWorkspace({ result, fs })
  if (registration.ok === false) throw new Error(registration.error)
  const text = await fs.readFileText(registration.workspacePath)
  if (!text) throw new Error('expected workspace document text')
  for (const value of [result.fileName, result.filePath, result.fileUrl || '', result.mimeType, String(result.sizeBytes), result.sourceUrl]) {
    if (!value || !text.includes(value)) throw new Error(`expected workspace document to include ${value}`)
  }
  if (!text.includes(`![video](${result.fileUrl})`) || !text.includes(`[Open local video](${result.fileUrl})`)) {
    throw new Error('expected workspace document to expose playable video link')
  }
}

export function testVideoDownloadLaunchAndEndpointSourceContracts() {
  const launch = readSource('lib', 'toolbar', 'LaunchDropdownImportUrlItem.tsx')
  const panel = readSource('features', 'toolbar', 'VideoDownloadOptionsPanel.tsx')
  const bridge = readSource('features', 'markdown-explorer', 'workspaceActionBridge.ts')
  const config = readSource('lib', 'config.env.ts')
  const resolver = readSource('lib', 'video-download', 'videoDownloadResolver.ts')
  const settingsRegistry = readSource('features', 'settings', 'registry-ui.workspace.ts')
  const settingsStore = readSource('lib', 'workspace', 'workspaceStoreSyncSettings.ts')
  const viteConfig = fs.readFileSync(path.resolve(rootDir, 'vite.config.ts'), 'utf8')
  const endpoint = fs.readFileSync(path.resolve(rootDir, '..', 'cloudflare', 'pages', 'video-download.mjs'), 'utf8')
  const featureSources = [viteConfig, endpoint, resolver].join('\n')

  if (!launch.includes('aria-label="Download local video"')) throw new Error('expected LaunchDropdown download button aria-label')
  if (!launch.includes('isVideoDownloadEligible(urlDraft)')) throw new Error('expected LaunchDropdown to use shared eligibility helper')
  if (!panel.includes('aria-label="Video download options"')) throw new Error('expected options panel root aria-label')
  if (!panel.includes('aria-label="Video download media"') || !panel.includes('aria-label="Video download quality"')) {
    throw new Error('expected options panel to expose media and quality selectors')
  }
  if (!panel.includes('Downloading…')) throw new Error('expected downloading label')
  if (!bridge.includes('downloadVideo?:')) throw new Error('expected workspace bridge downloadVideo hook')
  if (!config.includes('VITE_VIDEO_DOWNLOAD_ENDPOINT')) throw new Error('expected video endpoint env key')
  if (!resolver.includes("VIDEO_DOWNLOAD_LOCAL_ROUTE_PATH = '/__video_download'")) throw new Error('expected local same-origin download route')
  if (!resolver.includes('readWorkspaceImportVideoDownloadOutputDirSetting')) {
    throw new Error('expected resolver to read the MainPanel Settings output directory')
  }
  if (!settingsRegistry.includes("key: 'workspace.import.videoDownload.outputDir'")) {
    throw new Error('expected MainPanel Settings registry to expose video download output directory')
  }
  if (!settingsStore.includes('WORKSPACE_IMPORT_VIDEO_DOWNLOAD_OUTPUT_DIR_DEFAULT')) {
    throw new Error('expected workspace settings store to own the video download output default')
  }
  if (settingsStore.includes('/Users/')) {
    throw new Error('expected workspace settings defaults to avoid user-specific filesystem paths')
  }
  if (!viteConfig.includes('videoDownloadDevPlugin') || !viteConfig.includes("server.middlewares.use(VIDEO_DOWNLOAD_LOCAL_ROUTE_PATH")) {
    throw new Error('expected Vite dev/preview server to register local video download route')
  }
  if (!viteConfig.includes("path.resolve(workspaceRoot, 'huijoohwee', 'video')")) {
    throw new Error('expected local endpoint to default downloads into the sibling huijoohwee video folder')
  }
  if (!viteConfig.includes('resolveVideoDownloadOutputRoot') || !viteConfig.includes('workspaceRoot, rawPath')) {
    throw new Error('expected local endpoint to support configurable workspace-root bounded output directories')
  }
  if (!viteConfig.includes('VIDEO_DOWNLOAD_FILE_ROUTE_PATH') || !viteConfig.includes('createVideoDownloadFileHandler')) {
    throw new Error('expected Vite dev/preview server to expose downloaded video file route')
  }
  if (!viteConfig.includes('extractVideoDownloadMediaCandidates') || !viteConfig.includes('writeVideoDownloadResponseToFile')) {
    throw new Error('expected local endpoint to use native media discovery and file writing')
  }
  if (!viteConfig.includes('pickVideoDownloadByQuality') || !viteConfig.includes('requestedMediaKind')) {
    throw new Error('expected local endpoint to apply media and quality selection')
  }
  for (const forbidden of ['yt-dlp', 'yt_dlp', 'YTDLP_BIN', 'AGENTICGRAPH_YTDLP_BIN']) {
    if (featureSources.includes(forbidden)) throw new Error(`expected video download feature to avoid external dependency ${forbidden}`)
  }
  if (endpoint.includes('watch?v=')) throw new Error('expected endpoint source to avoid hardcoded video fixtures')
}

export function testImportUrlRejectsDownloadFailureStatusText() {
  const staleStatus = 'Download failed: Native downloader supports direct audio/video URLs and pages that expose media source URLs. This source requires extractor logic that is not implemented in-repo'
  if (normalizeImportUrlInput(staleStatus) !== '') {
    throw new Error('expected Import URL to reject download failure status text')
  }
  const valid = normalizeImportUrlInput('https://www.youtube.com/watch?v=AbC_DeF1234')
  if (valid !== 'https://www.youtube.com/watch?v=AbC_DeF1234') {
    throw new Error(`expected valid YouTube URL to remain importable, got ${valid}`)
  }
}

export async function testFloatingPanelMediaImportUrlFallsBackToVideoDownload() {
  const sourceUrl = `https://youtu.be/${['MediaImport', '01'].join('')}`
  const endpoint = 'http://localhost:5178/__video_download'
  const fileUrl = '/__video_download_file?path=video%2Fsample.mp4'
  const calls: Array<{ input: string; body: string }> = []
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const inputText = String(input)
    calls.push({ input: inputText, body: String(init?.body || '') })
    if (inputText === endpoint) {
      return new Response(JSON.stringify({ result: { ...okResult(sourceUrl), fileUrl } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (inputText === fileUrl) {
      return new Response(new Blob(['video bytes'], { type: 'video/mp4' }), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      })
    }
    return new Response('<html>provider page</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
  }

  const file = await resolveMediaImportUrlFile({ urlRaw: sourceUrl, fetchImpl, videoDownloadEndpoint: endpoint })
  const downloadCall = calls.find(call => call.input === endpoint)
  const requestBody = JSON.parse(downloadCall?.body || '{}') as Record<string, unknown>
  if (
    file.name !== 'sample.mp4' ||
    file.type !== 'video/mp4' ||
    file.size <= 0 ||
    !downloadCall ||
    requestBody.url !== sourceUrl ||
    requestBody.mediaKind !== 'video-audio' ||
    requestBody.quality !== 'best' ||
    !calls.some(call => call.input === fileUrl)
  ) {
    throw new Error(`expected FloatingPanel Media Import URL to reuse video-download fallback, got ${JSON.stringify({ calls, file: { name: file.name, size: file.size, type: file.type }, requestBody })}`)
  }
}
