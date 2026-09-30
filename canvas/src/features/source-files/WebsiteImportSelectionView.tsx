import React from 'react'
import { SourceImportAction, reportSourceImportFailure } from './SourceFileWebsiteActions'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { useWebsiteImportSelectionSession, importWebsiteFromSourceFiles } from './websiteImportSelectionSession'

/** Controls for the existing Source Files tree; this surface owns no second tree. */
export default function WebsiteImportSelectionView() {
  const session = useWebsiteImportSelectionSession(state => state.session)
  const recoveryError = useWebsiteImportSelectionSession(state => state.recoveryError)
  const typography = usePanelTypography()
  const [url, setUrl] = React.useState('')
  if (session) return <>
    {session.error && <p role="alert" className="text-xs">{session.error}</p>}
    {recoveryError && <p role="alert" className="text-xs">{recoveryError}</p>}
  </>
  return <section aria-label="Import website URL" className={`grid min-w-0 gap-2 border-b py-2 ${UI_THEME_TOKENS.panel.border} ${typography.panelTextClass}`}>
    <form className="flex min-w-0 flex-wrap items-end gap-1" onSubmit={event => { event.preventDefault(); void importWebsiteFromSourceFiles(url.trim()).catch(reportSourceImportFailure) }}>
      {recoveryError && <p role="alert" className="w-full text-xs">{recoveryError}</p>}
      <label className="grid min-w-0 flex-1 gap-1">Import URL<input type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" className="w-full min-w-0 rounded border bg-transparent p-1" /></label>
      <SourceImportAction action="discover" label="Find pages to import" type="submit" disabled={!url.trim()} />
    </form>
  </section>
}
