import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (absolutePath: string): string =>
  fs.readFileSync(absolutePath, { encoding: 'utf8' })

export const testTailwindScansSharedKtvClassOwners = () => {
  const canvasRoot = process.cwd()
  const tailwindTheme = readUtf8(path.resolve(canvasRoot, 'src', 'styles', 'tailwind-theme.css'))
  const sharedKtvRows = readUtf8(
    path.resolve(canvasRoot, '..', 'grph-shared', 'src', 'ui', 'keyTypeValueRows.ts'),
  )
  const sharedSourceDirective = '@source "../../../grph-shared/src";'

  if (tailwindTheme.split(sharedSourceDirective).length !== 2) {
    throw new Error(
      'Expected Canvas Tailwind to scan the shared package exactly once so KTV layout utilities reach generated CSS',
    )
  }
  if (
    !sharedKtvRows.includes('KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME')
    || !sharedKtvRows.includes('grid-cols-[minmax(0,0.95fr)_minmax(2.75rem,0.42fr)_minmax(0,1.2fr)]')
    || !sharedKtvRows.includes('KTV_KEY_VALUE_GRID_CLASS_NAME')
  ) {
    throw new Error(
      'Expected the scanned shared package to remain the source owner for KTV grid-column utilities',
    )
  }
}
