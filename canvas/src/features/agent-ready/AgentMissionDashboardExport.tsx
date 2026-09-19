import React from 'react'
import { DASHBOARD_TEMPLATE_PATH, readDashboardTemplate } from '@/components/DashboardCanvas/dashboardTemplateSource'
import { projectDashboardMarkdown, type DashboardEvent } from '@/components/DashboardCanvas/dashboardMarkdownDocument'
import { readDashboardSnapshotStream } from '@/components/DashboardCanvas/dashboardSnapshotStream'
import { useDashboardWidgets } from '@/components/DashboardCanvas/dashboardWidgetConfiguration'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { upsertWorkspaceTextDocument } from '@/features/workspace-fs/upsertWorkspaceTextDocument'
import { setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { upsertWorkspaceMarkdownSourceFile } from '@/features/source-files/upsertWorkspaceMarkdownSourceFile'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { activateAgentRunWorkspace, closeAgentRunInspection, useAgentRunInspection } from './agentRunInspectionStore'
import { agentMissionDashboardEvent } from './agentMissionDashboardDocument'
import { agentMissionWorkspace } from './agentMissionWorkspace'
import { readWorkspaceObservation } from './workspaceObservation'
import { readAgentMissionCodebaseIndex } from './useAgentMissionCodebaseIndex'
import type { DashboardFilePaths } from './agentMissionDashboardSnapshot'

const button = `rounded border px-3 py-2 text-xs disabled:opacity-50 ${UI_THEME_TOKENS.button.neutralMuted}`

/** Explicit checkpoint only. Source Files and the existing Mission reader own all three files. */
export default function AgentMissionDashboardExport() {
  const inspection = useAgentRunInspection(), settings = useDashboardWidgets()
  const [templatePath, setTemplatePath] = React.useState(DASHBOARD_TEMPLATE_PATH)
  const [input, setInput] = React.useState<DashboardEvent | null>(null)
  const [source, setSource] = React.useState<'mission' | 'workspace' | 'file'>(() => inspection?.trace.workspaceObservation ? 'workspace' : 'mission')
  const [status, setStatus] = React.useState(''), [savedFiles, setSavedFiles] = React.useState<DashboardFilePaths | null>(null)
  const [busy, setBusy] = React.useState(false)
  const controller = React.useRef<AbortController | null>(null)
  const files = savedFiles ?? settings.dashboard?.files
  const nativePath = inspection ? agentMissionWorkspace(inspection.trace).manifestPath : ''
  React.useEffect(() => () => controller.current?.abort(), [])
  React.useEffect(() => { if (settings.dashboard?.files) { setSavedFiles(null); setTemplatePath(settings.dashboard.files.template) } }, [settings.sourcePath])
  const importFile = async (file?: File) => {
    if (!file) return
    controller.current?.abort()
    const active = new AbortController(); controller.current = active
    setBusy(true); setStatus('Reading snapshot…')
    try {
      if (file.size > 1024 * 1024) throw Error('Dashboard input exceeds 1 MiB.')
      const text = await file.text(), sse = file.name.endsWith('.sse') || /^\s*(?:data:|event:|id:|:)/.test(text)
      const event = await readDashboardSnapshotStream(new Response(text, { headers: { 'content-type': sse ? 'text/event-stream' : 'application/json' } }), active.signal)
      setInput(event); setSource('file'); setSavedFiles(null); setStatus(`Loaded ${event.sourceId}, revision ${event.sequence}. Save to retain its input JSON in Source Files.`)
    } catch (error) { if (!active.signal.aborted) setStatus((error as Error).message) }
    finally { if (!active.signal.aborted) setBusy(false) }
  }
  const openFile = async (path: string) => {
    try {
      if (path === nativePath) { activateAgentRunWorkspace(inspection!.view, 'editor', path); return }
      const fs = await getWorkspaceFs()
      if (path === templatePath) {
        await readDashboardTemplate(fs, path)
        await applyWorkspaceImportToCanvas({ fs, createdPaths: [path], opts: { applyToGraph: false, skipComposedGraphApply: true } })
      }
      closeAgentRunInspection()
      useMarkdownExplorerStore.getState().setActivePath(path)
      useGraphStore.getState().setCanvas2dRenderer('dashboard')
      useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    } catch (error) { setStatus((error as Error).message) }
  }
  const save = async () => {
    controller.current?.abort()
    const active = new AbortController(); controller.current = active
    setBusy(true); setStatus('Saving dashboard…')
    try {
      const trace = source === 'workspace' ? await readWorkspaceObservation(active.signal)
        : source === 'mission' && inspection && inspection.expiresAt > Date.now() ? inspection.trace : null
      if (source !== 'file' && !trace) throw Error('Load a Mission observation or select a native .workspace archive first.')
      let event = source === 'file' ? input : null
      if (trace) {
        const codebase = await readAgentMissionCodebaseIndex(trace)
        const graph = codebase ? await (await import('@/features/agent-graph/agentGraphWorkspaceArtifact')).readAgentGraphWorkspaceProjection(
          String((codebase.index.value.projection as { path: string }).path), { graphId: String(codebase.index.value.graphId), snapshotDigest: String(codebase.index.value.snapshotDigest) }) : undefined
        event = agentMissionDashboardEvent(trace, { trace, codebase, graph, schema: useGraphStore.getState().schema })
      }
      if (!event) throw Error('Import a snapshot JSON/SSE file first.')
      const fs = await getWorkspaceFs(), template = await readDashboardTemplate(fs, templatePath)
      const stem = `dashboard-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
      const nextFiles = { input: `/docs/dashboards/${stem}.input.json`, template: templatePath, output: `/docs/dashboards/${stem}.md` }
      const markdown = projectDashboardMarkdown(template, event, trace ? settings.document : undefined, nextFiles)
      active.signal.throwIfAborted()
      await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: '/docs/dashboards' })
      await upsertWorkspaceTextDocument({ fs, parentPath: '/docs/dashboards', name: `${stem}.input.json`, text: JSON.stringify({ ...event, dashboard_output: nextFiles.output }, null, 2) + '\n' })
      setWorkspaceEntrySource(nextFiles.input, { kind: 'local', originalName: null }, { persist: 'sync' })
      await upsertWorkspaceMarkdownSourceFile({ fs, parentPath: '/docs/dashboards', name: `${stem}.md`, text: markdown,
        source: { kind: 'local', originalName: null }, sourcePersistence: 'sync' })
      await applyWorkspaceImportToCanvas({ fs, createdPaths: Object.values(nextFiles), opts: { applyToGraph: false, skipComposedGraphApply: true } })
      setSavedFiles(nextFiles); setStatus('Saved input JSON and dashboard Markdown. All three files are available in Source Files.')
    } catch (error) { if (!active.signal.aborted) setStatus((error as Error).message) }
    finally { if (!active.signal.aborted) setBusy(false) }
  }
  const inputPath = files?.input ?? (source === 'file' ? '' : nativePath)
  return <details className="rounded border p-3" aria-label="Create Markdown dashboard">
    <summary className="cursor-pointer text-sm font-semibold">Markdown dashboard</summary>
    <section className="mt-3 grid gap-3 text-xs">
      <p>Apply a Markdown template to a complete observation. Saved reports retain the Mission content and layout and reopen offline.</p>
      <label>Observation<select aria-label="Dashboard input source" className="ml-2 rounded border bg-transparent p-2" value={source} disabled={busy} onChange={event => { setSource(event.target.value as typeof source); setStatus(''); setSavedFiles(null) }}>
        <option value="workspace">Workspace · .workspace</option><option value="mission">Current Mission</option><option value="file">Imported snapshot</option>
      </select></label>
      {source === 'workspace' && <p>Reads the selected native .workspace archive when you save.</p>}
      {source === 'file' && <label>Import snapshot JSON / SSE<input aria-label="Import dashboard snapshot" type="file" accept=".json,.sse,application/json,text/event-stream" disabled={busy} className="ml-2"
        onChange={event => { void importFile(event.target.files?.[0]); event.target.value = '' }} /></label>}
      <fieldset className="grid min-w-0 gap-3 rounded border p-3"><legend className="px-1 font-semibold">Source Files</legend>
        {([['Input JSON snapshot', inputPath], ['Markdown template path', templatePath], ['Dashboard Markdown output', files?.output ?? '']] as const).map(([label, path], index) =>
          <label key={label} className="grid min-w-0 gap-1">{label}<span className="flex min-w-0 gap-2">
            <input aria-label={index === 1 ? 'Dashboard Markdown template' : label} value={path} readOnly={index !== 1} disabled={busy}
              onChange={index === 1 ? event => setTemplatePath(event.target.value) : undefined} placeholder={index === 0 ? 'Retained in /docs/dashboards on save' : '/docs/dashboards/dashboard-… .md'} className="min-w-0 flex-1 rounded border bg-transparent p-2" />
            <button type="button" className={button} aria-label={`Open ${label}`} disabled={busy || !path} onClick={() => void openFile(path)}>Open</button>
          </span></label>)}
      </fieldset>
      <p>Template owner: GitHub/huijoohwee.github.io/template. Saved input and output are local workspace files; cloud sync is available from Source Files.</p>
      <div><button type="button" className={button} disabled={busy || (source === 'mission' ? !inspection : source === 'file' && !input)} onClick={() => void save()}>Save dashboard Markdown</button></div>
      <p role="status">{status}</p>
    </section>
  </details>
}
