import React from 'react'
import { FileCheck2, FileSearch } from 'lucide-react'
import { useWebsiteImportSelectionSession, websiteSelectionPagination } from './websiteImportSelectionSession'

/** Read-only content for the shared summary overlay below the Source Files toolbar. */
export default function WebsiteImportSelectionView() {
  const session = useWebsiteImportSelectionSession(state => state.session)
  const recoveryError = useWebsiteImportSelectionSession(state => state.recoveryError)
  const pagination = session ? websiteSelectionPagination(session) : null
  if (session) return <section aria-label="Website discovery status" data-agentic-typography="" className="max-w-sm px-1 py-0.5">
    {session.importing && <p role="status" className="break-words">{session.importingUrl ? `Importing ${session.importingUrl}…` : 'Importing selected pages…'}</p>}
    <p role="status">{session.busy ? 'Finding crawlable pages…' : `${session.pages.length} discovered pages · ${pagination?.filtered ? `${pagination.matching} match filter · ` : ''}${pagination?.visible.length} shown · ${session.selected.size} selected`}</p>
    {!!pagination?.hiddenByFilter && <p>{pagination.hiddenByFilter} pages hidden by the search filter.</p>}
    <p>Select up to 500 pages to crawl.</p>
    <p className="flex flex-wrap items-center gap-1"><FileCheck2 className="size-3" aria-hidden="true" /> Saved file <FileSearch className="size-3" aria-hidden="true" /> Discovered, not saved</p>
    {session.limited && <p role="status">Discovery returned a partial list: a source could not be read or a resource limit was reached. Refresh or use a narrower source URL.</p>}
    {session.error && <p role="alert">{session.error}</p>}
    {recoveryError && <p role="alert">{recoveryError}</p>}
  </section>
  return recoveryError ? <p role="alert" data-agentic-typography="">{recoveryError}</p> : null
}
