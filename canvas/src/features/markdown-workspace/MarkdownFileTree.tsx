import React from 'react'
import { ChevronDown, ChevronRight, FileText, Folder, Link as LinkIcon, ShieldCheck } from 'lucide-react'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { WORKSPACE_ROOT_PATH } from '@/features/workspace-fs/path'
import { sortWorkspaceEntriesForExplorer } from '@/features/workspace-fs/workspaceFs'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { normalizeImportUrlInput } from '@/lib/url'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { subscribePointerDownDismiss, subscribeWindowEscapeDismiss } from '@/lib/browser/dismissEvents'
import { buildMarkdownFileTreeContextMenuItems } from './markdownFileTreeContextMenuItems'
import { MarkdownFileTreeRowButton } from './MarkdownFileTreeRowButton'
import { clampOverlayTopLeftFullyInViewport } from '@/lib/ui/overlayClamp'
import { excludeLegacyWorkspaceSourceEntries } from '@/features/workspace-fs/workspaceLegacySourceRoots'
import { isAgenticGraphWorkspaceSeedsRootPath } from 'grph-shared/collaboration/documentRepositoryAuthority'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_NARROW_MENU_PANEL_CLASSNAME,
  UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_LIST_CLASSNAME,
  UI_RESPONSIVE_MENU_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

type Node = {
  entry: WorkspaceEntry
  children: Node[]
}

const buildTree = (entries: WorkspaceEntry[]): Node => {
  const byParent = new Map<string, WorkspaceEntry[]>()
  const byPath = new Map<string, WorkspaceEntry>()
  for (const e of excludeLegacyWorkspaceSourceEntries(entries || [])) {
    if (!e) continue
    byPath.set(e.path, e)
    const parent = e.parentPath ?? '__root__'
    const arr = byParent.get(parent) || []
    arr.push(e)
    byParent.set(parent, arr)
  }
  const root =
    byPath.get(WORKSPACE_ROOT_PATH) ||
    ({ path: WORKSPACE_ROOT_PATH, parentPath: null, kind: 'folder', name: '', updatedAtMs: 0 } satisfies WorkspaceEntry)

  const walk = (entry: WorkspaceEntry): Node => {
    const kids = sortWorkspaceEntriesForExplorer(byParent.get(entry.path) || [])
    return { entry, children: kids.map(walk) }
  }
  return walk(root)
}

