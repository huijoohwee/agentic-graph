import { useGraphStore } from '@/hooks/useGraphStore'
import { pickFileWithExtensions } from '@/lib/graph/filePicker'
import { SOURCE_FILES_FORMATS } from '@/lib/config.copy'
import { decodeCodebasePathFromUrl, deriveFilenameFromUrl, normalizeGitHubBlobLikeUrl, unwrapUserProvidedText } from '@/lib/url'
import { fetchRemoteTextDetailed } from '@/lib/net/fetchRemoteText'
import { describeFetchRemoteTextFailure } from '@/lib/net/fetchRemoteTextFailure'
import { downloadBlob } from '@/lib/graph/save'
import { exportAsCombinedCsvBlob, exportAsJsonLdBlob, exportAsRawJsonBlob } from '@/lib/graph/io/adapter'
import { exportAsGeoJsonBlob } from '@/lib/graph/io/geojson'
import { scheduleApplyComposedGraphFromSourceFiles } from '@/features/source-files/applyComposedGraphFromSourceFiles'
import { writeLocalMarkdownFileText } from '@/features/source-files/localMarkdownFolder'
import { getMostRecentCachedMarkdownFolderId, writeCachedMarkdownText } from '@/features/source-files/markdownFsCache'
import type { MarkdownSourceFilesIngestIntegration } from '@/features/markdown/ui/MarkdownSourceFilesIngestIntegration'
import { convertPdfFileToMarkdown, convertPdfUrlToMarkdown, fetchYouTubeTranscriptMarkdown, fetchWebpageMarkdown } from '@/lib/net/remoteMarkdownConversions'
import { sanitizeImportedMarkdownText } from '@/lib/markdown/sanitizeImportedMarkdown'
import { buildGrabMapsProxyRequestHeaders } from 'grph-shared/geospatial/grabMapsAuth'
import { toGrabMapsProxyUrl } from 'grph-shared/geospatial/grabMapsProxy'
import { buildSourceFileLifecycleState } from '@/features/source-files/sourceFileParsedState'
import { KNOWGRPH_SOURCE_IMPORT_LIMITS } from '@/lib/storage/knowgrphStorageBounds'
import {
  applyImportedTextToSourceFile,
  buildSourceFileIdleReset,
  ensureTargetSourceFileId,
  syncDocumentViewFromSourceFile,
} from '@/features/source-files/sourceFilesParseRuntime'
export {
  importFeishuBaseSnapshotIntoSourceFile,
  parseAndApplySourceFile,
  readSourceImportUtf8ByteLength,
  refreshPersistedSourceFilesForCurrentParseIdentity,
  resolveSameNameSourceFileId,
} from '@/features/source-files/sourceFilesParseRuntime'

const SUPPORTED_SOURCE_FILE_IMPORT_EXTENSIONS = [...SOURCE_FILES_FORMATS.import]

const runBoundedRemoteImport = async <T>(operation: () => Promise<T>): Promise<T> => {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      reject(new Error(`Request timed out after ${KNOWGRPH_SOURCE_IMPORT_LIMITS.urlTimeoutMs}ms`))
    }, KNOWGRPH_SOURCE_IMPORT_LIMITS.urlTimeoutMs)
  })
  try {
    return await Promise.race([operation(), timeout])
  } finally {
    if (timeoutId != null) globalThis.clearTimeout(timeoutId)
  }
}

const inferExportFormatFromName = (name: string): (typeof SOURCE_FILES_FORMATS.export)[number] => {
  const lower = String(name || '').trim().toLowerCase()
  if (lower.endsWith('.jsonld')) return '.jsonld'
  if (lower.endsWith('.geojson')) return '.geojson'
  if (lower.endsWith('.json')) return '.json'
  if (lower.endsWith('.csv')) return '.csv'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return '.html'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return '.yaml'
  if (lower.endsWith('.txt')) return '.txt'
  return '.md'
}

