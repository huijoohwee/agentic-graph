import { parseInvocationToken } from 'agentic-os/invocation'
import { DASHBOARD_WIDGETS_PATH, DASHBOARD_WIDGET_TEMPLATES, DASHBOARD_WIDGET_INVOCATION, widgetIdentity } from './dashboardWidgetToolContract.mjs'
export * from './dashboardWidgetToolContract.mjs'
const empty = () => ({ version: 1, widgets: {} })
export function parseDashboardWidgets(text, unwrapKeyTypeValue = value => value) {
  const object = input => { const value = unwrapKeyTypeValue(input); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected a Dashboard widget object.'); return value }
  if (text === null) return empty()
  if (text.length > 65536) throw Error('Dashboard widget configuration exceeds 64 KiB.')
  const doc = object(JSON.parse(text)), entries = Object.entries(object(unwrapKeyTypeValue(doc.widgets, 'widgets')))
  if (unwrapKeyTypeValue(doc.version, 'version') !== 1 || entries.length > 128) throw Error('Unsupported Dashboard widget configuration.')
  const widgets = {}
  for (const [id, raw] of entries) {
    if (!widgetIdentity.test(id)) throw Error('Invalid Dashboard widget identity.')
    const item = object(raw), next = {}
    for (const [key, value] of Object.entries(item).map(([key, value]) => [key, unwrapKeyTypeValue(value, key)])) {
      if (key === 'source' && typeof value === 'string' && /^graph:[a-zA-Z0-9_-]{1,80}$/.test(value)) next.source = value
      else if (['visible', 'expanded'].includes(key) && typeof value === 'boolean') next[key] = value
      else if (['title', 'subtitle', 'footnote'].includes(key) && typeof value === 'string' && value.length <= 256) Object.assign(next, { [key]: value })
      else if (key === 'kind' && ['bar', 'line', 'area', 'table'].includes(String(value))) next.kind = value
      else if (key === 'tone' && ['blue', 'green', 'amber', 'rose', 'slate'].includes(String(value))) next.tone = value
      else if (key === 'template' && DASHBOARD_WIDGET_TEMPLATES.includes(value)) next.template = value
      else if (key === 'markdown' && typeof value === 'string' && value.length <= 16000) next.markdown = value
      else if (key === 'aspectRatio' && ['16:9', '9:16', 'custom'].includes(value)) next.aspectRatio = value
      else if (['width', 'height'].includes(key) && Number.isFinite(value) && value >= 120 && value <= 4096) next[key] = value
      else if (key === 'columns' && Number.isInteger(value) && value >= 1 && value <= 12) next.columns = value
      else if (key === 'children' && Array.isArray(value) && value.length <= 128 && new Set(value).size === value.length && value.every(child => typeof child === 'string' && widgetIdentity.test(child) && child !== id)) next.children = value
      else if (key === 'order' && typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 10000) next.order = value
      else throw Error(`Invalid setting ${key} for ${id}.`)
    }
    if (next.children && next.template !== 'container') throw Error('Only a container can own children.');
    if (next.template === 'container' && !/^graph:[a-z][a-z0-9-]{0,73}$/.test(id)) throw Error('Choose a lowercase graph: container id.');
    widgets[id] = next
  }
  const owners = new Set();
  for (const item of Object.values(widgets)) for (const child of item.children || []) {
    if (owners.has(child) || widgets[child]?.template === 'container') throw Error('A widget has one container; nested containers are not supported.');
    owners.add(child);
  }
  const boards = {}
  if (doc.boards !== undefined) {
    const entries = Object.entries(object(doc.boards))
    if (entries.length > 32) throw Error('Too many Dashboard boards.')
    for (const [id, rows] of entries) {
      if (!/^[a-z][a-z0-9-]{0,79}$/.test(id) || !Array.isArray(rows) || rows.length > 128) throw Error('Invalid Dashboard board.')
      const seen = new Set()
      boards[id] = rows.map(row => {
        if (!Array.isArray(row) || !row.length || row.length > 12) throw Error('Invalid Dashboard columns.')
        return row.map(item => {
          if (typeof item !== 'string' || !widgetIdentity.test(item) || seen.has(item) || seen.size >= 128) throw Error('Invalid Dashboard placement.')
          seen.add(item); return item
        })
      })
    }
  }
  return { version: 1, widgets, ...(doc.boards === undefined ? {} : { boards }) }
}

/** Canonical / # @ tuple; parameters are data, never executable source. */
export function resolveWidgetCommand(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['operation', 'invocation', 'id', 'settings', 'template', 'aspectRatio', 'columns', 'boardId', 'rows', 'document', 'registryEntryId', 'layoutVariantId'].includes(key))) throw Error('Invalid widget request.')
  if (input.invocation !== undefined && (typeof input.invocation !== 'string' || input.invocation.length > 4096)) throw Error('Invalid widget invocation.');
  if (input.settings !== undefined && (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings))) throw Error('Invalid widget settings.');
  const request = { ...input }
  if (input.invocation !== undefined) {
    const tokens = String(input.invocation).trim().split(/\s+/)
    const tuple = tokens.splice(0, 3)
    if (tuple.join(' ') !== DASHBOARD_WIDGET_INVOCATION || tuple.some(token => parseInvocationToken(token).error)) throw Error(`Use ${DASHBOARD_WIDGET_INVOCATION} operation=inspect.`)
    const seen = new Set()
    for (const token of tokens) {
      const match = /^(operation|id|template|aspectRatio|columns|boardId|registryEntryId|layoutVariantId)=(\S+)$/.exec(token)
      if (!match || seen.has(match[1])) throw Error('Invalid or repeated widget invocation parameter.')
      const [, key, raw] = match, value = key === 'columns' ? Number(raw) : raw
      seen.add(key)
      if (request[key] !== undefined && request[key] !== value) throw Error(`Conflicting widget ${key}.`)
      request[key] = value
    }
  }
  const operation = request.operation || 'inspect'
  if (!['inspect', 'upsert', 'remove', 'layout', 'export', 'create', 'expand', 'collapse'].includes(operation)) throw Error('Unsupported widget operation.')
  const settings = { ...(request.settings || {}) }
  for (const key of ['template', 'aspectRatio', 'columns']) if (request[key] !== undefined) {
    if (settings[key] !== undefined && settings[key] !== request[key]) throw Error(`Conflicting widget ${key}.`)
    settings[key] = request[key]
  }
  const id = request.id || (['tree', 'codebase'].includes(settings.template) ? `mission:${settings.template}` : '')
  if (['upsert', 'remove', 'create', 'expand', 'collapse'].includes(operation) && !widgetIdentity.test(id)) throw Error('Choose a stable graph: or mission: widget id.')
  for (const key of ['registryEntryId', 'layoutVariantId']) if (request[key] !== undefined && (typeof request[key] !== 'string' || !request[key].trim() || request[key].length > 128)) throw Error(`Invalid widget ${key}.`)
  if (operation === 'create' && (Object.keys(settings).length || request.rows || request.boardId || request.document)) throw Error('Registry creation accepts an id and registry/layout variant. Configure Dashboard cards with upsert; edit Storyboard cards through Props.')
  return { ...request, operation, id, settings }
}

