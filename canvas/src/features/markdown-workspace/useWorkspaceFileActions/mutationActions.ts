import React from 'react'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { WORKSPACE_ROOT_PATH, normalizeWorkspacePath, workspaceDocumentKey } from '@/features/workspace-fs/path'
import { isInitializationWorkspacePath } from '@/features/workspace-fs/workspaceFs'
import {
  extractYamlFrontmatterBlock,
  normalizeWebpageFrontmatterView,
  parseWebpageFrontmatterMeta,
  readYamlFrontmatterValue,
  upsertWebpageFrontmatterMeta,
} from '@/lib/markdown/frontmatter'
import { fetchWorkspaceUrlContent } from '../workspaceImport'
import { loadWorkspaceSourceIndex, removeWorkspaceEntrySourcesForPrefix, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { runWorkspaceFsChangedBatch, suppressNextWorkspaceFsChangedEvent } from '@/features/workspace-fs/workspaceFsEvents'
import type { WorkspaceMutationActionsCtx } from './types'
import { syncWorkspaceTextState, writeWorkspaceFileAndSync } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.io'
import { cancelMarkdownWorkspaceAutosaveSync } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.stateSync'
import { settleWorkspaceSourceTextTransactions } from '@/features/workspace-fs/workspaceSourceTextTransaction'

export function useWorkspaceMutationActions(args: {
  core: { status: ReturnType<typeof import('./core').useWorkspaceStatusHelpers> }
  ctx: WorkspaceMutationActionsCtx
}) {
  const { status } = args.core
  const {
    getFs,
    refresh,
    openedPath,
    selectionPath,
    activeDocumentKey,
    setActiveText,
    setEntries,
    lastLoadedRef,
    setActiveMarkdownDocument,
    setActivePathSafe,
    setSelectionPathSafe,
  } = args.ctx

  const writeMutationWorkspaceText = React.useCallback(
    async (
      path: WorkspacePath,
      text: string,
      options?: {
        getFsOverride?: () => ReturnType<typeof getFs>
        activeDocumentSourceUrl?: string | null
      },
    ) => {
      const normalized = normalizeWorkspacePath(path)
      const normalizedDocumentKey = workspaceDocumentKey(normalized)
      const synchronizeActiveDocument =
        openedPath === normalized ||
        (!!normalizedDocumentKey && normalizedDocumentKey === activeDocumentKey)
      await writeWorkspaceFileAndSync({
        path: normalized,
        text,
        getFs: options?.getFsOverride || getFs,
        lastLoadedRef,
        setEntries,
        synchronizeActiveDocument,
        setActiveText,
        activeDocumentKey,
        activeDocumentSourceUrl: options?.activeDocumentSourceUrl ?? null,
        setActiveMarkdownDocument,
        resetParsedState: true,
      })
    },
    [activeDocumentKey, getFs, lastLoadedRef, openedPath, setActiveMarkdownDocument, setActiveText, setEntries],
  )

  const syncRenamedActiveWorkspacePath = React.useCallback(
    async (fs: Awaited<ReturnType<typeof getFs>>, remappedOpenedPath: WorkspacePath) => {
      setActivePathSafe(remappedOpenedPath)
      const latestText = String((await fs.readFileText(remappedOpenedPath)) || '')
      syncWorkspaceTextState({
        path: remappedOpenedPath,
        text: latestText,
        lastLoadedRef,
        setActiveText,
        activeDocumentKey: workspaceDocumentKey(remappedOpenedPath) || activeDocumentKey,
        activeDocumentSourceUrl: null,
        setActiveMarkdownDocument,
      })
    },
    [activeDocumentKey, lastLoadedRef, setActiveMarkdownDocument, setActivePathSafe, setActiveText],
  )

  const refreshFileFromSource = React.useCallback(
    async (path: WorkspacePath) => {
      const normalized = normalizeWorkspacePath(path)
      const index = loadWorkspaceSourceIndex()
      const src = index[normalized]
      if (!src || src.kind !== 'url' || !String(src.url || '').trim()) {
        status.setStatusError('No URL source')
        return
      }
      status.setStatusProgress('Refreshing')
      try {
        const fs = await getFs()
        const prevText = await fs.readFileText(normalized).catch(() => '')
        const prevFm = prevText ? extractYamlFrontmatterBlock(prevText) : null
        const prevMeta = prevText ? parseWebpageFrontmatterMeta(prevText) : null
        const prevViewRaw = prevFm ? readYamlFrontmatterValue(prevFm.rawBlock, 'kgWebpageView') : ''
        const prevHasImages = !!(prevFm && readYamlFrontmatterValue(prevFm.rawBlock, 'kgWebpageIncludeImages'))
        const prevHasFidelity = !!(prevFm && readYamlFrontmatterValue(prevFm.rawBlock, 'kgWebpageFidelityLevel'))

        const desiredView = prevViewRaw === 'html' ? 'html' : prevViewRaw === 'json' ? 'json' : prevViewRaw === 'markdown' ? 'markdown' : ''
        const viewHint = desiredView === 'markdown' ? 'markdown' : desiredView === 'json' ? 'json' : desiredView === 'html' ? 'html' : undefined

        const fetched = await fetchWorkspaceUrlContent(src.url, {
          mode: 'refresh',
          viewHint,
          onProgress: p => status.setStatusProgress('Refreshing', p, 100),
        })
        let nextText = fetched.text
        if (prevMeta && prevMeta.url) {
          if (desiredView) nextText = normalizeWebpageFrontmatterView(nextText, desiredView as 'html' | 'json' | 'markdown')
          if (prevHasImages || prevHasFidelity || prevMeta.siteRootRel) {
            nextText = upsertWebpageFrontmatterMeta(nextText, {
              url: prevMeta.url,
              view: desiredView === 'json' ? 'json' : desiredView === 'html' ? 'html' : 'markdown',
              siteRootRel: prevMeta.siteRootRel,
              includeImages: prevHasImages ? prevMeta.includeImages : undefined,
              fidelityLevel: prevHasFidelity ? prevMeta.fidelityLevel : undefined,
            })
          }
        }

        await writeMutationWorkspaceText(normalized, nextText, {
          activeDocumentSourceUrl: fetched.normalizedUrl,
        })
        status.setStatusInfo('Refreshed')
      } catch (e) {
        status.setStatusError(`Refresh failed: ${String((e as { message?: unknown })?.message ?? e)}`)
      }
    },
    [getFs, status, writeMutationWorkspaceText],
  )

  const deleteEntry = React.useCallback(
    async (path: WorkspacePath) => {
      const normalized = normalizeWorkspacePath(path)
      if (isInitializationWorkspacePath(normalized)) {
        status.setStatusError('Delete disabled for initialization file')
        return
      }
      status.setStatusProgress('Deleting')
      try {
        const fs = await getFs()
        if (openedPath === normalized || openedPath?.startsWith(`${normalized}/`)) {
          cancelMarkdownWorkspaceAutosaveSync(openedPath)
          lastLoadedRef.current = null
          setActivePathSafe(WORKSPACE_ROOT_PATH)
          setSelectionPathSafe(WORKSPACE_ROOT_PATH)
          setActiveText('')
        }
        await settleWorkspaceSourceTextTransactions()
        await runWorkspaceFsChangedBatch(async () => {
          suppressNextWorkspaceFsChangedEvent()
          await fs.deleteEntry(normalized)
        })
        removeWorkspaceEntrySourcesForPrefix(normalized)
        await refresh()
        status.setStatusInfo('Deleted')
      } catch (e) {
        status.setStatusError(`Delete failed: ${String((e as { message?: unknown })?.message ?? e)}`)
      }
    },
    [getFs, refresh, status, openedPath, lastLoadedRef, setActivePathSafe, setSelectionPathSafe, setActiveText],
  )

  const renameEntry = React.useCallback(
    async (path: WorkspacePath, nextNameRaw: string) => {
      const sourcePath = normalizeWorkspacePath(path)
      const nextName = String(nextNameRaw || '').trim()
      if (!sourcePath || sourcePath === WORKSPACE_ROOT_PATH) return
      if (isInitializationWorkspacePath(sourcePath)) {
        status.setStatusError('Rename disabled for initialization file')
        return
      }
      if (!nextName || nextName.includes('/') || nextName.includes('\\')) {
        status.setStatusError('Invalid name')
        return
      }
      status.setStatusProgress('Renaming')
      try {
        const fs = await getFs()
        const list = await fs.listEntries()
        const target = list.find(e => normalizeWorkspacePath(e.path) === sourcePath)
        if (!target) {
          status.setStatusError('Path not found')
          return
        }
        const parentPath = normalizeWorkspacePath(target.parentPath || WORKSPACE_ROOT_PATH)
        const nextPath = normalizeWorkspacePath(`${parentPath === WORKSPACE_ROOT_PATH ? '' : parentPath}/${nextName}`)
        if (nextPath === sourcePath) {
          status.setStatusInfo('Unchanged')
          return
        }
        if (list.some(e => normalizeWorkspacePath(e.path) === nextPath)) {
          status.setStatusError('Name already exists')
          return
        }

        const sourceIndex = loadWorkspaceSourceIndex()
        const sourcePrefix = sourcePath.endsWith('/') ? sourcePath : `${sourcePath}/`
        const nextPrefix = nextPath.endsWith('/') ? nextPath : `${nextPath}/`
        await runWorkspaceFsChangedBatch(async () => {
          suppressNextWorkspaceFsChangedEvent()
          if (target.kind === 'file') {
            const text = String((await fs.readFileText(sourcePath)) || '')
            await fs.createFile({ parentPath, name: nextName, text })
          } else {
            await fs.createFolder({ parentPath, name: nextName })
            const descendants = list
              .filter(e => normalizeWorkspacePath(e.path).startsWith(sourcePrefix))
              .sort((a, b) => normalizeWorkspacePath(a.path).length - normalizeWorkspacePath(b.path).length)
            for (const entry of descendants) {
              const oldPath = normalizeWorkspacePath(entry.path)
              const rel = oldPath.slice(sourcePrefix.length)
              const mapped = normalizeWorkspacePath(`${nextPrefix}${rel}`)
              const mappedParent = normalizeWorkspacePath(entry.parentPath ? `${nextPath}/${normalizeWorkspacePath(entry.parentPath).slice(sourcePath.length + 1)}` : nextPath)
              if (entry.kind === 'folder') {
                await fs.createFolder({ parentPath: mappedParent, name: normalizeWorkspacePath(mapped).split('/').pop() || 'folder' })
              } else {
                const text = String((await fs.readFileText(oldPath)) || '')
                await fs.createFile({ parentPath: mappedParent, name: normalizeWorkspacePath(mapped).split('/').pop() || 'file.md', text })
              }
            }
          }

          await fs.deleteEntry(sourcePath)
        })
        removeWorkspaceEntrySourcesForPrefix(sourcePath)
        const applySourceMove = (fromPath: WorkspacePath, toPath: WorkspacePath) => {
          const src = sourceIndex[normalizeWorkspacePath(fromPath)]
          if (!src) return
          setWorkspaceEntrySource(toPath, src)
        }
        applySourceMove(sourcePath, nextPath)
        for (const [k] of Object.entries(sourceIndex)) {
          const normalized = normalizeWorkspacePath(k)
          if (!normalized.startsWith(sourcePrefix)) continue
          const rel = normalized.slice(sourcePrefix.length)
          applySourceMove(normalized, normalizeWorkspacePath(`${nextPrefix}${rel}`))
        }

        if (selectionPath && normalizeWorkspacePath(selectionPath).startsWith(sourcePrefix)) {
          const rel = normalizeWorkspacePath(selectionPath).slice(sourcePrefix.length)
          setSelectionPathSafe(normalizeWorkspacePath(`${nextPrefix}${rel}`))
        } else if (selectionPath && normalizeWorkspacePath(selectionPath) === sourcePath) {
          setSelectionPathSafe(nextPath)
        }
        const remappedOpenedPath = (() => {
          if (!openedPath) return null
          const normalizedOpened = normalizeWorkspacePath(openedPath)
          if (normalizedOpened === sourcePath) return nextPath
          if (normalizedOpened.startsWith(sourcePrefix)) {
            const rel = normalizedOpened.slice(sourcePrefix.length)
            return normalizeWorkspacePath(`${nextPrefix}${rel}`)
          }
          return null
        })()
        if (remappedOpenedPath) {
          await syncRenamedActiveWorkspacePath(fs, remappedOpenedPath)
        }

        await refresh()
        status.setStatusInfo('Renamed')
      } catch (e) {
        status.setStatusError(`Rename failed: ${String((e as { message?: unknown })?.message ?? e)}`)
      }
    },
    [
      getFs,
      openedPath,
      refresh,
      selectionPath,
      setSelectionPathSafe,
      status,
      syncRenamedActiveWorkspacePath,
    ],
  )

  const clearFile = React.useCallback(
    async (path: WorkspacePath) => {
      const normalized = normalizeWorkspacePath(path)
      status.setStatusProgress('Clearing')
      try {
        await writeMutationWorkspaceText(normalized, '')
        status.setStatusInfo('Cleared')
      } catch (e) {
        status.setStatusError(`Clear failed: ${String((e as { message?: unknown })?.message ?? e)}`)
      }
    },
    [status, writeMutationWorkspaceText],
  )

  const onDeleteEntry = React.useCallback((path: WorkspacePath) => {
    void deleteEntry(path)
  }, [deleteEntry])

  const onRenameEntry = React.useCallback((path: WorkspacePath, nextName: string) => {
    void renameEntry(path, nextName)
  }, [renameEntry])

  const onClearFile = React.useCallback((path: WorkspacePath) => {
    void clearFile(path)
  }, [clearFile])

  return {
    refreshFileFromSource,
    onDeleteEntry,
    onRenameEntry,
    onClearFile,
  }
}