const buildExportFilename = (rawName: string, ext: string) => {
  const base = String(rawName || '').trim() || 'source'
  const stem = base.replace(/\.(pdf|html|htm|jsonld|geojson|json|yaml|yml|md|markdown|txt|csv)$/i, '') || 'source'
  return `${stem}${ext}`
}

const isSameOriginCodebaseFileUrl = (rawUrl: string): boolean => {
  if (typeof window === 'undefined') return false
  const text = String(rawUrl || '').trim()
  if (!text) return false
  try {
    const parsed = new URL(text, window.location.href)
    if (parsed.origin !== window.location.origin) return false
    return parsed.pathname === '/__codebase_file' && !!decodeCodebasePathFromUrl(parsed.toString())
  } catch {
    return false
  }
}

const coerceGrabMapsHttpsUrl = (rawUrl: string): string | null => {
  const text = String(rawUrl || '').trim()
  if (!text) return null
  try {
    const u = new URL(text)
    if (u.protocol !== 'https:') return null
    if (u.hostname.toLowerCase() !== 'maps.grab.com') return null
    return u.toString()
  } catch {
    return null
  }
}

const fetchSameOriginCodebaseFileText = async (url: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
  const target = String(url || '').trim()
  if (!target) return { ok: false, error: 'Request failed' }
  const result = await fetchRemoteTextDetailed(target, {
    preflightHead: false,
    preferProxy: false,
    useProxy: 'never',
    timeoutMs: KNOWGRPH_SOURCE_IMPORT_LIMITS.urlTimeoutMs,
    maxBytes: KNOWGRPH_SOURCE_IMPORT_LIMITS.maxBytes,
  })
  if (result.ok === false) {
    return { ok: false, error: describeFetchRemoteTextFailure(result) }
  }
  return { ok: true, text: result.text }
}

function exportActiveSourceFile(args: { fileId: string | null }) {
  const store = useGraphStore.getState()
  const file = args.fileId ? store.sourceFiles.find(f => f.id === args.fileId) : null
  if (!file) return
  const format = inferExportFormatFromName(file.name)
  const filename = buildExportFilename(file.name, format)
  if (format === '.jsonld' && file.parsedGraphData) {
    downloadBlob(exportAsJsonLdBlob(file.parsedGraphData), filename)
    return
  }
  if (format === '.json' && file.parsedGraphData) {
    downloadBlob(exportAsRawJsonBlob(file.parsedGraphData), filename)
    return
  }
  if (format === '.csv' && file.parsedGraphData) {
    downloadBlob(exportAsCombinedCsvBlob(file.parsedGraphData), filename)
    return
  }
  if (format === '.geojson' && file.parsedGraphData) {
    downloadBlob(exportAsGeoJsonBlob(file.parsedGraphData), filename)
    return
  }
  const content = String(file.text || '')
  if (!content.trim()) return
  const mime =
    format === '.md'
      ? 'text/markdown;charset=utf-8'
      : format === '.html'
        ? 'text/html;charset=utf-8'
        : format === '.yaml'
          ? 'text/yaml;charset=utf-8'
          : 'text/plain;charset=utf-8'
  const blob = new Blob([content], { type: mime })
  downloadBlob(blob, filename)
}

