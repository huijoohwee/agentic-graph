import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import {
  ancestorPathsForWorkspacePath,
  normalizeWorkspacePath,
  workspaceBasename,
  workspaceDocumentKey,
  workspaceExtLower,
  WORKSPACE_ROOT_PATH,
} from '@/features/workspace-fs/path'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { getWorkspaceSeedFiles } from '@/features/workspace-fs/workspaceFs'
import { sanitizeImportedMarkdownText } from '@/lib/markdown/sanitizeImportedMarkdown'
import {
  hydrateWorkspaceFileFromPendingLocalImport,
  isPendingLocalImportStubText,
  peekPendingWorkspaceLocalImport,
} from '@/features/markdown-workspace/workspaceImport'
import { buildSourceFileParseIdentityHash } from '@/features/source-files/sourceFileParseIdentity'
import { buildSourceFileLifecycleState, buildSourceFileRecord } from '@/features/source-files/sourceFileParsedState'
import { readWorkspaceActiveDocumentResolvedText } from '@/features/source-files/sourceFilesRuntimeActive'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { runInIdle } from '@/features/panels/utils/idle'
import { parseGeoJsonFeatureCollectionFromText } from '@/features/geospatial/geojsonParseCache'
import { buildGraphDataFromFeatureCollection } from '@/lib/graph/io/geojsonToGraphData'
import { tryBuildGeodataGraphDataFromJsonText } from '@/lib/graph/io/geodataJson'
import {
  cancelMarkdownWorkspaceIndexStart,
  scheduleMarkdownWorkspaceIndexStart,
} from './markdownWorkspaceRuntime.stateSync'
import { applyMarkdownWorkspaceErrorStatus, applyMarkdownWorkspaceSuccessStatus } from './markdownWorkspaceStatusTransitions'
import {
  clearMarkdownWorkspaceIndexingInFlight, markMarkdownWorkspaceIndexingInFlight,
  clearRuntimeTimeout,
  findWorkspaceSourceFileByPath,
  resolveWorkspaceDirtyState,
  scheduleRuntimeTimeout,
  type RuntimeTimeoutHandle,
} from './markdownWorkspaceRuntime.shared'
import {
  pushWorkspaceTextToActiveMarkdownDocument,
  writeWorkspaceFileAndSync,
} from './markdownWorkspaceRuntime.io'
import type { MarkdownWorkspaceRuntimeProgressStatusBindings } from './markdownWorkspaceRuntimeStatus'
import type { MarkdownWorkspaceRuntimeGetFs, MarkdownWorkspaceRuntimeSetActiveDocument } from './markdownWorkspaceRuntime.types'
import { resolveWorkspaceSourceFileInlineText, upsertWorkspaceEntryInlineText } from '@/features/workspace-fs/workspaceInlineText'
import { shouldTrustEmptyWorkspaceSelectionCache } from './markdownWorkspaceSelectionCache'
import { resolveMarkdownWorkspaceIndexingFreshText } from './markdownWorkspaceIndexingFreshText'
export { shouldTrustEmptyWorkspaceSelectionCache } from './markdownWorkspaceSelectionCache'

const WORKSPACE_SWITCH_HEAVY_PARSE_MAX_CHARS = 240_000
export type MarkdownWorkspaceIndexingArgs = MarkdownWorkspaceRuntimeProgressStatusBindings & {
  active: boolean
  viewerInlineEditActive: boolean
  contentMode: 'document' | 'widget'
  widgetAvailable: boolean
  activePath: WorkspacePath | null
  activeEntry: WorkspaceEntry | null
  activeEntryKind: string | null
  activeEntryText: string | undefined
  activeDocumentKey: string
  activeDocumentSourceUrl: string | null
  sourcesByPath: WorkspaceSourceIndex
  getFs: MarkdownWorkspaceRuntimeGetFs
  lastLoadedRef: React.MutableRefObject<{ path: WorkspacePath; text: string } | null>
  activePathRef: React.MutableRefObject<WorkspacePath | null>
  activeTextRef: React.MutableRefObject<string>
  userEditedActiveTextRef: React.MutableRefObject<boolean>
  repairedMissingWorkspaceFilesRef: React.MutableRefObject<Set<WorkspacePath>>
  lastIndexedByPathRef: React.MutableRefObject<Map<WorkspacePath, string>>
  indexJobRef: React.MutableRefObject<number>
  indexingInFlightRef: React.MutableRefObject<boolean>
  indexingInFlightPathRef: React.MutableRefObject<WorkspacePath | null>
  patchWorkspaceEntryInlineText: (path: WorkspacePath, text: string) => void
  setIndexingInFlight: React.Dispatch<React.SetStateAction<boolean>>
  setActiveTextProgrammatic: (text: string) => void
  setActiveMarkdownDocument: MarkdownWorkspaceRuntimeSetActiveDocument
  setEntries: React.Dispatch<React.SetStateAction<WorkspaceEntry[]>>
}

