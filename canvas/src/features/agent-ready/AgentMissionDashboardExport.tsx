import React from 'react'
import defaultTemplate from '../../../../docs/workspace-seeds/agentic-graph-agent-mission-template.md?raw'
import { projectDashboardMarkdown, type DashboardEvent } from '@/components/DashboardCanvas/dashboardMarkdownDocument'
import { readDashboardSnapshotStream } from '@/components/DashboardCanvas/dashboardSnapshotStream'
import { useDashboardWidgets } from '@/components/DashboardCanvas/dashboardWidgetConfiguration'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { upsertWorkspaceMarkdownSourceFile } from '@/features/source-files/upsertWorkspaceMarkdownSourceFile'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { closeAgentRunInspection, useAgentRunInspection } from './agentRunInspectionStore'
import { agentMissionDashboardEvent } from './agentMissionDashboardDocument'

const TEMPLATE_PATH = '/docs/workspace-seeds/agentic-graph-agent-mission-template.md'
const button = `rounded border px-3 py-2 text-xs disabled:opacity-50 ${UI_THEME_TOKENS.button.neutralMuted}`

/** Explicit checkpoint only. The existing Mission observer owns streaming and private expiry. */
export default function AgentMissionDashboardExport() {
  const inspection = useAgentRunInspection(), settings = useDashboardWidgets()
  const [templatePath, setTemplatePath] = React.useState(TEMPLATE_PATH)
  const [input, setInput] = React.useState<DashboardEvent | null>(null)
  const [source, setSource] = React.useState<'mission' | 'file'>('mission')
  const [status, setStatus] = React.useState(''), [savedPath, setSavedPath] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const controller = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => controller.current?.abort(), [])
  const importFile = async (file?: File) => {
    if (!file) return
    controller.current?.abort()
    const active = new AbortController(); controller.current = active
    setBusy(true); setStatus('Reading snapshot…')
    try {
      if (file.size > 1024 * 1024) throw Error('Dashboard input exceeds 1 MiB.')
      const text = await file.text()
      const sse = file.name.endsWith('.sse') || /^\s*(?:data:|event:|id:|:)/.test(text)
      const event = await readDashboardSnapshotStream(new Response(text, { headers: { 'content-type': sse ? 'text/event-stream' : 'application/json' } }), active.signal)
      setInput(event); setSource('file'); setStatus(`Loaded ${event.sourceId}, revision ${event.sequence}.`)
    } catch (error) { if (!active.signal.aborted) setStatus((error as Error).message) }
    finally { if (!active.signal.aborted) setBusy(false) }
  }
  const save = async () => {
    setBusy(true); setSavedPath(null); setStatus('Saving dashboard…')
    try {
      const event = source === 'mission' && inspection && inspection.expiresAt > Date.now() ? agentMissionDashboardEvent(inspection.trace) : source === 'file' ? input : null
      if (!event) throw Error('Load a current Mission observation or a snapshot JSON/SSE file first.')
      const fs = await getWorkspaceFs()
      const template = await fs.readFileText(templatePath) ?? (templatePath === TEMPLATE_PATH ? defaultTemplate : null)
      if (!template) throw Error('The selected Markdown template is unavailable.')
      const markdown = projectDashboardMarkdown(template, event, source === 'mission' ? settings.document : undefined)
      const path = await upsertWorkspaceMarkdownSourceFile({ fs, parentPath: '/docs/dashboards',
        name: `dashboard-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.md`, text: markdown,
        source: { kind: 'local', originalName: null }, sourcePersistence: 'sync' })
      await applyWorkspaceImportToCanvas({ fs, createdPaths: [path], opts: { applyToGraph: false, skipComposedGraphApply: true } })
      setSavedPath(path); setStatus(`Saved ${path}. Cloud upload is available from Source Files.`)
    } catch (error) { setStatus((error as Error).message) }
    finally { setBusy(false) }
  }
  return <details className="rounded border p-3" aria-label="Create Markdown dashboard">
    <summary className="cursor-pointer text-sm font-semibold">Markdown dashboard</summary>
    <section className="mt-3 grid gap-3 text-xs">
      <p>Apply a template to a complete JSON snapshot or SSE file, or save the current Mission observation. Saved reports reopen offline.</p>
      <label>Observation<select aria-label="Dashboard input source" className="ml-2 rounded border bg-transparent p-2" value={source} onChange={event => setSource(event.target.value as 'mission' | 'file')}>
        <option value="mission">Current Mission</option><option value="file">Imported snapshot</option>
      </select></label>
      <label>Import snapshot JSON / SSE<input aria-label="Import dashboard snapshot" type="file" accept=".json,.sse,application/json,text/event-stream" disabled={busy} className="ml-2"
        onChange={event => { void importFile(event.target.files?.[0]); event.target.value = '' }} /></label>
      <label className="grid gap-1">Markdown template path<input aria-label="Dashboard Markdown template" value={templatePath} onChange={event => setTemplatePath(event.target.value)} className="rounded border bg-transparent p-2" /></label>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || (source === 'mission' ? !inspection : !input)} onClick={() => void save()}>Save dashboard Markdown</button>
        {savedPath && <button type="button" className={button} onClick={() => {
          closeAgentRunInspection(); useMarkdownExplorerStore.getState().setActivePath(savedPath)
          useGraphStore.getState().setCanvas2dRenderer('dashboard')
          useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
        }}>Open saved dashboard</button>}
      </div>
      <p role="status">{status}</p>
    </section>
  </details>
}
