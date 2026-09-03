import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { normalizePdfExtractedMarkdown } from '../normalizePdfExtractedMarkdown'
import { embedPdfAssetsInMarkdown } from '../embedPdfAssetsInMarkdown'
import { convertPdfBytesToMarkdown, writePdfAssets } from '../native/nativePdfToMarkdownNode'
import { fetchBytesWithLimits, isHttpUrl, readNumberFromEnv, readRequestBodyBytes, withTimeout } from './pdfHttp'
import { parsePdfConvertRequest } from './pdfConvertRequest'

type PdfConvertResult = { ok: true; markdown: string; name: string } | { ok: false; error: string }

type PdfAssetStore = { token: string; assetsDir: string; tmpDir: string; createdAtMs: number }

function derivePdfNameFromUrl(urlParam: string): string {
  try {
    const url = new URL(urlParam)
    const parts = url.pathname.split('/').filter(Boolean)
    const last = parts[parts.length - 1] || ''
    const base = last.replace(/\.pdf$/i, '') || 'document'
    return `${base}.md`
  } catch {
    return 'document.md'
  }
}

function derivePdfTitleFromUrl(urlParam: string): string {
  try {
    const url = new URL(urlParam)
    const parts = url.pathname.split('/').filter(Boolean)
    const last = parts[parts.length - 1] || ''
    return last || 'document.pdf'
  } catch {
    return 'document.pdf'
  }
}

function deriveMarkdownNameFromPdfFilename(name: string): string {
  const raw = String(name || '').trim()
  if (!raw) return 'document.md'
  const base = raw.replace(/\.pdf$/i, '') || 'document'
  return `${base}.md`
}

function createPdfAssetStoreCache() {
  const entries: PdfAssetStore[] = []
  const byToken = new Map<string, PdfAssetStore>()
  const limit = (() => {
    const raw = String(process.env.AGENTIC_OS_PDF_ASSET_CACHE_LIMIT || '').trim()
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 10
  })()

  const add = (entry: PdfAssetStore) => {
    entries.push(entry)
    byToken.set(entry.token, entry)
    while (entries.length > limit) {
      const evicted = entries.shift()
      if (!evicted) break
      byToken.delete(evicted.token)
      void fs.rm(evicted.tmpDir, { recursive: true, force: true }).catch(() => void 0)
    }
  }

  const get = (token: string) => byToken.get(token)
  return { add, get }
}

const pdfAssetCache = createPdfAssetStoreCache()

type PdfConvertProvider = 'native' | 'docling-remote'

async function convertPdfViaDoclingRemote(args: { endpoint: string; pdfBytes: Buffer; nameHint?: string }): Promise<PdfConvertResult> {
  const endpoint = String(args.endpoint || '').trim()
  if (!endpoint) return { ok: false, error: 'Missing Docling endpoint' }
  const timeoutMs = readNumberFromEnv('AGENTIC_OS_PDF_DOCLING_TIMEOUT_MS', 180_000)
  try {
    const body = (() => {
      const copy = new Uint8Array(args.pdfBytes.byteLength)
      copy.set(args.pdfBytes)
      return copy.buffer
    })()
    const controller = timeoutMs > 0 ? new AbortController() : null
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    const res = await withTimeout(
      fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/pdf',
          ...(args.nameHint ? { 'X-Import-Filename': args.nameHint } : {}),
        },
        body,
        signal: controller?.signal,
      }).finally(() => timeoutId != null && clearTimeout(timeoutId)),
      timeoutMs,
      'Docling request timed out',
    )
    const json = (await res.json()) as { ok?: unknown; markdown?: unknown; error?: unknown; name?: unknown }
    if (json && json.ok === true && typeof json.markdown === 'string') {
      const nameRaw = typeof json.name === 'string' ? json.name.trim() : ''
      const name = nameRaw ? (nameRaw.toLowerCase().endsWith('.pdf') ? deriveMarkdownNameFromPdfFilename(nameRaw) : nameRaw) : 'document.md'
      return { ok: true, markdown: json.markdown, name }
    }
    const err = typeof json?.error === 'string' && json.error.trim() ? json.error.trim() : ''
    if (err) return { ok: false, error: err }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: false, error: 'Docling conversion failed' }
  } catch (error) {
    const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || '') : ''
    return { ok: false, error: msg || 'Docling conversion failed' }
  }
}

