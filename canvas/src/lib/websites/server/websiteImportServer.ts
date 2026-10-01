import { handleWebsiteImportRevalidation } from './websiteImportRevalidation'
import fs from 'node:fs/promises'
import path from 'node:path'
import { clampInt, hashHex, normalizeUrl } from './websiteImportCore'
import { NativeWebsiteCrawler } from './nativeWebsiteCrawler'
import { handleWebsiteImportArtifact } from './websiteImportArtifactServer'
import type { WebsiteImportManifestV1, WebsiteImportNode, WebsiteImportOptions, WebsiteImportProgress, WebsiteImportRuntime } from './websiteImportTypes'
import { reserveWebsiteImportRun, resolveExistingWebsiteImportWorkspaceRoot, resolveWebsiteImportWorkspaceRoot } from './websiteImportStorage'
import { extractTitleFromHtml, posixPathFromFsAbs, readJsonFile, readLocalTextWithLimit, resolveLocalInputPath, sanitizeImportId, toTreePath, writeJsonFileAtomic, WEBSITE_IMPORT_PAGE_MAX_BYTES } from './websiteImportServerHelpers'
import { fetchTextWithLimit } from './websiteImportCore'
import { handleWebsiteDiscovery, readWebsiteImportRequest, validateSelectedWebsiteUrls } from './websiteImportDiscovery'
import { runWebsiteImportJob } from './websiteImportJob'

type StartResponse = { ok: true; importId: string } | { ok: false; error: string }

const jobs = new Map<string, { startedAtMs: number; manifest?: WebsiteImportManifestV1 }>()

