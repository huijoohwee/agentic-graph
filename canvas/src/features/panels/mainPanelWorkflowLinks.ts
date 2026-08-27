import { parseMarkdownTableRows } from '@/features/panels/mainPanelMarkdownTable'

export const MAIN_PANEL_WORKFLOW_LINKS_DOC_PATH = 'docs/documents/agenticgraph-mainpanel-workflow-links.md'

export type MainPanelWorkflowLinkText = Readonly<{
  key: string
  value: string
  details: readonly string[]
}>

const splitDetails = (raw: string): string[] => String(raw || '')
  .split(';')
  .map(value => value.trim())
  .filter(Boolean)

export function parseMainPanelWorkflowLinkTexts(markdown: string): MainPanelWorkflowLinkText[] {
  return parseMarkdownTableRows(markdown)
    .map(row => ({
      key: String(row.key || '').trim(),
      value: String(row.value || '').trim(),
      details: splitDetails(row.details || ''),
    }))
    .filter(row => row.key.length > 0)
}

export function buildMainPanelWorkflowLinkTextMap(
  rows: readonly MainPanelWorkflowLinkText[],
): Record<string, MainPanelWorkflowLinkText> {
  return Object.fromEntries(rows.map(row => [row.key, row])) as Record<string, MainPanelWorkflowLinkText>
}

export async function loadMainPanelWorkflowLinkTexts(): Promise<Record<string, MainPanelWorkflowLinkText>> {
  try {
    const markdownModule = await import('../../../../docs/documents/agenticgraph-mainpanel-workflow-links.md?raw') as { default?: string }
    return buildMainPanelWorkflowLinkTextMap(parseMainPanelWorkflowLinkTexts(markdownModule.default || ''))
  } catch {
    return {}
  }
}
