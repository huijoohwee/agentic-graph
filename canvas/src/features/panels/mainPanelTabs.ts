import { UI_COPY, UI_LABELS } from '@/lib/config'

export type MainPanelTabKey =
  | 'collaboration'
  | 'integrations'
  | 'mcp'
  | 'maps'
  | 'commerce'
  | 'research'
  | 'design'
  | 'workflowManager'
  | 'help'
  | 'dashboard'
  | 'preview'
  | 'settings'
  | 'history'

type MainPanelTabMeta = {
  key: MainPanelTabKey
  label: string
  searchable: boolean
  searchPlaceholder?: string
  footerLabel: string
}

const MAIN_PANEL_TAB_METADATA: MainPanelTabMeta[] = [
  {
    key: 'collaboration',
    label: UI_LABELS.collaboration,
    searchable: true,
    searchPlaceholder: UI_COPY.searchSettingsPlaceholder,
    footerLabel: UI_LABELS.collaboration,
  },
  {
    key: 'integrations',
    label: UI_LABELS.integrations,
    searchable: true,
    searchPlaceholder: UI_COPY.searchSettingsPlaceholder,
    footerLabel: UI_LABELS.integrations,
  },
  {
    key: 'mcp',
    label: UI_LABELS.mcp,
    searchable: true,
    searchPlaceholder: UI_COPY.searchSettingsPlaceholder,
    footerLabel: UI_LABELS.mcp,
  },
  {
    key: 'maps',
    label: UI_LABELS.maps,
    searchable: true,
    searchPlaceholder: UI_COPY.searchSettingsPlaceholder,
    footerLabel: UI_LABELS.maps,
  },
  {
    key: 'commerce',
    label: UI_LABELS.commerce,
    searchable: true,
    searchPlaceholder: UI_COPY.searchSettingsPlaceholder,
    footerLabel: UI_LABELS.commerce,
  },
  {
    key: 'research',
    label: 'Research',
    searchable: true,
    searchPlaceholder: UI_LABELS.search,
    footerLabel: 'Research',
  },
  {
    key: 'workflowManager',
    label: UI_LABELS.workflowManager,
    searchable: true,
    searchPlaceholder: UI_COPY.searchStoryboardWidgetManagerRegistryPlaceholder,
    footerLabel: UI_LABELS.workflowManager,
  },
  {
    key: 'dashboard',
    label: UI_LABELS.dashboard,
    searchable: false,
    footerLabel: UI_LABELS.dashboard,
  },
  {
    key: 'preview',
    label: UI_LABELS.previewPanel,
    searchable: false,
    footerLabel: UI_LABELS.previewPanel,
  },
  {
    key: 'settings',
    label: UI_LABELS.settings,
    searchable: true,
    searchPlaceholder: UI_COPY.searchSettingsPlaceholder,
    footerLabel: UI_LABELS.settings,
  },
  {
    key: 'history',
    label: UI_LABELS.history,
    searchable: true,
    searchPlaceholder: UI_LABELS.search,
    footerLabel: UI_LABELS.history,
  },
  {
    key: 'help',
    label: UI_LABELS.help,
    searchable: true,
    searchPlaceholder: UI_COPY.searchShortcutsPlaceholder,
    footerLabel: UI_LABELS.help,
  },
]

const MAIN_PANEL_TAB_KEY_SET = new Set<MainPanelTabKey>(MAIN_PANEL_TAB_METADATA.map(tab => tab.key))
const MAIN_PANEL_TAB_META_BY_KEY: Partial<Record<MainPanelTabKey, MainPanelTabMeta>> = Object.fromEntries(
  MAIN_PANEL_TAB_METADATA.map(tab => [tab.key, tab]),
) as Partial<Record<MainPanelTabKey, MainPanelTabMeta>>

export function isMainPanelTabKey(key: string): key is MainPanelTabKey {
  return MAIN_PANEL_TAB_KEY_SET.has(key as MainPanelTabKey)
}

export const SEARCHABLE_MAIN_PANEL_TABS = new Set<MainPanelTabKey>(
  MAIN_PANEL_TAB_METADATA.filter(tab => tab.searchable).map(tab => tab.key),
)

export const MAIN_PANEL_TABS: Array<{ key: MainPanelTabKey; label: string }> = MAIN_PANEL_TAB_METADATA.map(
  ({ key, label }) => ({ key, label }),
)

export const MAIN_PANEL_SEARCH_PLACEHOLDER_BY_TAB: Partial<Record<MainPanelTabKey, string>> = Object.fromEntries(
  MAIN_PANEL_TAB_METADATA.filter(tab => typeof tab.searchPlaceholder === 'string').map(tab => [
    tab.key,
    tab.searchPlaceholder as string,
  ]),
) as Partial<Record<MainPanelTabKey, string>>

export const MAIN_PANEL_FOOTER_LABEL_BY_TAB: Record<MainPanelTabKey, string> = Object.fromEntries(
  MAIN_PANEL_TAB_METADATA.map(tab => [tab.key, tab.footerLabel]),
) as Record<MainPanelTabKey, string>

export function getMainPanelTabMeta(tab: MainPanelTabKey): MainPanelTabMeta {
  return MAIN_PANEL_TAB_META_BY_KEY[tab] ?? MAIN_PANEL_TAB_META_BY_KEY.help!
}