export function applyDashboardWidgetCommand(document, input = {}) {
  const before = parseDashboardWidgets(JSON.stringify(document)), request = resolveWidgetCommand(input)
  if (request.operation === 'create') throw Error('Registry Widget Card creation requires the browser WebMCP tool and an editable Storyboard.')
  const next = structuredClone(before)
  if (request.operation === 'upsert') next.widgets[request.id] = { ...next.widgets[request.id], ...request.settings, visible: request.settings.visible !== false }
  if (['expand', 'collapse'].includes(request.operation)) next.widgets[request.id] = { ...next.widgets[request.id], expanded: request.operation === 'expand' }
  if (request.operation === 'remove') next.widgets[request.id] = { ...next.widgets[request.id], visible: false }
  if (request.operation === 'layout') {
    if (!/^[a-z][a-z0-9-]{0,79}$/.test(request.boardId || '')) throw Error('Choose a Dashboard board.')
    let rows = request.rows
    if (!rows) {
      const ids = before.boards?.[request.boardId]?.flat()
      const columns = request.columns
      if (!ids || !Number.isInteger(columns) || columns < 1 || columns > 12) throw Error('Supply rows or an existing board and a column count from 1 to 12.')
      rows = []; for (let i = 0; i < ids.length; i += columns) rows.push(ids.slice(i, i + columns))
    }
    next.boards = { ...next.boards, [request.boardId]: rows }
  }
  const markdown = Object.entries(next.widgets).filter(([, widget]) => widget.visible !== false).map(([id, widget]) => {
    const title = widget.title || id, body = widget.markdown ?? widget.subtitle ?? ''
    if (widget.template !== 'disclosure') return [`## ${title}`, body].filter(Boolean).join('\n\n')
    const summary = title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    return `<details${widget.expanded === false ? '' : ' open'}>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`
  }).join('\n\n')
  return { ok: true, operation: request.operation, ...(request.operation === 'export' ? { markdown } : {}), path: DASHBOARD_WIDGETS_PATH, document: parseDashboardWidgets(JSON.stringify(next)) }
}

