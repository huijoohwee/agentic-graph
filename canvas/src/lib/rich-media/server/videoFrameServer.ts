import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { unwrapUserProvidedText } from 'grph-shared/url'
import {
  buildRemoteVideoFrameFileName,
  buildRemoteVideoFrameSemanticKey,
  normalizeRemoteVideoFrameFormat,
  normalizeRemoteVideoFrameSeconds,
  parseYouTubeStartSeconds,
} from 'grph-shared/rich-media/providers'
import { buildWorkspaceTimestampedOutputFolderName } from '../../workspace/timestampedOutput'
import { videoFrameWorkerPool, type VideoFrameWorkerPool } from './videoFrameWorker'

type NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void

type VideoFrameServerOptions = {
  repoRoot: string
  workspaceRoot: string
  getPythonBin: () => Promise<string>
  withRepoPythonPath: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv
  cacheRoot?: string
  publicPrefix?: string
  workerPool?: VideoFrameWorkerPool
  requestTimeoutMs?: number
}

type VideoFrameRequest = {
  sourceUrl: string
  timeSeconds: number
  format: 'png' | 'jpg'
  fileName: string
  outputPath: string
  publicUrl: string
  semanticKey: string
}

type VideoFrameResult =
  | { ok: true; publicUrl: string; outputPath: string; semanticKey: string; cached: boolean; bytes: number; timeSeconds: number; format: 'png' | 'jpg' }
  | { ok: false; error: string }

export const REMOTE_VIDEO_FRAME_PUBLIC_PREFIX = '/image/video-frame'

const MAX_VIDEO_FRAME_URL_LENGTH = 4096
const MAX_VIDEO_FRAME_TIME_SECONDS = 12 * 60 * 60
const VIDEO_FRAME_FILE_RE = /^frame-[a-f0-9]+-t\d+(?:_\d+)?\.(?:png|jpg)$/i
const remoteVideoFrameOutputFolderName = buildWorkspaceTimestampedOutputFolderName()
type FrameInflight = { contextKey: string; promise: Promise<VideoFrameResult>; controller: AbortController; subscribers: number }
const inflightVideoFrameByOutputPath = new Map<string, FrameInflight>()

export const readRemoteVideoFrameOutputFolderName = (): string => remoteVideoFrameOutputFolderName

export const buildRemoteVideoFrameDefaultPublicPrefix = (): string =>
  `${REMOTE_VIDEO_FRAME_PUBLIC_PREFIX}/${remoteVideoFrameOutputFolderName}`

export const buildRemoteVideoFrameDefaultCacheRoot = (workspaceRoot: string): string =>
  path.resolve(workspaceRoot, 'huijoohwee', 'image', 'video-frame', remoteVideoFrameOutputFolderName)

const normalizePublicPrefix = (value: unknown): string => {
  const raw = String(value || '').trim() || buildRemoteVideoFrameDefaultPublicPrefix()
  const withLead = raw.startsWith('/') ? raw : `/${raw}`
  return withLead.replace(/\/+$/g, '')
}

const resolveCacheRoot = (opts: VideoFrameServerOptions): string => {
  const fromEnv = String(process.env.AG_VIDEO_FRAME_CACHE_ROOT || '').trim()
  return path.resolve(opts.cacheRoot || fromEnv || buildRemoteVideoFrameDefaultCacheRoot(opts.workspaceRoot))
}

const isWithinRoot = (root: string, filePath: string): boolean => {
  const rel = path.relative(path.resolve(root), path.resolve(filePath))
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

const readAllowedVideoFrameHosts = (): string[] => {
  const raw = String(process.env.AG_VIDEO_FRAME_ALLOWED_HOSTS || '').trim()
  if (raw) {
    return raw
      .split(',')
      .map(part => part.trim().toLowerCase())
      .filter(Boolean)
  }
  return [
    'youtube.com',
    'youtu.be',
    'youtube-nocookie.com',
    'bilibili.com',
    'b23.tv',
  ]
}

const hostMatches = (host: string, allowed: string): boolean => {
  return host === allowed || host.endsWith(`.${allowed}`)
}

const isAllowedRemoteVideoFrameUrl = (sourceUrl: string): boolean => {
  if (process.env.AG_VIDEO_FRAME_ALLOW_ANY_HTTP === '1') return /^https?:\/\//i.test(sourceUrl)
  try {
    const parsed = new URL(sourceUrl)
    const protocol = parsed.protocol.toLowerCase()
    if (protocol !== 'https:' && protocol !== 'http:') return false
    const host = parsed.hostname.toLowerCase()
    return readAllowedVideoFrameHosts().some(allowed => hostMatches(host, allowed))
  } catch {
    return false
  }
}

const readRequest = (req: IncomingMessage, opts: VideoFrameServerOptions): VideoFrameRequest | { error: string } => {
  const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const rawUrlParam = parsed.searchParams.get('url') || ''
  const sourceUrl = unwrapUserProvidedText(rawUrlParam) || rawUrlParam.trim()
  if (!sourceUrl) return { error: 'Missing url parameter' }
  if (sourceUrl.length > MAX_VIDEO_FRAME_URL_LENGTH) return { error: 'Video URL is too long' }
  if (!isAllowedRemoteVideoFrameUrl(sourceUrl)) return { error: 'Video frame extraction is limited to supported remote video hosts' }

  const parsedTime = normalizeRemoteVideoFrameSeconds(parsed.searchParams.get('time')) ?? parseYouTubeStartSeconds(sourceUrl)
  if (parsedTime == null) return { error: 'Missing time parameter' }
  const timeSeconds = Math.min(MAX_VIDEO_FRAME_TIME_SECONDS, Math.max(0, parsedTime))
  const format = normalizeRemoteVideoFrameFormat(parsed.searchParams.get('format') || 'png')
  const fileName = buildRemoteVideoFrameFileName({ sourceUrl, timeSeconds, format })
  if (!VIDEO_FRAME_FILE_RE.test(fileName)) return { error: 'Invalid frame cache key' }

  const cacheRoot = resolveCacheRoot(opts)
  const outputPath = path.resolve(cacheRoot, fileName)
  if (!isWithinRoot(cacheRoot, outputPath)) return { error: 'Invalid frame cache path' }
  const publicPrefix = normalizePublicPrefix(opts.publicPrefix || process.env.AG_VIDEO_FRAME_PUBLIC_PREFIX)
  const semanticKey = buildRemoteVideoFrameSemanticKey({ sourceUrl, timeSeconds, format })
  return {
    sourceUrl,
    timeSeconds,
    format,
    fileName,
    outputPath,
    publicUrl: `${publicPrefix}/${fileName}`,
    semanticKey,
  }
}

const readFileSize = async (filePath: string): Promise<number> => {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile() ? stat.size : 0
  } catch {
    return 0
  }
}

