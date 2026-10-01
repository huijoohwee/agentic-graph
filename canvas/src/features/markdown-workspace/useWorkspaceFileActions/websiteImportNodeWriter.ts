import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { createWorkspaceFolderTreeEnsurer } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { resolveInitializedWorkspaceFs } from '@/features/workspace-fs/workspaceFsInitialization'
import { resolveWebsiteCollectionRoot } from '@/features/workspace-fs/websiteCollections'
import { extractYamlFrontmatterHeaderBlock, readYamlFrontmatterValue } from '@/lib/markdown/frontmatter'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { mapLimit } from '@/lib/async/mapLimit'
import { resolveWebsiteImportNodeRelativeDocumentPath, safeWebsitePathSegment } from '@/lib/websites/websitePathUtils'
import { fetchWebsiteImportArtifact } from '@/lib/websites/webpageIframeSrcdoc'
import { convertWebpageUrlToMarkdownViaBrowser, looksLowFidelityWebpageMarkdown } from '@/lib/websites/webpageClientConvert'
import { buildWebsiteSitemapMarkdown } from '@/lib/websites/websiteSitemapMarkdown'
import { buildWebsiteCrawlCanvasMarkdown } from '@/lib/websites/websiteCrawlCanvasMarkdown'
import type { WebsiteImportManifestV1, WebsiteImportNode } from '@/lib/websites/server/websiteImportTypes'
import { buildWebpageWorkspaceEntryTextFromUpstreamMarkdown } from '../workspaceImport'
import { D3_URL_IMPORT_CANVAS_PRESET } from '../workspaceImport/canvasPresets'

export type WebsiteImportSettings = {
  selectedUrls?: string[]
  destinationPath?: string
  outputDirRel: string
  concurrency: number
  defaultView: unknown
  generateArtifactDocs: boolean
  browserEnhance: boolean
}

export type WebsiteImportCreated = {
  createdPaths: WorkspacePath[]
  sources: Array<{ path: WorkspacePath; source: { kind: 'url'; url: string; path: string } }>
}

function isWebsiteImportJobCurrent(importJobRef: { current: number }, jobId: number): boolean {
  return importJobRef.current === jobId
}

function resolveWebsiteImportHost(rootUrl: string): string {
  try {
    return new URL(rootUrl).host
  } catch {
    const normalized = String(rootUrl || '').replace(/\\/g, '/').replace(/\/+$/, '')
    const last = normalized.split('/').filter(Boolean).pop() || ''
    return last || 'website'
  }
}

