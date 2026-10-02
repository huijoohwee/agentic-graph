import React from 'react'
import { Link as LinkIcon, ShieldCheck, Share2, CodeXml, FolderOpen, Copy, TextSelect, FilePlus, Eraser, Pencil, Trash2 } from 'lucide-react'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { WORKSPACE_ROOT_PATH } from '@/features/workspace-fs/path'
import { sortWorkspaceEntriesForExplorer } from '@/features/workspace-fs/workspaceFs'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { DirectoryTreeBranch, DirectoryTreeRow, DirectoryTreeDisclosure, DirectoryTreeFileButton, DirectoryTreeChildren } from '@/lib/ui/DirectoryTreeControls'
import { normalizeImportUrlInput } from '@/lib/url'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { buildMarkdownFileTreeContextMenuItems } from './markdownFileTreeContextMenuItems'
import { MarkdownFileTreeRowButton } from './MarkdownFileTreeRowButton'
import { AnchorOverlay } from '@/lib/ui/overlay'
import { FLOATING_ICON_TOOLBAR_PANEL_CLASSNAME } from './main/viewer/floatingMenuStyles'
import { excludeLegacyWorkspaceSourceEntries } from '@/features/workspace-fs/workspaceLegacySourceRoots'
import { isAgenticGraphWorkspaceSeedsRootPath } from 'grph-shared/collaboration/documentRepositoryAuthority'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME,
  UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_LIST_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

