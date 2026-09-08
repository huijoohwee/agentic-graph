import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testGraphFieldsViewAddsSmartMediaWidgetGalleryPresetSetup() {
  const storyboardWidgetGraphTabPath = resolve(process.cwd(), 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetGraphTab.tsx')
  const graphFieldsViewPath = resolve(process.cwd(), 'src', 'features', 'panels', 'views', 'GraphFieldsView.tsx')
  const text = readFileSync(storyboardWidgetGraphTabPath, 'utf8')
  const graphFieldsViewText = readFileSync(graphFieldsViewPath, 'utf8')

  const commandText = readFileSync(resolve(process.cwd(), 'src/features/panels/views/graph-fields/graphFieldsEntryCommands.ts'), 'utf8')
  const hasConsolidatedEntryShortcut =
    text.includes('entryShortcutLabels={WORKFLOW_MANAGER_GRAPH_FIELDS_COMMAND_ENTRY_LABELS}') && text.includes('onEntryShortcutClick={openEntryInFieldSettings}') && text.includes('entryOpenRequest={entryOpenRequest}') &&
    commandText.includes('Nodes · Widget Gallery') &&
    commandText.includes('Clusters · Samples') &&
    graphFieldsViewText.includes('Entry shortcuts (click to open Field Settings)')

  if (text.includes('buildWidgetDraftFromSmartFields')) {
    throw new Error('expected Workflow Manager graph tab to avoid local widget preset setup logic after consolidation')
  }
  if (!hasConsolidatedEntryShortcut) {
    throw new Error('expected Workflow Manager to keep consolidated click shortcuts for Graph Fields right-pane')
  }
  if (!(text.includes('<GraphFieldsView') && text.includes('embedded={true}'))) {
    throw new Error('expected Workflow Manager graph tab to reuse embedded GraphFieldsView in workflow mode')
  }
  if (graphFieldsViewText.includes('Widget Gallery')) {
    throw new Error('expected GraphFieldsView to avoid duplicate Widget Gallery after consolidation')
  }
  if (graphFieldsViewText.includes('FieldSamplesPanel')) {
    throw new Error('expected GraphFieldsView to avoid duplicate standalone Samples panel after consolidation')
  }
}
