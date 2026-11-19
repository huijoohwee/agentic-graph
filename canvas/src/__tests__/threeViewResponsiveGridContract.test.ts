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

  if (!ownerText.includes('KeyTypeValueSectionStack') || ownerText.includes('uiToolbarSettingsPanelBodyClassName')) {
    throw new Error('expected the shared disclosure to own the inset and ThreeView fields to use the full-width KTV stack')
  }
  for (const fileName of consumers) {
    const text = readUtf8(`src/features/panels/views/${fileName}`)
    if (!text.includes('<ThreeViewFieldSection>')) {
      throw new Error(`expected ${fileName} to consume the shared ThreeView field grid owner`)
    }
    if (text.includes('grid grid-cols-2 gap-3')) {
      throw new Error(`expected ${fileName} to avoid the stale fixed two-column field grid literal`)
    }
  }
}
