import React from 'react'
import { Download, Link, X, Eraser, ListPlus, RefreshCcw, Info, type LucideIcon } from 'lucide-react'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import type { WorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { sourceFileWebsiteUrl } from './websiteImportTreeProjection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useWebsiteImportSelectionSession, importWebsiteFromSourceFiles, importDiscoveredWebsitePage, discoverWebsiteSelection, finishWebsiteImportSelection, confirmRestoredWebsiteSelection, cancelWebsiteImportSelection, websiteSelectionPagination, showMoreWebsiteSelectionPages } from './websiteImportSelectionSession'

const icons = { discover: Link, refresh: RefreshCcw, more: ListPlus, status: Info, import: Download, cancel: X, clear: Eraser } satisfies Record<string, LucideIcon>
export function SourceImportAction({ action, label, type = 'button', ...props }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { action: keyof typeof icons; label: string }) {
  const Icon = icons[action]
  return <button {...props} type={type} aria-label={props['aria-label'] || label} title={props.title || label}
    onClick={event => { if (!props.disabled) props.onClick?.(event) }}
    className={`inline-flex ${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} shrink-0 items-center justify-center rounded disabled:opacity-40 ${props.disabled ? `${UI_THEME_TOKENS.text.secondary} cursor-not-allowed` : UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.focus.primaryRing} ${props.className || ''}`}>
    <Icon className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} role="img" aria-label={label} />
  </button>
}

export function WebsiteSelectionCheckbox({ label, urls, selected, toggle, disabled = false }: { label: string; urls: string[]; selected: Set<string>; toggle: (urls: string[], checked: boolean) => void; disabled?: boolean }) {
  const ref = React.useRef<HTMLInputElement>(null)
  const count = urls.filter(url => selected.has(url)).length
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < urls.length }, [count, urls.length])
  return <label className={`inline-flex ${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} shrink-0 items-center justify-center rounded ${UI_THEME_TOKENS.focus.primaryRing}`}>
    <input ref={ref} className="size-3 shrink-0" type="checkbox" aria-label={label} checked={urls.length > 0 && count === urls.length} disabled={disabled} onChange={event => toggle(urls, event.target.checked)} />
  </label>
}

export function confirmWebsiteSelection() {
  const session = useWebsiteImportSelectionSession.getState().session
  if (!session || session.busy || session.importing || !session.selected.size) return
  const urls = session.pages.filter(page => session.selected.has(page.url)).map(page => page.url)
  if (session.restored) void confirmRestoredWebsiteSelection(session.id, urls).catch(reportSourceImportFailure)
  else finishWebsiteImportSelection(urls)
}

export function reportSourceImportFailure(error: unknown) {
  useGraphStore.getState().pushUiToast({ id: 'source-files:website-import', kind: 'error', message: error instanceof Error ? error.message : String(error), dismissible: true })
}

export function SourceFileWebsiteActions({ entry, source, urlOverride, destinationPath, confirmationOwner, discoveryContext = false, detailsOpen, onShowDetails, onToggleDetails, statusAvailable = false }: {
  entry: WorkspaceEntry; source?: WorkspaceEntrySource; urlOverride?: string; destinationPath?: string; confirmationOwner?: boolean; discoveryContext?: boolean
  detailsOpen?: boolean; onShowDetails?: () => void; onToggleDetails?: () => void; statusAvailable?: boolean
}) {
  const session = useWebsiteImportSelectionSession(state => state.session)
  const url = React.useMemo(() => urlOverride || sourceFileWebsiteUrl(entry, source), [entry, source, urlOverride])
  const ownsSession = !!session && (confirmationOwner ?? session.sourcePath === entry.path)
  const fileRequired = entry.kind !== 'file'
  const hasDiscovery = !!session && (ownsSession || discoveryContext)
  const confirmSelection = ownsSession && !fileRequired && !!session.selected.size
  const importPage = !fileRequired && hasDiscovery && !!url && session.pages.some(page => page.url === url)
  const refreshInventory = hasDiscovery && (ownsSession || fileRequired)
  const { remaining = 0, hiddenByFilter = 0 } = session ? websiteSelectionPagination(session) : {}
  const clearsFilter = remaining === 0 && hiddenByFilter > 0
  const moreDisabled = !hasDiscovery || !!session?.importing || (remaining === 0 && !clearsFilter)
  const cancelDisabled = !hasDiscovery || !!session?.importing || (!session?.busy && !session?.selected.size)
  return <>
    <SourceImportAction action={refreshInventory ? 'refresh' : 'discover'} label={refreshInventory ? 'Refresh discovered pages' : fileRequired ? `Find links unavailable for ${entry.name} — requires a source file` : url ? `Find pages linked from ${url}` : `Find links unavailable for ${entry.name}`}
      disabled={(!refreshInventory && (fileRequired || !url)) || !!session?.busy || !!session?.importing}
      onClick={() => { onShowDetails?.(); if (refreshInventory) void discoverWebsiteSelection(session.url); else if (session && urlOverride && session.pages.some(page => page.url === url)) void discoverWebsiteSelection(url); else void importWebsiteFromSourceFiles(url, entry.path).catch(reportSourceImportFailure) }} />
    <SourceImportAction action="import"
      label={confirmSelection ? `Import selected (${session.selected.size}) for ${entry.name}` : importPage ? `Import page ${entry.name}` : ownsSession && !fileRequired ? `Import selected (${session.selected.size}) for ${entry.name}` : `Import unavailable for ${entry.name}`}
      disabled={(!confirmSelection && !importPage) || !!session?.busy || !!session?.importing}
      onClick={() => { onShowDetails?.(); if (confirmSelection) confirmWebsiteSelection(); else if (importPage) void importDiscoveredWebsitePage(session.id, url, destinationPath).catch(reportSourceImportFailure) }} />
    <SourceImportAction action="more" label={clearsFilter ? 'Show more pages (clear filter)' : `Show more pages (${remaining} remaining)`} disabled={moreDisabled}
      title={!hasDiscovery ? 'Show more pages — this item is outside the current discovery' : session?.importing ? 'Show more pages — import in progress' : clearsFilter ? `Clear filter to browse ${hiddenByFilter} other discovered pages` : remaining === 0 ? 'Show more pages — all discovered pages are shown' : undefined}
      onClick={() => { onShowDetails?.(); showMoreWebsiteSelectionPages() }} />
    <SourceImportAction action="cancel" label="Cancel import selection" disabled={cancelDisabled}
      title={!hasDiscovery ? 'Cancel import selection — this item is outside the current discovery' : session?.importing ? 'Cancel import selection — import in progress' : cancelDisabled ? 'Cancel import selection — nothing selected or pending' : undefined}
      onClick={() => { onShowDetails?.(); cancelWebsiteImportSelection() }} />
    <SourceImportAction action="status" label="Website discovery status" aria-expanded={!!detailsOpen}
      disabled={(!hasDiscovery && !statusAvailable) || !onToggleDetails}
      title={!hasDiscovery && !statusAvailable ? 'Website discovery status — no discovery for this item' : undefined}
      onClick={onToggleDetails} />
  </>
}