function pickProvider(overrides?: { provider?: string | null }): PdfConvertProvider {
  const fromOverride = String(overrides?.provider || '').trim().toLowerCase()
  if (fromOverride === 'docling' || fromOverride === 'docling-remote') return 'docling-remote'
  if (fromOverride === 'native') return 'native'

  const mode = String(process.env.AGENTIC_OS_PDF_MODE || '').trim().toLowerCase()
  if (mode === 'online') {
    const doclingEndpoint = String(process.env.AGENTIC_OS_DOCLING_ENDPOINT || '').trim()
    if (doclingEndpoint) return 'docling-remote'
  }
  const provider = String(process.env.AGENTIC_OS_PDF_PROVIDER || '').trim().toLowerCase()
  if (provider === 'docling' || provider === 'docling-remote') return 'docling-remote'
  return 'native'
}

function defaultIncludeImages(overrides?: { includeImages?: boolean | undefined }): boolean {
  if (typeof overrides?.includeImages === 'boolean') return overrides.includeImages
  const raw = String(process.env.AGENTIC_OS_PDF_INCLUDE_IMAGES || '').trim()
  if (raw) return raw === '1'
  return true
}

function defaultEmbedImages(overrides?: { embedImages?: boolean | undefined }): boolean {
  if (typeof overrides?.embedImages === 'boolean') return overrides.embedImages
  const raw = String(process.env.AGENTIC_OS_PDF_EMBED_IMAGES || '').trim()
  if (raw) return raw === '1'
  return false
}

function defaultStreamDecodeCacheMaxBytes(): number {
  const raw = String(process.env.AGENTIC_OS_PDF_STREAM_DECODE_CACHE_MAX_BYTES || '').trim()
  const parsed = raw ? Number(raw) : NaN
  if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed)
  return 64 * 1024 * 1024
}

function clampToEnvCap(args: { envCap: number; override?: number | undefined }): number {
  if (typeof args.override === 'number' && Number.isFinite(args.override) && args.override > 0) {
    return Math.min(args.envCap, Math.floor(args.override))
  }
  return args.envCap
}

function clampToEnvCapNonNegative(args: { envCap: number; override?: number | undefined }): number {
  if (typeof args.override === 'number' && Number.isFinite(args.override) && args.override >= 0) {
    return Math.min(args.envCap, Math.floor(args.override))
  }
  return args.envCap
}

