import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { createRoot } from 'react-dom/client'

import { defaultSchema } from '@/lib/graph/schema'
import { WidgetEditorPortHandles, orderFlowPortHandlesByCenterPriority, selectCenteredFlowPortHandle } from '@/components/StoryboardWidget/WidgetEditorPortHandles'
import { PORT_HANDLE_MIN_VISUAL_SIZE_PX, readPortHandleUiMetrics } from '@/components/StoryboardWidget/portHandleUi'
import { buildRichMediaPanelRegistryDraft } from '@/features/storyboard-widget-manager/richMediaPanelRegistryDraft'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import type { JSONValue } from '@/lib/graph/types'

export const testFlowWidgetRendersPortHandleGutterWhenEnabled = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })

  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const schema = {
    ...defaultSchema,
    behavior: { ...defaultSchema.behavior, portHandles: { ...defaultSchema.behavior.portHandles, enabled: true } },
  }
  const portMetrics = readPortHandleUiMetrics(schema, { nodeWidth: 16, nodeHeight: 16 })
  if (portMetrics.sizePx < PORT_HANDLE_MIN_VISUAL_SIZE_PX) {
    throw new Error(`expected a visible port handle of at least ${PORT_HANDLE_MIN_VISUAL_SIZE_PX}px, got ${portMetrics.sizePx}px`)
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)

  root.render(
    React.createElement(
      'div',
      { style: { position: 'relative', width: 360, height: 320 } },
      React.createElement(WidgetEditorPortHandles, {
        active: true,
        node: { id: 'n1', type: 'Node', properties: {} },
        schema,
        edges: [],
        toolMode: 'select',
        pendingEdgeSourceId: null,
      }),
    ),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const inputButtons = host.querySelectorAll('button[aria-label^="Input handle"]')
  const outputButtons = host.querySelectorAll('button[aria-label^="Output handle"]')
  const portHandleSurface = host.querySelector('nav[aria-label="Node port handles"]') as HTMLElement | null
  if (inputButtons.length !== 1) throw new Error(`expected 1 input handle button, got ${inputButtons.length}`)
  if (outputButtons.length !== 1) throw new Error(`expected 1 output handle button, got ${outputButtons.length}`)
  if (!portHandleSurface?.style.zIndex) throw new Error('expected port handle surface to own an elevated z-index above media bodies')

  const inputDisabled = (inputButtons[0] as HTMLButtonElement).disabled
  const outputDisabled = (outputButtons[0] as HTMLButtonElement).disabled
  if (inputDisabled !== true) throw new Error('expected input handle to be disabled in select mode')
  if (outputDisabled !== false) throw new Error('expected output handle to be enabled in select mode')

  root.unmount()

  const overlayHost = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(overlayHost)
  const overlayRoot = createRoot(overlayHost)
  overlayRoot.render(
    React.createElement(
      'div',
      { style: { position: 'relative', width: 360, height: 320 } },
      React.createElement(WidgetEditorPortHandles, {
        active: true,
        node: { id: 'n1', type: 'Node', properties: {} },
        schema,
        edges: [],
        registryEntries: [{
          id: 'node-registry',
          isEnabled: true,
          nodeTypeId: 'Node',
          widgetTypeId: 'NodeWidget',
          formId: 'node-form',
          fields: [],
          ports: [
            { portKey: 'prompt', direction: 'input' },
            { portKey: 'reference', direction: 'input' },
            { portKey: 'text', direction: 'output' },
            { portKey: 'image', direction: 'output' },
          ],
          updatedAt: '2026-07-14T00:00:00.000Z',
        }],
        forceEnabled: true,
        strictHandleSet: true,
        toolMode: 'select',
        pendingEdgeSourceId: null,
      }),
    ),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const overlayButtons = Array.from(overlayHost.querySelectorAll('button[data-kg-port-handle="1"]')) as HTMLButtonElement[]
  if (overlayButtons.length !== 2) throw new Error(`expected Card/Rich Media overlay to render 2 handles, got ${overlayButtons.length}`)
  if (overlayButtons.some(button => button.style.top !== '50%')) {
    throw new Error(`expected Card/Rich Media handles at vertical middle, got ${overlayButtons.map(button => button.style.top).join(', ')}`)
  }
  if (new Set(overlayButtons.map(button => button.dataset.kgPortDir)).size !== 2) {
    throw new Error('expected Card/Rich Media overlay to keep one input and one output handle')
  }

  overlayRoot.unmount()

  const richMediaHost = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(richMediaHost)
  const richMediaRoot = createRoot(richMediaHost)
  const richMediaRegistryEntry = {
    ...buildRichMediaPanelRegistryDraft(),
    id: 'rich-media-panel',
    updatedAt: '2026-07-19T00:00:00.000Z',
  }
  const renderRichMediaHandles = (richMediaActiveTab: JSONValue, wrapProperties = false) => {
    const properties = wrapProperties
      ? {
          key: 'properties',
          type: 'object',
          value: { richMediaActiveTab },
        }
      : { richMediaActiveTab }
    richMediaRoot.render(
      React.createElement(
        'div',
        { style: { position: 'relative', width: 360, height: 320 } },
        React.createElement(WidgetEditorPortHandles, {
          active: true,
          node: {
            id: 'rich-media-source',
            type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
            properties,
          },
          schema,
          edges: [],
          registryEntries: [richMediaRegistryEntry],
          forceEnabled: true,
          strictHandleSet: true,
          toolMode: 'select',
          pendingEdgeSourceId: null,
        }),
      ),
    )
  }

  renderRichMediaHandles('text')
  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const textInput = richMediaHost.querySelector('button[data-kg-port-dir="in"]') as HTMLButtonElement | null
  const textOutput = richMediaHost.querySelector('button[data-kg-port-dir="out"]') as HTMLButtonElement | null
  if (!textInput || !textOutput) throw new Error('expected text Rich Media to render one input and one output rail')
  if (textInput.dataset.kgPortKey !== 'output' || textOutput.dataset.kgPortKey !== 'output') {
    throw new Error(`expected text Rich Media rails to expose output, got ${textInput.dataset.kgPortKey}/${textOutput.dataset.kgPortKey}`)
  }
  if (textInput.style.top !== '50%' || textOutput.style.top !== '50%') {
    throw new Error(`expected text Rich Media rails at vertical middle, got ${textInput.style.top}/${textOutput.style.top}`)
  }
  if (!textInput.disabled || textOutput.disabled) {
    throw new Error('expected text Rich Media input disabled and output enabled before edge drag')
  }

  renderRichMediaHandles('image')
  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const imageInput = richMediaHost.querySelector('button[data-kg-port-dir="in"]') as HTMLButtonElement | null
  const imageOutput = richMediaHost.querySelector('button[data-kg-port-dir="out"]') as HTMLButtonElement | null
  if (imageInput?.dataset.kgPortKey !== 'imageUrl' || imageOutput?.dataset.kgPortKey !== 'imageUrl') {
    throw new Error(`expected image Rich Media rails to expose imageUrl, got ${imageInput?.dataset.kgPortKey}/${imageOutput?.dataset.kgPortKey}`)
  }

  renderRichMediaHandles({ key: 'richMediaActiveTab', type: 'string', value: 'video' })
  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const typedVideoInput = richMediaHost.querySelector('button[data-kg-port-dir="in"]') as HTMLButtonElement | null
  const typedVideoOutput = richMediaHost.querySelector('button[data-kg-port-dir="out"]') as HTMLButtonElement | null
  if (typedVideoInput?.dataset.kgPortKey !== 'videoUrl' || typedVideoOutput?.dataset.kgPortKey !== 'videoUrl') {
    throw new Error(`expected typed video Rich Media rails to expose videoUrl, got ${typedVideoInput?.dataset.kgPortKey}/${typedVideoOutput?.dataset.kgPortKey}`)
  }

  renderRichMediaHandles('auto')
  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const autoInput = richMediaHost.querySelector('button[data-kg-port-dir="in"]') as HTMLButtonElement | null
  const autoOutput = richMediaHost.querySelector('button[data-kg-port-dir="out"]') as HTMLButtonElement | null
  if (autoInput?.dataset.kgPortKey !== 'videoUrl' || autoOutput?.dataset.kgPortKey !== 'videoUrl') {
    throw new Error(`expected auto Rich Media rails to retain centered videoUrl fallback, got ${autoInput?.dataset.kgPortKey}/${autoOutput?.dataset.kgPortKey}`)
  }

  renderRichMediaHandles({ key: 'richMediaActiveTab', type: 'string', value: 'text' }, true)
  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const wrappedTextInput = richMediaHost.querySelector('button[data-kg-port-dir="in"]') as HTMLButtonElement | null
  const wrappedTextOutput = richMediaHost.querySelector('button[data-kg-port-dir="out"]') as HTMLButtonElement | null
  if (wrappedTextInput?.dataset.kgPortKey !== 'output' || wrappedTextOutput?.dataset.kgPortKey !== 'output') {
    throw new Error(`expected outer-wrapped text Rich Media rails to expose output, got ${wrappedTextInput?.dataset.kgPortKey}/${wrappedTextOutput?.dataset.kgPortKey}`)
  }

  richMediaRoot.unmount()
}

export const testFlowWidgetOutputPortHandleDomOrderPrefersCenterLane = () => {
  const ordered = orderFlowPortHandlesByCenterPriority([
    { id: 'out:top', topPct: 16.6666666667 },
    { id: 'out:upper', topPct: 33.3333333333 },
    { id: 'out:center', topPct: 50 },
    { id: 'out:lower', topPct: 66.6666666667 },
    { id: 'out:bottom', topPct: 83.3333333333 },
  ])

  const ids = ordered.map(handle => handle.id)
  if (ids[0] !== 'out:center') {
    throw new Error(`expected center output handle to be first DOM target, got ${ids.join(', ')}`)
  }
  if (ids.length !== 5 || new Set(ids).size !== 5) {
    throw new Error(`expected center-priority ordering to preserve all handles, got ${ids.join(', ')}`)
  }

  const centered = selectCenteredFlowPortHandle([
    { id: 'out:top', topPct: 20 },
    { id: 'out:nearest', topPct: 54 },
    { id: 'out:bottom', topPct: 80 },
  ])
  if (centered.length !== 1 || centered[0]?.id !== 'out:nearest' || centered[0]?.topPct !== 50) {
    throw new Error(`expected outer overlay handles to keep only the nearest semantic handle at the middle, got ${JSON.stringify(centered)}`)
  }

  const overlayHandles = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/StoryboardWidgetOverlayPortHandles.tsx'), 'utf8')
  const panel = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/WidgetEditorPanel.tsx'), 'utf8')
  const formContent = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/WidgetEditorFormContent.tsx'), 'utf8')
  const registrySection = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/WidgetEditorRegistrySection.tsx'), 'utf8')
  const outerHandles = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/WidgetEditorPortHandles.tsx'), 'utf8')
  if (!overlayHandles.includes('<WidgetEditorPortHandles')) {
    throw new Error('expected shared Card and Rich Media overlays to reuse the centered outer handle owner')
  }
  if (!panel.includes('{isRichMediaPanelWidget ? (') || !panel.includes('<WidgetEditorPortHandles')) {
    throw new Error('expected WidgetEditorPanel outer handles to be Rich Media-only')
  }
  if (!formContent.includes('showRichMediaPanelKtvRows && registryEntrySnapshot') || !formContent.includes('portHandlesVisible={false}')) {
    throw new Error('expected Rich Media KTV rows to suppress duplicate row-level handles')
  }
  if (!registrySection.includes('if (!portHandlesVisible) return null') || !registrySection.includes('const visiblePortRows = showPortRows && portHandlesVisible ? portRows : []')) {
    throw new Error('expected registry handle visibility to be independent from interaction enablement')
  }
  if (!overlayHandles.includes('!props.selected && !isPendingSource && !isPendingTarget') || !overlayHandles.includes('outputOnly={persistentOutputOnly || pendingSourceOutputOnly}') || !overlayHandles.includes('pendingSourceIds.some(sourceId => isCanonicalNodeIdEqual(sourceId, nodeId))') || overlayHandles.includes('inputOnly={isPendingTarget')) {
    throw new Error('expected shared overlays to preserve selected source cohorts and allow target chaining during explicit edge wiring')
  }
  if (!panel.includes('forceEnabled')) {
    throw new Error('expected the Rich Media outer pair to remain visible independently from schema interaction state')
  }
  if (outerHandles.includes("layout?: 'semantic' | 'center-pair'") || outerHandles.includes('args.layout')) {
    throw new Error('expected the outer handle owner to remove the stale multi-handle layout branch')
  }
}
