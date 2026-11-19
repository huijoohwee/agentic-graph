import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

export function testFloatingPanelScrollBodiesUseSharedResponsiveOwner() {
  const classText = readUtf8('src/lib/ui/responsiveElementClasses.ts')
  const floatingPanelText = readUtf8('src/components/ui/FloatingPanel.tsx')
  const consumerPaths = [
    'src/features/chat/FloatingPanelChat.tsx',
    'src/components/StoryboardWidget/WidgetEditorForm.tsx',
    'src/features/panels/ui/MainPanelSettingsPanelShell.tsx',
    'src/features/storyboard-widget-manager/StoryboardWidgetMappingSettingsPanel.tsx',
    'src/features/panels/views/graph-fields/GraphFieldsListPanelBody.tsx',
    'src/features/panels/views/graph-fields/FieldSamplesPanel.tsx',
  ]
  const consumerTexts = consumerPaths.map(relativePath => {
    const source = readUtf8(relativePath)
    if (relativePath !== 'src/components/StoryboardWidget/WidgetEditorForm.tsx') return source
    if (!source.includes('<WidgetEditorFormContent') || !source.includes("from '@/components/StoryboardWidget/WidgetEditorFormContent'")) throw new Error('expected WidgetEditorForm to render its shared content owner')
    return source + readUtf8('src/components/StoryboardWidget/WidgetEditorFormContent.tsx')
  })

  const controller = readUtf8('src/lib/toolbar/ToolbarToolMenu.impl.tsx')
  const catalog = readUtf8('src/lib/ui/floatingPanelCatalogLayout.tsx')
  const tabLayout = controller.match(/const floatingPanelBodyClassName = cn\(([\s\S]*?)\n  \)/)?.[1]
  const catalogLayout = catalog.match(/function floatingPanelCatalogSurfaceClassName[^{]+\{([^}]+)/)?.[1]
  if (controller.includes('FLOATING_PANEL_FULL_HEIGHT_VIEWS')) throw new Error('Every floating tab should use the same frame')
  if (!tabLayout || !catalogLayout || /(?:^|[\s'"])-?[mp][trblxyse]?-[^\s'"]+/.test(tabLayout + catalogLayout)) {
    throw new Error('The Design System panel body must be the only tab frame inset owner')
  }

  for (const owner of [
    'src/features/panels/ui/MainPanelBody.tsx',
    'src/features/toolbar/FloatingPropsPanel.tsx',
    'src/features/strybldr/StrybldrTimelineBottomPanel.tsx',
    'src/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsPanel.tsx',
  ]) {
    const source = readUtf8(owner)
    if (!source.includes('agentic-panel-tab-layout') || !source.includes('className="agentic-panel-tab-body"')) {
      throw new Error(`Expected shared tab layout and body in ${owner}`)
    }
  }
  const styles = fs.readdirSync('src/styles').filter(file => file.endsWith('.css'))
  for (const file of styles) {
    if (/\.agentic-panel-tab-(?:layout|header|body|subtitle)\b/.test(readUtf8(`src/styles/${file}`))) {
      throw new Error(`The Design System owns tab layout styles. Remove the local rule in ${file}`)
    }
  }
  if (!classText.includes('UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME')) {
    throw new Error('expected floating panel scroll body owner to be exported from the shared responsive class registry')
  }
  if (floatingPanelText.includes('FLOATING_PANEL_SCROLL_CLASSNAME')) {
    throw new Error('expected FloatingPanel component file to avoid owning scroll-body sizing literals')
  }
  if (consumerTexts.some(text => !text.includes('UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME'))) {
    throw new Error('expected floating panel body consumers to use the shared responsive scroll owner')
  }
  if (consumerTexts.some(text => text.includes('flex-1 min-h-0 overflow-y-auto overflow-x-hidden'))) {
    throw new Error('expected floating panel body consumers to stay free of local scroll-surface literals')
  }
}
