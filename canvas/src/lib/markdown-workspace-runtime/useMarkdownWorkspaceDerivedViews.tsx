import type { MarkdownWorkspaceLoadedSnapshot } from './markdownWorkspaceRuntime.types'
import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { abortControllerSafely, isAsyncRequestStale } from '@/lib/async/asyncGuards'
import { runAsyncEffect } from '@/lib/async/asyncEffectRunner'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { beginProgressSession, createDefaultProgressSession, failProgressSession, finishProgressSession } from '@/lib/progress/progressTicker'
import { UI_TOAST_TTL_MS } from '@/lib/ui/toastTiming'
import { fetchPdfWorkspaceDoc } from '@/lib/pdf/pdfWorkspaceClient'
import { fetchWebpageMarkdown } from '@/lib/net/remoteMarkdownConversions'
import { parsePdfWorkspaceFrontmatter } from '@/lib/pdf/pdfWorkspaceFrontmatter'
import { applyMarkdownWorkspaceErrorStatus, applyMarkdownWorkspaceSuccessStatus } from './markdownWorkspaceStatusTransitions'
import {
  isFrontmatterOnlyDoc,
  parseWebpageFrontmatterMeta,
  parseWebsiteImportFrontmatterMeta,
  upsertWebpageFrontmatterMeta,
  type WebpageViewMode,
} from '@/lib/markdown/frontmatter'
import { fetchWebpageConversionJsonViaConvert, fetchWebsiteImportArtifact } from '@/lib/websites/webpageIframeSrcdoc'
import { websiteImportArtifactKindForWebpageView } from '@/lib/websites/websiteImportArtifactKind'
import { workspaceDocumentKey } from '@/features/workspace-fs/path'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { resolveAuthoritativeWorkspaceText, writeWorkspaceFileAndSync } from './markdownWorkspaceRuntime.io'
import type { MarkdownWorkspaceRuntimeProgressStatusBindings } from './markdownWorkspaceRuntimeStatus'
import type { MarkdownWorkspaceRuntimeGetFs, MarkdownWorkspaceRuntimeSetActiveDocument } from './markdownWorkspaceRuntime.types'

export type MarkdownWorkspaceDerivedViewsArgs = MarkdownWorkspaceRuntimeProgressStatusBindings & {
  activePath: WorkspacePath | null
  activeText: string
  layoutMode: string
  getFs: MarkdownWorkspaceRuntimeGetFs
  sourcesByPath: WorkspaceSourceIndex
  lastLoadedRef: React.MutableRefObject<MarkdownWorkspaceLoadedSnapshot | null>
  activeTextRef: React.MutableRefObject<string>
  userEditedActiveTextRef: React.MutableRefObject<boolean>
  patchWorkspaceEntryInlineText: (path: WorkspacePath, text: string) => void
  setActiveTextProgrammatic: (next: string) => void
  setActiveMarkdownDocument: MarkdownWorkspaceRuntimeSetActiveDocument
}

function createDerivedViewStatusAdapter(args: {
  setStatusError: (label: string) => void
  setStatusWithAutoClear: (label: string, ttlMs?: number) => void
}) {
  return {
    loaded: () =>
      applyMarkdownWorkspaceSuccessStatus({
        setStatusWithAutoClear: args.setStatusWithAutoClear,
        label: 'Loaded',
        ttlMs: UI_TOAST_TTL_MS.statusAutoCloseFast,
      }),
    updated: () =>
      applyMarkdownWorkspaceSuccessStatus({
        setStatusWithAutoClear: args.setStatusWithAutoClear,
        label: 'Updated',
        ttlMs: UI_TOAST_TTL_MS.statusAutoCloseFast,
      }),
    loadFailed: (error?: unknown, options?: { includeDetail?: boolean; fallbackMessage?: string }) =>
      applyMarkdownWorkspaceErrorStatus({
        setStatusError: args.setStatusError,
        prefix: 'Load failed',
        error,
        fallbackMessage: options?.fallbackMessage || 'Request failed',
        includeDetail: options?.includeDetail,
      }),
    updateFailed: (error?: unknown, options?: { fallbackMessage?: string }) =>
      applyMarkdownWorkspaceErrorStatus({
        setStatusError: args.setStatusError,
        prefix: 'Update failed',
        error,
        fallbackMessage: options?.fallbackMessage || 'Request failed',
      }),
    reportError: (error?: unknown, options?: { fallbackMessage?: string }) =>
      applyMarkdownWorkspaceErrorStatus({
        setStatusError: args.setStatusError,
        error,
        fallbackMessage: options?.fallbackMessage || 'Request failed',
      }),
  }
}

