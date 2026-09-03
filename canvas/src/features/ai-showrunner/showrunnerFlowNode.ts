import type { WidgetRegistryEntry, WidgetRegistryField, WidgetRegistryPort } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { createShowrunnerOrchestrator } from './showrunnerOrchestrator'

export const FLOW_SHOWRUNNER_NODE_TYPE_ID = 'showrunner' as const
export const FLOW_SHOWRUNNER_WIDGET_TYPE_ID = 'agentic-graph-showrunner' as const
export const FLOW_SHOWRUNNER_FORM_ID = 'showrunner-form' as const

const SHOWRUNNER_FIELDS: WidgetRegistryField[] = [
  { fieldKey: 'brief_path', label: 'Brief Path', fieldType: 'text', schemaPath: 'properties.brief_path' },
  { fieldKey: 'brief_markdown', label: 'Brief Markdown', fieldType: 'textarea', schemaPath: 'properties.brief_markdown' },
  { fieldKey: 'run_id', label: 'Run ID', fieldType: 'text', schemaPath: 'properties.run_id' },
  { fieldKey: 'dry_run', label: 'Dry Run Mode', fieldType: 'boolean', schemaPath: 'properties.dry_run' },
  { fieldKey: 'run_status', label: 'Run Status', fieldType: 'text', schemaPath: 'properties.run_status' },
  { fieldKey: 'latest_artifact_path', label: 'Latest Artifact Path', fieldType: 'text', schemaPath: 'properties.latest_artifact_path' },
  { fieldKey: 'token_spend_summary', label: 'Token Spend Summary', fieldType: 'textarea', schemaPath: 'properties.token_spend_summary' },
]

const SHOWRUNNER_PORTS: WidgetRegistryPort[] = [
  { portKey: 'brief_path', direction: 'input', schemaPath: 'properties.brief_path' },
  { portKey: 'brief_markdown', direction: 'input', schemaPath: 'properties.brief_markdown' },
  { portKey: 'run_id', direction: 'input', schemaPath: 'properties.run_id' },
  { portKey: 'dry_run', direction: 'input', schemaPath: 'properties.dry_run' },
  { portKey: 'run_status', direction: 'output', schemaPath: 'properties.run_status' },
  { portKey: 'latest_artifact_path', direction: 'output', schemaPath: 'properties.latest_artifact_path' },
  { portKey: 'token_spend_summary', direction: 'output', schemaPath: 'properties.token_spend_summary' },
]

export const SHOWRUNNER_WIDGET_ENTRY: WidgetRegistryEntry = {
  id: 'agentic-graph-showrunner-v1',
  isEnabled: true,
  nodeTypeId: FLOW_SHOWRUNNER_NODE_TYPE_ID,
  widgetTypeId: FLOW_SHOWRUNNER_WIDGET_TYPE_ID,
  formId: FLOW_SHOWRUNNER_FORM_ID,
  fields: SHOWRUNNER_FIELDS,
  ports: SHOWRUNNER_PORTS,
  schemaMappings: [],
  updatedAt: '2026-06-19T00:00:00.000Z',
}

export function buildShowrunnerRegistryDraft(): Omit<WidgetRegistryEntry, 'updatedAt'> {
  const { updatedAt: _updatedAt, ...draft } = SHOWRUNNER_WIDGET_ENTRY
  return { ...draft, id: '' }
}

export async function runShowrunnerWidgetProperties(properties: Record<string, unknown>): Promise<Record<string, unknown>> {
  const orchestrator = createShowrunnerOrchestrator()
  const briefText = String(properties.brief_markdown || properties.brief_path || '').trim()
  if (!briefText) return { ...properties, run_status: 'brief_missing' }
  const result = await orchestrator.startRun(briefText)
  const status = await orchestrator.runStatus(result.runId)
  const latestArtifactPath = status.source_file_paths[status.source_file_paths.length - 1] || status.brief_path
  return {
    ...properties,
    run_id: result.runId,
    run_status: status.status,
    latest_artifact_path: latestArtifactPath,
    token_spend_summary: JSON.stringify({
      run_token_total: status.run_token_total,
      token_budget: status.token_budget,
      token_budget_remaining: status.token_budget_remaining,
      paid_call_count: status.paid_call_count,
    }),
  }
}