export const MarkdownFileTree = React.memo(function MarkdownFileTree(props: {
  entries: WorkspaceEntry[]
  readOnly?: boolean
  expandedPaths: Set<string>
  toggleExpanded: (path: WorkspacePath) => void
  activePath: WorkspacePath | null
  onSelectFile: (path: WorkspacePath) => void
  onSelectFolder: (path: WorkspacePath) => void
  sourcesByPath?: WorkspaceSourceIndex | null
  onCreateNewFile?: (parentPath: WorkspacePath) => void
  onRevealInFinder?: (path: WorkspacePath) => void
  onClearFile?: (path: WorkspacePath) => void
  onRenameEntry?: (path: WorkspacePath, nextName: string) => void
  onDeleteEntry?: (path: WorkspacePath) => void
  buildShareUrl?: (entry: WorkspaceEntry) => string | null | Promise<string | null>
  buildCanvasEmbedUrl?: (entry: WorkspaceEntry) => string | null | Promise<string | null>
  onCanvasEmbedStart?: (entry: WorkspaceEntry) => void
  onCanvasEmbedReady?: (entry: WorkspaceEntry, url: string) => void
  onShareCodeReady?: (detail: { sourceName: string; title: string; language: string; code: string }) => void
  renderFileRight?: (args: { entry: WorkspaceEntry; isActive: boolean }) => React.ReactNode
}) {
  const {
    entries,
    expandedPaths,
    toggleExpanded,
    activePath,
    onSelectFile,
    onSelectFolder,
    sourcesByPath,
    onCreateNewFile,
    onRevealInFinder,
    onClearFile,
    onRenameEntry,
    onDeleteEntry,
    buildShareUrl,
    buildCanvasEmbedUrl,
    onCanvasEmbedStart,
    onCanvasEmbedReady,
    onShareCodeReady,
    renderFileRight,
  } = props
  const panelTypography = usePanelTypography()
  const tree = React.useMemo(() => buildTree(entries), [entries])
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; entry: WorkspaceEntry } | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const deleteDialog = React.useRef<HTMLDialogElement | null>(null)
  const deleteAnswer = React.useRef<((confirmed: boolean) => void) | null>(null)
  const answerDelete = React.useCallback((confirmed: boolean) => {
    deleteAnswer.current?.(confirmed); deleteAnswer.current = null; setDeleteTarget(null)
  }, [])
  const confirmDelete = React.useCallback((path: string) => new Promise<boolean>(resolve => {
    deleteAnswer.current?.(false); deleteAnswer.current = resolve; setDeleteTarget(path)
  }), [])
  React.useEffect(() => { if (deleteTarget) deleteDialog.current?.showModal?.() }, [deleteTarget])
  React.useEffect(() => () => { deleteAnswer.current?.(false) }, [])

  const closeContextMenu = React.useCallback(() => {
    setContextMenu(null)
  }, [])

  React.useEffect(() => {
    if (!contextMenu) return
    const unsubscribePointerDown = subscribePointerDownDismiss({
      listener: closeContextMenu,
      target: 'window',
    })
    const unsubscribeEscape = subscribeWindowEscapeDismiss(closeContextMenu)
    return () => {
      unsubscribePointerDown()
      unsubscribeEscape()
    }
  }, [closeContextMenu, contextMenu])

  const copyToClipboard = React.useCallback(async (text: string) => {
    const value = String(text || '')
    if (!value) return false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        return true
      }
    } catch {
      void 0
    }
    return false
  }, [])
  const defaultBuildShareUrl = React.useCallback((entry: WorkspaceEntry): string | null | Promise<string | null> => {
    const publishedShareUrl = buildShareUrl?.(entry)
    if (publishedShareUrl) return publishedShareUrl
    const relative = String(entry.path || '').replace(/^\/+/, '')
    if (!relative) return null
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const base = typeof window !== 'undefined' ? window.location.pathname.replace(/\/$/, '') : '/agentic-graph'
    const params = new URLSearchParams()
    params.set('kgDoc', relative)
    return `${origin}${base}/?${params.toString()}`
  }, [buildShareUrl])

  const contextMenuItems = React.useMemo(
    () =>
      contextMenu
        ? buildMarkdownFileTreeContextMenuItems({
            entry: contextMenu.entry,
            readOnly: props.readOnly,
            copyToClipboard,
            buildShareUrl: defaultBuildShareUrl,
            buildCanvasEmbedUrl,
            onCanvasEmbedStart,
            onCanvasEmbedReady,
            onShareCodeReady,
            onCreateNewFile,
            onRevealInFinder,
            onClearFile,
            onRenameEntry,
            onDeleteEntry,
            confirmDelete,
            closeContextMenu,
          })
        : [],
    [props.readOnly, buildCanvasEmbedUrl, closeContextMenu, contextMenu, copyToClipboard, defaultBuildShareUrl, onCanvasEmbedReady, onCanvasEmbedStart, onClearFile, onCreateNewFile, onDeleteEntry, onRenameEntry, onRevealInFinder, onShareCodeReady, confirmDelete],
  )

  const renderNode = (node: Node, depth: number) => {
    const entry = node.entry
    const isRoot = entry.path === WORKSPACE_ROOT_PATH
    if (isRoot && node.children.length === 0) {
      return (
        <section key={entry.path} className={`px-2 py-2 ${panelTypography.panelTextClass} ${UI_THEME_TOKENS.text.secondary}`} aria-label="Workspace help">
          <h3 className={`${panelTypography.microLabelClass} font-semibold tracking-wide uppercase ${UI_THEME_TOKENS.text.secondary}`}>Workspace</h3>
          <ul className="mt-1 list-disc pl-5">
            <li>Select a file in SOURCE FILES to load it into the editor.</li>
            <li>Headings show up in TOC.</li>
            <li>Wikilinks like <span className={UI_THEME_TOKENS.text.primary}>[[SomePage]]</span> create backlinks.</li>
          </ul>
          <h4 className={`mt-2 ${panelTypography.microLabelClass} font-semibold tracking-wide uppercase ${UI_THEME_TOKENS.text.secondary}`}>Notes</h4>
          <p className="mt-1">This workspace is stored locally in your browser.</p>
        </section>
      )
    }
    if (isRoot) {
      return (
        <ul key={entry.path} className="list-none m-0 p-0">
          {node.children.map(child => renderNode(child, depth))}
        </ul>
      )
    }

    const indent = Math.min(28, depth * 12)
    const isFolder = entry.kind === 'folder'
    const isExpanded = expandedPaths.has(entry.path)
    const isActive = activePath === entry.path
    const source = sourcesByPath ? sourcesByPath[entry.path] : null
    const sourceUrl = source?.kind === 'url' ? normalizeImportUrlInput(source.url) : ''
    const isWorkspaceSeedsAuthorityRoot = isAgenticGraphWorkspaceSeedsRootPath(entry.path)
    const selectEntry = () => isFolder ? onSelectFolder(entry.path) : onSelectFile(entry.path)
    const iconActionClass = `${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} p-0 shrink-0 inline-flex items-center justify-center rounded ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.focus.primaryRing}`
    const openContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const pos = clampOverlayTopLeftFullyInViewport({
        pos: { left: event.clientX, top: event.clientY }, size: { width: 220, height: 260 },
        viewport: { width: window.innerWidth || document.documentElement.clientWidth || 1,
          height: window.innerHeight || document.documentElement.clientHeight || 1 }, snapPx: 1,
      })
      setContextMenu({ x: pos.left, y: pos.top, entry })
    }

    return (
      <li key={entry.path} className="list-none">
        <section className="group flex items-center" style={{ paddingLeft: indent }}
          aria-label={isFolder ? `Folder ${entry.name}` : `File ${entry.name}`}>
          {isFolder ? (
            <button type="button" aria-label={`${isExpanded ? 'Collapse' : 'Expand'} folder ${entry.name}`}
              aria-expanded={isExpanded} title={`${isExpanded ? 'Collapse' : 'Expand'} ${entry.path}`}
              className={`ml-1 ${iconActionClass}`}
              onClick={() => toggleExpanded(entry.path)}>
              {isExpanded
                ? <ChevronDown role="img" aria-label="Collapse folder" className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} />
                : <ChevronRight role="img" aria-label="Expand folder" className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} />}
            </button>
          ) : null}
          <button type="button" aria-label={`Select ${isFolder ? 'folder' : 'file'} ${entry.name}`}
            aria-pressed={isActive} title={entry.path}
            className={iconActionClass}
            style={isFolder ? undefined : { marginLeft: 'calc(0.25rem + var(--kg-data-view-icon-action-sm-size, 1.75rem))' }}
            onClick={selectEntry} onContextMenu={openContextMenu}>
            {isFolder
              ? <Folder role="img" aria-label={`Select folder ${entry.name}`} className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} />
              : <FileText role="img" aria-label={`Select file ${entry.name}`} className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} />}
          </button>
          <MarkdownFileTreeRowButton
            ariaLabel={isFolder ? `Folder ${entry.name}` : `File ${entry.name}`}
            title={entry.path}
            indent={0}
            isActive={isActive}
            textClassName={panelTypography.panelTextClass}
            onClick={selectEntry}
            onContextMenu={openContextMenu}
          >
            <span className="truncate">{entry.name || (isFolder ? 'folder' : 'file')}</span>
            {isWorkspaceSeedsAuthorityRoot ? (
              <ShieldCheck role="img" aria-label="agentic-graph workspace-seed authority"
                className={`${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} opacity-80`} />
            ) : null}
          </MarkdownFileTreeRowButton>
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open source URL for ${entry.name}`}
              title={sourceUrl}
              className={`shrink-0 inline-flex h-5 w-5 items-center justify-center rounded ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.focus.primaryRing}`}>
              <LinkIcon role="img" aria-label="Imported from URL" className={`${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} opacity-70`} />
            </a>
          ) : null}
          {renderFileRight ? (
            <span className="shrink-0" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
              {renderFileRight({ entry, isActive })}
            </span>
          ) : null}
        </section>
        {isFolder && isExpanded && node.children.length > 0 ? (
          <ul className="list-none m-0 p-0">{node.children.map(child => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    )
  }

  return (
    <nav className={UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_LIST_CLASSNAME} aria-label="Source files">
      {renderNode(tree, 0)}
      {deleteTarget && <dialog ref={deleteDialog} aria-labelledby="workspace-delete-title"
        className={`w-[min(90vw,28rem)] rounded border p-4 shadow-lg backdrop:bg-black/60 ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.panel.border}`}
        onCancel={event => { event.preventDefault(); answerDelete(false) }} onPointerDown={event => event.stopPropagation()}>
        <h2 id="workspace-delete-title">Delete source file?</h2>
        <p className="break-words">{deleteTarget}</p>
        <p>This removes the workspace entry. The original imported file on your device is unchanged.</p>
        <footer className="flex justify-end gap-2">
          <button type="button" autoFocus className="min-h-11 rounded border px-3" onClick={() => answerDelete(false)}>Cancel</button>
          <button type="button" disabled={props.readOnly} className={`min-h-11 rounded border px-3 ${UI_THEME_TOKENS.status.error}`}
            onClick={() => answerDelete(true)}>Delete from workspace</button>
        </footer>
      </dialog>}
      {contextMenu ? (
        <section
          className={`kg-data-view-floating-menu fixed z-[120] ${UI_RESPONSIVE_DATA_VIEW_NARROW_MENU_PANEL_CLASSNAME} rounded border shadow-lg ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.panel.border}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={event => event.stopPropagation()}
        >
          <ul className="list-none m-0 p-1">
            {contextMenuItems.map(item => (
              <li key={item.key} className="list-none">
                <button
                  type="button"
                  disabled={item.disabled}
                  title={item.disabled ? 'Unavailable for read-only observation files' : undefined}
                  className={`${UI_RESPONSIVE_MENU_ROW_CLASSNAME} text-left rounded px-2 py-1 ${panelTypography.textSizeClass} ${
                    item.disabled ? `${UI_THEME_TOKENS.text.secondary} opacity-40 cursor-not-allowed`
                      : item.tone === 'danger' ? UI_THEME_TOKENS.status.error : UI_THEME_TOKENS.button.text
                  } ${item.disabled ? '' : UI_THEME_TOKENS.button.hoverBg}`}
                  onClick={item.onSelect}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </nav>
  )
})
