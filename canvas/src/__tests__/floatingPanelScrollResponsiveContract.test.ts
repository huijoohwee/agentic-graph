import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

export function testFloatingPanelScrollBodiesUseSharedResponsiveOwner() {
  const classText = readUtf8('src/lib/ui/responsiveElementClasses.ts')
  const floatingPanelText = readUtf8('src/components/ui/FloatingPanel.tsx')
  const consumerPaths = [
    'src/features/chat/FloatingPanelChat.tsx',
    'src/lib/toolbar/ToolbarToolMenu.impl.tsx',
    'src/components/StoryboardWidget/WidgetEditorForm.tsx',
    'src/features/panels/ui/MainPanelSettingsPanelShell.tsx',
    'src/features/design/DesignFloatingPanelView.tsx',
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