export function useMarkdownWorkspaceDerivedViews(args: MarkdownWorkspaceDerivedViewsArgs) {
  const {
    activePath,
    activeText,
    layoutMode,
    getFs,
    sourcesByPath,
    lastLoadedRef,
    activeTextRef,
    userEditedActiveTextRef,
    patchWorkspaceEntryInlineText,
    setActiveTextProgrammatic,
    setActiveMarkdownDocument,
    setStatusError,
    setStatusProgress,
    setStatusWithAutoClear,
  } = args
  const statusAdapter = React.useMemo(
    () =>
      createDerivedViewStatusAdapter({
        setStatusError,
        setStatusWithAutoClear,
      }),
    [setStatusError, setStatusWithAutoClear],
  )
  const pdfWorkspaceMeta = React.useMemo(() => {
    if (!activePath) return null
    if (!activePath.endsWith('.md') && !activePath.endsWith('.markdown')) return null
    const t = String(activeText || '')
    if (!t.startsWith('---')) return null
    return parsePdfWorkspaceFrontmatter(t)
  }, [activePath, activeText])

  const webpageWorkspaceMeta = React.useMemo(() => {
    if (!activePath) return null
    if (!activePath.endsWith('.md') && !activePath.endsWith('.markdown')) return null
    const t = String(activeText || '')
    if (!t.startsWith('---')) return null
    return parseWebpageFrontmatterMeta(t)
  }, [activePath, activeText])

  const websiteImportMeta = React.useMemo(() => {
    if (!activePath) return null
    if (!activePath.endsWith('.md') && !activePath.endsWith('.markdown')) return null
    const t = String(activeText || '')
    if (!t.startsWith('---')) return null
    return parseWebsiteImportFrontmatterMeta(t)
  }, [activePath, activeText])

  const [pdfWorkspaceViewerTextOverride, setPdfWorkspaceViewerTextOverride] = React.useState<string | null>(null)
  const [webpageWorkspaceEditorTextOverride, setWebpageWorkspaceEditorTextOverride] = React.useState<string | null>(null)
  const [webpageWorkspaceViewerTextOverride, setWebpageWorkspaceViewerTextOverride] = React.useState<string | null>(null)
  const persistDerivedWorkspaceText = React.useCallback(
    async (nextText: string, options?: { refreshActiveDocument?: boolean }) => {
      if (!activePath) return
      const refreshActiveDocument = options?.refreshActiveDocument === true
      const docKey = refreshActiveDocument ? workspaceDocumentKey(activePath) : ''
      const source = refreshActiveDocument ? sourcesByPath[activePath] : null
      const sourceUrl = source && source.kind === 'url' ? String(source.url || '').trim() : ''
      await writeWorkspaceFileAndSync({
        path: activePath,
        text: nextText,
        getFs,
        lastLoadedRef,
        patchWorkspaceEntryInlineText,
        setActiveText: setActiveTextProgrammatic,
        activeDocumentKey: docKey || undefined,
        activeDocumentSourceUrl: docKey ? (sourceUrl || null) : undefined,
        setActiveMarkdownDocument: docKey ? setActiveMarkdownDocument : undefined,
        resetParsedState: true,
      })
    },
    [
      activePath,
      getFs,
      lastLoadedRef,
      patchWorkspaceEntryInlineText,
      setActiveMarkdownDocument,
      setActiveTextProgrammatic,
      sourcesByPath,
    ],
  )

  const pdfWorkspaceFetchArgs = React.useMemo(() => {
    const docId = pdfWorkspaceMeta ? String(pdfWorkspaceMeta.docId || '').trim() : ''
    const outputDirRel = pdfWorkspaceMeta ? String(pdfWorkspaceMeta.outputDirRel || '').trim() : ''
    if (!docId) return null
    return { docId, outputDirRel }
  }, [pdfWorkspaceMeta])
  const pdfWorkspaceFetchKey = pdfWorkspaceFetchArgs ? `${pdfWorkspaceFetchArgs.docId}:${pdfWorkspaceFetchArgs.outputDirRel}` : ''

  React.useEffect(() => {
    if (layoutMode !== 'viewer' && layoutMode !== 'split') {
      setPdfWorkspaceViewerTextOverride(null)
      return
    }
    if (!pdfWorkspaceFetchKey || !pdfWorkspaceFetchArgs) {
      setPdfWorkspaceViewerTextOverride(null)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 60_000)
    void (async () => {
      try {
        const res = await fetchPdfWorkspaceDoc({
          docId: pdfWorkspaceFetchArgs.docId,
          outputDirRel: pdfWorkspaceFetchArgs.outputDirRel,
          signal: controller.signal,
        })
        if (isAsyncRequestStale({ cancelled })) return
        if (res.ok !== true) {
          setPdfWorkspaceViewerTextOverride(null)
          return
        }
        setPdfWorkspaceViewerTextOverride(String(res.markdown || ''))
      } catch {
        if (!cancelled) setPdfWorkspaceViewerTextOverride(null)
      }
    })()
    return () => {
      cancelled = true
      clearTimeout(t)
      abortControllerSafely(controller)
    }
  }, [layoutMode, pdfWorkspaceFetchArgs, pdfWorkspaceFetchKey])

  const webpageUrl = webpageWorkspaceMeta?.url ? String(webpageWorkspaceMeta.url || '').trim() : ''
  const webpageView = webpageWorkspaceMeta?.view
  const websiteImportKey = (() => {
    const importId = String(websiteImportMeta?.importId || '').trim()
    const nodeId = String(websiteImportMeta?.nodeId || '').trim()
    const outputDirRel = String(websiteImportMeta?.outputDirRel || '').trim()
    if (!importId || !nodeId) return ''
    return `${importId}:${nodeId}:${outputDirRel}`
  })()

  React.useEffect(() => {
    const url = webpageUrl
    const view = webpageView
    if (!url || !view || view === 'markdown' || view === 'html') {
      setWebpageWorkspaceEditorTextOverride(null)
      setWebpageWorkspaceViewerTextOverride(null)
      return
    }

    const progressSession = createDefaultProgressSession({
      onProgress: p => setStatusProgress(view === 'json' ? 'Loading JSON' : 'Loading view', p, 100),
    })
    return runAsyncEffect({
      onCleanup: progressSession.cleanup,
      onError: () => {
        progressSession.stop()
        setWebpageWorkspaceEditorTextOverride(JSON.stringify({ ok: false, error: 'Request failed' }, null, 2))
        setWebpageWorkspaceViewerTextOverride(null)
        statusAdapter.loadFailed(undefined, { includeDetail: false })
      },
      run: async ({ signal, isStale }) => {
        beginProgressSession({
          progressSession,
          beforeStart: () => setStatusProgress(view === 'json' ? 'Loading JSON' : 'Loading view'),
        })
        if (websiteImportKey) {
          const [importId, nodeId, outputDirRelRaw] = websiteImportKey.split(':')
          const outputDirRel = String(outputDirRelRaw || useGraphStore.getState().websiteImportOutputDirRel || '').trim()
          const kind = websiteImportArtifactKindForWebpageView(view)
          try {
            const effective = await fetchWebsiteImportArtifact({
              importId: String(importId || ''),
              nodeId: String(nodeId || ''),
              outputDirRel,
              kind,
              signal,
            })
            if (isStale()) return
            const clipped = effective.length > 200_000 ? `${effective.slice(0, 200_000)}\n\n(clipped)\n` : effective
            setWebpageWorkspaceEditorTextOverride(clipped)
            setWebpageWorkspaceViewerTextOverride(view === 'json' ? `\`\`\`json\n${clipped}\n\`\`\`\n` : null)
            finishProgressSession({
              progressSession,
              finalPercentage: 100,
              afterFinish: statusAdapter.loaded,
            })
          } catch (err) {
            if (isStale()) return
            const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message || '') : ''
            const errorText =
              view === 'json'
                ? JSON.stringify({ ok: false, error: msg || 'Load failed' }, null, 2)
                : `Load failed: ${msg || 'Request failed'}\n`
            setWebpageWorkspaceEditorTextOverride(errorText)
            setWebpageWorkspaceViewerTextOverride(view === 'json' ? `\`\`\`json\n${errorText}\n\`\`\`\n` : null)
            failProgressSession({
              progressSession,
              afterStop: () => statusAdapter.loadFailed(msg, { fallbackMessage: 'Request failed' }),
            })
          }
          return
        }

        if (view === 'json') {
          const includeImages = useGraphStore.getState().webpageImportIncludeImages ?? true
          try {
            const rawJson = await fetchWebpageConversionJsonViaConvert({ url, includeImages, signal })
            if (isStale()) return
            const pretty = (() => {
              const t = String(rawJson || '')
              try {
                return JSON.stringify(JSON.parse(t) as unknown, null, 2)
              } catch {
                return t
              }
            })()
            setWebpageWorkspaceEditorTextOverride(pretty)
            setWebpageWorkspaceViewerTextOverride(`\`\`\`json\n${pretty}\n\`\`\`\n`)
            finishProgressSession({
              progressSession,
              finalPercentage: 100,
              afterFinish: statusAdapter.loaded,
            })
          } catch (err) {
            if (isStale()) return
            const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message || '') : ''
            const errorText = JSON.stringify({ ok: false, error: msg || 'Request failed' }, null, 2)
            setWebpageWorkspaceEditorTextOverride(errorText)
            setWebpageWorkspaceViewerTextOverride(`\`\`\`json\n${errorText}\n\`\`\`\n`)
            failProgressSession({
              progressSession,
              afterStop: () => statusAdapter.loadFailed(msg, { fallbackMessage: 'Request failed' }),
            })
          }
          return
        }

        setWebpageWorkspaceEditorTextOverride(null)
        setWebpageWorkspaceViewerTextOverride(null)
        progressSession.finish(100)
      },
    })
  }, [setStatusProgress, statusAdapter, webpageUrl, webpageView, websiteImportKey])

  const switchActiveWebpageWorkspaceView = React.useCallback(
    async (view: WebpageViewMode) => {
      if (!activePath || !webpageWorkspaceMeta) return
      if (webpageWorkspaceMeta.view === view) return
      const progressSession = createDefaultProgressSession({
        onProgress: p => setStatusProgress('Updating view', p, 100),
      })
      try {
        beginProgressSession({
          progressSession,
          beforeStart: () => setStatusProgress('Updating view'),
        })

        if (view === 'markdown') {
          setWebpageWorkspaceEditorTextOverride(prev => (prev == null ? prev : null))
          setWebpageWorkspaceViewerTextOverride(prev => (prev == null ? prev : null))
        }

        const prevText = await resolveAuthoritativeWorkspaceText({
          path: activePath,
          getFs,
          lastLoadedRef,
          activeTextRef,
          userEditedActiveTextRef,
        })

        const nextText = await (async () => {
          if (view !== 'markdown') return upsertWebpageFrontmatterMeta(prevText, { url: webpageWorkspaceMeta.url, view })
          if (!isFrontmatterOnlyDoc(prevText)) return upsertWebpageFrontmatterMeta(prevText, { url: webpageWorkspaceMeta.url, view })

          const store = useGraphStore.getState()
          const includeImages = webpageWorkspaceMeta.includeImages ?? (store.webpageImportIncludeImages !== false)
          const isHttp = (() => {
            const u = String(webpageWorkspaceMeta.url || '').trim().toLowerCase()
            return u.startsWith('http://') || u.startsWith('https://')
          })()

          if (!isHttp && websiteImportMeta?.importId && websiteImportMeta?.nodeId) {
            const outputDirRel = String(
              websiteImportMeta.outputDirRel || useGraphStore.getState().websiteImportOutputDirRel || '',
            ).trim()
            const outputDirQuery = outputDirRel ? `outputDirRel=${encodeURIComponent(outputDirRel)}&` : ''
            const rawRes = await fetch(
              `/__website_import/artifact?${outputDirQuery}importId=${encodeURIComponent(
                websiteImportMeta.importId,
              )}&nodeId=${encodeURIComponent(websiteImportMeta.nodeId)}&kind=markdown`,
            )
            if (!rawRes.ok) return upsertWebpageFrontmatterMeta(prevText, { url: webpageWorkspaceMeta.url, view })
            const raw = String((await rawRes.text()) || '')
            return upsertWebpageFrontmatterMeta(raw, {
              url: webpageWorkspaceMeta.url,
              view: 'markdown',
              includeImages: webpageWorkspaceMeta.includeImages,
              fidelityLevel: webpageWorkspaceMeta.fidelityLevel,
            })
          }

          const res = await fetchWebpageMarkdown(webpageWorkspaceMeta.url, { includeImages })
          if (!res || res.ok !== true) return upsertWebpageFrontmatterMeta(prevText, { url: webpageWorkspaceMeta.url, view })
          return upsertWebpageFrontmatterMeta(String(res.markdown || ''), {
            url: webpageWorkspaceMeta.url,
            view: 'markdown',
            includeImages: webpageWorkspaceMeta.includeImages,
            fidelityLevel: webpageWorkspaceMeta.fidelityLevel,
          })
        })()

        await persistDerivedWorkspaceText(nextText)
        finishProgressSession({
          progressSession,
          finalPercentage: 100,
          afterFinish: statusAdapter.updated,
        })
      } catch (e) {
        failProgressSession({
          progressSession,
          afterStop: () => statusAdapter.updateFailed(e),
        })
      }
    },
    [activePath, activeTextRef, getFs, lastLoadedRef, persistDerivedWorkspaceText, setStatusProgress, statusAdapter, userEditedActiveTextRef, webpageWorkspaceMeta, websiteImportMeta],
  )

  const updateActiveWebpageWorkspaceMeta = React.useCallback(
    async (patch: { fidelityLevel?: 1 | 2 | 3 | 4 }) => {
      if (!activePath || !webpageWorkspaceMeta) return
      try {
        setStatusProgress('Updating view')
        const prevText = await resolveAuthoritativeWorkspaceText({
          path: activePath,
          getFs,
          lastLoadedRef,
          activeTextRef,
          userEditedActiveTextRef,
        })
        const meta = parseWebpageFrontmatterMeta(prevText) || webpageWorkspaceMeta
        const nextText = upsertWebpageFrontmatterMeta(prevText, {
          url: meta.url,
          view: meta.view,
          siteRootRel: meta.siteRootRel,
          fidelityLevel: patch.fidelityLevel,
        })
        await persistDerivedWorkspaceText(nextText)
        statusAdapter.updated()
      } catch (e) {
        statusAdapter.updateFailed(e)
      }
    },
    [activePath, activeTextRef, getFs, lastLoadedRef, persistDerivedWorkspaceText, setStatusProgress, statusAdapter, userEditedActiveTextRef, webpageWorkspaceMeta],
  )

  return {
    pdfWorkspaceMeta,
    webpageWorkspaceMeta,
    websiteImportMeta,
    pdfWorkspaceViewerTextOverride,
    webpageWorkspaceEditorTextOverride,
    webpageWorkspaceViewerTextOverride,
    switchActiveWebpageWorkspaceView,
    updateActiveWebpageWorkspaceMeta,
  }
}
