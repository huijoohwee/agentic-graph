import { parseMarkdownTableRows } from '@/features/panels/mainPanelMarkdownTable'

export const MAIN_PANEL_HELP_SHORTCUTS_DOC_PATH = 'docs/documents/agentic-graph-mainpanel-help-shortcuts.md'

export type MainPanelHelpShortcutText = Readonly<{
  key: string
  value: string
}>

export function parseMainPanelHelpShortcutTexts(markdown: string): MainPanelHelpShortcutText[] {
  return parseMarkdownTableRows(markdown)
    .map(row => ({
      key: String(row.key || '').trim(),
      value: String(row.value || '').trim(),
    }))
    .filter(row => row.key.length > 0)
}

export function buildMainPanelHelpShortcutTextMap(
  rows: readonly MainPanelHelpShortcutText[],
): Record<string, MainPanelHelpShortcutText> {
  return Object.fromEntries(rows.map(row => [row.key, row])) as Record<string, MainPanelHelpShortcutText>
}

export async function loadMainPanelHelpShortcutTexts(): Promise<Record<string, MainPanelHelpShortcutText>> {
  try {
    const markdownModule = await import('../../../../docs/documents/agentic-graph-mainpanel-help-shortcuts.md?raw') as { default?: string }
    return buildMainPanelHelpShortcutTextMap(parseMainPanelHelpShortcutTexts(markdownModule.default || ''))
  } catch {
    return {}
  }
}
