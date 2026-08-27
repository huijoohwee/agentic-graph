import { spawn } from 'node:child_process'
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

type NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void

type VideoFrameServerOptions = {
  repoRoot: string
  workspaceRoot: string
  getPythonBin: () => Promise<string>
  withRepoPythonPath: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv
  cacheRoot?: string
  publicPrefix?: string
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
const inflightVideoFrameByOutputPath = new Map<string, Promise<VideoFrameResult>>()

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

const runFrameExtraction = async (req: VideoFrameRequest, opts: VideoFrameServerOptions): Promise<VideoFrameResult> => {
  const existingBytes = await readFileSize(req.outputPath)
  if (existingBytes > 0) {
    return {
      ok: true,
      publicUrl: req.publicUrl,
      outputPath: req.outputPath,
      semanticKey: req.semanticKey,
      cached: true,
      bytes: existingBytes,
      timeSeconds: req.timeSeconds,
      format: req.format,
    }
  }

  const existingInflight = inflightVideoFrameByOutputPath.get(req.outputPath)
  if (existingInflight) return await existingInflight

  const promise = (async (): Promise<VideoFrameResult> => {
    await fs.mkdir(path.dirname(req.outputPath), { recursive: true })
    const pythonBin = await opts.getPythonBin()
    const timeoutMs = (() => {
      const raw = Number(process.env.AG_VIDEO_FRAME_TIMEOUT_MS || '')
      if (!Number.isFinite(raw) || raw <= 0) return 75_000
      return Math.max(10_000, Math.min(60 * 60_000, Math.floor(raw)))
    })()
    return await new Promise<VideoFrameResult>((resolve) => {
      const child = spawn(pythonBin, [
        '-m',
        'agenticgraph_parser',
        'video-frame',
        '--emit',
        'json',
        '--url',
        req.sourceUrl,
        '--time',
        String(req.timeSeconds),
        '--format',
        req.format,
        '--output',
        req.outputPath,
      ], {
        cwd: opts.repoRoot,
        env: opts.withRepoPythonPath(process.env),
      })

      let stdout = ''
      let stderr = ''
      let settled = false
      const finish = (result: VideoFrameResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          void 0
        }
        finish({ ok: false, error: `Video frame extraction timed out after ${timeoutMs}ms` })
      }, timeoutMs)

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', chunk => {
        stdout += chunk
      })
      child.stderr?.on('data', chunk => {
        stderr += chunk
      })
      child.on('error', err => {
        finish({ ok: false, error: err.message || 'Video frame extraction process error' })
      })
      child.on('close', async (code) => {
        if (settled) return
        const out = stdout.trim()
        try {
          const parsed = out ? JSON.parse(out) as Record<string, unknown> : null
          if (parsed?.ok === true) {
            const bytes = await readFileSize(req.outputPath)
            if (bytes > 0) {
              finish({
                ok: true,
                publicUrl: req.publicUrl,
                outputPath: req.outputPath,
                semanticKey: req.semanticKey,
                cached: parsed.cached === true,
                bytes,
                timeSeconds: req.timeSeconds,
                format: req.format,
              })
              return
            }
          }
          if (typeof parsed?.error === 'string' && parsed.error.trim()) {
            finish({ ok: false, error: parsed.error.trim() })
            return
          }
        } catch {
          void 0
        }
        const detail = stderr.trim() || out || `Video frame extraction failed (exit ${code ?? 'unknown'})`
        finish({ ok: false, error: detail })
      })
    })
  })()

  inflightVideoFrameByOutputPath.set(req.outputPath, promise)
  try {
    return await promise
  } finally {
    inflightVideoFrameByOutputPath.delete(req.outputPath)
  }
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
    stream.on('error', reject)
    stream.on('end', resolve)
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
    const result = await runFrameExtraction(frameReq, opts)
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
    await pipeImage(res, result)
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
