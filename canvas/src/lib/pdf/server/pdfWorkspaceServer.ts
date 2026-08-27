import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { convertPdfToMarkdown } from './pdfConvertServer'
import {
  PDF_WORKSPACE_INDEX_VERSION,
  type PdfWorkspaceDocumentMeta,
  type PdfWorkspaceIndex,
  buildAnchorMapFromMarkdown,
} from '../pdfWorkspaceAnchors'
import { PDF_WORKSPACE_DIR_REL_DEFAULT } from '../pdfWorkspaceConfig'

const normalizeRel = (raw: string): string => String(raw || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')

const resolveWorkspaceRoot = (args: { repoRoot: string; outputDirRel?: string | null }): { ok: true; abs: string; rel: string } | { ok: false; error: string } => {
  const fallbackRel = PDF_WORKSPACE_DIR_REL_DEFAULT
  const relRaw = normalizeRel(args.outputDirRel || fallbackRel) || fallbackRel
  const normalized = path.posix.normalize(relRaw)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return { ok: false, error: 'Missing outputDirRel' }
  if (parts[0] !== '.agenticgraph-workspace') return { ok: false, error: 'outputDirRel must be under .agenticgraph-workspace' }
  if (normalized.startsWith('..') || normalized.includes('/../')) return { ok: false, error: 'Invalid outputDirRel' }
  const abs = path.resolve(args.repoRoot, normalized)
  const rootResolved = path.resolve(args.repoRoot)
  if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) return { ok: false, error: 'outputDirRel escapes repo root' }
  return { ok: true, abs, rel: normalized }
}

