import fs from 'node:fs/promises'
import path from 'node:path'
import { extractXmlLocs, fetchTextWithLimit, hashHex, isCrawlableInternalUrl, normalizeUrl } from './websiteImportCore'
import type { NativeWebsiteCrawler } from './nativeWebsiteCrawler'
import type { WebsiteImportManifestV1, WebsiteImportNode, WebsiteImportOptions, WebsiteImportProgress } from './websiteImportTypes'
import { buildWebsiteSemanticSnapshotFromHtml } from '../websiteSemanticSnapshot'
import { collectSitemapUrls, crawlInternalUrls, discoverSitemapUrl, extractTitleFromHtml, isHttpUrl, listLocalHtmlFiles, posixPathFromFsAbs, readLocalTextWithLimit, resolveLocalInputPath, toTreePath, writeJsonFileAtomic, WEBSITE_IMPORT_DISCOVERY_MAX_BYTES, WEBSITE_IMPORT_PAGE_MAX_BYTES } from './websiteImportServerHelpers'

export async function runWebsiteImportJob(args: {
  repoRoot: string; rootUrl: string; rootKind: 'http' | 'local'
  rootLocalResolved: Awaited<ReturnType<typeof resolveLocalInputPath>> | null
  options: WebsiteImportOptions; nativeCrawler: NativeWebsiteCrawler | null
  importId: string; importDirAbs: string; manifestPathAbs: string; workspaceRel: string
  initial: WebsiteImportManifestV1; initialProgress: WebsiteImportProgress
  onUpdate: (manifest: WebsiteImportManifestV1) => void; onFinish: () => void
}) {
  const { repoRoot, rootUrl, rootKind, rootLocalResolved, options, nativeCrawler, importId,
    importDirAbs, manifestPathAbs, workspaceRel, initial, initialProgress, onUpdate, onFinish } = args
  let manifestState: WebsiteImportManifestV1 = { ...initial }
  let writing: Promise<void> | null = null
  let lastWriteAtMs = 0
  let pending: NodeJS.Timeout | null = null
  const mergeManifest = (next: Partial<WebsiteImportManifestV1>) => {
    manifestState = {
      ...manifestState,
      ...next,
      version: 1,
      importId,
      rootUrl,
      progress: next.progress ? next.progress : manifestState.progress,
      nodes: Array.isArray(next.nodes) ? next.nodes : manifestState.nodes,
      errors: Array.isArray(next.errors) ? next.errors : manifestState.errors,
    }
    if (manifestState.status === 'running') onUpdate(manifestState)
  }
  const flushManifestWrite = async () => {
    if (pending) {
      clearTimeout(pending)
      pending = null
    }
    if (writing) {
      try {
        await writing
      } catch {
        void 0
      }
    }
    lastWriteAtMs = Date.now()
    const snapshot = manifestState
    writing = writeJsonFileAtomic(manifestPathAbs, snapshot)
    await writing
    writing = null
  }
  const scheduleManifestWrite = () => {
    const now = Date.now()
    const waitMs = Math.max(0, 500 - (now - lastWriteAtMs))
    if (!pending) {
      pending = setTimeout(() => {
        pending = null
        void flushManifestWrite()
      }, waitMs)
    }
  }

  const updateManifest = async (next: Partial<WebsiteImportManifestV1>, opts?: { flush?: boolean }) => {
    mergeManifest(next)
    if (opts?.flush) {
      await flushManifestWrite()
      onUpdate(manifestState)
      return
    }
    scheduleManifestWrite()
  }

  try {
    await fs.mkdir(path.join(importDirAbs, 'nodes'), { recursive: true })
    await updateManifest({ status: 'running', progress: { ...initialProgress, stage: 'discovering', updatedAtMs: Date.now() } }, { flush: true })

    const errors: Array<{ url: string; error: string }> = []
    const repoRootAbs = path.resolve(repoRoot)
    const localRootAbs = rootKind === 'local' && rootLocalResolved && rootLocalResolved.ok === true ? rootLocalResolved.abs : ''
    const localSiteRootAbs = rootKind === 'local'
      ? (async () => {
          if (!localRootAbs) return ''
          try {
            const st = await fs.stat(localRootAbs)
            return st.isDirectory() ? localRootAbs : path.dirname(localRootAbs)
          } catch {
            return ''
          }
        })()
      : ''
    const localSiteRootAbsResolved = rootKind === 'local' ? await localSiteRootAbs : ''
    const localSiteRootRel = rootKind === 'local' && localSiteRootAbsResolved
      ? posixPathFromFsAbs(path.relative(repoRootAbs, localSiteRootAbsResolved))
      : ''

    let sitemapUrlForManifest: string | undefined
    const limited = await (async (): Promise<string[]> => {
      if (options.selectedUrls) return options.selectedUrls
      if (rootKind === 'http') {
        if (nativeCrawler) {
          await updateManifest({ progress: { ...initialProgress, stage: 'crawling', updatedAtMs: Date.now() } })
          return [rootUrl]
        }
        const explicitSitemap = normalizeUrl(options.sitemapUrl || '')
        const discovered = explicitSitemap ? explicitSitemap : options.discoverSitemap ? await discoverSitemapUrl(rootUrl) : null
        const effectiveSitemap = discovered ? normalizeUrl(discovered) : null
        sitemapUrlForManifest = effectiveSitemap || undefined

        const sitemapRes: { ok: true; urls: string[] } | { ok: false; error: string } = effectiveSitemap
          ? await collectSitemapUrls(rootUrl, effectiveSitemap, { timeoutMs: 30_000, maxBytes: 3 * 1024 * 1024, maxSitemaps: 30 })
          : { ok: true, urls: [] }
        const urls = sitemapRes.ok ? sitemapRes.urls : []
        await updateManifest({ progress: { ...initialProgress, stage: 'crawling', updatedAtMs: Date.now() } })
        const crawled = await crawlInternalUrls({
          rootUrl,
          seedUrls: urls,
          maxPages: options.maxPages || 50,
          timeoutMs: 30_000,
          maxBytes: WEBSITE_IMPORT_DISCOVERY_MAX_BYTES,
        })
        const combined = (() => {
          const out: string[] = []
          const seen = new Set<string>()
          for (const u of [...urls, ...crawled]) {
            const n = normalizeUrl(u)
            if (!n) continue
            if (seen.has(n)) continue
            seen.add(n)
            out.push(n)
          }
          return out
        })()
        if (sitemapRes.ok !== true && effectiveSitemap) errors.push({ url: effectiveSitemap, error: sitemapRes.error })
        return combined.slice(0, options.maxPages || 50)
      }

      if (!localSiteRootAbsResolved) return []
      await updateManifest({ progress: { ...initialProgress, stage: 'crawling', updatedAtMs: Date.now() } })

      const explicitLocalSitemap = options.sitemapUrl && !isHttpUrl(options.sitemapUrl)
        ? await resolveLocalInputPath(repoRoot, options.sitemapUrl)
        : null
      const discoveredLocalSitemap = options.discoverSitemap
        ? (async () => {
            const candidates = ['sitemap.xml', 'sitemap_index.xml', 'wp-sitemap.xml']
            for (const name of candidates) {
              const abs = path.join(localSiteRootAbsResolved, name)
              try {
                const st = await fs.stat(abs)
                if (st.isFile()) return abs
              } catch {
                void 0
              }
            }
            return ''
          })()
        : ''
      const localSitemapAbs = explicitLocalSitemap && explicitLocalSitemap.ok === true
        ? explicitLocalSitemap.abs
        : discoveredLocalSitemap
          ? await discoveredLocalSitemap
          : ''
      sitemapUrlForManifest = localSitemapAbs ? posixPathFromFsAbs(path.relative(repoRootAbs, localSitemapAbs)) : undefined

      const sitemapUrls = await (async () => {
        if (!localSitemapAbs) return [] as string[]
        const xmlRes = await readLocalTextWithLimit(localSitemapAbs, 3 * 1024 * 1024)
        if (xmlRes.ok !== true) {
          errors.push({ url: posixPathFromFsAbs(path.relative(repoRootAbs, localSitemapAbs)), error: xmlRes.error })
          return []
        }
        const locs = extractXmlLocs(xmlRes.text)
        const out: string[] = []
        for (const loc of locs) {
          const http = normalizeUrl(loc)
          if (http) {
            out.push(http)
            continue
          }
          const normalized = String(loc || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
          if (!normalized || normalized.includes('..')) continue
          const abs = path.resolve(localSiteRootAbsResolved, normalized)
          if (!abs.startsWith(localSiteRootAbsResolved + path.sep) && abs !== localSiteRootAbsResolved) continue
          try {
            const st = await fs.stat(abs)
            if (!st.isFile()) continue
          } catch {
            continue
          }
          const rel = posixPathFromFsAbs(path.relative(repoRootAbs, abs))
          out.push(rel)
        }
        return out
      })()

      const htmlFilesAbs = sitemapUrls.length
        ? []
        : await listLocalHtmlFiles(localSiteRootAbsResolved, options.maxPages || 50)

      const scanned = htmlFilesAbs.map(abs => posixPathFromFsAbs(path.relative(repoRootAbs, abs)))
      const combined = [...sitemapUrls, ...scanned]
      const seen = new Set<string>()
      const out: string[] = []
      for (const u of combined) {
        const key = String(u || '').trim()
        if (!key) continue
        if (seen.has(key)) continue
        seen.add(key)
        out.push(key)
        if (out.length >= (options.maxPages || 50)) break
      }
      return out
    })()

    const initialRunProgress: WebsiteImportProgress = {
      stage: 'converting',
      total: limited.length,
      processed: 0,
      ok: 0,
      error: 0,
      queued: limited.length,
      updatedAtMs: Date.now(),
    }

    await updateManifest({ sitemapUrl: sitemapUrlForManifest, errors, progress: initialRunProgress }, { flush: true })

    const nodes: WebsiteImportNode[] = []
    const queue = limited.slice()
    const queuedUrls = new Set(queue)
    let idx = 0
    let captureSequence = 0
    let processed = 0
    let okCount = 0
    let errorCount = 0
    const nextUrl = () => {
      if (idx >= queue.length) return null
      const u = queue[idx]
      idx += 1
      return u
    }

    let convertEnv: { restore: () => void } | null = null
    let convertFn: ((args: { html: string; url: string }) => Promise<string>) | null = null
    let convertLock = Promise.resolve()
    const withConvertLock = async <T,>(run: () => Promise<T>): Promise<T> => {
      const prev = convertLock
      let resolveNext: (() => void) | null = null
      convertLock = new Promise<void>(resolve => {
        resolveNext = resolve
      })
      await prev
      try {
        return await run()
      } finally {
        if (resolveNext) resolveNext()
      }
    }

    const ensureConvertReady = async () => {
      if (!options.generateMarkdownArtifacts) return
      if (convertFn) return
      const { initJsdomHarness } = await import('../../../tests/lib/jsdomHarness')
      convertEnv = initJsdomHarness()
      const mod = await import('../webpageHtmlToMarkdownArtifact')
      convertFn = (input: { html: string; url: string }) => mod.convertWebpageHtmlToMarkdownArtifactAsync({
        html: input.html,
        url: input.url,
        includeImages: options.includeImages !== false,
        fidelityLevel: 4,
        // raw.html owns capture diagnostics; page.md is the usable article.
        mode: 'ssot',
      })
    }

    const processUrl = async (u: string) => {
      const nodeId = hashHex(u).slice(0, 24)
      const nodeDirAbs = path.join(importDirAbs, 'nodes', nodeId)
      await fs.mkdir(nodeDirAbs, { recursive: true })

      let html = ''
      let title = ''
      let discoveredLinks: string[] = []
      let downloads: WebsiteImportNode['artifacts']['downloads'] = []
      try {
        if (nativeCrawler && isHttpUrl(u)) {
          const capture = await nativeCrawler.capture({ url: u, nodeDirAbs, sequence: captureSequence++ })
          html = capture.html
          title = capture.title
          downloads = capture.downloads
          discoveredLinks = capture.links
            .map(normalizeUrl)
            .filter((link): link is string => Boolean(link && isCrawlableInternalUrl(link, rootUrl)))
        } else {
          const rawHtmlRes = rootKind === 'http' || isHttpUrl(u)
            ? await fetchTextWithLimit(u, {
                timeoutMs: 30_000,
                maxBytes: WEBSITE_IMPORT_PAGE_MAX_BYTES,
                accept: 'text/html,*/*;q=0.9',
              })
            : await readLocalTextWithLimit(path.resolve(repoRootAbs, u), WEBSITE_IMPORT_PAGE_MAX_BYTES)
          if (rawHtmlRes.ok !== true) throw new Error(rawHtmlRes.error)
          html = String(rawHtmlRes.text || '')
          title = extractTitleFromHtml(html)
        }
      } catch (error) {
        const message = error && typeof error === 'object' && 'message' in error ? String(error.message || '') : String(error || '')
        errors.push({ url: u, error: message || 'Crawl failed' })
        nodes.push({ nodeId, url: u, path: toTreePath(isHttpUrl(u) ? 'http' : 'local', u, localSiteRootRel), status: 'error', artifacts: {} })
        errorCount += 1
        return
      }
      for (const link of options.selectedUrls ? [] : discoveredLinks) {
        if (queue.length >= (options.maxPages || 50)) break
        if (queuedUrls.has(link)) continue
        queuedUrls.add(link)
        queue.push(link)
      }

      const artifacts: WebsiteImportNode['artifacts'] = downloads.length ? { downloads } : {}
      if (html) {
        try {
          await fs.writeFile(path.join(nodeDirAbs, 'raw.html'), html, 'utf8')
          artifacts.rawHtmlRelPath = path.posix.join(workspaceRel, importId, 'nodes', nodeId, 'raw.html')
          artifacts.rawHtmlBytes = Buffer.byteLength(html, 'utf8')
          artifacts.rawHtmlSha256 = hashHex(html)
        } catch {
          void 0
        }
      }

      if (html && options.generateMarkdownArtifacts) {
        try {
          await ensureConvertReady()
          if (convertFn) {
            const markdown = await withConvertLock(async () => convertFn ? convertFn({ html, url: u }) : '')
            if (markdown) {
              try {
                await fs.writeFile(path.join(nodeDirAbs, 'page.md'), markdown, 'utf8')
                artifacts.markdownRelPath = path.posix.join(workspaceRel, importId, 'nodes', nodeId, 'page.md')
                artifacts.markdownBytes = Buffer.byteLength(markdown, 'utf8')
                artifacts.markdownSha256 = hashHex(markdown)
              } catch {
                void 0
              }
              try {
                const semanticSnapshot = buildWebsiteSemanticSnapshotFromHtml({ html, url: u, title, maxItems: 220 })
                const json = JSON.stringify({ ok: true, name: 'webpage.md', markdown, title: title || undefined, source_url: u, images: [], semanticSnapshot }, null, 2)
                await fs.writeFile(path.join(nodeDirAbs, 'conversion.json'), json, 'utf8')
                artifacts.conversionJsonRelPath = path.posix.join(workspaceRel, importId, 'nodes', nodeId, 'conversion.json')
                artifacts.conversionJsonBytes = Buffer.byteLength(json, 'utf8')
                artifacts.conversionJsonSha256 = hashHex(json)
              } catch {
                void 0
              }
            }
          }
        } catch {
          void 0
        }
      }
      nodes.push({
        nodeId,
        url: u,
        path: toTreePath(isHttpUrl(u) ? 'http' : 'local', u, localSiteRootRel),
        title: title || undefined,
        status: 'ok',
        links: discoveredLinks.length ? discoveredLinks : undefined,
        artifacts,
      })
      okCount += 1
    }

    const workerCount = rootKind === 'local' && options.generateMarkdownArtifacts ? 1 : (options.concurrency || 4)
    const workers = Array.from({ length: workerCount }).map(async () => {
      while (true) {
        const u = nextUrl()
        if (!u) return
        await processUrl(u)
        processed += 1
        const nextProgress: WebsiteImportProgress = {
          stage: 'converting',
          total: queue.length,
          processed,
          ok: okCount,
          error: errorCount,
          queued: Math.max(0, queue.length - processed),
          lastUrl: u,
          updatedAtMs: Date.now(),
        }
        await updateManifest({ progress: nextProgress, nodes: [...nodes], errors: [...errors] })
      }
    })

    await Promise.all(workers)
    nodes.sort((a, b) => a.path.localeCompare(b.path))
    if (convertEnv) {
      try {
        convertEnv.restore()
      } catch {
        void 0
      }
    }
    await updateManifest(
      {
        status: 'done',
        finishedAtMs: Date.now(),
        progress: {
          stage: 'done',
          total: queue.length,
          processed,
          ok: okCount,
          error: errorCount,
          queued: 0,
          lastUrl: processed > 0 ? (nodes[nodes.length - 1]?.url || undefined) : undefined,
          updatedAtMs: Date.now(),
        },
        nodes,
        errors,
      },
      { flush: true },
    )
  } catch (e) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message || '') : ''
    await updateManifest(
      {
        status: 'failed',
        finishedAtMs: Date.now(),
        progress: {
          stage: 'failed',
          total: manifestState.progress?.total || 0,
          processed: manifestState.progress?.processed || 0,
          ok: manifestState.progress?.ok || 0,
          error: Math.max(1, manifestState.progress?.error || 0),
          queued: manifestState.progress?.queued || 0,
          lastUrl: manifestState.progress?.lastUrl,
          updatedAtMs: Date.now(),
        },
        errors: [{ url: rootUrl, error: msg || 'Import failed' }],
      },
      { flush: true },
    )
  } finally {
    await nativeCrawler?.close().catch(() => void 0)
    onFinish()
  }

}