export async function convertPdfToMarkdown(opts: {
  url?: string
  body?: Buffer
  nameHint?: string
  assetStore?: {
    assetsDirAbs: string
    assetUrlPrefix: string
  }
  overrides?: {
    includeImages?: boolean
    embedImages?: boolean
    maxPages?: number
    maxExtractedImagesPerPage?: number
    maxEmbeddedImagesPerPage?: number
    maxEmbeddedTotalBytes?: number
    maxEmbeddedAssetBytes?: number
    reconstructTables?: boolean
    tableMinColumns?: number
    tableMinRows?: number
    tableMaxRows?: number
    ocrEnabled?: boolean
    ocrMode?: 'fallback' | 'always'
    provider?: string
    doclingEndpoint?: string
    providerFallbackToNative?: boolean

    maxPdfBytes?: number
    fetchTimeoutMs?: number
    uploadTimeoutMs?: number
    convertTimeoutMs?: number

    streamDecodeCacheMaxBytes?: number
    contentStreamMaxDecodeBytes?: number
    pageContentMaxBytes?: number

    cmapMaxBytes?: number
    maxToUnicodeStreamBytes?: number
    toUnicodeMaxDecodeBytes?: number
    imageStreamMaxDecodeBytes?: number
    maxTextContentBytesPerPage?: number
    maxTextStreamBytes?: number
    maxFormXObjectBytes?: number
    maxFormXObjectStreamBytes?: number
    maxFormXObjectCount?: number
  }
}): Promise<PdfConvertResult> {
  const envMaxPdfBytes = readNumberFromEnv('AGENTIC_OS_PDF_MAX_BYTES', 100 * 1024 * 1024)
  const envFetchTimeoutMs = readNumberFromEnv('AGENTIC_OS_PDF_FETCH_TIMEOUT_MS', 60_000)
  const envConvertTimeoutMs = readNumberFromEnv('AGENTIC_OS_PDF_CONVERT_TIMEOUT_MS', 180_000)

  const maxPdfBytes = clampToEnvCap({ envCap: envMaxPdfBytes, override: opts.overrides?.maxPdfBytes })
  const fetchTimeoutMs = clampToEnvCap({ envCap: envFetchTimeoutMs, override: opts.overrides?.fetchTimeoutMs })
  const convertTimeoutMs = clampToEnvCap({ envCap: envConvertTimeoutMs, override: opts.overrides?.convertTimeoutMs })
  const assetStore =
    opts.assetStore && typeof opts.assetStore === 'object'
      ? {
          assetsDirAbs: String(opts.assetStore.assetsDirAbs || '').trim(),
          assetUrlPrefix: String(opts.assetStore.assetUrlPrefix || '').trim().replace(/\/+$/, ''),
        }
      : null

  const cleanup = async () => void 0
  try {
    let pdfBytes: Buffer | null = null
    if (opts.body) {
      if (maxPdfBytes > 0 && opts.body.length > maxPdfBytes) return { ok: false, error: 'PDF is too large' }
      pdfBytes = opts.body
    } else if (opts.url) {
      if (!isHttpUrl(opts.url)) return { ok: false, error: 'Invalid PDF url' }
      const upstream = await fetchBytesWithLimits({
        url: opts.url,
        maxBytes: maxPdfBytes,
        timeoutMs: fetchTimeoutMs,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      if (upstream.status < 200 || upstream.status >= 300) return { ok: false, error: `Upstream fetch failed (${upstream.status})` }
      pdfBytes = upstream.bytes
    } else {
      await cleanup()
      return { ok: false, error: 'Missing PDF url or body' }
    }
    if (!pdfBytes) return { ok: false, error: 'Missing PDF bytes' }

    const title =
      (opts.nameHint && opts.nameHint.trim()
        ? opts.nameHint.trim()
        : opts.url
          ? derivePdfTitleFromUrl(opts.url)
          : '') || 'document.pdf'

    const provider = pickProvider({ provider: opts.overrides?.provider })
    if (provider === 'docling-remote') {
      const endpoint = String(opts.overrides?.doclingEndpoint || '').trim() || String(process.env.AGENTIC_OS_DOCLING_ENDPOINT || '').trim()
      const result = await withTimeout(convertPdfViaDoclingRemote({ endpoint, pdfBytes, nameHint: opts.nameHint }), convertTimeoutMs, 'PDF conversion timed out')
      if (!result.ok) {
        const allowFallback =
          typeof opts.overrides?.providerFallbackToNative === 'boolean'
            ? opts.overrides.providerFallbackToNative
            : String(process.env.AGENTIC_OS_PDF_PROVIDER_FALLBACK_TO_NATIVE || '').trim() === '1'
        if (allowFallback) {
          return await convertPdfToMarkdown({ ...opts, overrides: { ...opts.overrides, provider: 'native' } })
        }
        return result
      }
      return {
        ok: true,
        name: result.name,
        markdown: normalizePdfExtractedMarkdown(result.markdown),
      }
    }

    const stableToken = (() => {
      const hex = createHash('sha256').update(pdfBytes).digest('hex')
      return `pdf-${hex.slice(0, 16)}-${provider}`
    })()
    const assetUrlPrefix = assetStore?.assetUrlPrefix ? assetStore.assetUrlPrefix : `/__pdf_assets/${stableToken}`
    const resolvePersistentAssetsDir = async (): Promise<string> => {
      const repoRoot = path.resolve(process.cwd(), '..')
      const assetsDir = path.resolve(repoRoot, 'data', 'outputs', 'pdf-assets', stableToken)
      const rootResolved = path.resolve(repoRoot)
      if (!assetsDir.startsWith(rootResolved + path.sep) && assetsDir !== rootResolved) return assetsDir
      await fs.mkdir(assetsDir, { recursive: true })
      return assetsDir
    }

    const includeImages = defaultIncludeImages({ includeImages: opts.overrides?.includeImages })
    const embedImages = includeImages && defaultEmbedImages({ embedImages: opts.overrides?.embedImages })
    const maxExtractedImagesPerPage = (() => {
      if (typeof opts.overrides?.maxExtractedImagesPerPage === 'number' && opts.overrides.maxExtractedImagesPerPage > 0) {
        return Math.floor(opts.overrides.maxExtractedImagesPerPage)
      }
      const raw = String(process.env.AGENTIC_OS_PDF_MAX_EXTRACTED_IMAGES_PER_PAGE || '').trim()
      const parsed = raw ? Number(raw) : NaN
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined
    })()
    const maxPages = (() => {
      if (typeof opts.overrides?.maxPages === 'number' && opts.overrides.maxPages > 0) return Math.floor(opts.overrides.maxPages)
      const raw = String(process.env.AGENTIC_OS_PDF_MAX_PAGES || '').trim()
      const parsed = raw ? Number(raw) : NaN
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined
    })()
    const maxEmbeddedImagesPerPage = (() => {
      if (typeof opts.overrides?.maxEmbeddedImagesPerPage === 'number' && opts.overrides.maxEmbeddedImagesPerPage >= 0) {
        return Math.floor(opts.overrides.maxEmbeddedImagesPerPage)
      }
      const raw = String(process.env.AGENTIC_OS_PDF_MAX_EMBEDDED_IMAGES_PER_PAGE || '').trim()
      const parsed = raw ? Number(raw) : NaN
      return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined
    })()

    const streamDecodeCacheMaxBytes = clampToEnvCap({
      envCap: defaultStreamDecodeCacheMaxBytes(),
      override: opts.overrides?.streamDecodeCacheMaxBytes,
    })
    const contentStreamMaxDecodeBytes = clampToEnvCap({
      envCap: readNumberFromEnv('AGENTIC_OS_PDF_CONTENT_STREAM_MAX_DECODE_BYTES', 8 * 1024 * 1024),
      override: opts.overrides?.contentStreamMaxDecodeBytes,
    })
    const pageContentMaxBytes = clampToEnvCap({
      envCap: readNumberFromEnv('AGENTIC_OS_PDF_PAGE_CONTENT_MAX_BYTES', 8 * 1024 * 1024),
      override: opts.overrides?.pageContentMaxBytes,
    })

  const cmapMaxBytes = clampToEnvCap({
    envCap: readNumberFromEnv('AGENTIC_OS_PDF_CMAP_MAX_BYTES', 256 * 1024),
    override: opts.overrides?.cmapMaxBytes,
  })
  const maxToUnicodeStreamBytes = clampToEnvCap({
    envCap: readNumberFromEnv('AGENTIC_OS_PDF_MAX_TO_UNICODE_STREAM_BYTES', 256 * 1024),
    override: opts.overrides?.maxToUnicodeStreamBytes,
  })
  const toUnicodeMaxDecodeBytes = clampToEnvCap({
    envCap: readNumberFromEnv('AGENTIC_OS_PDF_TOUNICODE_MAX_DECODE_BYTES', 512 * 1024),
    override: opts.overrides?.toUnicodeMaxDecodeBytes,
  })
  const imageStreamMaxDecodeBytes = clampToEnvCap({
    envCap: readNumberFromEnv('AGENTIC_OS_PDF_IMAGE_STREAM_MAX_DECODE_BYTES', 32 * 1024 * 1024),
    override: opts.overrides?.imageStreamMaxDecodeBytes,
  })
  const maxTextContentBytesPerPage = clampToEnvCap({
    envCap: readNumberFromEnv('AGENTIC_OS_PDF_MAX_TEXT_CONTENT_BYTES_PER_PAGE', 512 * 1024),
    override: opts.overrides?.maxTextContentBytesPerPage,
  })
  const maxTextStreamBytes = clampToEnvCap({
    envCap: readNumberFromEnv('AGENTIC_OS_PDF_MAX_TEXT_STREAM_BYTES', 256 * 1024),
    override: opts.overrides?.maxTextStreamBytes,
  })
  const maxFormXObjectBytes = clampToEnvCap({
    envCap: readNumberFromEnv('AGENTIC_OS_PDF_MAX_FORM_XOBJECT_BYTES', 512 * 1024),
    override: opts.overrides?.maxFormXObjectBytes,
  })
  const maxFormXObjectStreamBytes = clampToEnvCap({
    envCap: readNumberFromEnv('AGENTIC_OS_PDF_MAX_FORM_XOBJECT_STREAM_BYTES', 256 * 1024),
    override: opts.overrides?.maxFormXObjectStreamBytes,
  })
  const maxFormXObjectCount = clampToEnvCapNonNegative({
    envCap: readNumberFromEnv('AGENTIC_OS_PDF_MAX_FORM_XOBJECT_COUNT', 64),
    override: opts.overrides?.maxFormXObjectCount,
  })

    const ocrEnhance = (() => {
      const readEnv = (key: string): string => String(process.env[key] || '').trim()
      const endpoint = readEnv('AGENTIC_OS_PDF_OCR_ENDPOINT')
      if (!endpoint) return null

      const enabled =
        typeof opts.overrides?.ocrEnabled === 'boolean' ? opts.overrides.ocrEnabled : readEnv('AGENTIC_OS_PDF_OCR_ENABLE') !== '0'
      if (!enabled) return null

      const modeEnvRaw = readEnv('AGENTIC_OS_PDF_OCR_MODE')
      const mode: 'always' | 'fallback' =
        opts.overrides?.ocrMode === 'always'
          ? 'always'
          : opts.overrides?.ocrMode === 'fallback'
            ? 'fallback'
            : String(modeEnvRaw).trim().toLowerCase() === 'always'
              ? 'always'
              : 'fallback'

      const minTextChars = (() => {
        const raw = readEnv('AGENTIC_OS_PDF_OCR_MIN_TEXT_CHARS')
        const parsed = raw ? Number(raw) : NaN
        return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined
      })()
      const maxImagesPerPage = (() => {
        const raw = readEnv('AGENTIC_OS_PDF_OCR_MAX_IMAGES_PER_PAGE')
        const parsed = raw ? Number(raw) : NaN
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined
      })()
      const timeoutMs = (() => {
        const raw = readEnv('AGENTIC_OS_PDF_OCR_TIMEOUT_MS')
        const parsed = raw ? Number(raw) : NaN
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined
      })()
      const prompt = (() => {
        const raw = readEnv('AGENTIC_OS_PDF_OCR_PROMPT')
        return raw ? raw : undefined
      })()
      return { enabled, endpoint, mode, minTextChars, maxImagesPerPage, timeoutMs, prompt }
    })()

    const native = await withTimeout(
      convertPdfBytesToMarkdown({
      pdfBytes,
      title,
      assetUrlPrefix,
      includeImages,
      maxPages,
      maxExtractedImagesPerPage,
      maxEmbeddedImagesPerPage,
      reconstructTables: opts.overrides?.reconstructTables,
      tableMinColumns: opts.overrides?.tableMinColumns,
      tableMinRows: opts.overrides?.tableMinRows,
      tableMaxRows: opts.overrides?.tableMaxRows,
      ocrEnhance,
      streamDecodeCacheMaxBytes,
      contentStreamMaxDecodeBytes,
      pageContentMaxBytes,
      cmapMaxBytes,
      maxToUnicodeStreamBytes,
      toUnicodeMaxDecodeBytes,
      imageStreamMaxDecodeBytes,
      maxTextContentBytesPerPage,
      maxTextStreamBytes,
      maxFormXObjectBytes,
      maxFormXObjectStreamBytes,
      maxFormXObjectCount,
      }),
      convertTimeoutMs,
      'PDF conversion timed out',
    )
    let markdown = normalizePdfExtractedMarkdown(native.markdown)
    if (embedImages && native.assets.length > 0) {
      const envMaxEmbeddedTotalBytes = (() => {
        const raw = String(process.env.AGENTIC_OS_PDF_MAX_EMBEDDED_TOTAL_BYTES || '').trim()
        const n = raw ? Number(raw) : NaN
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
      })()
      const envMaxEmbeddedAssetBytes = (() => {
        const raw = String(process.env.AGENTIC_OS_PDF_MAX_EMBEDDED_ASSET_BYTES || '').trim()
        const n = raw ? Number(raw) : NaN
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
      })()
      const embedded = embedPdfAssetsInMarkdown({
        markdown,
        assets: native.assets,
        assetUrlPrefix,
        maxTotalBytes: typeof opts.overrides?.maxEmbeddedTotalBytes === 'number' ? opts.overrides.maxEmbeddedTotalBytes : envMaxEmbeddedTotalBytes,
        maxAssetBytes: typeof opts.overrides?.maxEmbeddedAssetBytes === 'number' ? opts.overrides.maxEmbeddedAssetBytes : envMaxEmbeddedAssetBytes,
      })
      markdown = embedded.markdown
    }

    const needsAssetServer = includeImages && markdown.includes(`(${assetUrlPrefix}/`)
    if (needsAssetServer && native.assets.length > 0) {
      if (assetStore?.assetsDirAbs) {
        await writePdfAssets({ assetsDir: assetStore.assetsDirAbs, assets: native.assets })
      } else {
        const assetsDir = await resolvePersistentAssetsDir()
        await writePdfAssets({ assetsDir, assets: native.assets })
      }
    } else {
      await cleanup()
    }
    const name =
      (opts.nameHint && opts.nameHint.trim()
        ? deriveMarkdownNameFromPdfFilename(opts.nameHint)
        : opts.url
          ? derivePdfNameFromUrl(opts.url)
          : 'document.md') || 'document.md'
    return { ok: true, markdown, name }
  } catch (error) {
    await cleanup()
    const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || '') : ''
    return { ok: false, error: msg || 'PDF conversion failed' }
  }
}

export function createPdfConvertHandler(): import('vite').Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.method !== 'POST') {
      next()
      return
    }
    try {
      const parsed = parsePdfConvertRequest({ req })

      const envMaxBytes = readNumberFromEnv('AGENTIC_OS_PDF_MAX_BYTES', 100 * 1024 * 1024)
      const envUploadTimeoutMs = readNumberFromEnv('AGENTIC_OS_PDF_UPLOAD_TIMEOUT_MS', 30_000)
      const maxBytes =
        typeof parsed.overrides.maxPdfBytes === 'number' && parsed.overrides.maxPdfBytes > 0
          ? Math.min(envMaxBytes, Math.floor(parsed.overrides.maxPdfBytes))
          : envMaxBytes
      const uploadTimeoutMs =
        typeof parsed.overrides.uploadTimeoutMs === 'number' && parsed.overrides.uploadTimeoutMs > 0
          ? Math.min(envUploadTimeoutMs, Math.floor(parsed.overrides.uploadTimeoutMs))
          : envUploadTimeoutMs

      const body = await (async (): Promise<Buffer | null> => {
        if (!parsed.rawContentType.toLowerCase().startsWith('application/pdf')) return null
        return await readRequestBodyBytes({ req, maxBytes, timeoutMs: uploadTimeoutMs })
      })()

      const result = await convertPdfToMarkdown({
        url: parsed.url,
        body: body || undefined,
        nameHint: parsed.nameHint,
        overrides: parsed.overrides,
      })
      res.statusCode = result.ok ? 200 : 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (error) {
      let message = 'PDF conversion failed'
      if (error && typeof error === 'object' && 'message' in error) {
        const candidate = (error as { message?: unknown }).message
        if (typeof candidate === 'string' && candidate.trim()) message = candidate
      }
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: message }))
    }
  }
}

