import React from 'react'
import { ChevronDown, ChevronRight, FileText, Folder, Link as LinkIcon, ShieldCheck } from 'lucide-react'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { WORKSPACE_ROOT_PATH } from '@/features/workspace-fs/path'
import { sortWorkspaceEntriesForExplorer } from '@/features/workspace-fs/workspaceFs'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { subscribePointerDownDismiss, subscribeWindowEscapeDismiss } from '@/lib/browser/dismissEvents'
import { buildMarkdownFileTreeContextMenuItems } from './markdownFileTreeContextMenuItems'
import { MarkdownFileTreeRowButton } from './MarkdownFileTreeRowButton'
import { clampOverlayTopLeftFullyInViewport } from '@/lib/ui/overlayClamp'
import { excludeLegacyWorkspaceSourceEntries } from '@/features/workspace-fs/workspaceLegacySourceRoots'
import { isKnowgrphWorkspaceSeedsRootPath } from 'grph-shared/collaboration/documentRepositoryAuthority'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
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
  expandedPaths: Set<string>
  toggleExpanded: (path: WorkspacePath) => void
  activePath: WorkspacePath | null
  onSelectFile: (path: WorkspacePath) => void
  onSelectFolder?: (path: WorkspacePath) => void
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
    const base = typeof window !== 'undefined' ? window.location.pathname.replace(/\/$/, '') : '/knowgrph'
    const params = new URLSearchParams()
    params.set('kgDoc', relative)
    return `${origin}${base}/?${params.toString()}`
  }, [buildShareUrl])

  const contextMenuItems = React.useMemo(
    () =>
      contextMenu
        ? buildMarkdownFileTreeContextMenuItems({
            entry: contextMenu.entry,
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
            closeContextMenu,
          })
        : [],
    [buildCanvasEmbedUrl, closeContextMenu, contextMenu, copyToClipboard, defaultBuildShareUrl, onCanvasEmbedReady, onCanvasEmbedStart, onClearFile, onCreateNewFile, onDeleteEntry, onRenameEntry, onRevealInFinder, onShareCodeReady],
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
    const isUrlSource = source && source.kind === 'url'
    const isWorkspaceSeedsAuthorityRoot = isKnowgrphWorkspaceSeedsRootPath(entry.path)

    return (
      <li key={entry.path} className="list-none">
        <section className="group flex items-center" aria-label={isFolder ? `Folder ${entry.name}` : `File ${entry.name}`}>
          <MarkdownFileTreeRowButton
            ariaLabel={isFolder ? `Folder ${entry.name}` : `File ${entry.name}`}
            indent={indent}
            isActive={isActive}
            textClassName={panelTypography.panelTextClass}
            onClick={() => {
              if (isFolder) {
                if (onSelectFolder) onSelectFolder(entry.path)
                toggleExpanded(entry.path)
                return
              } else {
                onSelectFile(entry.path)
              }
            }}
            onContextMenu={event => {
              event.preventDefault()
              event.stopPropagation()
              const pos = clampOverlayTopLeftFullyInViewport({
                pos: { left: event.clientX, top: event.clientY },
                size: { width: 220, height: 260 },
                viewport: {
                  width: window.innerWidth || document.documentElement.clientWidth || 1,
                  height: window.innerHeight || document.documentElement.clientHeight || 1,
                },
                snapPx: 1,
              })
              setContextMenu({ x: pos.left, y: pos.top, entry })
            }}
          >
            {isFolder ? (
              isExpanded ? (
                <ChevronDown className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} />
              ) : (
                <ChevronRight className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} />
              )
            ) : (
              <span className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} />
            )}
            {isFolder ? <Folder className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} /> : <FileText className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} />}
            <span className="truncate">{entry.name || (isFolder ? 'folder' : 'file')}</span>
            {isWorkspaceSeedsAuthorityRoot ? (
              <span title="Canonical source: GitHub/knowgrph/docs/workspace-seeds" aria-label="Knowgrph workspace-seed authority">
                <ShieldCheck className={`${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} opacity-80`} aria-hidden="true" />
              </span>
            ) : null}
            {isUrlSource ? <LinkIcon className={`${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} opacity-70`} aria-label="Imported from URL" /> : null}
          </MarkdownFileTreeRowButton>
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
                  className={`${UI_RESPONSIVE_MENU_ROW_CLASSNAME} text-left rounded px-2 py-1 ${panelTypography.textSizeClass} ${
                    item.tone === 'danger' ? UI_THEME_TOKENS.status.error : UI_THEME_TOKENS.button.text
                  } ${UI_THEME_TOKENS.button.hoverBg}`}
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
