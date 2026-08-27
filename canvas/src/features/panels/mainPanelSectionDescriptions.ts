import { parseMarkdownTableRows } from '@/features/panels/mainPanelMarkdownTable'

export const MAIN_PANEL_SECTION_DESCRIPTIONS_DOC_PATH = 'docs/documents/agenticgraph-mainpanel-section-descriptions.md'

export type MainPanelSectionDescription = Readonly<{
  key: string
  value: string
  highlights: readonly string[]
}>

const splitHighlights = (raw: string): string[] => String(raw || '')
  .split(';')
  .map(value => value.trim())
  .filter(Boolean)

export function parseMainPanelSectionDescriptionRows(markdown: string): MainPanelSectionDescription[] {
  return parseMarkdownTableRows(markdown)
    .map(row => ({
      key: String(row.key || '').trim(),
      value: String(row.value || '').trim(),
      highlights: splitHighlights(row.highlights || ''),
    }))
    .filter(row => row.key.length > 0 && row.value.length > 0)
}

export function toMainPanelSectionDescriptionMap(rows: readonly MainPanelSectionDescription[]): Record<string, MainPanelSectionDescription> {
  return Object.fromEntries(rows.map(row => [row.key, row])) as Record<string, MainPanelSectionDescription>
}

declare const __AGENTICGRAPH_MAIN_PANEL_SECTION_DESCRIPTIONS_MARKDOWN__: string | undefined
type MainPanelSectionDescriptionsGlobalScope = typeof globalThis & {
  __AGENTICGRAPH_MAIN_PANEL_SECTION_DESCRIPTIONS_MARKDOWN__?: string
}

function readBundledMainPanelSectionDescriptionsMarkdown(): string {
  if (
    typeof __AGENTICGRAPH_MAIN_PANEL_SECTION_DESCRIPTIONS_MARKDOWN__ === 'string'
    && __AGENTICGRAPH_MAIN_PANEL_SECTION_DESCRIPTIONS_MARKDOWN__.trim()
  ) {
    return __AGENTICGRAPH_MAIN_PANEL_SECTION_DESCRIPTIONS_MARKDOWN__
  }
  const globalMarkdown = (globalThis as MainPanelSectionDescriptionsGlobalScope).__AGENTICGRAPH_MAIN_PANEL_SECTION_DESCRIPTIONS_MARKDOWN__
  return typeof globalMarkdown === 'string' ? globalMarkdown : ''
}

export async function loadMainPanelSectionDescriptions(): Promise<Record<string, MainPanelSectionDescription>> {
  const markdown = readBundledMainPanelSectionDescriptionsMarkdown()
  return markdown.trim()
    ? toMainPanelSectionDescriptionMap(parseMainPanelSectionDescriptionRows(markdown))
    : {}
}
