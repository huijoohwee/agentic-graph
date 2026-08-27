import {
  MAIN_PANEL_TABS,
  isMainPanelTabKey,
  type MainPanelTabKey,
} from '@/features/panels/mainPanelTabs'
import {
  MAIN_PANEL_TAB_TYPE_ICON_KEY_BY_TAB,
  type MainPanelTypeIconKey,
} from '@/features/panels/ui/mainPanelHelpIconLibrary'
import { parseMarkdownTableRows } from './mainPanelMarkdownTable'

export const MAIN_PANEL_TAB_DESCRIPTIONS_DOC_PATH = 'docs/documents/agenticgraph-mainpanel-tabs.md'

export type MainPanelTabKtvRow = Readonly<{
  key: MainPanelTabKey
  label: string
  typeIconKey: MainPanelTypeIconKey
  value: string
}>

type ParsedTabDescriptionRow = Readonly<{
  key: MainPanelTabKey
  type: string
  value: string
}>

export function parseMainPanelTabDescriptionRows(markdown: string): ParsedTabDescriptionRow[] {
  return parseMarkdownTableRows(markdown)
    .map(row => ({
      key: row.key || '',
      type: row.type || '',
      value: row.value || '',
    }))
    .filter((row): row is ParsedTabDescriptionRow => isMainPanelTabKey(row.key) && row.value.length > 0)
}

export function toMainPanelTabDescriptionMap(rows: readonly ParsedTabDescriptionRow[]): Partial<Record<MainPanelTabKey, string>> {
  return Object.fromEntries(rows.map(row => [row.key, row.value])) as Partial<Record<MainPanelTabKey, string>>
}

export function buildMainPanelTabKtvRows(rows: readonly ParsedTabDescriptionRow[]): MainPanelTabKtvRow[] {
  const descriptionByKey = toMainPanelTabDescriptionMap(rows)
  return MAIN_PANEL_TABS.map(tab => ({
    key: tab.key,
    label: tab.label,
    typeIconKey: MAIN_PANEL_TAB_TYPE_ICON_KEY_BY_TAB[tab.key],
    value: descriptionByKey[tab.key] || '',
  }))
}

export async function loadMainPanelTabDescriptionRows(): Promise<ParsedTabDescriptionRow[]> {
  try {
    const markdownModule = await import('../../../../docs/documents/agenticgraph-mainpanel-tabs.md?raw') as { default?: string }
    return parseMainPanelTabDescriptionRows(markdownModule.default || '')
  } catch {
    return []
  }
}

export async function loadMainPanelTabKtvRows(): Promise<MainPanelTabKtvRow[]> {
  return buildMainPanelTabKtvRows(await loadMainPanelTabDescriptionRows())
}
