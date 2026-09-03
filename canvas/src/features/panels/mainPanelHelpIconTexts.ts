import { parseMarkdownTableRows } from '@/features/panels/mainPanelMarkdownTable'

export const MAIN_PANEL_HELP_ICONS_DOC_PATH = 'docs/documents/agentic-graph-mainpanel-help-icons.md'

export type MainPanelHelpIconText = Readonly<{
  key: string
  type: string
  value: string
  details: readonly string[]
}>

const splitDetails = (raw: string): string[] => String(raw || '')
  .split(';')
  .map(value => value.trim())
  .filter(Boolean)

export function parseMainPanelHelpIconTexts(markdown: string): MainPanelHelpIconText[] {
  return parseMarkdownTableRows(markdown)
    .map(row => ({
      key: String(row.key || '').trim(),
      type: String(row.type || '').trim(),
      value: String(row.value || '').trim(),
      details: splitDetails(row.details || ''),
    }))
    .filter(row => row.key.length > 0)
}

export function buildMainPanelHelpIconTextMap(
  rows: readonly MainPanelHelpIconText[],
): Record<string, MainPanelHelpIconText> {
  return Object.fromEntries(rows.map(row => [row.key, row])) as Record<string, MainPanelHelpIconText>
}

export async function loadMainPanelHelpIconTexts(): Promise<Record<string, MainPanelHelpIconText>> {
  try {
    const markdownModule = await import('../../../../docs/documents/agentic-graph-mainpanel-help-icons.md?raw') as { default?: string }
    return buildMainPanelHelpIconTextMap(parseMainPanelHelpIconTexts(markdownModule.default || ''))
  } catch {
    return {}
  }
}
