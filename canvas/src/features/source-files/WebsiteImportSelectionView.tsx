import React from 'react'
import { SourceImportAction, WebsiteSelectionCheckbox, reportSourceImportFailure } from './SourceFileWebsiteActions'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { useWebsiteImportSelectionSession, discoverWebsiteSelection, toggleWebsiteSelection, setWebsiteSelectionQuery, finishWebsiteImportSelection, importWebsiteFromSourceFiles } from './websiteImportSelectionSession'

/** Controls for the existing Source Files tree; this surface owns no second tree. */
export default function WebsiteImportSelectionView() {
  const session = useWebsiteImportSelectionSession(state => state.session)
  const typography = usePanelTypography()
  const [url, setUrl] = React.useState('')
  const visible = session?.pages.filter(page => `${page.url} ${page.title || ''}`.toLowerCase().includes(session.query.toLowerCase())) || []
  return <section aria-label="Choose folder(s)/page(s) to import" className={`grid min-w-0 gap-2 border-b py-2 ${UI_THEME_TOKENS.panel.border} ${typography.panelTextClass}`}>
    <h3 className="font-semibold">Choose folder(s)/page(s) to import</h3>
    {session ? <>
      <p className="break-all text-xs">{session.url}</p>
      <p className="text-xs">Select folders or pages in Source Files below, then use Import selected beside cloud sync. Discovered pages stay local until imported.</p>
      <label className="grid gap-1 text-xs">Filter discovered pages<input type="search" value={session.query} onChange={event => setWebsiteSelectionQuery(event.target.value)} placeholder="Filter pages…" className="min-w-0 rounded border bg-transparent p-1" /></label>
      <nav className="flex flex-wrap items-center gap-1" aria-label="Import selection controls">
        <label className="flex items-center gap-1"><WebsiteSelectionCheckbox label="Select all visible pages" urls={visible.map(page => page.url)} selected={session.selected} toggle={toggleWebsiteSelection} />Select visible</label>
        <SourceImportAction action="clear" label="Clear selection" disabled={!session.selected.size} onClick={() => toggleWebsiteSelection(session.pages.map(page => page.url), false)} />
        <SourceImportAction action="cancel" label="Cancel import selection" onClick={() => finishWebsiteImportSelection(null)} />
      </nav>
      <p role="status" className="text-xs">{session.selected.size} selected · {session.pages.length} discovered{session.busy ? ' · Finding links…' : ''}</p>
      {session.error && <section role="alert"><p>{session.error}</p><SourceImportAction action="discover" label="Retry discovery" disabled={session.busy} onClick={() => void discoverWebsiteSelection(session.url)} /></section>}
      {(session.limited || session.pages.length >= 500) && <p className="text-xs">Showing up to 500 discovered pages. This is a bounded list.</p>}
    </> : <form className="flex min-w-0 flex-wrap items-end gap-1" onSubmit={event => { event.preventDefault(); void importWebsiteFromSourceFiles(url.trim()).catch(reportSourceImportFailure) }}>
      <label className="grid min-w-0 flex-1 gap-1">Import URL<input type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" className="w-full min-w-0 rounded border bg-transparent p-1" /></label>
      <SourceImportAction action="discover" label="Find pages to import" type="submit" disabled={!url.trim()} />
    </form>}
  </section>
}
