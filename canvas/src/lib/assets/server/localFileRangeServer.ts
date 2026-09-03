import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

const AG_LOCAL_FILE_ROUTE_PATH = '/__agentic_os_local_file'

type LocalFileRangeHandler = import('vite').Connect.NextHandleFunction

function guessContentType(filePath: string): string {
  const ext = String(path.extname(filePath) || '').toLowerCase()
  if (ext === '.glb') return 'model/gltf-binary'
  if (ext === '.gltf') return 'model/gltf+json'
  if (ext === '.ply') return 'model/ply'
  if (ext === '.json' || ext === '.jsonld') return 'application/json'
  if (ext === '.spz') return 'application/octet-stream'
  return 'application/octet-stream'
}

function isWorkspaceLocalFilePath(workspaceRoot: string, filePath: string): boolean {
  const root = path.resolve(workspaceRoot)
  const resolved = path.resolve(filePath)
  const relative = path.relative(root, resolved)
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function parseByteRange(range: string, size: number): { end: number; partial: boolean; start: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim())
  if (!match) return range ? null : { start: 0, end: Math.max(0, size - 1), partial: false }
  const rawStart = match[1] || ''
  const rawEnd = match[2] || ''
  let start = rawStart ? Math.max(0, Number(rawStart) || 0) : 0
  let end = rawEnd ? Math.min(Math.max(0, size - 1), Number(rawEnd) || 0) : Math.max(0, size - 1)
  if (!rawStart && rawEnd) {
    start = Math.max(0, size - (Number(rawEnd) || size))
    end = Math.max(0, size - 1)
  }
  if (size <= 0 || start > end || start >= size) return null
  return { start, end, partial: true }
}

function endJson(res: Parameters<LocalFileRangeHandler>[1], statusCode: number, error: string): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ ok: false, error }))
}

export function createLocalFileRangeHandler(args: { workspaceRoot: string }): LocalFileRangeHandler {
  return async (req, res, next) => {
    if (!req.url?.startsWith(AG_LOCAL_FILE_ROUTE_PATH)) {
      next()
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    try {
      const url = new URL(req.url, 'http://localhost')
      const rawPath = String(url.searchParams.get('path') || '').trim()
      const filePath = path.resolve(rawPath)
      if (!rawPath || !path.isAbsolute(rawPath)) {
        endJson(res, 400, 'Invalid path')
        return
      }
      if (!isWorkspaceLocalFilePath(args.workspaceRoot, filePath)) {
        endJson(res, 403, 'Forbidden path')
        return
      }
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) throw new Error('Asset not found')
      const parsedRange = parseByteRange(String(req.headers.range || ''), stat.size)
      if (!parsedRange) {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${stat.size}`)
        res.end('')
        return
      }
      const contentLength = stat.size <= 0 ? 0 : parsedRange.end - parsedRange.start + 1
      res.statusCode = parsedRange.partial ? 206 : 200
      res.setHeader('Content-Type', guessContentType(filePath))
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Content-Length', String(contentLength))
      if (parsedRange.partial) res.setHeader('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${stat.size}`)
      if (req.method === 'HEAD' || stat.size <= 0) {
        res.end('')
        return
      }
      createReadStream(filePath, { start: parsedRange.start, end: parsedRange.end })
        .on('error', () => endJson(res, 404, 'Asset not found'))
        .pipe(res)
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || '') : ''
      endJson(res, 404, message || 'Asset not found')
    }
  }
}