function clearActiveSourceFile(args: { fileId: string | null }) {
  const store = useGraphStore.getState()
  const file = args.fileId ? store.sourceFiles.find(f => f.id === args.fileId) : null
  if (!file) return
  store.updateSourceFile(file.id, {
    text: '',
    ...buildSourceFileIdleReset(),
  })
  syncDocumentViewFromSourceFile(
    {
      name: file.name,
      text: '',
      source: file.source?.kind === 'url' ? { kind: 'url', url: String(file.source.url || '').trim() } : { kind: 'local' },
    },
    { applyToGraph: false },
  )

  if (file.source?.kind === 'local') {
    const relativePath = String(file.source?.path || file.name || '').trim()
    if (relativePath) {
      void (async () => {
        try {
          if (store.localMarkdownFolderHandle) {
            await writeLocalMarkdownFileText(relativePath, '')
            return
          }
          const cacheId =
            String(store.localMarkdownFolderCacheId || '').trim() || (await getMostRecentCachedMarkdownFolderId())
          if (cacheId) {
            await writeCachedMarkdownText(cacheId, relativePath, '')
          }
        } catch {
          store.pushUiToast({
            id: 'source-file-clear-local-failed',
            kind: 'warning',
            message: `Cleared in-app copy only: ${String(file.name || '').trim() || 'local file'}`,
          })
        }
      })()
    }
  }
  if (file.enabled) scheduleApplyComposedGraphFromSourceFiles()
}