const frameResult = (req: VideoFrameRequest, bytes: number, cached: boolean): VideoFrameResult => ({
  ok: true, publicUrl: req.publicUrl, outputPath: req.outputPath, semanticKey: req.semanticKey,
  cached, bytes, timeSeconds: req.timeSeconds, format: req.format,
})

const abortable = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
  const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('Video frame request cancelled')) }
  if (signal.aborted) { abort(); return }
  signal.addEventListener('abort', abort, { once: true })
  promise.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => {
    signal.removeEventListener('abort', abort); reject(error)
  })
})

// Effective configuration stays in memory. Browser cookies use the worker's bounded
// 75s snapshot lease; a new worker resolves credentials again. Cookie files are hashed.
const prepareContext = async (req: VideoFrameRequest, opts: VideoFrameServerOptions, signal: AbortSignal) => {
  const env = opts.withRepoPythonPath({ ...process.env })
  const pythonBin = await abortable(opts.getPythonBin(), signal)
  await fs.mkdir(path.dirname(req.outputPath), { recursive: true })
  const outputRoot = await fs.realpath(path.dirname(req.outputPath))
  const privateRoot = path.resolve(opts.repoRoot, '.tmp', 'video-frame-source-workers')
  const digest = createHash('sha256').update(JSON.stringify([
    req.sourceUrl, pythonBin, opts.repoRoot, outputRoot, privateRoot,
    Object.entries(env).sort(([a], [b]) => a.localeCompare(b)),
  ]))
  const cookies = String(env.AG_VIDEO_FRAME_YTDLP_COOKIES || '').trim()
  let cookieSnapshot: Buffer | undefined
  if (cookies) {
    const stream = createReadStream(path.resolve(opts.repoRoot, cookies), { signal })
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of stream) {
      bytes += chunk.length
      if (bytes > 256 * 1024) throw new Error('Video frame cookie file exceeds 256KiB snapshot limit')
      digest.update(chunk)
      chunks.push(chunk)
    }
    cookieSnapshot = Buffer.concat(chunks)
  }
  return { contextKey: digest.digest('hex'), env, pythonBin, outputRoot, privateRoot, cookieSnapshot }
}

const subscribeFrame = (entry: FrameInflight, signal: AbortSignal): Promise<VideoFrameResult> => {
  entry.subscribers += 1
  return abortable(entry.promise, signal).catch(error => ({ ok: false as const, error: String(error) })).finally(() => {
    entry.subscribers -= 1
    if (!entry.subscribers) entry.controller.abort()
  })
}

