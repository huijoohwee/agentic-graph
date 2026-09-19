import { useEffect, useSyncExternalStore } from 'react'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { subscribeWorkspaceFsChanged } from '@/features/workspace-fs/workspaceFsEvents'
import { unwrapKeyTypeValue } from '@/lib/graph/keyTypeValue'
import { parseDashboardWidgets as parseWidgetDocument } from './dashboardWidgetContract.mjs'
import type { DashboardCard, DashboardMetric } from './dashboardModel'

/** Authored display configuration only. Run evidence never enters this source file. */
import { DASHBOARD_WIDGETS_PATH } from './dashboardWidgetToolContract.mjs'
export { DASHBOARD_WIDGETS_PATH }
export type DashboardWidgetSettings = { source?: string; visible?: boolean; expanded?: boolean; title?: string; subtitle?: string; footnote?: string; kind?: DashboardCard['kind']; tone?: DashboardCard['tone']; order?: number; template?: string; markdown?: string; aspectRatio?: '16:9' | '9:16' | 'custom'; width?: number; height?: number; columns?: number; children?: string[] }
export type DashboardWidgetDocument = { version: 1; widgets: Record<string, DashboardWidgetSettings>; boards?: Record<string, string[][]> }
const empty = (): DashboardWidgetDocument => ({ version: 1, widgets: {} })
export const parseDashboardWidgets = (text: string | null): DashboardWidgetDocument => parseWidgetDocument(text, unwrapKeyTypeValue) as DashboardWidgetDocument
let snapshot = { document: empty(), error: '', ready: false }
const listeners = new Set<() => void>()
const emit = () => { for (const listener of listeners) listener() }
let generation = 0, pending: Promise<unknown> = Promise.resolve()
async function reload() {
  const ticket = ++generation
  try {
    const fs = await getWorkspaceFs(), document = parseDashboardWidgets(await fs.readFileText(DASHBOARD_WIDGETS_PATH))
    if (ticket === generation) { snapshot = { document, error: '', ready: true }; emit() }
  } catch (error) { if (ticket === generation) { snapshot = { ...snapshot, ready: true, error: String((error as Error).message) }; emit() } }
}
export function useDashboardWidgets() {
  const value = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => snapshot, () => snapshot)
  useEffect(() => {
    void reload()
    return subscribeWorkspaceFsChanged(detail => { if (!detail.path || detail.path === DASHBOARD_WIDGETS_PATH) void reload() })
  }, [])
  return value
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
  const operation = pending.then(async () => {
    const fs = await getWorkspaceFs(), before = await fs.readFileText(DASHBOARD_WIDGETS_PATH), document = edit(parseDashboardWidgets(before))
    const text = JSON.stringify(parseDashboardWidgets(JSON.stringify(document)), null, 2) + '\n'
    // Read immediately before write; never replace concurrent Editor edits with a stale form.
    if (await fs.readFileText(DASHBOARD_WIDGETS_PATH) !== before) throw Error('Dashboard configuration changed. Retry this edit.')
    if (before === null) {
      if (!(await fs.listEntries()).some(entry => entry.path === '/notes' && entry.kind === 'folder')) await fs.createFolder({ parentPath: '/', name: 'notes', mirrorToHost: false })
      await fs.createFile({ parentPath: '/notes', name: 'dashboard.widgets.json', text, mirrorToHost: false })
    } else await fs.writeFileText(DASHBOARD_WIDGETS_PATH, text, { mirrorToHost: false })
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
