import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

export function testGraphFieldsFieldGridsUseSharedResponsiveOwner() {
  const ownerText = readUtf8('src/features/panels/views/graph-fields/graphFieldResponsiveClasses.ts')
  const fieldGridLiteral = 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3'
  const compactGridLiteral = 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-2'
  const denseGridLiteral = 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-1'
  const tripleGridLiteral = 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2'
  const denseTripleGridLiteral = 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-1'
  const mainSplitGridLiteral = 'kg-graph-fields-split grid h-full min-h-0 min-w-0 gap-2'
  const spaciousConsumers = [
    'FieldSchemaSection.tsx',
    'FieldSettingsPanel.tsx',
  ]
  const compactConsumers = [
    'FieldEndpointsAndCardinalitySection.tsx',
    'FieldGraphLayersSection.tsx',
  ]

  if (!ownerText.includes(`GRAPH_FIELDS_FIELD_GRID_CLASS_NAME = '${fieldGridLiteral}'`)) {
    throw new Error('expected Graph Fields form grids to define one mobile-first shared owner')
  }
  if (!ownerText.includes(`GRAPH_FIELDS_COMPACT_FIELD_GRID_CLASS_NAME = '${compactGridLiteral}'`)) {
    throw new Error('expected compact Graph Fields grids to define one mobile-first shared owner')
  }
  if (!ownerText.includes(`GRAPH_FIELDS_DENSE_FIELD_GRID_CLASS_NAME = '${denseGridLiteral}'`)) {
    throw new Error('expected dense Graph Fields grids to define one mobile-first shared owner')
  }
  if (!ownerText.includes(`GRAPH_FIELDS_TRIPLE_FIELD_GRID_CLASS_NAME = '${tripleGridLiteral}'`)) {
    throw new Error('expected three-field Graph Fields rows to define one mobile-first shared owner')
  }
  if (!ownerText.includes(`GRAPH_FIELDS_DENSE_TRIPLE_FIELD_GRID_CLASS_NAME = '${denseTripleGridLiteral}'`)) {
    throw new Error('expected dense three-field Graph Fields rows to define one mobile-first shared owner')
  }
  if (!ownerText.includes(`GRAPH_FIELDS_MAIN_SPLIT_GRID_CLASS_NAME = '${mainSplitGridLiteral}'`)) {
    throw new Error('expected Graph Fields main split to define one mobile-first shared owner')
  }
  for (const fileName of spaciousConsumers) {
    const text = readUtf8(`src/features/panels/views/graph-fields/${fileName}`)
    if (!text.includes('GRAPH_FIELDS_FIELD_GRID_CLASS_NAME')) {
      throw new Error(`expected ${fileName} to consume the shared Graph Fields form grid owner`)
    }
    if (text.includes('grid grid-cols-2 gap-3')) {
      throw new Error(`expected ${fileName} to avoid the stale fixed two-column field grid literal`)
    }
  }
  for (const fileName of compactConsumers) {
    const text = readUtf8(`src/features/panels/views/graph-fields/${fileName}`)
    if (!text.includes('GRAPH_FIELDS_COMPACT_FIELD_GRID_CLASS_NAME')) {
      throw new Error(`expected ${fileName} to consume the shared compact Graph Fields grid owner`)
    }
    if (text.includes('grid grid-cols-2 gap-2')) {
      throw new Error(`expected ${fileName} to avoid the stale compact fixed two-column grid literal`)
    }
  }
  const validationText = readUtf8('src/features/panels/views/graph-fields/FieldLocalSchemaValidationEditor.tsx')
  if (!validationText.includes('GRAPH_FIELDS_DENSE_FIELD_GRID_CLASS_NAME')) {
    throw new Error('expected FieldLocalSchemaValidationEditor to consume the shared dense Graph Fields grid owner')
  }
  if (!validationText.includes('GRAPH_FIELDS_DENSE_TRIPLE_FIELD_GRID_CLASS_NAME')) {
    throw new Error('expected FieldLocalSchemaValidationEditor to consume the shared dense three-field Graph Fields grid owner')
  }
  if (validationText.includes('grid grid-cols-2 gap-1') || validationText.includes('grid grid-cols-3 gap-1')) {
    throw new Error('expected FieldLocalSchemaValidationEditor to avoid stale fixed dense grid literals')
  }
  const layersText = readUtf8('src/features/panels/views/graph-fields/FieldGraphLayersSection.tsx')
  if (!layersText.includes('GRAPH_FIELDS_TRIPLE_FIELD_GRID_CLASS_NAME')) {
    throw new Error('expected FieldGraphLayersSection to consume the shared three-field Graph Fields grid owner')
  }
  if (layersText.includes('grid grid-cols-3 gap-2')) {
    throw new Error('expected FieldGraphLayersSection to avoid the stale fixed three-column grid literal')
  }
  const graphFieldsViewText = readUtf8('src/features/panels/views/GraphFieldsView.tsx')
  for (const ownerName of ['GRAPH_FIELDS_MAIN_SPLIT_GRID_CLASS_NAME', 'GRAPH_FIELDS_MAIN_LIST_PANE_CLASS_NAME', 'GRAPH_FIELDS_MAIN_SETTINGS_PANE_CLASS_NAME']) {
    if (!graphFieldsViewText.includes(ownerName)) {
      throw new Error(`expected GraphFieldsView to consume shared ${ownerName}`)
    }
  }
  if (graphFieldsViewText.includes('grid grid-cols-3 gap-2') || graphFieldsViewText.includes('col-span-2') || graphFieldsViewText.includes('col-span-1')) {
    throw new Error('expected GraphFieldsView to avoid fixed desktop split grid literals on mobile')
  }
}
