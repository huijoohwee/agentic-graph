import React from 'react'
import { FileCheck2, FileSearch } from 'lucide-react'
import { SourceImportAction } from './SourceFileWebsiteActions'
import { useWebsiteImportSelectionSession, cancelWebsiteImportSelection, discoverWebsiteSelection, visibleWebsiteSelectionPages, showMoreWebsiteSelectionPages } from './websiteImportSelectionSession'

/** Controls for the existing Source Files tree; this surface owns no second tree. */
export default function WebsiteImportSelectionView() {
  const session = useWebsiteImportSelectionSession(state => state.session)
  const recoveryError = useWebsiteImportSelectionSession(state => state.recoveryError)
  const visible = session ? visibleWebsiteSelectionPages(session).length : 0
  const matching = session?.pages.filter(page => `${page.url} ${page.title || ''}`.toLowerCase().includes(session.query.trim().toLowerCase())).length || 0
  if (session) return <>
    <p role="status" className="text-xs">{session.busy ? 'Finding crawlable pages…' : `${session.pages.length} discovered pages · ${visible} shown · ${session.selected.size} selected`}</p>
    <p className="text-xs">Select up to 500 pages to crawl.</p>
    <p className="flex flex-wrap items-center gap-1 text-xs"><FileCheck2 className="size-3" aria-hidden="true" /> Saved file <FileSearch className="size-3" aria-hidden="true" /> Discovered, not saved</p>
    {visible < matching && <button type="button" onClick={showMoreWebsiteSelectionPages} className="text-xs underline">Show more pages ({matching - visible} remaining)</button>}
    {session.limited && <p role="status" className="text-xs">Discovery limit reached; this is a partial list. Use a narrower source URL to find more pages.</p>}
    <SourceImportAction action="discover" label="Refresh discovered pages" disabled={session.busy || session.importing}
      onClick={() => void discoverWebsiteSelection(session.url)} />
    <SourceImportAction action="cancel" label="Cancel import selection" disabled={session.importing || (!session.busy && !session.selected.size)}
      onClick={cancelWebsiteImportSelection} />
    {session.error && <p role="alert" className="text-xs">{session.error}</p>}
    {recoveryError && <p role="alert" className="text-xs">{recoveryError}</p>}
  </>
  return recoveryError ? <p role="alert" className="text-xs">{recoveryError}</p> : null
}