const readJsonFile = async <T>(filePath: string): Promise<T | null> => {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

const writeJsonFileAtomic = async (filePath: string, value: unknown): Promise<void> => {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${filePath}.${randomUUID()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}

const nowMs = () => Date.now()

const titleFromName = (nameHint: string): string => {
  const raw = String(nameHint || '').trim()
  if (!raw) return 'document.pdf'
  return raw
}

const readBodyAsPdf = async (req: import('http').IncomingMessage): Promise<Buffer | null> => {
  const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : ''
  if (!contentType.toLowerCase().startsWith('application/pdf')) return null
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const SOURCE_PDF_FILENAME = 'source.pdf'

const readIndex = async (workspaceAbs: string): Promise<PdfWorkspaceIndex> => {
  const p = path.join(workspaceAbs, 'index.json')
  const existing = await readJsonFile<PdfWorkspaceIndex>(p)
  if (existing && existing.version === PDF_WORKSPACE_INDEX_VERSION && Array.isArray(existing.docs)) return existing
  return { version: PDF_WORKSPACE_INDEX_VERSION, docs: [] }
}

const writeIndex = async (workspaceAbs: string, idx: PdfWorkspaceIndex): Promise<void> => {
  const p = path.join(workspaceAbs, 'index.json')
  await writeJsonFileAtomic(p, idx)
}

const upsertDocMeta = (idx: PdfWorkspaceIndex, next: PdfWorkspaceDocumentMeta): PdfWorkspaceIndex => {
  const docs = Array.isArray(idx.docs) ? idx.docs.slice() : []
  const pos = docs.findIndex(d => d && d.docId === next.docId)
  if (pos >= 0) docs[pos] = next
  else docs.push(next)
  docs.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0))
  return { version: PDF_WORKSPACE_INDEX_VERSION, docs }
}

export function createPdfWorkspaceHandler(args: { repoRoot: string }): import('vite').Connect.NextHandleFunction {
  return async (req, res, next) => {
    const rawUrl = String(req.url || '')
    if (!rawUrl.startsWith('/__pdf_workspace')) {
      next()
      return
    }
    const base = `http://${req.headers.host || 'localhost'}`
    const parsed = new URL(rawUrl, base)
    const pathname = parsed.pathname
    const workspaceResolved = resolveWorkspaceRoot({ repoRoot: args.repoRoot, outputDirRel: parsed.searchParams.get('outputDirRel') })
    if (workspaceResolved.ok !== true) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: workspaceResolved.error }))
      return
    }
    const workspaceAbs = workspaceResolved.abs

    if (req.method === 'GET' && pathname === '/__pdf_workspace/docs') {
      const idx = await readIndex(workspaceAbs)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, index: idx }))
      return
    }

    if (req.method === 'GET' && pathname.startsWith('/__pdf_workspace/assets/')) {
      try {
        const parts = pathname.split('/').filter(Boolean)
        const docId = parts.length >= 3 ? decodeURIComponent(parts[2] || '') : ''
        const file = parts.length >= 4 ? parts.slice(3).map(decodeURIComponent).join('/') : ''
        if (!docId || !file || file.includes('..') || file.includes('\\')) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('Asset not found')
          return
        }
        const assetsDirAbs = path.join(workspaceAbs, docId, 'assets')
        const resolved = path.resolve(assetsDirAbs, file)
        const within = resolved.startsWith(path.resolve(assetsDirAbs) + path.sep)
        if (!within) {
          res.statusCode = 403
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('Forbidden')
          return
        }
        const stat = await fs.stat(resolved).catch(() => null)
        if (!stat || !stat.isFile()) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('Asset not found')
          return
        }
        const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`
        if (req.headers['if-none-match'] === etag) {
          res.statusCode = 304
          res.end()
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
        res.setHeader('ETag', etag)
        res.setHeader('Cache-Control', 'max-age=0, must-revalidate')
        res.end(buf)
        return
      } catch {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Asset not found')
        return
      }
    }

    if (req.method === 'POST' && pathname === '/__pdf_workspace/import') {
      const docId = String(parsed.searchParams.get('docId') || '').trim() || randomUUID()
      const nameHint = typeof req.headers['x-import-filename'] === 'string' ? req.headers['x-import-filename'] : ''
      const pdfBytes = await readBodyAsPdf(req)
      if (!pdfBytes) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Expected application/pdf body' }))
        return
      }

      const docDirAbs = path.join(workspaceAbs, docId)
      await fs.mkdir(docDirAbs, { recursive: true })
      try {
        await fs.writeFile(path.join(docDirAbs, SOURCE_PDF_FILENAME), pdfBytes)
      } catch {
        void 0
      }

      const assetsDirAbs = path.join(docDirAbs, 'assets')
      await fs.rm(assetsDirAbs, { recursive: true, force: true }).catch(() => void 0)
      const converted = await convertPdfToMarkdown({
        body: pdfBytes,
        nameHint,
        assetStore: {
          assetsDirAbs,
          assetUrlPrefix: `/__pdf_workspace/assets/${encodeURIComponent(docId)}`,
        },
      })
      if (!converted.ok) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(converted))
        return
      }

      const markdown = String(converted.markdown || '')
      const anchorMap = buildAnchorMapFromMarkdown({ docId, markdown })

      const mdPathAbs = path.join(docDirAbs, 'output.md')
      const anchorPathAbs = path.join(docDirAbs, 'anchor-map.json')
      const reportPathAbs = path.join(docDirAbs, 'conversion-report.json')
      await fs.writeFile(mdPathAbs, markdown, 'utf8')
      await writeJsonFileAtomic(anchorPathAbs, anchorMap)
      await writeJsonFileAtomic(reportPathAbs, {
        ok: true,
        docId,
        name: converted.name,
        createdAtMs: nowMs(),
      })

      const docMetaPathAbs = path.join(docDirAbs, 'document.json')
      const prevMeta = await readJsonFile<PdfWorkspaceDocumentMeta>(docMetaPathAbs)
      const createdAtMs = prevMeta?.createdAtMs && Number.isFinite(prevMeta.createdAtMs) ? prevMeta.createdAtMs : nowMs()
      const meta: PdfWorkspaceDocumentMeta = {
        docId,
        title: titleFromName(nameHint || converted.name),
        sourceName: String(nameHint || converted.name || 'document.pdf').trim() || 'document.pdf',
        createdAtMs,
        updatedAtMs: nowMs(),
      }
      await writeJsonFileAtomic(docMetaPathAbs, meta)

      const idx = upsertDocMeta(await readIndex(workspaceAbs), meta)
      await writeIndex(workspaceAbs, idx)

      const relBase = workspaceResolved.rel
      const relDoc = path.posix.join(relBase, docId)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: true,
          docId,
          name: converted.name,
          artifacts: {
            mdRelPath: `${relDoc}/output.md`,
            anchorMapRelPath: `${relDoc}/anchor-map.json`,
            reportRelPath: `${relDoc}/conversion-report.json`,
          },
        }),
      )
      return
    }

    if (req.method === 'GET' && pathname.startsWith('/__pdf_workspace/doc/')) {
      const parts = pathname.split('/').filter(Boolean)
      const docId = parts.length >= 3 ? decodeURIComponent(parts[2] || '') : ''
      if (!docId) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing docId' }))
        return
      }
      const docDirAbs = path.join(workspaceAbs, docId)
      const meta = await readJsonFile<PdfWorkspaceDocumentMeta>(path.join(docDirAbs, 'document.json'))

      let markdown = await fs
        .readFile(path.join(docDirAbs, 'output.md'), 'utf8')
        .then(s => String(s))
        .catch(() => '')
      let anchorMap = (await readJsonFile(path.join(docDirAbs, 'anchor-map.json'))) as unknown

      if (!markdown || !anchorMap) {
        const sourcePdfAbs = path.join(docDirAbs, SOURCE_PDF_FILENAME)
        const pdfBytes = await fs.readFile(sourcePdfAbs).catch(() => null)
        if (pdfBytes) {
          const nameHint = meta?.sourceName || meta?.title || ''
          const assetsDirAbs = path.join(docDirAbs, 'assets')
          await fs.rm(assetsDirAbs, { recursive: true, force: true }).catch(() => void 0)
          const converted = await convertPdfToMarkdown({
            body: pdfBytes,
            nameHint,
            assetStore: {
              assetsDirAbs,
              assetUrlPrefix: `/__pdf_workspace/assets/${encodeURIComponent(docId)}`,
            },
          })
          if (converted.ok) {
            markdown = String(converted.markdown || '')
            anchorMap = buildAnchorMapFromMarkdown({ docId, markdown })
            await fs.writeFile(path.join(docDirAbs, 'output.md'), markdown, 'utf8')
            await writeJsonFileAtomic(path.join(docDirAbs, 'anchor-map.json'), anchorMap)
            await writeJsonFileAtomic(path.join(docDirAbs, 'conversion-report.json'), {
              ok: true,
              docId,
              name: converted.name,
              createdAtMs: nowMs(),
              regenerated: true,
            })
            if (meta) {
              const nextMeta: PdfWorkspaceDocumentMeta = { ...meta, updatedAtMs: nowMs() }
              await writeJsonFileAtomic(path.join(docDirAbs, 'document.json'), nextMeta)
              const idx = upsertDocMeta(await readIndex(workspaceAbs), nextMeta)
              await writeIndex(workspaceAbs, idx)
            }
          }
        }
      }

      if (!markdown || !anchorMap) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Artifacts not found' }))
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, docId, meta, markdown, anchorMap }))
      return
    }

    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Not found' }))
  }
}
