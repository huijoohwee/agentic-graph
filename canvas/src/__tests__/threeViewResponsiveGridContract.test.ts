import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

export function testThreeViewFieldGridsUseSharedResponsiveOwner() {
  const ownerText = readUtf8('src/features/panels/views/threeViewResponsiveClasses.ts')
  const consumers = [
    'ThreeViewBackgroundFogSection.tsx',
    'ThreeViewCameraSection.tsx',
    'ThreeViewGlobeEffectsSection.tsx',
    'ThreeViewLinksSection.tsx',
    'ThreeViewSelectionSection.tsx',
    'ThreeViewStarfieldSection.tsx',
  ]

  if (!ownerText.includes('THREE_VIEW_FIELD_GRID_CLASS_NAME = KTV_SECTION_STACK_CLASS_NAME') || !ownerText.includes("from 'grph-shared/ui/keyTypeValueRows'")) {
    throw new Error('expected ThreeView fields to reuse the full-width shared KTV stack')
  }
  for (const fileName of consumers) {
    const text = readUtf8(`src/features/panels/views/${fileName}`)
    if (!text.includes('THREE_VIEW_FIELD_GRID_CLASS_NAME')) {
      throw new Error(`expected ${fileName} to consume the shared ThreeView field grid owner`)
    }
    if (text.includes('grid grid-cols-2 gap-3')) {
      throw new Error(`expected ${fileName} to avoid the stale fixed two-column field grid literal`)
    }
  }
}
