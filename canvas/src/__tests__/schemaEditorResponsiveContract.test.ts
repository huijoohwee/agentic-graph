import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

export function testSchemaEditorStructuredRowsUseSharedResponsiveOwners() {
  const schemaRowsText = readUtf8('src/features/schema/ui/SchemaUiEditorRows.tsx')
  const columnLiteral = 'flex min-h-0 min-w-0 flex-col'
  const editorLiteral = '`${UI_RESPONSIVE_SCHEMA_EDITOR_SERIALIZATION_EDITOR_CLASSNAME} w-full shrink-0`'
  const requiredFieldsGridLiteral = 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-1'
  const propertyTypeGridLiteral = 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-1'
  const layoutControlGridLiteral = 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2'

  if (!schemaRowsText.includes(`SCHEMA_UI_EDITOR_COLUMN_CLASS_NAME = '${columnLiteral}'`)) {
    throw new Error('expected Schema UI editor columns to define one shared responsive owner')
  }
  if (!schemaRowsText.includes(`SCHEMA_UI_STRUCTURED_TEXT_EDITOR_CLASS_NAME = ${editorLiteral}`)) {
    throw new Error('expected Schema UI structured text editors to define one shared responsive owner')
  }
  if (schemaRowsText.split(columnLiteral).length !== 2 || schemaRowsText.split(editorLiteral).length !== 2) {
    throw new Error('expected Schema UI structured editor layout literals to stay only in their shared owners')
  }
  if (!schemaRowsText.includes(`SCHEMA_UI_REQUIRED_FIELDS_GRID_CLASS_NAME = '${requiredFieldsGridLiteral}'`)) {
    throw new Error('expected Schema UI required-field grids to use one shared mobile-first responsive owner')
  }
  if (!schemaRowsText.includes(`SCHEMA_UI_PROPERTY_TYPE_GRID_CLASS_NAME = '${propertyTypeGridLiteral}'`)) {
    throw new Error('expected Schema UI property-type grids to use one shared mobile-first responsive owner')
  }
  if (!schemaRowsText.includes(`SCHEMA_UI_LAYOUT_CONTROL_GRID_CLASS_NAME = '${layoutControlGridLiteral}'`)) {
    throw new Error('expected Schema UI layout control grids to use one shared mobile-first responsive owner')
  }
  if (schemaRowsText.includes('grid grid-cols-3 gap-1') || schemaRowsText.includes('grid grid-cols-2 gap-1') || schemaRowsText.includes('grid grid-cols-4 gap-2')) {
    throw new Error('expected Schema UI validation grids to stay free of fixed mobile column literals')
  }
}