async function importLocalIntoActive(args: { fileId: string | null }): Promise<void> {
  const store = useGraphStore.getState()
  const picked = await pickFileWithExtensions([...SUPPORTED_SOURCE_FILE_IMPORT_EXTENSIONS])
  if (!picked) return
  if (
    typeof picked.size === 'number'
    && Number.isFinite(picked.size)
    && picked.size > KNOWGRPH_SOURCE_IMPORT_LIMITS.maxBytes
  ) {
    const mb = (picked.size / (1024 * 1024)).toFixed(1)
    const limitMb = (KNOWGRPH_SOURCE_IMPORT_LIMITS.maxBytes / (1024 * 1024)).toFixed(1)
    const id = ensureTargetSourceFileId({ fileId: args.fileId, suggestedName: picked.name })
    const previous = store.sourceFiles.find(file => file.id === id)
    store.updateSourceFile(
      id,
      buildSourceFileLifecycleState({
        status: 'error',
        error: `Too large (${mb} MB > ${limitMb} MB)`,
        previousState: previous,
        preserveParsedState: true,
      }),
    )
    return
  }

  const lower = String(picked.name || '').toLowerCase()
  const id = ensureTargetSourceFileId({ fileId: args.fileId, suggestedName: picked.name })
  const previous = store.sourceFiles.find(file => file.id === id)
  store.updateSourceFile(id, {
    ...buildSourceFileLifecycleState({
      status: 'loading',
      previousState: previous,
      preserveParsedState: true,
    }),
    enabled: true,
  })

  if (/\.(pdf)(\?|#|$)/i.test(lower)) {
    const converted = await convertPdfFileToMarkdown(picked)
    if (!converted) {
      store.updateSourceFile(
        id,
        buildSourceFileLifecycleState({
          status: 'error',
          error: 'Request failed',
          previousState: previous,
          preserveParsedState: true,
        }),
      )
      return
    }
    if (converted.ok === false) {
      store.updateSourceFile(
        id,
        buildSourceFileLifecycleState({
          status: 'error',
          error: converted.error,
          previousState: previous,
          preserveParsedState: true,
        }),
      )
      return
    }
    await applyImportedTextToSourceFile({
      id,
      name: converted.name,
      text: converted.markdown,
      source: { kind: 'local', path: picked.name },
    })
    return
  }

  const text = await picked.text()
  await applyImportedTextToSourceFile({
    id,
    name: picked.name,
    text,
    source: { kind: 'local', path: picked.name },
  })
}

async function importUrlIntoActive(args: { fileId: string | null; url: string; format?: 'markdown' | 'json' }): Promise<void> {
  const store = useGraphStore.getState()
  const rawUrl = unwrapUserProvidedText(String(args.url || '').trim()) || String(args.url || '').trim()
  if (!rawUrl) return
  const normalizedUrl = normalizeGitHubBlobLikeUrl(rawUrl) || rawUrl
  const lower = normalizedUrl.toLowerCase()

  const id = ensureTargetSourceFileId({ fileId: args.fileId, suggestedName: deriveFilenameFromUrl(normalizedUrl, 'source.txt') })
  const previous = store.sourceFiles.find(file => file.id === id)
  store.updateSourceFile(id, {
    ...buildSourceFileLifecycleState({
      status: 'loading',
      previousState: previous,
      preserveParsedState: true,
    }),
    enabled: true,
    source: { kind: 'url', url: normalizedUrl },
  })

  try {
    const isYouTube = lower.includes('youtube.com') || lower.includes('youtu.be')
    if (isYouTube) {
      const yt = await runBoundedRemoteImport(() => fetchYouTubeTranscriptMarkdown(normalizedUrl))
      if (!yt) {
        store.updateSourceFile(
          id,
          buildSourceFileLifecycleState({
            status: 'error',
            error: 'Request failed',
            previousState: previous,
            preserveParsedState: true,
          }),
        )
        return
      }
      if (yt.ok === false) {
        store.updateSourceFile(
          id,
          buildSourceFileLifecycleState({
            status: 'error',
            error: yt.error,
            previousState: previous,
            preserveParsedState: true,
          }),
        )
        return
      }

      let videoId = ''
      try {
        if (yt.transcriptJsonText) {
          const parsed = JSON.parse(yt.transcriptJsonText)
          if (parsed && typeof parsed.video_id === 'string') {
            videoId = parsed.video_id
          }
        }
      } catch {
        void 0
      }

      const effectiveFormat = args.format === 'json' ? 'json' : 'markdown'
      const frontmatter = videoId
        ? `---\nkgYoutubeVideoId: "${videoId}"\nkgYoutubeFormat: "${effectiveFormat}"\n---\n\n`
        : ''

      // Handle JSON format preference
      if (effectiveFormat === 'json' && yt.transcriptJsonText) {
        // Keep .md extension so it opens in Markdown Workspace
        const content = `${frontmatter}\`\`\`json\n${yt.transcriptJsonText}\n\`\`\`\n`
        await applyImportedTextToSourceFile({
          id,
          name: yt.name,
          text: content,
          source: { kind: 'url', url: normalizedUrl },
        })
        return
      }

      const content = `${frontmatter}${yt.markdown}`
      await applyImportedTextToSourceFile({
        id,
        name: yt.name,
        text: content,
        source: { kind: 'url', url: normalizedUrl },
      })
      return
    }

    if (/\.(pdf)(\?|#|$)/i.test(lower)) {
      const converted = await runBoundedRemoteImport(() => convertPdfUrlToMarkdown(normalizedUrl))
      if (!converted) {
        store.updateSourceFile(
          id,
          buildSourceFileLifecycleState({
            status: 'error',
            error: 'Request failed',
            previousState: previous,
            preserveParsedState: true,
          }),
        )
        return
      }
      if (converted.ok === false) {
        store.updateSourceFile(
          id,
          buildSourceFileLifecycleState({
            status: 'error',
            error: converted.error,
            previousState: previous,
            preserveParsedState: true,
          }),
        )
        return
      }
      await applyImportedTextToSourceFile({
        id,
        name: converted.name,
        text: converted.markdown,
        source: { kind: 'url', url: normalizedUrl },
      })
      return
    }

    const looksLikeCodeOrData = /\.(json|jsonld|geojson|csv|yaml|yml|txt|js|ts|py|md|markdown|mdx|svg)(\?|#|$)/i.test(lower)
    if (!looksLikeCodeOrData) {
      const includeImages = useGraphStore.getState().webpageImportIncludeImages ?? true
      const view = (() => {
        const v = useGraphStore.getState().webpageImportView
        if (v === 'html') return 'html'
        if (v === 'json') return 'json'
        return 'markdown'
      })()
      const webpage = await runBoundedRemoteImport(
        () => fetchWebpageMarkdown(normalizedUrl, { includeImages }),
      )
      if (webpage && webpage.ok) {
        const frontmatter = `---\nkgWebpageUrl: "${normalizedUrl}"\nkgWebpageView: "${view}"\n---\n\n`
        const content = sanitizeImportedMarkdownText(`${frontmatter}${webpage.markdown}`, { sourceUrl: normalizedUrl }).text
        await applyImportedTextToSourceFile({
          id,
          name: webpage.name,
          text: content,
          source: { kind: 'url', url: normalizedUrl },
        })
        return
      }
    }

    if (isSameOriginCodebaseFileUrl(normalizedUrl)) {
      const direct = await fetchSameOriginCodebaseFileText(normalizedUrl)
      if (direct.ok === false) {
        store.updateSourceFile(
          id,
          buildSourceFileLifecycleState({
            status: 'error',
            error: direct.error,
            previousState: previous,
            preserveParsedState: true,
          }),
        )
        return
      }
      const nextName = deriveFilenameFromUrl(normalizedUrl, 'source.txt')
      await applyImportedTextToSourceFile({
        id,
        name: nextName,
        text: direct.text,
        source: { kind: 'url', url: normalizedUrl },
      })
      return
    }

    const grabMapsProxyUrl = (() => {
      const grabMapsHttpsUrl = coerceGrabMapsHttpsUrl(normalizedUrl)
      if (!grabMapsHttpsUrl) return null
      return toGrabMapsProxyUrl(grabMapsHttpsUrl)
    })()
    const isGrabMapsProxyRequest = !!grabMapsProxyUrl
    const res = await fetchRemoteTextDetailed(grabMapsProxyUrl || normalizedUrl, {
      preflightHead: true,
      preferProxy: !isGrabMapsProxyRequest,
      useProxy: isGrabMapsProxyRequest ? 'never' : 'auto',
      headers: isGrabMapsProxyRequest ? buildGrabMapsProxyRequestHeaders() : undefined,
      timeoutMs: KNOWGRPH_SOURCE_IMPORT_LIMITS.urlTimeoutMs,
      maxBytes: KNOWGRPH_SOURCE_IMPORT_LIMITS.maxBytes,
    })
    if (res.ok === false) {
      store.updateSourceFile(
        id,
        buildSourceFileLifecycleState({
          status: 'error',
          error: describeFetchRemoteTextFailure(res),
          previousState: previous,
          preserveParsedState: true,
        }),
      )
      return
    }

    const nextName = deriveFilenameFromUrl(normalizedUrl, 'source.txt')
    await applyImportedTextToSourceFile({
      id,
      name: nextName,
      text: res.text,
      source: { kind: 'url', url: normalizedUrl },
    })
  } catch {
    store.updateSourceFile(
      id,
      buildSourceFileLifecycleState({
        status: 'error',
        error: 'Request failed',
        previousState: previous,
        preserveParsedState: true,
      }),
    )
  }
}

export function createMarkdownSourceFilesIngestIntegration(): MarkdownSourceFilesIngestIntegration {
  return {
    onImportLocal: args => void importLocalIntoActive(args),
    onImportUrl: args => void importUrlIntoActive(args),
    onExport: args => exportActiveSourceFile(args),
    onClear: args => clearActiveSourceFile(args),
  }
}

export async function hydratePendingUrlSourceFiles(): Promise<void> {
  const store = useGraphStore.getState()
  const sourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles : []
  const pending = sourceFiles.filter(file => {
    if (!file?.enabled) return false
    const source = file.source
    if (!source || source.kind !== 'url') return false
    const url = String(source.url || '').trim()
    if (!url) return false
    if (String(file.text || '').trim()) return false
    if (file.parsedGraphData) return false
    if (file.status === 'loading') return false
    return true
  })
  for (let i = 0; i < pending.length; i += 1) {
    const file = pending[i]!
    const source = file.source
    const url = source && source.kind === 'url' ? String(source.url || '').trim() : ''
    if (!url) continue
    await importUrlIntoActive({ fileId: file.id, url, format: 'markdown' })
  }
}
