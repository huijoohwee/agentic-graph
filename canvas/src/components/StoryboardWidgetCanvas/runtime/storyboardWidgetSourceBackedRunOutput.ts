import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphNode } from '@/lib/graph/types'
import { buildTextWidgetOutputPatch } from '@/features/chat/richMediaRun'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

const RUN_OUTPUT_KEYS = [
  'lane',
  'summary',
  'action',
  'prompt',
  'output',
  'invocation',
  'kgc:readingSummary',
  'runtimeProof',
  'validationStatus',
  'canvas:widgetCard',
] as const

const cleanString = (value: unknown): string => {
  const unwrapped = unwrapGraphCellValue(value)
  if (typeof unwrapped === 'string') return unwrapped.trim()
  if (Array.isArray(unwrapped) || (unwrapped && typeof unwrapped === 'object')) {
    try {
      return JSON.stringify(unwrapped)
    } catch {
      return ''
    }
  }
  return typeof unwrapped === 'number' || typeof unwrapped === 'boolean' ? String(unwrapped) : ''
}

export const buildStoryboardWidgetSourceBackedRunOutput = (node: GraphNode): string => {
  const properties = (node.properties || {}) as Record<string, unknown>
  const title = cleanString(node.label) || cleanString(node.id) || 'Storyboard card'
  const type = cleanString(node.type) || 'node'
  const rows = RUN_OUTPUT_KEYS
    .map(key => [key, cleanString(properties[key])] as const)
    .filter(([, value]) => value)
  const table = rows.length
    ? serializeMarkdownPipeTable({ columns: ['Field', 'Source-backed value'], rows }).join('\n')
    : 'No source-backed card fields were available beyond node identity.'
  return [
    `# ${title}`,
    '',
    `Run-ready card output generated from the selected ${type} node without a provider call.`,
    '',
    table,
  ].join('\n')
}

export const publishStoryboardWidgetSourceBackedRunOutput = (args: {
  id: string
  node: GraphNode
  updateRunOutputForKnownNodeIds: (buildPatch: (nodeProps: Record<string, unknown>) => Record<string, unknown>) => void
  publishTextRunOutputToRichMediaPanel: (panelArgs: { anchorNode: GraphNode; outputText: string; title: string; model?: unknown; loading?: boolean }) => void
  upsertUiToast: (toast: { id: string; kind: 'neutral'; message: string; ttlMs: number }) => void
}): void => {
  const output = buildStoryboardWidgetSourceBackedRunOutput(args.node)
  const title = args.node.label || args.node.id || 'Storyboard card'
  args.updateRunOutputForKnownNodeIds(nodeProps => ({
    ...nodeProps,
    ...buildTextWidgetOutputPatch({ output, title, model: 'source-backed-card-run' }),
  }))
  args.publishTextRunOutputToRichMediaPanel({
    anchorNode: args.node,
    outputText: output,
    title,
    model: 'source-backed-card-run',
    loading: false,
  })
  args.upsertUiToast({
    id: `storyboard-widget-run-${args.id}`,
    kind: 'neutral',
    message: 'Generated source-backed Rich Media output.',
    ttlMs: 2200,
  })
}