export function createWebsiteImportHandler(args: { repoRoot: string }): import('vite').Connect.NextHandleFunction {
  return async (req, res, next) => {
    const rawUrl = String(req.url || '')
    if (!rawUrl.startsWith('/__website_import')) {
      next()
      return
    }

    const base = `http://${req.headers.host || 'localhost'}`
    const parsed = new URL(rawUrl, base)
    const pathname = parsed.pathname
    if (req.method === 'POST' && pathname === '/__website_import/discover') {
      await handleWebsiteDiscovery(req, res)
      return
    }
    if (req.method === 'POST' && pathname === '/__website_import/revalidate') {
      await handleWebsiteImportRevalidation(req, res); return
    }
    const workspaceArgs = { repoRoot: args.repoRoot, outputDirRel: parsed.searchParams.get('outputDirRel') }
    let workspaceResolved: ReturnType<typeof resolveWebsiteImportWorkspaceRoot>
    try {
      workspaceResolved = req.method === 'GET'
        ? await resolveExistingWebsiteImportWorkspaceRoot({ ...workspaceArgs, importId: parsed.searchParams.get('importId') })
        : resolveWebsiteImportWorkspaceRoot(workspaceArgs)
    } catch {
      res.statusCode = 500; res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Could not resolve the local import directory' })); return
    }
    if (workspaceResolved.ok !== true) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: workspaceResolved.error }))
      return
    }
    const workspaceAbs = workspaceResolved.abs
    const claimRun = async (token: unknown, request: unknown) => {
      try {
        const existing = await resolveExistingWebsiteImportWorkspaceRoot({ ...workspaceArgs, importId: token })
        if (existing.ok === true && existing.abs !== workspaceAbs) throw new Error('Import run belongs to an earlier output folder; start a fresh run')
        return await reserveWebsiteImportRun(workspaceAbs, token, request)
      }
      catch (error) {
        res.statusCode = 409
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: String((error as Error).message || error) }))
        return null
      }
    }


    if (req.method === 'GET' && pathname === '/__website_import/manifest') {
      const importId = sanitizeImportId(parsed.searchParams.get('importId') || '')
      if (!importId) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing importId' }))
        return
      }
      const manifestPathAbs = path.join(workspaceAbs, importId, 'manifest.json')
      const manifest = await readJsonFile<WebsiteImportManifestV1>(manifestPathAbs)
      if (!manifest) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Not found' }))
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ ok: true, manifest }))
      return
    }

    if (req.method === 'GET' && pathname === '/__website_import/artifact') {
      await handleWebsiteImportArtifact({ workspaceAbs, parsed, res, readManifest: readJsonFile })
      return
    }

    if (req.method === 'POST' && pathname === '/__website_import/import-url') {
      let body: Awaited<ReturnType<typeof readWebsiteImportRequest>>
      try { body = await readWebsiteImportRequest(req) } catch (error) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: String((error as Error).message || error) }))
        return
      }
      const pageUrlRaw = typeof body.url === 'string' ? body.url : ''
      const pageUrlHttp = normalizeUrl(pageUrlRaw)
      const pageUrlLocal = pageUrlHttp ? null : await resolveLocalInputPath(args.repoRoot, pageUrlRaw)
      const pageUrl = pageUrlHttp ? pageUrlHttp : pageUrlLocal && pageUrlLocal.ok === true ? pageUrlLocal.rel : ''
      if (!pageUrl) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing or invalid url' }))
        return
      }

      const opt = (body.options && typeof body.options === 'object' ? (body.options as Record<string, unknown>) : {})
      const claim = await claimRun(opt.generationToken, { kind: 'page', url: pageUrl })
      if (!claim) return
      const { importId } = claim
      const nodeId = hashHex(pageUrl).slice(0, 24)
      const importDirAbs = path.join(workspaceAbs, importId)
      const nodeDirAbs = path.join(importDirAbs, 'nodes', nodeId)
      const manifestPathAbs = path.join(importDirAbs, 'manifest.json')
      const errors: Array<{ url: string; error: string }> = []
      if (claim.existing) {
        const manifest = await readJsonFile<WebsiteImportManifestV1>(manifestPathAbs)
        const ok = manifest?.status === 'done'
        res.statusCode = ok ? 200 : 409
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok, importId, nodeId, url: pageUrl, ...(!ok ? { error: 'Import run is incomplete; use a fresh run to retry' } : {}) }))
        return
      }


      try {
        await fs.mkdir(nodeDirAbs, { recursive: true })

        const rawHtmlRes = pageUrlHttp
          ? await fetchTextWithLimit(pageUrlHttp, {
              timeoutMs: 30_000,
              maxBytes: WEBSITE_IMPORT_PAGE_MAX_BYTES,
              accept: 'text/html,*/*;q=0.9',
            })
          : pageUrlLocal && pageUrlLocal.ok === true
            ? await readLocalTextWithLimit(pageUrlLocal.abs, WEBSITE_IMPORT_PAGE_MAX_BYTES)
            : { ok: false as const, error: 'Not found' }
        if (rawHtmlRes.ok !== true) {
          errors.push({ url: pageUrl, error: rawHtmlRes.error })
        } else {
          const html = String(rawHtmlRes.text || '')
          await fs.writeFile(path.join(nodeDirAbs, 'raw.html'), html, 'utf8')
        }

        const importedRawHtml = rawHtmlRes.ok === true ? String(rawHtmlRes.text || '') : ''
        const title = importedRawHtml ? extractTitleFromHtml(importedRawHtml) : ''

        const node: WebsiteImportNode = {
          nodeId,
          url: pageUrl,
          path: toTreePath(pageUrlHttp ? 'http' : 'local', pageUrl),
          title: title || undefined,
          status: errors.length > 0 ? 'error' : 'ok',
          artifacts: importedRawHtml
            ? { rawHtmlRelPath: path.posix.join(workspaceResolved.rel, importId, 'nodes', nodeId, 'raw.html'), rawHtmlBytes: Buffer.byteLength(importedRawHtml, 'utf8'), rawHtmlSha256: hashHex(importedRawHtml) }
            : {},
        }

        const manifest: WebsiteImportManifestV1 = {
          version: 1,
          importId,
          rootUrl: pageUrl,
          status: errors.length > 0 ? 'failed' : 'done',
          startedAtMs: Date.now(),
          finishedAtMs: Date.now(),
          nodes: [node],
          errors,
        }
        await writeJsonFileAtomic(manifestPathAbs, manifest)
        res.statusCode = errors.length > 0 ? 400 : 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ ok: errors.length === 0, importId, nodeId, url: pageUrl, error: errors[0]?.error }))
        return
      } catch (e) {
        const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message || '') : ''
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ ok: false, error: msg || 'Import failed' }))
        return
      }
    }

    if (req.method === 'POST' && pathname === '/__website_import/start') {
      let body: Awaited<ReturnType<typeof readWebsiteImportRequest>>
      try { body = await readWebsiteImportRequest(req) } catch (error) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: String((error as Error).message || error) }))
        return
      }
      const rootInput = typeof body.url === 'string' ? body.url : ''
      const rootUrlHttp = normalizeUrl(rootInput)
      const rootLocalResolved = rootUrlHttp ? null : await resolveLocalInputPath(args.repoRoot, rootInput)
      const rootKind: 'http' | 'local' = rootUrlHttp ? 'http' : 'local'
      const rootUrl = await (async () => {
        if (rootUrlHttp) return rootUrlHttp
        if (!rootLocalResolved || rootLocalResolved.ok !== true) return ''
        try {
          const st = await fs.stat(rootLocalResolved.abs)
          if (!st.isFile()) return rootLocalResolved.rel
          const parts = rootLocalResolved.rel.split('/').filter(Boolean)
          if (parts.length <= 1) return rootLocalResolved.rel
          return parts.slice(0, -1).join('/')
        } catch {
          return rootLocalResolved.rel
        }
      })()
      if (!rootUrl) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing or invalid url' }))
        return
      }
      const opt = (body.options && typeof body.options === 'object' ? (body.options as Record<string, unknown>) : {})
      let selectedUrls: string[] | undefined
      try { selectedUrls = validateSelectedWebsiteUrls(rootUrl, opt.selectedUrls) } catch (error) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: String((error as Error).message || error) }))
        return
      }
      const options: WebsiteImportOptions = {
        selectedUrls,
        discoverSitemap: opt.discoverSitemap !== false,
        sitemapUrl: typeof opt.sitemapUrl === 'string' ? opt.sitemapUrl : undefined,
        maxPages: clampInt(opt.maxPages, 50, 1, 500),
        concurrency: clampInt(opt.concurrency, 4, 1, 12),
        includeImages: opt.includeImages !== false,
        generateMarkdownArtifacts: opt.generateMarkdownArtifacts === true,
        outputDirRel: typeof opt.outputDirRel === 'string' ? opt.outputDirRel : undefined,
        browserMode: rootKind === 'http' && opt.browserMode === 'headless' ? 'headless' : 'http',
        proxyRotation: opt.proxyRotation === true,
        downloadAssets: opt.downloadAssets === true,
        maxDownloads: clampInt(opt.maxDownloads, 120, 1, 500),
        maxDownloadBytes: clampInt(opt.maxDownloadBytes, 250 * 1024 * 1024, 1024 * 1024, 1024 * 1024 * 1024),
        generationToken: typeof opt.generationToken === 'string' ? opt.generationToken : undefined,
      }

      const nativeCrawler = options.browserMode === 'headless'
        ? new NativeWebsiteCrawler({
            concurrency: options.concurrency || 4,
            proxyRotation: options.proxyRotation === true,
            downloadAssets: options.downloadAssets === true,
            maxDownloads: options.maxDownloads || 120,
            maxDownloadBytes: options.maxDownloadBytes || 250 * 1024 * 1024,
          })
        : null
      const runtime: WebsiteImportRuntime = nativeCrawler?.runtime || {
        engine: 'http',
        headless: false,
        proxyMode: 'direct',
        proxyPoolSize: 0,
        downloadAssets: false,
        maxDownloads: 0,
        maxDownloadBytes: 0,
      }

      const { generationToken, ...requestOptions } = options
      const claim = await claimRun(generationToken, { kind: 'crawl', rootUrl, options: requestOptions })
      if (!claim) return
      const { importId } = claim
      const importDirAbs = path.join(workspaceAbs, importId)
      const manifestPathAbs = path.join(importDirAbs, 'manifest.json')
      if (claim.existing) {
        const manifest = await readJsonFile<WebsiteImportManifestV1>(manifestPathAbs)
        const ok = Boolean(manifest && manifest.status !== 'failed')
        res.statusCode = ok ? 200 : 409
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ ok, importId, ...(!ok ? { error: 'Import run is incomplete; use a fresh run to retry' } : {}) }))
        return
      }
      const initialProgress: WebsiteImportProgress = {
        stage: 'queued',
        total: 0,
        processed: 0,
        ok: 0,
        error: 0,
        queued: 0,
        updatedAtMs: Date.now(),
      }
      const initial: WebsiteImportManifestV1 = {
        version: 1,
        importId,
        rootUrl,
        status: 'queued',
        selectedUrls,
        startedAtMs: Date.now(),
        progress: initialProgress,
        runtime,
        nodes: [],
        errors: [],
      }
      await writeJsonFileAtomic(manifestPathAbs, initial)

      jobs.set(importId, { startedAtMs: Date.now(), manifest: initial })
      void runWebsiteImportJob({
        repoRoot: args.repoRoot, rootUrl, rootKind, rootLocalResolved, options, nativeCrawler,
        importId, importDirAbs, manifestPathAbs, workspaceRel: workspaceResolved.rel, initial, initialProgress,
        onUpdate: manifest => { const job = jobs.get(importId); if (job) job.manifest = manifest },
        onFinish: () => { jobs.delete(importId) },
      })

      const out: StartResponse = { ok: true, importId }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(out))
      return
    }

    if (req.method === 'GET' && pathname === '/__website_import/status') {
      const importId = sanitizeImportId(parsed.searchParams.get('importId') || '')
      if (!importId) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing importId' }))
        return
      }
      const job = jobs.get(importId)
      if (job?.manifest) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ ok: true, status: job.manifest.status, running: true, progress: job.manifest.progress || null }))
        return
      }
      const manifestPathAbs = path.join(workspaceAbs, importId, 'manifest.json')
      const manifest = await readJsonFile<WebsiteImportManifestV1>(manifestPathAbs)
      if (!manifest) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Not found' }))
        return
      }
      const running = jobs.has(importId)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ ok: true, status: manifest.status, running, progress: manifest.progress || null }))
      return
    }

    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Not found' }))
  }
}