function resolveWebsiteImportLocalSiteRootRel(url: string): string {
  if (/^https?:\/\//i.test(url)) return ''
  const normalized = url.replace(/\\/g, '/').replace(/\/+$/, '').replace(/^\.+\//, '').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) return ''
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return ''
  const leaf = parts[parts.length - 1] || ''
  if (/\.(xml|html|htm)$/i.test(leaf) && parts.length > 1) return parts.slice(0, -1).join('/')
  return normalized
}

function coerceWebsiteImportWebpageView(raw: unknown): 'markdown' | 'json' | 'html' {
  return raw === 'html' ? 'html' : raw === 'json' ? 'json' : 'markdown'
}

function shouldEnhanceWebsiteMarkdownViaBrowser(settings: WebsiteImportSettings, url: string, markdown: string): boolean {
  if (!settings.browserEnhance) return false
  if (!/^https?:\/\//i.test(String(url || '').trim())) return false
  const text = String(markdown || '').trim()
  return !text || text.length < 1400 || looksLowFidelityWebpageMarkdown(text)
}

async function getBrowserEnhancedWebsiteMarkdown(url: string): Promise<{ markdown: string; title: string } | null> {
  const res = await convertWebpageUrlToMarkdownViaBrowser({ url })
  if (res.ok !== true || !String(res.markdown || '').trim()) return null
  return { markdown: res.markdown.trim(), title: String(res.title || '').trim() }
}

export async function createWebsiteImportWorkspaceWriter(args: {
  fs: WorkspaceFs
  url: string
  importId: string
  onFileCreated?: (source: WebsiteImportCreated['sources'][number]) => Promise<void>
  onRootPath?: (path: WorkspacePath) => void
  settings: WebsiteImportSettings
  importJobRef: { current: number }
  jobId: number
  status: { setStatusProgress: (label: string, current?: number | null, total?: number | null) => void }
}): Promise<{ writeNodes: (nodes: WebsiteImportNode[]) => Promise<void>; finalize: (manifest: WebsiteImportManifestV1) => Promise<{ created: WebsiteImportCreated; host: string; canvasPath: WorkspacePath | null }> }> {
  const { fs, url, importId, settings, importJobRef, jobId, status } = args
  let rootUrl = url
  const host = resolveWebsiteImportHost(rootUrl)
  const localSiteRootRel = resolveWebsiteImportLocalSiteRootRel(url)
  const view = coerceWebsiteImportWebpageView(settings.defaultView)
  const generateArtifactDocs = settings.generateArtifactDocs
  const destination = settings.destinationPath
  if (destination !== undefined && (settings.selectedUrls?.length !== 1 || !destination.startsWith('/')
    || destination === '/' || normalizeWorkspacePath(destination) !== destination
    || destination.split('/').some(part => part === '.' || part === '..'))) {
    throw new Error('An in-place import requires one selected page and an exact workspace file path.')
  }

  const stubForNode = (nodeUrl: string, nodeId: string, unavailable = false) => {
    const text = buildWebpageWorkspaceEntryTextFromUpstreamMarkdown({
      upstreamMarkdown: unavailable ? 'Markdown conversion is unavailable for this page. Use the HTML view to inspect the captured source.' : '',
      url: nodeUrl, view, canvasPreset: D3_URL_IMPORT_CANVAS_PRESET,
      websiteImportMeta: { importId, nodeId, outputDirRel: settings.outputDirRel || undefined },
    })
    return !/^https?:\/\//i.test(nodeUrl) && localSiteRootRel
      ? text.replace('\n---', `\nkgWebpageSiteRootRel: ${JSON.stringify(localSiteRootRel)}\n---`)
      : text
  }

  // Fence parent creation and initialization before resolving the retained collection.
  args.onRootPath?.(destination ? destination.slice(0, destination.lastIndexOf('/')) || '/' : `/websites/${safeWebsitePathSegment(host)}`)
  await resolveInitializedWorkspaceFs(fs)
  const inventory = await fs.listEntries()
  const rootFolder = destination
    ? destination.slice(0, destination.lastIndexOf('/')) || '/'
    : resolveWebsiteCollectionRoot(inventory, host, importId)
  const ensureFolder = await createWorkspaceFolderTreeEnsurer(fs, inventory)
  await ensureFolder(rootFolder)
  const createdPaths: WorkspacePath[] = []
  const sources: WebsiteImportCreated['sources'] = []
  const docLinkByNodeId: Record<string, string> = {}
  const ctrl = new AbortController()
  const seenNodeIds = new Set<string>()
  const claimedDocumentPaths = new Set<string>()
  const folderCache = new Map<string, Promise<WorkspacePath>>([[rootFolder, Promise.resolve(rootFolder)]])
  const ensureFolderCached = async (absPath: string) => {
    const normalized = normalizeWorkspacePath(absPath)
    const cached = folderCache.get(normalized)
    if (cached) return await cached
    const pending = ensureFolder(normalized).then(() => normalized).catch(error => {
      folderCache.delete(normalized)
      throw error
    })
    folderCache.set(normalized, pending)
    return await pending
  }
  const createCaptureFile = async (parentPath: string, name: string, text: string) => {
    const reuseCapture = async (path: string, existing: string | null) => {
      if (existing === text) return true
      const header = existing && extractYamlFrontmatterHeaderBlock(existing)
      if (!header || readYamlFrontmatterValue(header.rawBlock, 'kgWebsiteImportId') !== importId) return false
      await fs.writeFileText(path, text, { expectedText: existing })
      return true
    }
    let path = `${parentPath}/${name}`
    const existing = await fs.readFileText(path)
    if (await reuseCapture(path, existing)) return path
    if (existing !== null) {
      const dot = name.lastIndexOf('.')
      name = dot > 0 ? `${name.slice(0, dot)}--${safeWebsitePathSegment(importId)}${name.slice(dot)}`
        : `${name}--${safeWebsitePathSegment(importId)}`
      path = `${parentPath}/${name}`
      if (await reuseCapture(path, await fs.readFileText(path))) return path
    }
    return fs.createFile({ parentPath, name, text })
  }
  const writeNodes = async (nodes: WebsiteImportNode[]) => {
    const freshNodes = nodes.filter(node => {
      if (!node.nodeId || seenNodeIds.has(node.nodeId)) return false
      seenNodeIds.add(node.nodeId)
      return true
    })
    const nodeRows = freshNodes
      .map(n => {
        const node = n
        const nodeUrl = typeof node.url === 'string' ? node.url : ''
        const nodeId = typeof node.nodeId === 'string' ? node.nodeId : hashStringToHex(nodeUrl).slice(0, 16)
        const nodeTreePath = typeof node.path === 'string' ? node.path : ''
        const nodeStatus = typeof node.status === 'string' ? node.status : 'ok'
        if (!nodeUrl || nodeStatus !== 'ok' || (destination && nodeUrl !== settings.selectedUrls![0])) return null
        const artifacts = node.artifacts && typeof node.artifacts === 'object' ? (node.artifacts as Record<string, unknown>) : {}
        const artifactText = (key: string): string | undefined => {
          const text = typeof artifacts[key] === 'string' ? String(artifacts[key]).trim() : ''
          return text || undefined
        }
        const row = {
          nodeUrl,
          nodeId,
          nodeTreePath,
          websiteImportMeta: {
            importId,
            nodeId,
            outputDirRel: settings.outputDirRel || undefined,
            rawHtmlRelPath: artifactText('rawHtmlRelPath'),
            markdownRelPath: artifactText('markdownRelPath'),
            conversionJsonRelPath: artifactText('conversionJsonRelPath'),
            rawHtmlSha256: artifactText('rawHtmlSha256'),
            markdownSha256: artifactText('markdownSha256'),
            conversionJsonSha256: artifactText('conversionJsonSha256'),
          },
        } as { nodeUrl: string; nodeId: string; nodeTreePath: string; nodeTitle?: string; websiteImportMeta: NonNullable<Parameters<typeof buildWebpageWorkspaceEntryTextFromUpstreamMarkdown>[0]['websiteImportMeta']> }
        const title = typeof node.title === 'string' ? node.title : ''
        if (title) row.nodeTitle = title
        return row
      })
      .filter((v): v is { nodeUrl: string; nodeId: string; nodeTreePath: string; nodeTitle?: string; websiteImportMeta: NonNullable<Parameters<typeof buildWebpageWorkspaceEntryTextFromUpstreamMarkdown>[0]['websiteImportMeta']> } => !!v)

    const writeConcurrency = generateArtifactDocs ? Math.max(1, Math.min(2, settings.concurrency)) : Math.max(1, Math.min(6, settings.concurrency))

    await mapLimit(
      nodeRows,
      writeConcurrency,
      async row => {
        if (!isWebsiteImportJobCurrent(importJobRef, jobId)) throw new Error('cancelled')
        const relativeDocumentPath = destination?.slice(destination.lastIndexOf('/') + 1) || resolveWebsiteImportNodeRelativeDocumentPath({
          nodeUrl: row.nodeUrl,
          nodePath: row.nodeTreePath,
        })
        if (claimedDocumentPaths.has(relativeDocumentPath)) throw new Error(`Crawl page path collision: ${relativeDocumentPath}`)
        claimedDocumentPaths.add(relativeDocumentPath)
        const documentParts = relativeDocumentPath.split('/').filter(Boolean)
        const primaryName = documentParts[documentParts.length - 1] || 'index.md'
        const folderParts = documentParts.slice(0, Math.max(0, documentParts.length - 1))
        const folderPath = folderParts.length ? await ensureFolderCached(`${rootFolder}/${folderParts.join('/')}`) : rootFolder
        const nameBase = primaryName.replace(/\.md$/i, '') || 'index'

        const text = await (async () => {
          if (!generateArtifactDocs) return stubForNode(row.nodeUrl, row.nodeId)
          try {
            const serverMarkdown = await (async () => {
              try {
                const markdown = await fetchWebsiteImportArtifact({
                  importId,
                  nodeId: row.nodeId,
                  outputDirRel: settings.outputDirRel || undefined,
                  kind: 'markdown',
                  signal: ctrl.signal,
                })
                if (markdown && markdown.trim()) return markdown
              } catch {
                void 0
              }
              return ''
            })()

            const browserMarkdown = shouldEnhanceWebsiteMarkdownViaBrowser(settings, row.nodeUrl, serverMarkdown)
              ? await getBrowserEnhancedWebsiteMarkdown(row.nodeUrl).catch(() => null)
              : null
            const selectedMarkdown = browserMarkdown?.markdown || serverMarkdown
            const selectedTitle = row.nodeTitle || browserMarkdown?.title

            if (selectedMarkdown) {
              return buildWebpageWorkspaceEntryTextFromUpstreamMarkdown({
                upstreamMarkdown: selectedMarkdown,
                url: row.nodeUrl,
                view,
                canvasPreset: D3_URL_IMPORT_CANVAS_PRESET,
                title: selectedTitle,
                fidelityLevel: 4,
                includeImages: true,
                preserveBodyFidelity: true,
                websiteImportMeta: row.websiteImportMeta,
              })
            }

            // The server owns crawl conversion. Re-parsing a large HTML capture here
            // blocks the UI and duplicates its bytes into the workspace document.
            return stubForNode(row.nodeUrl, row.nodeId, true)
          } catch {
            return stubForNode(row.nodeUrl, row.nodeId, true)
          }
        })()

        const tryCreate = async (name: string) => {
          if (!isWebsiteImportJobCurrent(importJobRef, jobId)) throw new Error('cancelled')
          const createdPath = destination
            ? await fs.createFile({ parentPath: folderPath, name, text, requireExactPath: true })
            : await createCaptureFile(folderPath, name, text)
          createdPaths.push(createdPath)
          const source = { path: createdPath, source: { kind: 'url' as const, url: row.nodeUrl, path: `workspace:${createdPath}` } }
          sources.push(source)
          try {
            const normalizedRoot = normalizeWorkspacePath(rootFolder)
            const normalizedCreated = normalizeWorkspacePath(createdPath)
            const rel = normalizedCreated.startsWith(normalizedRoot + '/')
              ? normalizedCreated.slice(normalizedRoot.length + 1)
              : normalizedCreated.replace(/^\/+/, '')
            if (rel) docLinkByNodeId[row.nodeId] = `./${rel}`
          } catch {
            void 0
          }
          return source
        }

        let source: WebsiteImportCreated['sources'][number] | null = null
        try {
          source = await tryCreate(primaryName)
        } catch (error) {
          if (destination || !isWebsiteImportJobCurrent(importJobRef, jobId)) throw error
          const alt = `${nameBase}-${hashStringToHex(row.nodeUrl).slice(0, 6)}.md`
          try {
            source = await tryCreate(alt)
          } catch {
            void 0
          }
        }
        if (source) await args.onFileCreated?.(source)
      },
      {
        signal: ctrl.signal,
        yieldEvery: generateArtifactDocs ? 1 : 12,
      },
    )
  }

  const finalize = async (manifest: WebsiteImportManifestV1) => {
    if (!isWebsiteImportJobCurrent(importJobRef, jobId)) throw new Error('cancelled')
    rootUrl = manifest.rootUrl
    const nodes = manifest.nodes
    await writeNodes(nodes)
    if (destination) {
      if (!createdPaths.includes(destination)) throw new Error(`The requested page was not saved: ${settings.selectedUrls![0]}`)
      status.setStatusProgress('Writing', 1, 1)
      return { created: { createdPaths, sources }, host, canvasPath: null }
    }
    try {
      const sitemapText = buildWebsiteSitemapMarkdown({
        rootUrl,
        importId,
        outputDirRel: settings.outputDirRel || undefined,
        docLinkByNodeId,
        nodes: nodes
          .map(node => {
            const nodeUrl = typeof node.url === 'string' ? node.url : ''
            const nodeId = typeof node.nodeId === 'string' ? node.nodeId : ''
            const nodeTreePath = typeof node.path === 'string' ? node.path : ''
            const title = typeof node.title === 'string' ? node.title : null
            return { nodeId, url: nodeUrl, path: nodeTreePath, title }
          })
          .filter(n => n.url),
      })
      const sitemapPath = await createCaptureFile(rootFolder, 'website.sitemap.md', sitemapText)
      createdPaths.unshift(sitemapPath)
      sources.unshift({ path: sitemapPath, source: { kind: 'url', url: rootUrl, path: `workspace:${sitemapPath}` } })
    } catch {
      void 0
    }

    let canvasPath: WorkspacePath | null = null
    try {
      const canvasText = buildWebsiteCrawlCanvasMarkdown({
        rootUrl,
        importId,
        outputDirRel: settings.outputDirRel,
        runtime: manifest.runtime,
        nodes,
      })
      canvasPath = await createCaptureFile(rootFolder, 'website.crawl.canvas.md', canvasText)
      createdPaths.unshift(canvasPath)
      sources.unshift({ path: canvasPath, source: { kind: 'url', url: rootUrl, path: `workspace:${canvasPath}` } })
    } catch {
      void 0
    }

    status.setStatusProgress('Writing', createdPaths.length, createdPaths.length)
    return { created: { createdPaths, sources }, host, canvasPath }
  }

  return { writeNodes, finalize }
}