const runFrameExtraction = async (req: VideoFrameRequest, opts: VideoFrameServerOptions, signal: AbortSignal): Promise<VideoFrameResult> => {
  try {
    const existingBytes = await readFileSize(req.outputPath)
    if (existingBytes > 0) return frameResult(req, existingBytes, true)
    const context = await prepareContext(req, opts, signal)
    const outputKey = path.join(context.outputRoot, req.fileName)
    if (signal.aborted) return { ok: false, error: 'Video frame request cancelled' }
    while (true) {
      const owner = inflightVideoFrameByOutputPath.get(outputKey)
      if (owner) {
        const wasCancelled = owner.controller.signal.aborted
        const result = await subscribeFrame(owner, signal)
        if ((owner.contextKey === context.contextKey && !wasCancelled) || signal.aborted) return result
        // Different source grants wait for the output owner. Its durable artifact
        // remains authoritative; a failed owner permits a fresh isolated lease.
        const bytes = await readFileSize(req.outputPath)
        if (bytes > 0) return frameResult(req, bytes, true)
        continue
      }
      const bytes = await readFileSize(req.outputPath)
      if (bytes > 0) return frameResult(req, bytes, true)
      if (!inflightVideoFrameByOutputPath.has(outputKey)) break
    }
    const controller = new AbortController()
    const entry: FrameInflight = { contextKey: context.contextKey, controller, subscribers: 0, promise: undefined! }
    entry.promise = (async (): Promise<VideoFrameResult> => {
      await fs.mkdir(context.outputRoot, { recursive: true })
      if (controller.signal.aborted) return { ok: false, error: 'Video frame request cancelled' }
      const result = await (opts.workerPool || videoFrameWorkerPool).request({
        ...context, sourceUrl: req.sourceUrl, repoRoot: opts.repoRoot, outputPath: outputKey,
        timeSeconds: req.timeSeconds, format: req.format, signal: controller.signal,
      })
      if (result.ok !== true) return result
      const writtenBytes = await readFileSize(req.outputPath)
      if (writtenBytes <= 0) return { ok: false, error: 'Video frame worker did not write an image' }
      return frameResult(req, writtenBytes, result.cached)
    })().catch(error => ({ ok: false as const, error: String(error).slice(0, 2000) })).finally(() => {
      if (inflightVideoFrameByOutputPath.get(outputKey) === entry) inflightVideoFrameByOutputPath.delete(outputKey)
    })
    inflightVideoFrameByOutputPath.set(outputKey, entry)
    return await subscribeFrame(entry, signal)
  } catch (error) { return { ok: false, error: String(error).slice(0, 2000) } }
}

const writeJson = (res: ServerResponse, statusCode: number, body: unknown): void => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

const writeText = (res: ServerResponse, statusCode: number, body: string): void => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

const pipeImage = async (res: ServerResponse, result: Extract<VideoFrameResult, { ok: true }>): Promise<void> => {
  const contentType = result.format === 'jpg' ? 'image/jpeg' : 'image/png'
  res.statusCode = 200
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(result.outputPath)
    const close = () => { stream.destroy(); resolve() }
    res.once('close', close)
    stream.on('error', reject)
    stream.on('end', resolve)
    stream.once('close', () => res.removeListener('close', close))
    stream.pipe(res)
  })
}

export function createRemoteVideoFrameHandler(opts: VideoFrameServerOptions): NextHandleFunction {
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      next()
      return
    }
    const frameReq = readRequest(req, opts)
    const emitJson = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).searchParams.get('emit') === 'json'
    if ('error' in frameReq) {
      if (emitJson) writeJson(res, 400, { ok: false, error: frameReq.error })
      else writeText(res, 400, frameReq.error)
      return
    }
    const controller = new AbortController()
    const abort = () => { if (!res.writableEnded) controller.abort() }
    req.once('aborted', abort)
    res.once('close', abort)
    let timedOut = false
    const timeoutMs = Math.max(1, Math.min(75_000, opts.requestTimeoutMs ?? 75_000))
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    let result: VideoFrameResult
    try { result = await runFrameExtraction(frameReq, opts, controller.signal) } finally {
      clearTimeout(timer)
      req.removeListener('aborted', abort)
      res.removeListener('close', abort)
    }
    if (res.destroyed) return
    if (timedOut) {
      const error = 'Video frame request deadline exceeded after ' + timeoutMs + 'ms'
      if (emitJson) writeJson(res, 504, { ok: false, error })
      else writeText(res, 504, error)
      return
    }
    if (controller.signal.aborted) return
    if (result.ok !== true) {
      if (emitJson) writeJson(res, 502, result)
      else writeText(res, 502, result.error)
      return
    }
    if (emitJson) {
      writeJson(res, 200, {
        ok: true,
        imageUrl: result.publicUrl,
        publicUrl: result.publicUrl,
        semanticKey: result.semanticKey,
        cached: result.cached,
        bytes: result.bytes,
        timeSeconds: result.timeSeconds,
        format: result.format,
      })
      return
    }
    try { await pipeImage(res, result) } catch (error) { if (!res.destroyed) next(error) }
  }
}

export function createRemoteVideoFramePublicAssetHandler(opts: Pick<VideoFrameServerOptions, 'workspaceRoot' | 'cacheRoot'>): NextHandleFunction {
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const fileName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '').trim()
    if (!VIDEO_FRAME_FILE_RE.test(fileName)) {
      next()
      return
    }
    const cacheRoot = resolveCacheRoot({
      repoRoot: '',
      workspaceRoot: opts.workspaceRoot,
      getPythonBin: async () => '',
      withRepoPythonPath: env => env,
      cacheRoot: opts.cacheRoot,
    })
    const filePath = path.resolve(cacheRoot, fileName)
    if (!isWithinRoot(cacheRoot, filePath)) {
      next()
      return
    }
    const bytes = await readFileSize(filePath)
    if (bytes <= 0) {
      next()
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', fileName.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png')
    res.setHeader('Content-Length', String(bytes))
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(filePath).pipe(res)
  }
}
