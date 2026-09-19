import { readMissionDashboardSnapshot, type MissionDashboardSnapshot, type DashboardFilePaths } from '@/features/agent-ready/agentMissionDashboardSnapshot'
import { dump } from 'js-yaml'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { getObjectPath } from '@/lib/data/objectPath'
import { parseMarkdownVariableTokens } from '@/features/markdown/ui/markdownVariableReferences'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import { parseDashboardWidgets } from './dashboardWidgetContract.mjs'
import type { DashboardWidgetDocument, DashboardWidgetSettings } from './dashboardWidgetConfiguration'

export const DASHBOARD_TEMPLATE_SCHEMA = 'agentic-graph/dashboard-template/v1'
export const DASHBOARD_SNAPSHOT_SCHEMA = 'agentic-graph/dashboard-snapshot/v1'
export const DASHBOARD_EVENT_SCHEMA = 'agentic-graph/dashboard-event/v1'
export const DASHBOARD_DOCUMENT_LIMIT = 2 * 1024 * 1024
const START = '<!-- dashboard:generated:start -->', END = '<!-- dashboard:generated:end -->'
type Scalar = string | number | boolean | null
export type DashboardEvent = { schema: typeof DASHBOARD_EVENT_SCHEMA; sourceId: string; sequence: number; observedAt: number; complete: boolean; data: Record<string, unknown> }
export type DashboardValue = { value?: Scalar; columns?: string[]; rows?: Scalar[][] }
export type DashboardSnapshot = {
  template: { id: string; version: string }
  source: Omit<DashboardEvent, 'data' | 'schema'>
  configuration: DashboardWidgetDocument
  values: Record<string, DashboardValue>
  mission?: MissionDashboardSnapshot
  files?: DashboardFilePaths
}
type Binding = { value?: string; rows?: string; columns?: { label: string; path: string }[] }
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected a dashboard object.')
  return value as Record<string, unknown>
}
const bounded = (text: string, limit = DASHBOARD_DOCUMENT_LIMIT) => {
  if (new TextEncoder().encode(text).length > limit) throw Error('Dashboard document exceeds its byte limit.')
  return text
}
const scalar = (value: unknown): Scalar => {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' && value.length <= 16000 || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value as Scalar
  throw Error('Dashboard values must be finite scalars.')
}
export const dashboardValueText = (value: unknown) => value === null || value === undefined ? 'Unknown' : String(value)
/** Literal observation data never becomes markup, a variable or an invocation. */
export const dashboardLiteral = (value: unknown) => dashboardValueText(value).replace(/[&<>\\`*_{}[\]()|/#@!\r\n]/g,
  char => `&#${char.charCodeAt(0)};`)
const readPath = (value: unknown, path: string) => {
  if (typeof path !== 'string' || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+|\[\d+\])*$/.test(path)
    || path.length > 128 || /(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$)/.test(path)) throw Error('Invalid dashboard binding path.')
  return getObjectPath(value, path)
}
function parseDocument(text: string) {
  bounded(text)
  const lines = splitMarkdownLines(text), parsed = parseMarkdownFrontmatter(lines)
  if (!text.startsWith('---') || parsed.warnings.length || !parsed.startIndex) throw Error('Dashboard requires valid YAML frontmatter.')
  return { meta: parsed.meta, body: lines.slice(parsed.startIndex).join('\n') }
}
export function validateDashboardEvent(input: unknown): DashboardEvent {
  const event = object(input)
  if (event.schema !== DASHBOARD_EVENT_SCHEMA || typeof event.sourceId !== 'string' || !event.sourceId || event.sourceId.length > 256
    || !Number.isSafeInteger(event.sequence) || Number(event.sequence) < 0
    || !Number.isSafeInteger(event.observedAt) || Number(event.observedAt) < 0 || Number(event.observedAt) > 8640000000000000
    || typeof event.complete !== 'boolean') throw Error('Invalid dashboard snapshot identity or revision.')
  const data = object(event.data)
  bounded(JSON.stringify(data), 1024 * 1024)
  return { schema: DASHBOARD_EVENT_SCHEMA, sourceId: event.sourceId, sequence: event.sequence as number,
    observedAt: event.observedAt as number, complete: event.complete, data }
}
function validateSnapshot(input: unknown): DashboardSnapshot {
  const value = object(input), template = object(value.template), source = object(value.source)
  if (typeof template.id !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(template.id)
    || typeof template.version !== 'string' || !/^[0-9]+(?:\.[0-9]+){0,2}$/.test(template.version)) throw Error('Invalid dashboard template identity.')
  const event = validateDashboardEvent({ ...source, schema: DASHBOARD_EVENT_SCHEMA, data: {} })
  const configuration = parseDashboardWidgets(JSON.stringify(value.configuration)) as DashboardWidgetDocument
  const values: Record<string, DashboardValue> = {}
  for (const [id, raw] of Object.entries(object(value.values))) {
    if (!Object.hasOwn(configuration.widgets, id)) throw Error('Dashboard values reference an unknown widget.')
    const item = object(raw), next: DashboardValue = {}
    if (Object.hasOwn(item, 'value')) next.value = scalar(item.value)
    if (item.rows !== undefined || item.columns !== undefined) {
      if (!Array.isArray(item.columns) || !item.columns.length || item.columns.length > 16
        || item.columns.some(label => typeof label !== 'string' || label.length > 128)
        || !Array.isArray(item.rows) || item.rows.length > 2048) throw Error('Dashboard table exceeds its row or column limits.')
      next.columns = item.columns as string[]
      next.rows = item.rows.map(row => {
        if (!Array.isArray(row) || row.length !== next.columns!.length) throw Error('Dashboard table columns do not match.')
        return row.map(scalar)
      })
    }
    values[id] = next
  }
  const mission = value.mission === undefined ? undefined : readMissionDashboardSnapshot(value.mission)
  if (mission && (mission.trace.runId !== event.sourceId || mission.trace.observedAt !== event.observedAt)) throw Error('Mission evidence differs from the dashboard source.')
  const files = value.files === undefined ? undefined : object(value.files)
  if (files && ['input', 'template', 'output'].some(key => typeof files[key] !== 'string' || !(files[key] as string).startsWith('/') || (files[key] as string).split('/').includes('..'))) throw Error('Dashboard file paths must name workspace files.')
  return { ...(mission ? { mission } : {}), ...(files ? { files: files as DashboardFilePaths } : {}), template: { id: template.id, version: template.version }, source: { sourceId: event.sourceId,
    sequence: event.sequence, observedAt: event.observedAt, complete: event.complete }, configuration, values }
}
export function readDashboardSnapshot(text: string): DashboardSnapshot | null {
  // Ordinary Markdown retains its existing path. A declared malformed snapshot fails visibly.
  if (!text.startsWith('---') || !text.includes(DASHBOARD_SNAPSHOT_SCHEMA)) return null
  const { meta } = parseDocument(text)
  if (meta.schema !== DASHBOARD_SNAPSHOT_SCHEMA) return null
  return validateSnapshot(meta.dashboard_snapshot)
}
export function dashboardGeneratedMarkdown(snapshot: DashboardSnapshot): string {
  const { configuration, values } = snapshot
  const ordered = [...new Set([...Object.values(configuration.boards ?? {}).flat(2), ...Object.keys(configuration.widgets)])]
  return ordered.flatMap(id => {
    const config = configuration.widgets[id], value = values[config?.source ?? id]
    if (!config || config.visible === false) return []
    const body = dashboardWidgetMarkdown(config, value)
    return [`## ${dashboardLiteral(config.title ?? id)}\n\n${body}`]
  }).join('\n\n')
}
export function dashboardWidgetMarkdown(config: DashboardWidgetSettings, value?: DashboardValue): string {
  return config.markdown ?? (value?.rows ? serializeMarkdownPipeTable({ columns: value.columns!, rows: value.rows.map(row => row.map(dashboardLiteral)) }).join('\n')
    : value && Object.hasOwn(value, 'value') ? dashboardLiteral(value.value) : config.subtitle ?? '')
}
function serialize(meta: Record<string, unknown>, body: string) {
  return bounded(`---\n${dump(meta, { noRefs: true, lineWidth: -1, sortKeys: false })}---\n${body.replace(/^\n*/, '\n')}`)
}
export function projectDashboardMarkdown(templateText: string, input: unknown, settings?: DashboardWidgetDocument, files?: DashboardFilePaths): string {
  const event = validateDashboardEvent(input), { meta, body } = parseDocument(bounded(templateText, 128 * 1024))
  if (meta.schema !== DASHBOARD_TEMPLATE_SCHEMA) throw Error('Choose a dashboard Markdown template.')
  const mission = meta.mission_snapshot === undefined ? undefined : readMissionDashboardSnapshot(readPath(event.data, String(meta.mission_snapshot)))
  const configuration = parseDashboardWidgets(JSON.stringify(meta.dashboard)) as DashboardWidgetDocument
  if (mission && settings) {
    for (const [id, config] of Object.entries(settings.widgets)) configuration.widgets[id] = { ...configuration.widgets[id], ...config }
    configuration.boards = { ...configuration.boards, ...settings.boards }
  }
  for (const [id, config] of Object.entries(configuration.widgets)) {
    const override = settings?.widgets[id]
    if (override) configuration.widgets[id] = { ...config, ...override }
  }
  for (const id of Object.keys(configuration.boards ?? {})) if (settings?.boards?.[id]) configuration.boards![id] = settings.boards[id]
  const values: Record<string, DashboardValue> = {}
  let projectedBytes = 0
  const bindScalar = (input: unknown) => {
    const value = scalar(input)
    projectedBytes += new TextEncoder().encode(JSON.stringify(value)).length + 1
    if (projectedBytes > DASHBOARD_DOCUMENT_LIMIT / 2) throw Error('Dashboard projection exceeds its value byte limit.')
    return value
  }
  for (const [id, raw] of Object.entries(object(meta.bindings))) {
    if (!Object.hasOwn(configuration.widgets, id)) throw Error('Template binding references an unknown widget.')
    const binding = object(raw) as Binding, value: DashboardValue = {}
    if (binding.value !== undefined) value.value = bindScalar(readPath(event.data, binding.value))
    if (binding.rows !== undefined) {
      const rows = readPath(event.data, binding.rows)
      if (!Array.isArray(rows) || rows.length > 2048 || !Array.isArray(binding.columns) || !binding.columns.length || binding.columns.length > 16) throw Error('Template table requires at most 2,048 rows and 16 columns.')
      value.columns = binding.columns.map(column => column.label)
      value.rows = rows.map(row => binding.columns!.map(column => bindScalar(readPath(row, column.path))))
    }
    values[id] = value
  }
  const snapshot = validateSnapshot({ template: { id: meta.template_id, version: String(meta.template_version) },
    source: event, configuration, values, ...(mission ? { mission } : {}), ...(files ? { files } : {}) })
  let rendered = body
  for (const token of parseMarkdownVariableTokens(body).reverse()) {
    const value = token.declaredValue ?? readPath(event.data, token.key) ?? token.fallback ?? null
    rendered = rendered.slice(0, token.start) + dashboardLiteral(bindScalar(value)) + rendered.slice(token.end)
  }
  if (rendered.includes(START) || rendered.includes(END)) throw Error('Template body contains reserved dashboard boundaries.')
  return serialize({ schema: DASHBOARD_SNAPSHOT_SCHEMA, title: meta.title ?? meta.template_id,
    kgCanvasRenderMode: '2d', kgCanvas2dRenderer: 'dashboard', dashboard_snapshot: snapshot },
  `${rendered.trim()}\n\nObserved: ${new Date(event.observedAt).toISOString()} · ${event.complete ? 'Complete' : 'Partial'} coverage · Historical snapshot\n\n${START}\n${dashboardGeneratedMarkdown(snapshot)}\n${END}\n\n## Notes\n\n`)
}
/** Preserve authored prefix/suffix and unknown frontmatter; replace only the generated projection. */
export function updateDashboardSnapshotConfiguration(text: string, configuration: DashboardWidgetDocument): string {
  const snapshot = readDashboardSnapshot(text)
  if (!snapshot) throw Error('Dashboard snapshot is unavailable.')
  const { meta, body } = parseDocument(text)
  const start = body.indexOf(START), end = body.indexOf(END)
  if (start < 0 || end < start || body.lastIndexOf(START) !== start || body.lastIndexOf(END) !== end) throw Error('Dashboard generated boundaries changed. Restore them before configuring cards.')
  const next = validateSnapshot({ ...snapshot, configuration })
  return serialize({ ...meta, dashboard_snapshot: next }, `${body.slice(0, start + START.length)}\n${dashboardGeneratedMarkdown(next)}\n${body.slice(end)}`)
}
