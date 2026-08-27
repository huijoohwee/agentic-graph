import { parseMarkdownTableRows } from '@/features/panels/mainPanelMarkdownTable'

export const MAIN_PANEL_HELP_CHEATSHEET_DOC_PATH = 'docs/documents/agenticgraph-mainpanel-help-cheatsheet.md'

export type MainPanelHelpCheatsheetText = Readonly<{
  key: string
  gesture: string
  value: string
  details: readonly string[]
}>

const splitDetails = (raw: string): string[] => String(raw || '')
  .split(';')
  .map(value => value.trim())
  .filter(Boolean)

export function parseMainPanelHelpCheatsheetTexts(markdown: string): MainPanelHelpCheatsheetText[] {
  return parseMarkdownTableRows(markdown)
    .map(row => ({
      key: String(row.key || '').trim(),
      gesture: String(row.gesture || '').trim(),
      value: String(row.value || '').trim(),
      details: splitDetails(row.details || ''),
    }))
    .filter(row => row.key.length > 0)
}

export function buildMainPanelHelpCheatsheetTextMap(
  rows: readonly MainPanelHelpCheatsheetText[],
): Record<string, MainPanelHelpCheatsheetText> {
  return Object.fromEntries(rows.map(row => [row.key, row])) as Record<string, MainPanelHelpCheatsheetText>
}

export async function loadMainPanelHelpCheatsheetTexts(): Promise<Record<string, MainPanelHelpCheatsheetText>> {
  try {
    const markdownModule = await import('../../../../docs/documents/agenticgraph-mainpanel-help-cheatsheet.md?raw') as { default?: string }
    return buildMainPanelHelpCheatsheetTextMap(parseMainPanelHelpCheatsheetTexts(markdownModule.default || ''))
  } catch {
    return {}
  }
}
