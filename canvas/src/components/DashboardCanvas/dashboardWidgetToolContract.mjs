export const DASHBOARD_WIDGETS_PATH = '/notes/dashboard.widgets.json'
export const DASHBOARD_WIDGET_TEMPLATES = Object.freeze(['metric', 'bar', 'line', 'area', 'table', 'tree', 'codebase', 'heading', 'text', 'divider', 'container', 'disclosure'])
export const DASHBOARD_WIDGET_TOOL_ID = 'control_local_widget'
export const DASHBOARD_WIDGET_INVOCATION = '/canvas.widget #widget @dashboard'
export const widgetIdentity = /^(graph|mission):[a-zA-Z0-9_-]{1,80}$/

export function buildDashboardWidgetToolContract() {
  const settings = { type: 'object', additionalProperties: false, properties: {
    template: { type: 'string', enum: DASHBOARD_WIDGET_TEMPLATES }, source: { type: 'string' },
    title: { type: 'string', maxLength: 256 }, subtitle: { type: 'string', maxLength: 256 }, footnote: { type: 'string', maxLength: 256 },
    markdown: { type: 'string', maxLength: 16000 }, visible: { type: 'boolean' }, expanded: { type: 'boolean' },
    kind: { type: 'string', enum: ['bar', 'line', 'area', 'table'] }, tone: { type: 'string', enum: ['blue', 'green', 'amber', 'rose', 'slate'] },
    aspectRatio: { type: 'string', enum: ['16:9', '9:16', 'custom'] },
    width: { type: 'number', minimum: 120, maximum: 4096 }, height: { type: 'number', minimum: 120, maximum: 4096 },
    order: { type: 'integer', minimum: -10000, maximum: 10000 }, columns: { type: 'integer', minimum: 1, maximum: 12 },
    children: { type: 'array', maxItems: 128, uniqueItems: true, items: { type: 'string' } },
  } }
  return { name: DASHBOARD_WIDGET_TOOL_ID, webName: `agentic-graph.${DASHBOARD_WIDGET_TOOL_ID}`, title: 'Configure Widget Cards',
    description: `Inspect, upsert, expand, collapse, hide, arrange or export Widget Cards. ${DASHBOARD_WIDGET_INVOCATION} operation=upsert id=graph:notes template=text. WebMCP edits the active workspace. Expand/collapse ids include mission:index-economics and mission:execution-economics. Create invokes an enabled registry card in an editable Storyboard. Native MCP transforms the supplied document and returns the same importable configuration.`,
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      operation: { type: 'string', enum: ['inspect', 'upsert', 'remove', 'layout', 'export', 'create', 'expand', 'collapse'] }, invocation: { type: 'string', maxLength: 4096 },
      id: { type: 'string', pattern: widgetIdentity.source }, settings,
      registryEntryId: { type: 'string', maxLength: 128 }, layoutVariantId: { type: 'string', maxLength: 128 },
      template: settings.properties.template, aspectRatio: settings.properties.aspectRatio, columns: settings.properties.columns,
      boardId: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,79}$' },
      rows: { type: 'array', maxItems: 128, items: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string', pattern: widgetIdentity.source } } },
      document: { type: 'object', description: 'Native MCP input document; in WebMCP this is an optional exact expected document.', additionalProperties: true },
    } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true } }
}
