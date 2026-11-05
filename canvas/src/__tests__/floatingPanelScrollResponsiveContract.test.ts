import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

export async function testFloatingPanelScrollBodiesUseSharedResponsiveOwner() {
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

  const env = initJsdomHarness()
  const container = env.dom.window.document.body.appendChild(env.dom.window.document.createElement('main'))
  const root = createRoot(container)
  try {
    const { FloatingPanelSceneContext } = await import('@/lib/toolbar/FloatingPanelXrSceneViews')
    const controls = React.createElement('button', { type: 'button' }, 'Open scene context')
    await act(async () => root.render(React.createElement(FloatingPanelSceneContext, { view: 'flightSim', children: controls })))
    const disclosure = container.querySelector('details')!
    assert.ok(disclosure, 'Flight keeps optional context discoverable beside the primary evidence workspace')
    assert.equal(disclosure.open, false)
    assert.equal(container.querySelector('button'), null, 'Collapsed context does not mount secondary controls')
    await act(async () => { disclosure.open = true; disclosure.dispatchEvent(new env.dom.window.Event('toggle')) })
    assert.equal(container.querySelector('button')?.textContent, 'Open scene context', 'Opening context retains its original controls')
    await act(async () => root.render(React.createElement(FloatingPanelSceneContext, { view: 'camera', children: controls })))
    await act(async () => root.render(React.createElement(FloatingPanelSceneContext, { view: 'flightSim', children: controls })))
    const returnedDisclosure = container.querySelector('details')!
    assert.equal(returnedDisclosure.open, false, 'Returning from another panel starts with context collapsed')
    assert.equal(container.querySelector('button'), null, 'Returning to Flight does not mount controls hidden by a closed disclosure')
    await act(async () => { returnedDisclosure.open = true; returnedDisclosure.dispatchEvent(new env.dom.window.Event('toggle')) })
    assert.ok(container.querySelector('button'))
    await act(async () => { returnedDisclosure.open = false; returnedDisclosure.dispatchEvent(new env.dom.window.Event('toggle')) })
    assert.equal(container.querySelector('button'), null)
    for (const view of ['media', 'animation', 'motionControl', 'gameMode', 'camera'] as const) {
      await act(async () => root.render(React.createElement(FloatingPanelSceneContext, { view, children: controls })))
      assert.equal(container.querySelector('details'), null, `${view} retains its existing visible projection`)
      assert.equal(container.querySelector('button')?.textContent, 'Open scene context')
    }
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
}