export function useMarkdownWorkspaceIndexing(args: MarkdownWorkspaceIndexingArgs) {
  const applyIndexedStatus = React.useCallback(() => {
    applyMarkdownWorkspaceSuccessStatus({
      setStatusWithAutoClear: args.setStatusWithAutoClear,
      label: 'Indexed',
    })
  }, [args.setStatusWithAutoClear])

  const applyLoadFailedStatus = React.useCallback(
    (error: unknown, options?: { includeDetail?: boolean; fallbackMessage?: string }) => {
      applyMarkdownWorkspaceErrorStatus({
        setStatusError: args.setStatusError,
        prefix: 'Load failed',
        error,
        fallbackMessage: options?.fallbackMessage || 'Request failed',
        includeDetail: options?.includeDetail,
      })
    },
    [args.setStatusError],
  )

  React.useEffect(() => {
    if (!args.active || args.viewerInlineEditActive) return
    if (args.contentMode === 'widget' && args.widgetAvailable) return
    const path = args.activePath
    if (!path || !args.activeEntry || args.activeEntryKind === 'folder') return
    // Prevent re-entrant indexing churn for the same active path while an index job is still running.
    if (args.indexingInFlightRef.current && args.indexingInFlightPathRef.current === path) return
    if (
      resolveWorkspaceDirtyState({
        path,
        lastLoadedRef: args.lastLoadedRef,
        activeTextRef: args.activeTextRef,
        userEditedActiveTextRef: args.userEditedActiveTextRef,
      })
    ) {
      return
    }

    const scheduledFor = path
    const effectJobId = ++args.indexJobRef.current
    const cachedText = typeof args.activeEntryText === 'string' ? String(args.activeEntryText ?? '') : null
    const sourceUrl = String(args.activeDocumentSourceUrl || '').trim()
    const sourceFileName = workspaceBasename(path) || 'source.md'
    const pendingLocalImport = peekPendingWorkspaceLocalImport(path)
    const indexLabel = pendingLocalImport?.kind === 'pdf' ? 'Indexing PDF' : 'Indexing'
    const bytesTotalHint = pendingLocalImport ? Math.max(0, Number(pendingLocalImport.file?.size || 0)) : null
    const lastLoaded = args.lastLoadedRef.current
    const canTrustEmptyCache = shouldTrustEmptyWorkspaceSelectionCache({
      cachedText,
      path,
      lastLoaded,
    })
    const isPendingStub = cachedText != null && isPendingLocalImportStubText(cachedText)
    const canUsePendingModelStub = (pendingLocalImport?.kind === 'glb' || pendingLocalImport?.kind === 'gltf') && isPendingStub
    const canUseCachedText =
      cachedText != null &&
      (cachedText !== '' || canTrustEmptyCache) &&
      !(pendingLocalImport && !canUsePendingModelStub && (cachedText === '' || isPendingStub))

    let cancelled = false
    scheduleMarkdownWorkspaceIndexStart(() => {
      if (cancelled || args.activePathRef.current !== scheduledFor) return
      void (async () => {
        let loadingLabelTimer: RuntimeTimeoutHandle | null = null
        try {
          markMarkdownWorkspaceIndexingInFlight(args, scheduledFor, cancelled)
          try {
            loadingLabelTimer = scheduleRuntimeTimeout(() => {
              if (bytesTotalHint && bytesTotalHint > 0) {
                args.setStatusProgress(indexLabel, 1, 1, 0, bytesTotalHint)
              } else {
                args.setStatusProgress(indexLabel)
              }
            }, 140)
          } catch {
            void 0
          }

          const text = await (async () => {
            const fs = await args.getFs()
            if (canUseCachedText) {
              const resolved = await readWorkspaceActiveDocumentResolvedText({
                activePath: path,
                currentText: cachedText as string,
                fs,
                preferCanonicalPathText: true,
              })
              return String(resolved || '').trim() ? resolved : cachedText as string
            }
            const hydrated = await hydrateWorkspaceFileFromPendingLocalImport({ fs, path })
            const loaded = hydrated ? hydrated.text : await fs.readFileText(path)
            if (loaded != null) return loaded

            const normalizedPath = normalizeWorkspacePath(path)
            if (args.repairedMissingWorkspaceFilesRef.current.has(normalizedPath)) return loaded
            args.repairedMissingWorkspaceFilesRef.current.add(normalizedPath)

            const seeds = await getWorkspaceSeedFiles()
            const seed = seeds.find(candidate => normalizeWorkspacePath(candidate.path) === normalizedPath)
            if (!seed) return loaded

            try {
              const parentFolders = ancestorPathsForWorkspacePath(normalizedPath)
              const parentPath = parentFolders[parentFolders.length - 1] || WORKSPACE_ROOT_PATH
              await ensureWorkspaceFolderTreeIfMissing({ folderPath: parentPath, fs })
              await fs.createFile({ parentPath, name: workspaceBasename(normalizedPath) || 'document.md', text: seed.text })
            } catch {
              void 0
            }

            return await fs.readFileText(normalizedPath)
          })()
          if (cancelled || args.activePathRef.current !== scheduledFor) return
          if (text == null) {
            applyLoadFailedStatus('Missing file contents', { fallbackMessage: 'Missing file contents' })
            return
          }
          if (resolveWorkspaceDirtyState({
            path,
            lastLoadedRef: args.lastLoadedRef,
            activeTextRef: args.activeTextRef,
            userEditedActiveTextRef: args.userEditedActiveTextRef,
          })) {
            return
          }

          const rawNext = String(text)
          const sanitized = (() => {
            if (!rawNext) return null
            if (!rawNext.includes('kgWebpageUrl') && !rawNext.includes('data:image/')) return null
            const res = sanitizeImportedMarkdownText(rawNext)
            return res.changed ? res.text : null
          })()
          const liveState = useGraphStore.getState()
          let nextText = resolveMarkdownWorkspaceIndexingFreshText({
            path,
            nextText: sanitized ?? rawNext,
            scheduledLastLoaded: lastLoaded,
            liveLoaded: args.lastLoadedRef.current,
            liveMarkdownDocumentName: liveState.markdownDocumentName,
            liveMarkdownDocumentText: liveState.markdownDocumentText,
          })
          const textHash = buildSourceFileParseIdentityHash({
            cacheNamespace: `workspace-import:${path}`,
            name: workspaceDocumentKey(path),
            text: nextText,
          })
          if (sanitized) {
            try {
              await writeWorkspaceFileAndSync({
                path,
                text: sanitized,
                getFs: args.getFs,
                lastLoadedRef: args.lastLoadedRef,
                setEntries: args.setEntries,
                createEntryIfMissing: !canUseCachedText,
                setActiveText: args.setActiveTextProgrammatic,
                activeDocumentKey: args.activeDocumentKey,
                activeDocumentSourceUrl: sourceUrl ? sourceUrl : null,
                setActiveMarkdownDocument: args.setActiveMarkdownDocument,
                resetParsedState: true,
              })
            } catch {
              void 0
            }
          } else {
            args.lastLoadedRef.current = { path, text: nextText }
            args.setActiveTextProgrammatic(nextText)
            if (!canUseCachedText || nextText !== cachedText) {
              args.setEntries(prev =>
                upsertWorkspaceEntryInlineText({
                  entries: prev,
                  path,
                  text: nextText,
                  createIfMissing: true,
                }),
              )
            }
            const previouslyIndexedHash = args.lastIndexedByPathRef.current.get(path)
            const alreadyIndexedForTextHash = typeof previouslyIndexedHash === 'string' && previouslyIndexedHash === textHash
            if (!alreadyIndexedForTextHash) {
              pushWorkspaceTextToActiveMarkdownDocument({
                activeDocumentKey: args.activeDocumentKey,
                activeDocumentSourceUrl: sourceUrl ? sourceUrl : null,
                setActiveMarkdownDocument: args.setActiveMarkdownDocument,
                text: nextText,
                applyViewPreset: false,
                applyToGraph: false,
                forceApplyToGraph: false,
                normalizeWebpageFrontmatterToMarkdown: false,
              })
            }
          }

          const wasIndexedForPath = (candidatePath: WorkspacePath, textHash: string): boolean => {
            const existing = args.lastIndexedByPathRef.current.get(candidatePath)
            return typeof existing === 'string' && existing === textHash
          }
          const rememberIndexedForPath = (candidatePath: WorkspacePath, textHash: string): void => {
            const map = args.lastIndexedByPathRef.current
            if (map.has(candidatePath)) map.delete(candidatePath)
            map.set(candidatePath, textHash)
            while (map.size > 24) {
              const oldest = map.keys().next().value as WorkspacePath | undefined
              if (!oldest) break
              map.delete(oldest)
            }
          }

          if (args.activeDocumentKey && nextText.trim()) {
            const hash = textHash
            const existingWorkspaceSourceForPath = findWorkspaceSourceFileByPath(path)
            const workspaceSourceAlreadyIndexedForSameHash = !!(
              existingWorkspaceSourceForPath &&
              String(existingWorkspaceSourceForPath?.status || '').toLowerCase() === 'parsed' &&
              existingWorkspaceSourceForPath?.error == null &&
              String(existingWorkspaceSourceForPath?.parsedTextHash || '') === hash &&
              wasIndexedForPath(path, hash)
            )
            if (workspaceSourceAlreadyIndexedForSameHash) {
              applyIndexedStatus()
              return
            }
            if (!wasIndexedForPath(path, hash)) {
              const ext = workspaceExtLower(path)
              const shouldRunWorkspaceSourceParsing = ext === '.geojson' || ext === '.json' || ext === '.html' || ext === '.htm'
              const shouldSkipHeavyWorkspaceSourceParsing = nextText.length > WORKSPACE_SWITCH_HEAVY_PARSE_MAX_CHARS
              if (shouldSkipHeavyWorkspaceSourceParsing) {
                rememberIndexedForPath(path, hash)
                applyIndexedStatus()
                return
              }
              if (!shouldRunWorkspaceSourceParsing) {
                rememberIndexedForPath(path, hash)
                applyIndexedStatus()
                return
              }
              const isCanvasHtmlExport = (() => {
                if (ext !== '.html' && ext !== '.htm') return false
                const sample = nextText.slice(0, 4096)
                const lower = sample.toLowerCase()
                if (!lower.includes('<!doctype html')) return false
                if (!sample.includes('id="kg-root"') && !sample.includes("id='kg-root'")) return false
                if (!sample.includes('#kg-stage') || !sample.includes('#kg-svgwrap')) return false
                return true
              })()
              if (isCanvasHtmlExport) {
                rememberIndexedForPath(path, hash)
                applyIndexedStatus()
                return
              }

              const jobId = effectJobId
              const isStaleJob = () =>
                cancelled || args.activePathRef.current !== scheduledFor || args.indexJobRef.current !== jobId
              if (bytesTotalHint && bytesTotalHint > 0) args.setStatusProgress(indexLabel, 1, 1, bytesTotalHint, bytesTotalHint)
              else args.setStatusProgress(indexLabel, 1, 1)

              const store = useGraphStore.getState()
              const workspaceSourcePath = `workspace:${path}`
              const inlineSourceText = resolveWorkspaceSourceFileInlineText(nextText)
              let existingWorkspaceSourceFile = findWorkspaceSourceFileByPath(path)
              const fileId = (() => {
                if (existingWorkspaceSourceFile) return existingWorkspaceSourceFile.id
                const id = `ws:${hashStringToHex(workspaceSourcePath)}`
                const url = sourceUrl ? sourceUrl : undefined
                const sourceRecord = url
                  ? ({ kind: 'url', url, path: workspaceSourcePath } as const)
                  : ({ kind: 'local', path: workspaceSourcePath } as const)
                store.addSourceFile(buildSourceFileRecord({
                  id,
                  name: sourceFileName,
                  text: inlineSourceText,
                  enabled: true,
                  source: sourceRecord,
                }))
                existingWorkspaceSourceFile = findWorkspaceSourceFileByPath(path)
                return id
              })()

              if (isStaleJob()) return
              const existing = existingWorkspaceSourceFile || findWorkspaceSourceFileByPath(path)
              const cachedGraph = existing?.parsedGraphData
              const cachedHash = typeof existing?.parsedTextHash === 'string' ? existing.parsedTextHash : ''
              const shouldReuseExistingWorkspaceSourceFile = !!(
                existing &&
                existing.enabled &&
                String(existing?.source?.path || '') === workspaceSourcePath &&
                cachedGraph &&
                cachedHash === hash
              )
              const workspaceSourceAlreadyMaterialized = !!(
                shouldReuseExistingWorkspaceSourceFile &&
                String(existing?.name || '') === sourceFileName &&
                String(existing?.text || '') === inlineSourceText &&
                String(existing?.status || '').toLowerCase() === 'parsed' &&
                existing?.error == null
              )
              if (workspaceSourceAlreadyMaterialized) {
                if (!isStaleJob()) rememberIndexedForPath(path, hash)
                return
              }

              if (shouldReuseExistingWorkspaceSourceFile) {
                if (isStaleJob()) return
                try {
                  store.updateSourceFile(fileId, {
                    name: sourceFileName,
                    text: inlineSourceText,
                    enabled: true,
                    ...buildSourceFileLifecycleState({
                      status: 'parsed',
                      parserId: existing?.parsedParserId,
                      textHash: existing?.parsedTextHash,
                      graphData: existing?.parsedGraphData,
                      previousState: existing,
                      preserveExistingRevision: true,
                    }),
                  })
                } catch {
                  void 0
                }
                if (!isStaleJob()) rememberIndexedForPath(path, hash)
                return
              }

              const isGeoCandidate = (() => {
                const lower = String(path || '').toLowerCase()
                return lower.endsWith('.geojson') || lower.endsWith('.json')
              })()
              try {
                store.updateSourceFile(fileId, {
                  name: sourceFileName,
                  text: inlineSourceText,
                  enabled: true,
                  ...buildSourceFileLifecycleState({
                    status: 'loading',
                    previousState: existing,
                    preserveParsedState: true,
                  }),
                })
              } catch {
                void 0
              }

              const geoGraph = isGeoCandidate
                ? await runInIdle(
                    () => {
                      const lowerPath = String(path || '').toLowerCase()
                      const mightBeGeoJson =
                        lowerPath.endsWith('.geojson') ||
                        (lowerPath.endsWith('.json') && /"type"\s*:\s*"FeatureCollection"/i.test(nextText.slice(0, 4096)))
                      if (mightBeGeoJson && nextText.length < 2_000_000) {
                        const normalized = parseGeoJsonFeatureCollectionFromText(nextText)
                        if (normalized) {
                          return buildGraphDataFromFeatureCollection({
                            featureCollection: normalized,
                            sourcePath: path,
                            sourceHash: hash,
                          })
                        }
                      }
                      const geodata = tryBuildGeodataGraphDataFromJsonText({ name: path, text: nextText, maxRecords: 5000 })
                      return geodata ? geodata.graphData : null
                    },
                    { timeoutMs: 650 },
                  )
                : null
              if (isStaleJob()) return

              if (geoGraph) {
                if (isStaleJob()) return
                try {
                  store.updateSourceFile(fileId, {
                    ...buildSourceFileLifecycleState({
                      status: 'parsed',
                      parserId: geoGraph.context === 'geodata' ? 'geodata' : 'geojson',
                      textHash: hash,
                      graphData: geoGraph,
                    }),
                  })
                } catch {
                  void 0
                }
                if (!isStaleJob()) rememberIndexedForPath(path, hash)
                return
              }

              if (cachedGraph && cachedHash === hash) {
                if (isStaleJob()) return
                try {
                  store.updateSourceFile(fileId, {
                    ...buildSourceFileLifecycleState({
                      status: 'parsed',
                      parserId: existing?.parsedParserId,
                      textHash: existing?.parsedTextHash,
                      graphData: existing?.parsedGraphData,
                      previousState: existing,
                      preserveExistingRevision: true,
                    }),
                  })
                } catch {
                  void 0
                }
              } else {
                if (isStaleJob()) return
                const { loadGraphDataFromTextViaParser } = (await import('@/features/parsers/loader')) as typeof import('@/features/parsers/loader')
                let lastStage = ''
                args.setStatusProgress('Parsing')
                const res = await runInIdle(
                  () =>
                    loadGraphDataFromTextViaParser(args.activeDocumentKey, nextText, {
                      applyToStore: false,
                      onProgress: stage => {
                        const s = String(stage || '').trim()
                        if (!s || s === lastStage) return
                        lastStage = s
                        args.setStatusProgress(s)
                      },
                    }),
                  { timeoutMs: 650 },
                )
                if (isStaleJob()) return
                const graphData = res?.graphData || null
                if (graphData) {
                  try {
                    store.updateSourceFile(fileId, {
                      ...buildSourceFileLifecycleState({
                        status: 'parsed',
                        parserId: typeof res?.parserId === 'string' ? res.parserId : undefined,
                        textHash: hash,
                        graphData,
                      }),
                    })
                  } catch {
                    void 0
                  }
                } else if (!isStaleJob()) {
                  try {
                    store.updateSourceFile(fileId, {
                      ...buildSourceFileLifecycleState({
                        status: 'error',
                        error: 'Parser returned empty graph',
                        parserId: typeof res?.parserId === 'string' ? res.parserId : undefined,
                        textHash: hash,
                        graphData: undefined,
                      }),
                    })
                  } catch {
                    void 0
                  }
                }
              }
              if (!isStaleJob()) rememberIndexedForPath(path, hash)
            }
          }

          applyIndexedStatus()
        } catch (e) {
          if (!cancelled && args.activePathRef.current === scheduledFor) {
            applyLoadFailedStatus(e)
          }
        } finally {
          if (args.indexingInFlightPathRef.current === scheduledFor) {
            clearMarkdownWorkspaceIndexingInFlight(args, scheduledFor, effectJobId)
          }
          clearRuntimeTimeout(loadingLabelTimer)
        }
      })()
    }, {
      path: scheduledFor,
      sourceUrl,
      sourceFileName,
    })
    return () => {
      cancelled = true
      cancelMarkdownWorkspaceIndexStart()
      if (args.indexingInFlightPathRef.current === scheduledFor) {
        clearMarkdownWorkspaceIndexingInFlight(args, scheduledFor)
      }
    }
  }, [
    applyIndexedStatus,
    applyLoadFailedStatus,
    args.active,
    args.activeDocumentKey,
    args.activeDocumentSourceUrl,
    args.activeEntry,
    args.activeEntryKind,
    args.activeEntryText,
    args.activePath,
    args.contentMode,
    args.getFs,
    args.indexingInFlightRef,
    args.indexingInFlightPathRef,
    args.setActiveMarkdownDocument,
    args.setIndexingInFlight,
    args.setActiveTextProgrammatic,
    args.setEntries,
    args.setStatusError,
    args.setStatusProgress,
    args.setStatusWithAutoClear,
    args.userEditedActiveTextRef,
    args.viewerInlineEditActive,
    args.widgetAvailable,
  ])
}
