import { useEffect, useSyncExternalStore } from 'react'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { subscribeWorkspaceFsChanged } from '@/features/workspace-fs/workspaceFsEvents'
import { unwrapKeyTypeValue } from '@/lib/graph/keyTypeValue'
import { parseDashboardWidgets as parseWidgetDocument } from './dashboardWidgetContract.mjs'
import type { DashboardCard, DashboardMetric } from './dashboardModel'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { readAgentRunWorkspace, useAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'
import { readDashboardSnapshot, updateDashboardSnapshotConfiguration, type DashboardSnapshot } from './dashboardMarkdownDocument'

/** One owner for authored settings and explicit, historical dashboard documents. */
import { DASHBOARD_WIDGETS_PATH } from './dashboardWidgetToolContract.mjs'
export { DASHBOARD_WIDGETS_PATH }
export type DashboardWidgetSettings = { source?: string; visible?: boolean; expanded?: boolean; title?: string; subtitle?: string; footnote?: string; kind?: DashboardCard['kind']; tone?: DashboardCard['tone']; order?: number; template?: string; markdown?: string; aspectRatio?: '16:9' | '9:16' | 'custom'; width?: number; height?: number; columns?: number; children?: string[] }
export type DashboardWidgetDocument = { version: 1; widgets: Record<string, DashboardWidgetSettings>; boards?: Record<string, string[][]> }
const empty = (): DashboardWidgetDocument => ({ version: 1, widgets: {} })
export const parseDashboardWidgets = (text: string | null): DashboardWidgetDocument => parseWidgetDocument(text, unwrapKeyTypeValue) as DashboardWidgetDocument
let snapshot: { document: DashboardWidgetDocument; error: string; ready: boolean; sourcePath: string; scope: string; dashboard: DashboardSnapshot | null } = {
  document: empty(), error: '', ready: false, sourcePath: DASHBOARD_WIDGETS_PATH, scope: '', dashboard: null }
const sourceScope = () => readAgentRunWorkspace() ? 'mission' : useMarkdownExplorerStore.getState().activePath ?? ''
const listeners = new Set<() => void>()
const emit = () => { for (const listener of listeners) listener() }
let generation = 0, pending: Promise<unknown> = Promise.resolve()
async function reload() {
  const ticket = ++generation, scope = sourceScope()
  try {
    const fs = await getWorkspaceFs()
    let selectedPath = scope
    let selected = scope !== 'mission' && /\.(md|markdown|mdx|json)$/i.test(scope) ? await fs.readFileText(scope) : null
    if (selected && /\.json$/i.test(scope)) {
      let output: unknown
      try { output = JSON.parse(selected).dashboard_output } catch { /* Ordinary JSON has no report association. */ }
      if (typeof output === 'string' && output.startsWith('/docs/dashboards/') && output.endsWith('.md') && !output.split('/').includes('..')) {
        selectedPath = output; selected = await fs.readFileText(output)
      } else selected = null
    }
    const dashboard = selected ? readDashboardSnapshot(selected) : null
    if (dashboard && selectedPath !== scope && dashboard.files?.input !== scope) throw Error('Dashboard input/output association changed.')
    const document = dashboard?.configuration ?? parseDashboardWidgets(await fs.readFileText(DASHBOARD_WIDGETS_PATH))
    if (ticket === generation && scope === sourceScope()) { snapshot = { document, dashboard, sourcePath: dashboard ? selectedPath : DASHBOARD_WIDGETS_PATH, scope, error: '', ready: true }; emit() }
  } catch (error) { if (ticket === generation) { snapshot = { ...snapshot, scope, ready: true, error: String((error as Error).message) }; emit() } }
}
export function useDashboardWidgets() {
  const activePath = useMarkdownExplorerStore(state => state.activePath), workspace = useAgentRunWorkspace()
  const scope = workspace ? 'mission' : activePath ?? ''
  const value = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => snapshot, () => snapshot)
  useEffect(() => {
    void reload()
    return subscribeWorkspaceFsChanged(detail => { if (!detail.path || detail.path === DASHBOARD_WIDGETS_PATH || detail.path === scope || detail.path === snapshot.sourcePath) void reload() })
  }, [scope])
  return value
}
export async function readDashboardWidgetConfiguration() {
  await reload()
  if (!snapshot.ready || snapshot.error || snapshot.scope !== sourceScope()) throw Error(snapshot.error || 'Dashboard source changed. Inspect it again.')
  return snapshot
}
export function updateDashboardWidget(id: string, update: DashboardWidgetSettings): Promise<void> {
  return updateDashboardWidgets({ [id]: update })
}
export function updateDashboardWidgets(updates: Record<string, DashboardWidgetSettings | null>, boards?: Record<string, string[][]>): Promise<void> {
  return mutateDashboardWidgets(document => {
    for (const [id, update] of Object.entries(updates)) { if (update === null) delete document.widgets[id]; else document.widgets[id] = { ...document.widgets[id], ...update } }
    if (boards) document.boards = { ...document.boards, ...boards }
    return document
  })
}
export function mutateDashboardWidgets(edit: (document: DashboardWidgetDocument) => DashboardWidgetDocument): Promise<void> {
  const scope = sourceScope()
  const operation = pending.then(async () => {
    const current = await readDashboardWidgetConfiguration(), sourcePath = current.sourcePath
    if (current.scope !== scope || sourceScope() !== scope) throw Error('Dashboard source changed or is invalid. Reopen the card before editing.')
    const fs = await getWorkspaceFs(), before = await fs.readFileText(sourcePath)
    const portable = before && sourcePath !== DASHBOARD_WIDGETS_PATH ? readDashboardSnapshot(before) : null
    if (sourcePath !== DASHBOARD_WIDGETS_PATH && !portable) throw Error('Dashboard document was replaced.')
    const document = edit(portable?.configuration ?? parseDashboardWidgets(before))
    const validated = parseDashboardWidgets(JSON.stringify(document))
    const text = portable ? updateDashboardSnapshotConfiguration(before!, validated) : JSON.stringify(validated, null, 2) + '\n'
    // Read immediately before write; never replace concurrent Editor edits with a stale form.
    if (await fs.readFileText(sourcePath) !== before || sourceScope() !== scope) throw Error('Dashboard configuration changed. Retry this edit.')
    if (before === null) {
      if (!(await fs.listEntries()).some(entry => entry.path === '/notes' && entry.kind === 'folder')) await fs.createFolder({ parentPath: '/', name: 'notes', mirrorToHost: false })
      await fs.createFile({ parentPath: '/notes', name: 'dashboard.widgets.json', text, mirrorToHost: false })
    } else await fs.writeFileText(sourcePath, text, { mirrorToHost: false })
    await reload()
  })
  pending = operation.catch(error => { snapshot = { ...snapshot, error: String(error.message) }; emit() })
  return operation
}
export const widgetSettings = (document: DashboardWidgetDocument, id: string) => document.widgets[id] ?? {}
export function configureDashboardCards(document: DashboardWidgetDocument, cards: DashboardCard[], allCards = cards): DashboardCard[] {
  const instances = [...cards.map(card => {
    const source = allCards.find(item => `graph:${item.id}` === widgetSettings(document, `graph:${card.id}`).source)
    return source ? { ...source, id: card.id } : card
  }), ...Object.entries(document.widgets).flatMap(([id, settings]) => {
    const source = cards.find(card => `graph:${card.id}` === settings.source)
    return source && id.startsWith('graph:') && !allCards.some(card => `graph:${card.id}` === id) ? [{ ...source, id: id.slice('graph:'.length) }] : []
  })]
  return instances.filter(card => widgetSettings(document, `graph:${card.id}`).visible !== false)
    .map(card => ({ ...card, ...Object.fromEntries(Object.entries(widgetSettings(document, `graph:${card.id}`)).filter(([key]) => !['visible', 'order', 'source'].includes(key))) }))
    .map(card => ({ ...card, rows: card.rows.length ? card.rows : card.series.map((point, index) => ({ id: `point-${index}`, label: point.label, value: String(point.value), detail: point.detail })), series: card.series.length ? card.series : card.rows.flatMap(row => Number.isFinite(Number(row.value)) ? [{ label: row.label, value: Number(row.value), detail: row.detail }] : []) }))
    .sort((a, b) => (widgetSettings(document, `graph:${a.id}`).order ?? 0) - (widgetSettings(document, `graph:${b.id}`).order ?? 0))
}
export function configureDashboardMetrics(document: DashboardWidgetDocument, metrics: DashboardMetric[]): DashboardMetric[] {
  const instances = [...metrics.map(metric => {
    const source = metrics.find(item => `graph:${item.id}` === widgetSettings(document, `graph:${metric.id}`).source)
    return source ? { ...source, id: metric.id } : metric
  }), ...Object.entries(document.widgets).flatMap(([id, settings]) => {
    const source = metrics.find(metric => `graph:${metric.id}` === settings.source)
    return source && id.startsWith('graph:') && !metrics.some(metric => `graph:${metric.id}` === id) ? [{ ...source, id: id.slice('graph:'.length) }] : []
  })]
  return instances.filter(metric => widgetSettings(document, `graph:${metric.id}`).visible !== false).map(metric => {
    const config = widgetSettings(document, `graph:${metric.id}`)
    return { ...metric, label: config.title ?? metric.label, detail: config.subtitle ?? metric.detail, tone: config.tone ?? metric.tone }
  }).sort((a, b) => (widgetSettings(document, `graph:${a.id}`).order ?? 0) - (widgetSettings(document, `graph:${b.id}`).order ?? 0))
}

export function authoredDashboardWidgets(document: DashboardWidgetDocument, sourceIds: string[] = []) {
  return Object.entries(document.widgets).filter(([id, config]) => id.startsWith('graph:') && !sourceIds.includes(id)
    && !id.startsWith('graph:container-') && id !== 'graph:header' && config.template && !config.source && config.visible !== false)
}