const contextIcons = { shareUrl: Share2, shareCanvasEmbed: CodeXml, reveal: FolderOpen, copyPath: Copy, copyRelativePath: TextSelect, newFile: FilePlus, clear: Eraser, rename: Pencil, delete: Trash2 }

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
  renderEntryLeading?: (entry: WorkspaceEntry) => React.ReactNode
  resolveSourceUrl?: (entry: WorkspaceEntry) => string | null
  renderContextActions?: (entry: WorkspaceEntry, details: { open: boolean; show: () => void; toggle: () => void }) => React.ReactNode
  renderContextDetails?: (entry: WorkspaceEntry) => React.ReactNode
  isEntrySaved?: (entry: WorkspaceEntry) => boolean
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
    renderEntryLeading,
    isEntrySaved,
  } = props
  const panelTypography = usePanelTypography()
  const tree = React.useMemo(() => buildTree(entries), [entries])
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; entry: WorkspaceEntry; detailsOpen?: boolean } | null>(null)
  const contextPanelRef = React.useRef<HTMLElement | null>(null)
  const contextOverlayGroup = React.useId()
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
    if (contextMenu && !entries.some(entry => entry.path === contextMenu.entry.path)) closeContextMenu()
  }, [entries, contextMenu, closeContextMenu])

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
            unavailableReason: isEntrySaved?.(contextMenu.entry) === false ? 'Not saved — import this item first' : undefined,
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
    [props.readOnly, isEntrySaved, buildCanvasEmbedUrl, closeContextMenu, contextMenu, copyToClipboard, defaultBuildShareUrl, onCanvasEmbedReady, onCanvasEmbedStart, onClearFile, onCreateNewFile, onDeleteEntry, onRenameEntry, onRevealInFinder, onShareCodeReady, confirmDelete],
  )

  const renderNode = (node: Node, depth: number) => {
    const entry = node.entry
    const isRoot = entry.path === WORKSPACE_ROOT_PATH
    if (isRoot && node.children.length === 0) {
      return (
        <section key={entry.path} className={`px-2 py-2 ${panelTypography.panelTextClass} ${UI_THEME_TOKENS.text.secondary}`} aria-label="Workspace help">
          <h3 className={`${panelTypography.microLabelClass} font-semibold tracking-normal uppercase ${UI_THEME_TOKENS.text.secondary}`}>Workspace</h3>
          <ul className="mt-1 list-disc pl-5">
            <li>Select a file in SOURCE FILES to load it into the editor.</li>
            <li>Headings show up in TOC.</li>
            <li>Wikilinks like <span className={UI_THEME_TOKENS.text.primary}>[[SomePage]]</span> create backlinks.</li>
          </ul>
          <h4 className={`mt-2 ${panelTypography.microLabelClass} font-semibold tracking-normal uppercase ${UI_THEME_TOKENS.text.secondary}`}>Notes</h4>
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

    const isFolder = entry.kind === 'folder'
    const contentUnavailable = !isFolder && isEntrySaved?.(entry) === false
    const isExpanded = expandedPaths.has(entry.path)
    const isActive = activePath === entry.path
    const entryLeading = renderEntryLeading?.(entry)
    const selectionFolder = isFolder && Boolean(entryLeading)
    const fileRight = renderFileRight?.({ entry, isActive })
    const isWorkspaceSeedsAuthorityRoot = isAgenticGraphWorkspaceSeedsRootPath(entry.path)
    const selectEntry = () => isFolder ? onSelectFolder(entry.path) : onSelectFile(entry.path)
    const openContextMenu = (event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.focus({ preventScroll: true })
      const rect = event.currentTarget.getBoundingClientRect()
      const hasPointerPosition = 'clientX' in event && (event.clientX !== 0 || event.clientY !== 0)
      setContextMenu({ x: hasPointerPosition ? event.clientX : rect.left, y: hasPointerPosition ? event.clientY : rect.bottom, entry })
    }

    return (
      <DirectoryTreeBranch key={entry.path}>
        <DirectoryTreeRow depth={depth} label={isFolder ? `Folder ${entry.name}` : `File ${entry.name}`}>
          {entryLeading ? <span className="ml-1 inline-flex shrink-0">{entryLeading}</span> : isFolder
            ? <DirectoryTreeDisclosure name={entry.name} path={entry.path} expanded={isExpanded} onToggle={() => toggleExpanded(entry.path)} />
            : <DirectoryTreeFileButton name={entry.name} path={entry.path} selected={isActive} onSelect={selectEntry} onContextMenu={openContextMenu} />}
          <MarkdownFileTreeRowButton
            ariaLabel={selectionFolder ? `${isExpanded ? 'Collapse' : 'Expand'} folder ${entry.name}` : isFolder ? `Folder ${entry.name}` : `File ${entry.name}`}
            title={contentUnavailable ? `${entry.path} — Content not saved. Use Import page to open it.` : entry.path}
            indent={0}
            isActive={isActive}
            ariaExpanded={selectionFolder ? isExpanded : undefined}
            textClassName={panelTypography.panelTextClass}
            onClick={selectionFolder ? () => toggleExpanded(entry.path) : contentUnavailable ? openContextMenu : selectEntry}
            onContextMenu={openContextMenu}
          >
            <span className={`truncate${contentUnavailable ? ' opacity-50' : ''}`}>{entry.name || (isFolder ? 'folder' : 'file')}</span>
            {isWorkspaceSeedsAuthorityRoot ? (
              <ShieldCheck role="img" aria-label="agentic-graph workspace-seed authority"
                className={`${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} opacity-80`} />
            ) : null}
          </MarkdownFileTreeRowButton>
          {fileRight ? <span className="shrink-0" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>{fileRight}</span> : null}
        </DirectoryTreeRow>
        {isFolder && isExpanded && node.children.length > 0 ? (
          <DirectoryTreeChildren name={entry.name} path={entry.path} depth={depth} onSelect={selectEntry}>
            <ul className="list-none m-0 p-0">{node.children.map(child => renderNode(child, depth + 1))}</ul>
          </DirectoryTreeChildren>
        ) : null}
      </DirectoryTreeBranch>
    )
  }

  return (
    <nav className={UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_LIST_CLASSNAME} aria-label="Source files">
      {renderNode(tree, 0)}
      {deleteTarget && <dialog ref={deleteDialog} aria-labelledby="workspace-delete-title"
        className={`w-[min(90vw,28rem)] rounded border p-4 shadow-[var(--kg-shadow-overlay)] backdrop:bg-black/60 ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.panel.border}`}
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
      {contextMenu ? <>
        <AnchorOverlay open anchorPoint={{ left: contextMenu.x, top: contextMenu.y }} align="bottom-left"
          dismissalGroup={contextOverlayGroup} panelRef={contextPanelRef}
          onClose={closeContextMenu} className={`kg-data-view-floating-menu ${FLOATING_ICON_TOOLBAR_PANEL_CLASSNAME}`}>
          <section role="toolbar" aria-label={`Actions for ${contextMenu.entry.name}`} data-source-file-actions
            className="flex flex-wrap items-center gap-0.5 max-w-full" style={{ width: 'max-content' }}>
            {(() => {
              const source = sourcesByPath?.[contextMenu.entry.path]
              const url = normalizeImportUrlInput(props.resolveSourceUrl?.(contextMenu.entry) ?? (source?.kind === 'url' ? source.url : ''))
              return url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open source URL for ${contextMenu.entry.name}`}
                title={`Open source URL: ${url}`} className={`inline-flex ${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} items-center justify-center rounded ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.focus.primaryRing}`}>
                <LinkIcon className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" />
              </a> : <button type="button" disabled aria-label={`Source URL unavailable for ${contextMenu.entry.name}`}
                title="Open source URL — no source URL" className={`inline-flex ${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} items-center justify-center rounded ${UI_THEME_TOKENS.text.secondary} opacity-40 cursor-not-allowed`}>
                <LinkIcon className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" />
              </button>
            })()}
            {props.renderContextActions?.(contextMenu.entry, {
              open: !!contextMenu.detailsOpen,
              show: () => setContextMenu(current => current ? { ...current, detailsOpen: true } : null),
              toggle: () => setContextMenu(current => current ? { ...current, detailsOpen: !current.detailsOpen } : null),
            })}
            {contextMenuItems.map(item => {
              const Icon = contextIcons[item.key]
              return <button key={item.key} type="button" disabled={item.disabled} aria-label={item.label}
                title={item.disabledReason ? `${item.label} — ${item.disabledReason}` : item.label}
                className={`inline-flex ${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} items-center justify-center rounded ${UI_THEME_TOKENS.focus.primaryRing} ${
                  item.disabled ? `${UI_THEME_TOKENS.text.secondary} opacity-40 cursor-not-allowed`
                    : item.tone === 'danger' ? UI_THEME_TOKENS.status.error : UI_THEME_TOKENS.button.text
                } ${item.disabled ? '' : UI_THEME_TOKENS.button.hoverBg}`}
                onClick={item.onSelect}><Icon className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" /></button>
            })}
          </section>
        </AnchorOverlay>
        {contextMenu.detailsOpen && props.renderContextDetails && <AnchorOverlay open anchorRef={contextPanelRef} align="bottom-left"
          dismissalGroup={contextOverlayGroup} onClose={closeContextMenu} autoFocus={false}
          className={`kg-data-view-floating-menu ${FLOATING_ICON_TOOLBAR_PANEL_CLASSNAME}`}>
          {props.renderContextDetails(contextMenu.entry)}
        </AnchorOverlay>}
      </> : null}
    </nav>
  )
})
