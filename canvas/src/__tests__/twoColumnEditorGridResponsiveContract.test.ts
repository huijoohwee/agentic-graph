import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

export function testTwoColumnEditorGridUsesSharedMobileFirstOwner() {
  const ownerText = readUtf8('src/features/panels/ui/TwoColumnEditorGrid.tsx')
  const ownerLiteral = 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-2'
  const consumers = [
    'src/features/schema/ui/SchemaUiEditorRows.tsx',
    'src/features/graph-editor/panels/GraphEditorInspectorTab.tsx',
    'src/features/graph-editor/panels/GraphEditorOutlineTab.tsx',
    'src/features/panels/views/DatasetInspectorSection.tsx',
  ]

  if (!ownerText.includes(`TWO_COLUMN_EDITOR_GRID_CLASS_NAME = '${ownerLiteral}'`)) {
    throw new Error('expected TwoColumnEditorGrid to define one mobile-first shared owner')
  }
  if (!ownerText.includes('[TWO_COLUMN_EDITOR_GRID_CLASS_NAME, className || \'\']')) {
    throw new Error('expected TwoColumnEditorGrid to build root classes from the shared owner')
  }
  if (ownerText.includes('grid grid-cols-2 gap-2')) {
    throw new Error('expected TwoColumnEditorGrid to avoid the stale fixed two-column literal')
  }
  for (const relativePath of consumers) {
    const text = readUtf8(relativePath)
    if (!text.includes('TwoColumnEditorGrid')) {
      throw new Error(`expected ${relativePath} to consume the shared TwoColumnEditorGrid owner`)
    }
    if (text.includes('grid grid-cols-2 gap-2')) {
      throw new Error(`expected ${relativePath} to avoid local fixed two-column editor grid literals`)
    }
  }
}
