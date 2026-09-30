import React from 'react'
import { Download, Link, X, Eraser, type LucideIcon } from 'lucide-react'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import type { WorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { sourceFileWebsiteUrl } from './websiteImportTreeProjection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useWebsiteImportSelectionSession, importWebsiteFromSourceFiles, discoverWebsiteSelection, finishWebsiteImportSelection, confirmRestoredWebsiteSelection } from './websiteImportSelectionSession'

const icons = { discover: Link, import: Download, cancel: X, clear: Eraser } satisfies Record<string, LucideIcon>
export function SourceImportAction({ action, label, type = 'button', ...props }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { action: keyof typeof icons; label: string }) {
  const Icon = icons[action]
  return <button {...props} type={type} aria-label={props['aria-label'] || label} title={label}
    className={`inline-flex ${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} shrink-0 items-center justify-center rounded disabled:opacity-40 ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.focus.primaryRing} ${props.className || ''}`}>
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

export function SourceFileWebsiteActions({ entry, source, urlOverride, confirmationOwner }: { entry: WorkspaceEntry; source?: WorkspaceEntrySource; urlOverride?: string; confirmationOwner?: boolean }) {
  const session = useWebsiteImportSelectionSession(state => state.session)
  const url = React.useMemo(() => urlOverride || sourceFileWebsiteUrl(entry, source), [entry, source, urlOverride])
  const ownsSession = !!session && (confirmationOwner ?? session.sourcePath === entry.path)
  return <>
    <SourceImportAction action="discover" label={url ? `Find pages linked from ${url}` : `Find links unavailable for ${entry.name}`}
      disabled={!url || !!session?.busy || !!session?.importing}
      onClick={() => { if (session && (ownsSession || (urlOverride && session.pages.some(page => page.url === url)))) void discoverWebsiteSelection(url); else void importWebsiteFromSourceFiles(url, entry.path).catch(reportSourceImportFailure) }} />
    <SourceImportAction action="import"
      label={ownsSession ? `Import selected (${session.selected.size}) for ${entry.name}` : `Import unavailable for ${entry.name}`}
      disabled={!ownsSession || session.busy || !!session.importing || !session.selected.size}
      onClick={confirmWebsiteSelection} />
  </>
}