export function createPdfAssetsHandler(): import('vite').Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      next()
      return
    }
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`)
      const parts = url.pathname.split('/').filter(Boolean)
      const token = parts[0] || ''
      const file = parts.slice(1).join('/')
      if (!token || !file || file.includes('..') || file.includes('\\')) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Invalid asset path')
        return
      }
      const entry = pdfAssetCache.get(token)
      const assetsDir = await (async (): Promise<string | null> => {
        if (entry?.assetsDir) return entry.assetsDir
        const repoRoot = path.resolve(process.cwd(), '..')
        const dir = path.resolve(repoRoot, 'data', 'outputs', 'pdf-assets', token)
        const rootResolved = path.resolve(repoRoot)
        if (!dir.startsWith(rootResolved + path.sep) && dir !== rootResolved) return null
        try {
          const st = await fs.stat(dir)
          if (!st.isDirectory()) return null
          return dir
        } catch {
          return null
        }
      })()
      if (!assetsDir) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Asset not found')
        return
      }
      const resolved = path.resolve(assetsDir, file)
      const within = resolved.startsWith(path.resolve(assetsDir) + path.sep)
      if (!within) {
        res.statusCode = 403
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Forbidden')
        return
      }
      const ext = path.extname(resolved).toLowerCase()
      const contentType =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.gif'
              ? 'image/gif'
              : ext === '.webp'
                ? 'image/webp'
                : 'application/octet-stream'
      const buf = await fs.readFile(resolved)
      res.statusCode = 200
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'no-store')
      res.end(buf)
    } catch {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Asset not found')
    }
  }
}
