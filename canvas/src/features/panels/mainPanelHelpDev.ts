import { parseMarkdownTableRows } from '@/features/panels/mainPanelMarkdownTable'

export const MAIN_PANEL_HELP_DEV_DOC_PATH = 'docs/documents/agentic-graph-mainpanel-help-dev.md'

export type MainPanelHelpDevText = Readonly<{
  key: string
  value: string
  details: readonly string[]
}>

const splitDetails = (raw: string): string[] => String(raw || '')
  .split(';')
  .map(value => value.trim())
  .filter(Boolean)

export function parseMainPanelHelpDevTexts(markdown: string): MainPanelHelpDevText[] {
  return parseMarkdownTableRows(markdown)
    .map(row => ({
      key: String(row.key || '').trim(),
      value: String(row.value || '').trim(),
      details: splitDetails(row.details || ''),
    }))
    .filter(row => row.key.length > 0)
}

export function buildMainPanelHelpDevTextMap(
  rows: readonly MainPanelHelpDevText[],
): Record<string, MainPanelHelpDevText> {
  return Object.fromEntries(rows.map(row => [row.key, row])) as Record<string, MainPanelHelpDevText>
}

export async function loadMainPanelHelpDevTexts(): Promise<Record<string, MainPanelHelpDevText>> {
  try {
    const markdownModule = await import('../../../../docs/documents/agentic-graph-mainpanel-help-dev.md?raw') as { default?: string }
    return buildMainPanelHelpDevTextMap(parseMainPanelHelpDevTexts(markdownModule.default || ''))
  } catch {
    return {}
  }
}
