import React from 'react'
import { FileCheck2, FileSearch } from 'lucide-react'
import { useWebsiteImportSelectionSession, visibleWebsiteSelectionPages } from './websiteImportSelectionSession'

/** Read-only content for the shared summary overlay below the Source Files toolbar. */
export default function WebsiteImportSelectionView() {
  const session = useWebsiteImportSelectionSession(state => state.session)
  const recoveryError = useWebsiteImportSelectionSession(state => state.recoveryError)
  const visible = session ? visibleWebsiteSelectionPages(session).length : 0
  if (session) return <section aria-label="Website discovery status" className="max-w-sm px-1 py-0.5">
    <p role="status" className="text-xs">{session.busy ? 'Finding crawlable pages…' : `${session.pages.length} discovered pages · ${visible} shown · ${session.selected.size} selected`}</p>
    <p className="text-xs">Select up to 500 pages to crawl.</p>
    <p className="flex flex-wrap items-center gap-1 text-xs"><FileCheck2 className="size-3" aria-hidden="true" /> Saved file <FileSearch className="size-3" aria-hidden="true" /> Discovered, not saved</p>
    {session.limited && <p role="status" className="text-xs">Discovery returned a partial list: a source could not be read or a resource limit was reached. Refresh or use a narrower source URL.</p>}
    {session.error && <p role="alert" className="text-xs">{session.error}</p>}
    {recoveryError && <p role="alert" className="text-xs">{recoveryError}</p>}
  </section>
  return recoveryError ? <p role="alert" className="text-xs">{recoveryError}</p> : null
}
