import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'

import { defaultSchema } from '@/lib/graph/schema'
import { WidgetEditorForm } from '@/components/StoryboardWidget/WidgetEditorForm'
import {
  FRONTMATTER_FLOW_HANDLES_VALUE_KEY,
  FRONTMATTER_FLOW_WIDGET_FIELDS_KEY,
} from '@/features/parsers/markdownFrontmatterFlowGraph.flowBlock'
import {
  buildCanonicalWidgetRegistryDraft,
  buildTextGenerationRegistryDraft,
  buildWidgetDraftFromSmartFields,
  getWidgetRegistryEntryLabel,
  listVisibleWidgetRegistryPortsForPropsEditor,
} from '@/features/storyboard-widget-manager/registryTemplates'
import { normalizeWidgetFieldSchemaPath } from '@/features/storyboard-widget-manager/widgetFieldMutation'
import {
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { buildRichMediaPanelRegistryDraft } from '@/features/storyboard-widget-manager/richMediaPanelRegistryDraft'

type DomGlobalSnapshot = Partial<Pick<
  typeof globalThis,
  'window' | 'document' | 'Event' | 'InputEvent' | 'HTMLElement' | 'HTMLInputElement' | 'HTMLTextAreaElement'
>> & { IS_REACT_ACT_ENVIRONMENT?: unknown }

function installDomGlobals(dom: JSDOM): () => void {
  const g = globalThis as typeof globalThis & DomGlobalSnapshot
  const prev: DomGlobalSnapshot = {
    window: g.window,
    document: g.document,
    Event: g.Event,
    InputEvent: g.InputEvent,
    HTMLElement: g.HTMLElement,
    HTMLInputElement: g.HTMLInputElement,
    HTMLTextAreaElement: g.HTMLTextAreaElement,
    IS_REACT_ACT_ENVIRONMENT: g.IS_REACT_ACT_ENVIRONMENT,
  }
  g.window = dom.window as unknown as Window & typeof globalThis
  g.document = dom.window.document
  g.Event = dom.window.Event as typeof Event
  g.InputEvent = dom.window.InputEvent as typeof InputEvent
  g.HTMLElement = dom.window.HTMLElement as typeof HTMLElement
  g.HTMLInputElement = dom.window.HTMLInputElement as typeof HTMLInputElement
  g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement as typeof HTMLTextAreaElement
  g.IS_REACT_ACT_ENVIRONMENT = true
  return () => {
    Object.entries(prev).forEach(([key, value]) => {
      if (typeof value === 'undefined') delete (g as Record<string, unknown>)[key]
      else (g as Record<string, unknown>)[key] = value
    })
  }
}

async function renderFrontmatterBuiltInWidget(args: {
  nodeId: string
  nodeTypeId: string
  properties: Record<string, unknown>
  providerFamily?: 'byteplus' | 'openai'
}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const registryDraft = buildCanonicalWidgetRegistryDraft({
    nodeTypeId: args.nodeTypeId,
    providerFamily: args.providerFamily,
  })
  if (!registryDraft) throw new Error(`expected canonical registry draft for ${args.nodeTypeId}`)
  const registryEntry = {
    ...registryDraft,
    id: `${args.nodeId}-registry`,
    updatedAt: '2026-04-27T00:00:00.000Z',
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    React.createElement(WidgetEditorForm, {
      active: true,
      node: {
        id: args.nodeId,
        label: `${registryEntry.nodeTypeId} - Frontmatter`,
        type: args.nodeTypeId,
        properties: {
          'flow:widgetFormId': registryEntry.formId,
          ...args.properties,
        },
      },
      graphMetaKind: 'frontmatter-flow',
      schema: defaultSchema,
      hideFields: false,
      labelInputRef: { current: null },
      onSetLabel: () => void 0,
      onSetType: () => void 0,
      onPatchProperties: () => void 0,
      onSetProperties: () => void 0,
      onValidate: () => void 0,
      registryEntry: registryEntry as any,
      registryEntries: [registryEntry as any],
    }),
  )
  await new Promise<void>(resolve => setTimeout(resolve, 20))

  return { dom, host, root, registryEntry }
}

function assertFrontmatterBuiltInWidgetIdentityPattern(args: {
  host: HTMLElement
  registryEntry: Pick<WidgetRegistryEntry, 'nodeTypeId' | 'widgetTypeId' | 'formId' | 'fields' | 'ports'>
  expectedIdentityLabel?: string
}) {
  const widgetIdentityInput = args.host.querySelector('input[id$="frontmatter-widget-identity"]') as HTMLInputElement | null
  if (!widgetIdentityInput) throw new Error('expected frontmatter built-in widget to expose canonical Widget identity row')
  const expectedIdentityLabel = args.expectedIdentityLabel || getWidgetRegistryEntryLabel({
    nodeTypeId: args.registryEntry.nodeTypeId,
    widgetTypeId: args.registryEntry.widgetTypeId,
    formId: args.registryEntry.formId,
  })
  if (widgetIdentityInput.value !== expectedIdentityLabel) {
    throw new Error(`expected canonical Widget identity ${JSON.stringify(expectedIdentityLabel)}, got ${JSON.stringify(widgetIdentityInput.value)}`)
  }
  if (args.host.querySelector('section[aria-label="Flow Envelope"]')) throw new Error('expected built-in frontmatter widget to avoid duplicate flow-envelope rows')
  if (args.host.querySelector('section[aria-label="Flow Handles"]')) throw new Error('expected built-in frontmatter widget to avoid duplicate flow-handle rows')
  if (args.host.querySelector('section[aria-label="Widget Registry"] thead')) throw new Error('expected built-in frontmatter widget registry to reuse props-panel table rows without Key/Type/Value header row')
  ;['Key', 'Type', 'Value'].forEach(token => {
    const headerCell = args.host.querySelector(`section[aria-label="Widget Registry"] thead td`)
    if (headerCell && args.host.textContent?.includes(token)) {
      throw new Error(`expected frontmatter built-in widget registry to omit ${JSON.stringify(token)} header token`)
    }
  })
  const renderedLabels = Array.from(
    args.host.querySelectorAll('section[aria-label="Widget"] label, section[aria-label="Widget Registry"] label'),
  ).map(label => label.textContent?.trim() || '').filter(Boolean)
  const fieldSchemaPaths = new Set(args.registryEntry.fields.map(field => normalizeWidgetFieldSchemaPath(field.schemaPath, field.fieldKey)).filter(Boolean))
  const expectedOrderedLabels = [
    'Widget',
    ...args.registryEntry.fields.map(field => String(field.label || '').trim()).filter(Boolean),
    ...listVisibleWidgetRegistryPortsForPropsEditor({ registryEntry: args.registryEntry })
      .filter(port => !fieldSchemaPaths.has(normalizeWidgetFieldSchemaPath(port.schemaPath, port.portKey)))
      .map(port => String(port.portKey || '').trim())
      .filter(Boolean),
  ]
  if (renderedLabels.length !== expectedOrderedLabels.length) {
    throw new Error(`expected ${expectedOrderedLabels.length} Widget/Registry labels, got ${renderedLabels.length}: ${JSON.stringify(renderedLabels)}`)
  }
  expectedOrderedLabels.forEach((label, idx) => {
    const rendered = renderedLabels[idx]
    if (rendered !== label && !rendered.startsWith(label)) {
      throw new Error(`expected ordered label ${idx} to start with ${JSON.stringify(label)}, got ${JSON.stringify(rendered)}`)
    }
  })
}

export const testFlowWidgetSchemaFieldPortsRenderRowHandles = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const schema = {
    ...defaultSchema,
    behavior: { ...defaultSchema.behavior, portHandles: { ...defaultSchema.behavior.portHandles, enabled: true } },
  }

  const node = {
    id: 'table:products',
    label: 'Products',
    type: 'Schema',
    properties: {
      'schema:fields': ['id', { title: 'warehouse_id', type: 'uuid' }],
    },
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)

  root.render(
    React.createElement(WidgetEditorForm, {
      active: true,
      node,
      schema,
      hideFields: true,
      labelInputRef: { current: null },
      onSetLabel: () => void 0,
      onSetType: () => void 0,
      onPatchProperties: () => void 0,
      onSetProperties: () => void 0,
      onValidate: () => void 0,
      onSchemaPortHandleClick: () => void 0,
    }),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const inButtons = host.querySelectorAll('button[data-kg-port-handle="1"][data-kg-port-dir="in"][data-kg-port-key^="field:"]')
  const outButtons = host.querySelectorAll('button[data-kg-port-handle="1"][data-kg-port-dir="out"][data-kg-port-key^="field:"]')
  if (inButtons.length !== 2) throw new Error(`expected 2 input port buttons, got ${inButtons.length}`)
  if (outButtons.length !== 2) throw new Error(`expected 2 output port buttons, got ${outButtons.length}`)

  root.unmount()
}

export const testFrontmatterEnvelopeHandlesUsePerPortNamesAndEditableTypedValues = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const restoreGlobals = installDomGlobals(dom)
  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)
  const patched: Array<Record<string, unknown>> = []
  try {
    await act(async () => {
      root.render(
        React.createElement(WidgetEditorForm, {
          active: true,
          node: {
            id: 'p-text-script',
            label: 'Rich Media Panel - Text',
            type: 'RichMediaPanel',
            properties: {
              [FRONTMATTER_FLOW_HANDLES_VALUE_KEY]: {
                target: ['output', 'outputSrcDoc'],
                source: ['output', 'outputSrcDoc'],
              },
              [FRONTMATTER_FLOW_WIDGET_FIELDS_KEY]: [
                { fieldKey: 'prompt', fieldType: 'textarea', schemaPath: 'prompt' },
                { fieldKey: 'actor', fieldType: 'array', schemaPath: 'actor' },
                { fieldKey: 'media_interactive', fieldType: 'boolean', schemaPath: 'media_interactive' },
              ],
              prompt: 'before',
              actor: ['user', 'AI'],
              media_interactive: true,
            },
          },
          graphMetaKind: 'frontmatter-flow',
          schema: defaultSchema,
          hideFields: false,
          labelInputRef: { current: null },
          onSetLabel: () => void 0,
          onSetType: () => void 0,
          onPatchProperties: () => void 0,
          onSetProperties: next => patched.push(next),
          onValidate: () => void 0,
        }),
      )
    })

    const envelope = host.querySelector('section[aria-label="Flow Envelope"]')
    if (!envelope) throw new Error('expected generic frontmatter-flow node to render Flow Envelope rows')
    const labels = (Array.from(envelope.querySelectorAll('label')) as HTMLLabelElement[])
      .map(label => String(label.textContent || '').trim())
      .filter(Boolean)
    const genericHandleLabels = labels.filter(label => label.includes('handles.target') || label.includes('handles.source'))
    if (genericHandleLabels.length > 0) {
      throw new Error(`expected frontmatter handle rows to avoid generic handle path labels, got ${JSON.stringify(genericHandleLabels)}`)
    }
    ;(['output', 'outputSrcDoc'] as const).forEach(portKey => {
      const inButton = envelope.querySelector(`button[data-kg-port-handle="1"][data-kg-port-dir="in"][data-kg-port-key="${portKey}"]`)
      const outButton = envelope.querySelector(`button[data-kg-port-handle="1"][data-kg-port-dir="out"][data-kg-port-key="${portKey}"]`)
      if (!inButton || !outButton) {
        throw new Error(`expected ${portKey} to map to both input and output port handles`)
      }
    })

    const readControlForLabel = (labelText: string): HTMLElement => {
      const label = (Array.from(envelope.querySelectorAll('label')) as HTMLLabelElement[]).find(entry => (
        String(entry.textContent || '').trim() === labelText
      ))
      if (!label) throw new Error(`expected label ${JSON.stringify(labelText)} to render`)
      const controlId = String(label.getAttribute('for') || '').trim()
      const control = controlId ? dom.window.document.getElementById(controlId) : null
      if (!(control instanceof dom.window.HTMLElement)) {
        throw new Error(`expected label ${JSON.stringify(labelText)} to bind to editable Value control`)
      }
      return control
    }

    const editText = async (labelText: string, value: string) => {
      const control = readControlForLabel(labelText)
      if (control.getAttribute('data-kg-card-inline-edit') !== '1') {
        throw new Error(`expected label ${JSON.stringify(labelText)} to reuse shared inline Value editor`)
      }
      await act(async () => {
        control.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise(resolve => setTimeout(resolve, 0))
      })
      const editable = dom.window.document.getElementById(control.id)
      if (
        !(editable instanceof dom.window.HTMLTextAreaElement)
        && !(editable instanceof dom.window.HTMLInputElement)
      ) {
        throw new Error(`expected label ${JSON.stringify(labelText)} to open shared editable Value input`)
      }
      const setter = Object.getOwnPropertyDescriptor(
        editable instanceof dom.window.HTMLTextAreaElement
          ? dom.window.HTMLTextAreaElement.prototype
          : dom.window.HTMLInputElement.prototype,
        'value',
      )?.set
      if (!setter) throw new Error('expected DOM Value control setter')
      await act(async () => {
        setter.call(editable, value)
        Simulate.change(editable)
        await new Promise(resolve => setTimeout(resolve, 0))
      })
      const changedEditable = dom.window.document.getElementById(control.id)
      if (
        !(changedEditable instanceof dom.window.HTMLTextAreaElement)
        && !(changedEditable instanceof dom.window.HTMLInputElement)
      ) {
        throw new Error(`expected label ${JSON.stringify(labelText)} to keep shared editable Value input after change`)
      }
      await act(async () => {
        Simulate.keyDown(changedEditable, { key: 'Enter', metaKey: true })
      })
    }

    await editText('prompt', 'after')
    await editText('actor', '["producer","AI"]')
    await editText('media_interactive', 'false')

    if (!patched.some(entry => entry.prompt === 'after')) {
      throw new Error(`expected string KTV Value edit to patch prompt, got ${JSON.stringify(patched)}`)
    }
    if (!patched.some(entry => Array.isArray(entry.actor) && entry.actor.join('|') === 'producer|AI')) {
      throw new Error(`expected array KTV Value edit to patch typed actor array, got ${JSON.stringify(patched)}`)
    }
    if (!patched.some(entry => entry.media_interactive === false)) {
      throw new Error(`expected boolean KTV Value edit to patch typed false value, got ${JSON.stringify(patched)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restoreGlobals()
  }
}

export const testTextGenerationWidgetDoesNotRenderLegacySmartMediaRows = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const registryDraft = buildTextGenerationRegistryDraft({ providerFamily: 'byteplus' })
  const registryEntry = {
    ...registryDraft,
    id: 'byteplus-text-default',
    updatedAt: '2026-02-06T00:00:00.000Z',
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)

  root.render(
    React.createElement(WidgetEditorForm, {
      active: true,
      node: {
        id: 'text:byteplus',
        label: 'BytePlus Text Widget',
        type: 'TextGeneration',
        properties: {
          chatProvider: 'byteplus',
          chatModel: 'doubao-1.5-pro-32k',
          prompt: 'hello',
          aspect_ratio: 'square',
          resolution: '1080p',
          duration: 4,
          generate_audio: true,
          fast: false,
          reference_image: 'https://example.invalid/image.png',
        },
      },
      schema: defaultSchema,
      hideFields: false,
      labelInputRef: { current: null },
      onSetLabel: () => void 0,
      onSetType: () => void 0,
      onPatchProperties: () => void 0,
      onSetProperties: () => void 0,
      onValidate: () => void 0,
      registryEntry: registryEntry as any,
      registryEntries: [registryEntry as any],
    }),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  if (host.querySelector('section[aria-label="Smart fields"]')) {
    throw new Error('expected BytePlus TextGeneration widget to hide legacy smart-media rows')
  }
  ;['Aspect ratio', 'Resolution', 'Duration', 'Generate audio', 'Fast', 'Reference image'].forEach(label => {
    if (host.textContent?.includes(label)) {
      throw new Error(`expected BytePlus TextGeneration widget to omit legacy smart-media row ${label}`)
    }
  })
  ;['Provider', 'Model', 'Response format', 'Top P'].forEach(label => {
    if (!host.textContent?.includes(label)) {
      throw new Error(`expected BytePlus TextGeneration widget to keep registry row ${label}`)
    }
  })

  root.unmount()
}

export const testFrontmatterImageWidgetReusesCanonicalRegistryRowsAndSingleHandleSurface = async () => {
  const { host, root, registryEntry } = await renderFrontmatterBuiltInWidget({
    nodeId: 'w-img-frontmatter',
    nodeTypeId: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
    properties: {
      model: 'seedream-4-0-250828',
      prompt: 'frontmatter image prompt',
      size: '2K',
      output_format: 'jpeg',
      response_format: 'b64_json',
      optimize_prompt_options: 'fast',
      aspect_ratio: 1,
      stream: true,
      watermark: false,
      seed: 0,
      guidance_scale: 0,
      reference_image: '',
    },
  })

  assertFrontmatterBuiltInWidgetIdentityPattern({
    host,
    registryEntry,
    expectedIdentityLabel: 'Image Widget',
  })

  const text = host.textContent || ''
  if (text.includes('handles.target') || text.includes('handles.source')) {
    throw new Error('expected canonical handle rows to avoid generic handle path labels')
  }
  const referencePort = host.querySelector('button[data-kg-port-handle="1"][data-kg-port-dir="in"][data-kg-port-key="reference_image"]')
  const imagePort = host.querySelector('button[data-kg-port-handle="1"][data-kg-port-dir="out"][data-kg-port-key="imageUrl"]')
  if (!referencePort || !imagePort) {
    throw new Error('expected canonical image widget port handles to map semantic keys to port buttons')
  }

  root.unmount()
}

export const testFrontmatterTextWidgetUsesCanonicalWidgetIdentityPattern = async () => {
  const { host, root, registryEntry } = await renderFrontmatterBuiltInWidget({
    nodeId: 'w-text-frontmatter',
    nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    providerFamily: 'byteplus',
    properties: {
      chatProvider: 'byteplus',
      chatAuthMode: 'apikey',
      chatEndpointUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3',
      chatModel: 'doubao-1.5-pro-32k',
      prompt: 'frontmatter text prompt',
      response_format: 'text',
      top_p: 0.9,
    },
  })

  assertFrontmatterBuiltInWidgetIdentityPattern({
    host,
    registryEntry,
    expectedIdentityLabel: 'Widget Card',
  })

  root.unmount()
}

export const testFrontmatterVideoWidgetUsesCanonicalWidgetIdentityPattern = async () => {
  const { host, root, registryEntry } = await renderFrontmatterBuiltInWidget({
    nodeId: 'w-video-frontmatter',
    nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
    properties: {
      model: 'seedance-1-0-pro-fast-251015',
      prompt: 'frontmatter video prompt',
      content_json: '{"style":"cinematic"}',
      aspect_ratio: '16:9',
      resolution: '1080p',
      duration: 4,
      generate_audio: true,
      fast: false,
      watermark: false,
      reference_image: '',
    },
  })

  assertFrontmatterBuiltInWidgetIdentityPattern({
    host,
    registryEntry,
    expectedIdentityLabel: 'Video Widget',
  })

  root.unmount()
}

export const testFrontmatterRichMediaPanelUsesCanonicalWidgetIdentityPattern = async () => {
  const { host, root, registryEntry } = await renderFrontmatterBuiltInWidget({
    nodeId: 'w-rich-frontmatter',
    nodeTypeId: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    properties: {
      output: 'frontmatter rich media output',
      imageUrl: 'https://example.invalid/frontmatter-image.png',
      videoUrl: 'https://example.invalid/frontmatter-video.mp4',
      outputSrcDoc: '<p>frontmatter rich media</p>',
      media_interactive: true,
    },
  })

  assertFrontmatterBuiltInWidgetIdentityPattern({
    host,
    registryEntry,
    expectedIdentityLabel: 'Rich Media Panel',
  })

  root.unmount()
}

export const testFlowWidgetHideFieldsRendersTextOutputPreviewAndKeepsPortRows = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const registryDraft = buildTextGenerationRegistryDraft({ providerFamily: 'byteplus' })
  const registryEntry = {
    ...registryDraft,
    id: 'byteplus-text-default',
    updatedAt: '2026-04-22T00:00:00.000Z',
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)

  root.render(
    React.createElement(WidgetEditorForm, {
      active: true,
      node: {
        id: 'text:compact',
        label: 'BytePlus Text Widget',
        type: 'TextGeneration',
        properties: {
          prompt: 'hello',
          output: '## Compact text preview',
        },
      },
      schema: defaultSchema,
      hideFields: true,
      labelInputRef: { current: null },
      onSetLabel: () => void 0,
      onSetType: () => void 0,
      onPatchProperties: () => void 0,
      onSetProperties: () => void 0,
      onValidate: () => void 0,
      registryEntry: registryEntry as any,
      registryEntries: [registryEntry as any],
    }),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const preview = host.querySelector('[aria-label="Widget text output preview"]') as HTMLElement | null
  if (!preview) throw new Error('expected compact text output preview')
  if (!String(preview.textContent || '').includes('Compact text preview')) {
    throw new Error('expected compact text preview to render widget output text')
  }
  if (host.textContent?.includes('Response format')) {
    throw new Error('expected hideFields compact mode to hide default registry field rows')
  }
  const portButtons = host.querySelectorAll('button[data-kg-port-handle="1"][data-kg-port-dir="out"]')
  if (portButtons.length < 1) throw new Error('expected compact mode to keep output-side port handle rows')

  root.unmount()
}

export const testFlowWidgetHideFieldsRendersImageOutputPreview = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const registryDraft = buildWidgetDraftFromSmartFields({
    nodeTypeId: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
    mode: 'image',
  })
  const registryEntry = {
    ...registryDraft,
    id: 'image-widget-default',
    updatedAt: '2026-04-22T00:00:00.000Z',
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)

  root.render(
    React.createElement(WidgetEditorForm, {
      active: true,
      node: {
        id: 'image:compact',
        label: 'BytePlus Image Widget',
        type: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
        properties: {
          imageUrl: 'https://example.invalid/generated-image.png',
        },
      },
      schema: defaultSchema,
      hideFields: true,
      labelInputRef: { current: null },
      onSetLabel: () => void 0,
      onSetType: () => void 0,
      onPatchProperties: () => void 0,
      onSetProperties: () => void 0,
      onValidate: () => void 0,
      registryEntry: registryEntry as any,
      registryEntries: [registryEntry as any],
    }),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const preview = host.querySelector('img[src="https://example.invalid/generated-image.png"]') as HTMLImageElement | null
  if (!preview) throw new Error('expected compact image output preview')

  root.unmount()
}

export const testFlowWidgetHideFieldsRendersVideoOutputPreview = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const registryDraft = buildWidgetDraftFromSmartFields({
    nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
    mode: 'video',
  })
  const registryEntry = {
    ...registryDraft,
    id: 'video-widget-default',
    updatedAt: '2026-04-22T00:00:00.000Z',
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)

  root.render(
    React.createElement(WidgetEditorForm, {
      active: true,
      node: {
        id: 'video:compact',
        label: 'Video Widget',
        type: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
        properties: {
          videoUrl: 'https://example.invalid/generated-video.mp4',
        },
      },
      schema: defaultSchema,
      hideFields: true,
      labelInputRef: { current: null },
      onSetLabel: () => void 0,
      onSetType: () => void 0,
      onPatchProperties: () => void 0,
      onSetProperties: () => void 0,
      onValidate: () => void 0,
      registryEntry: registryEntry as any,
      registryEntries: [registryEntry as any],
    }),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const preview = host.querySelector('video[src="https://example.invalid/generated-video.mp4"]') as HTMLVideoElement | null
  if (!preview) throw new Error('expected compact video output preview')

  root.unmount()
}

export const testFlowWidgetHideFieldsRendersConnectedImagePreviewFromGenericOutputEdge = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const registryDraft = buildRichMediaPanelRegistryDraft()
  const registryEntry = {
    ...registryDraft,
    id: 'rich-media-panel-default',
    updatedAt: '2026-04-22T00:00:00.000Z',
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)

  root.render(
    React.createElement(WidgetEditorForm, {
      active: true,
      node: {
        id: 'rich-media:compact:image-from-output',
        label: 'Rich Media Panel',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        properties: {},
      },
      schema: defaultSchema,
      hideFields: true,
      labelInputRef: { current: null },
      onSetLabel: () => void 0,
      onSetType: () => void 0,
      onPatchProperties: () => void 0,
      onSetProperties: () => void 0,
      onValidate: () => void 0,
      registryEntry: registryEntry as any,
      registryEntries: [registryEntry as any],
      connectedValuesBySchemaPath: {
        'properties.output': {
          value: 'https://example.invalid/connected-image.png',
          sources: [{ edgeId: 'edge-image', nodeId: 'image-widget', portKey: 'imageUrl' }],
        },
      },
    }),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const preview = host.querySelector('img[src="https://example.invalid/connected-image.png"]') as HTMLImageElement | null
  if (!preview) throw new Error('expected connected image source port on generic output edge to render image preview')

  root.unmount()
}

export const testFlowWidgetHideFieldsRendersConnectedVideoPreviewFromGenericOutputEdge = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const registryDraft = buildRichMediaPanelRegistryDraft()
  const registryEntry = {
    ...registryDraft,
    id: 'rich-media-panel-default',
    updatedAt: '2026-04-22T00:00:00.000Z',
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)

  root.render(
    React.createElement(WidgetEditorForm, {
      active: true,
      node: {
        id: 'rich-media:compact:video-from-output',
        label: 'Rich Media Panel',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        properties: {},
      },
      schema: defaultSchema,
      hideFields: true,
      labelInputRef: { current: null },
      onSetLabel: () => void 0,
      onSetType: () => void 0,
      onPatchProperties: () => void 0,
      onSetProperties: () => void 0,
      onValidate: () => void 0,
      registryEntry: registryEntry as any,
      registryEntries: [registryEntry as any],
      connectedValuesBySchemaPath: {
        'properties.output': {
          value: 'https://example.invalid/connected-video.mp4',
          sources: [{ edgeId: 'edge-video', nodeId: 'video-widget', portKey: 'videoUrl' }],
        },
      },
    }),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const preview = host.querySelector('video[src="https://example.invalid/connected-video.mp4"]') as HTMLVideoElement | null
  if (!preview) throw new Error('expected connected video source port on generic output edge to render video preview')

  root.unmount()
}

export const testRichMediaPanelDefaultViewReusesSharedViewerSsot = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const registryDraft = buildRichMediaPanelRegistryDraft()
  const registryEntry = {
    ...registryDraft,
    id: 'rich-media-panel-default',
    updatedAt: '2026-04-24T00:00:00.000Z',
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)

  root.render(
    React.createElement(WidgetEditorForm, {
      active: true,
      node: {
        id: 'rich-media:viewer-default',
        label: 'Rich Media Panel',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        properties: {},
      },
      schema: defaultSchema,
      hideFields: false,
      labelInputRef: { current: null },
      onSetLabel: () => void 0,
      onSetType: () => void 0,
      onPatchProperties: () => void 0,
      onSetProperties: () => void 0,
      onValidate: () => void 0,
      registryEntry: registryEntry as any,
      registryEntries: [registryEntry as any],
      connectedValuesBySchemaPath: {
        'properties.output': {
          value: '# Hello from Rich Media Panel',
          sources: [{ edgeId: 'edge-text', nodeId: 'text-widget', portKey: 'text_out' }],
        },
      },
    }),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const viewer = host.querySelector('[data-kg-rich-media-panel="1"]')
  if (!viewer) throw new Error('expected Rich Media Panel default view to mount the shared RichMediaPanel viewer')
  const resizeHandle = host.querySelector('[data-kg-resize-handle="se"]')
  if (!resizeHandle) throw new Error('expected Rich Media Panel default view to keep the bottom-right resize handle on the same panel surface')
  const markdownPreview = host.querySelector('[data-kg-rich-media-markdown-preview="1"]')
  if (!markdownPreview) throw new Error('expected Rich Media Panel default view to reuse markdown/image/video viewer SSOT')
  if (host.textContent?.includes('Widget Registry')) {
    throw new Error('expected Rich Media Panel default view to avoid duplicate registry/KTV sections')
  }
  ;['Model', 'Prompt', 'Aspect ratio', 'Duration', 'Resolution', 'Generate audio', 'Fast'].forEach(text => {
    if (host.textContent?.includes(text)) {
      throw new Error(`expected Rich Media Panel default view to avoid stale smart-media editor field ${text}`)
    }
  })

  root.unmount()
}

export const testRichMediaPanelKtvRowsReuseSharedWidgetKvTableSsot = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const registryDraft = buildRichMediaPanelRegistryDraft()
  const registryEntry = {
    ...registryDraft,
    id: 'rich-media-panel-default',
    updatedAt: '2026-04-24T00:00:00.000Z',
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)

  root.render(
    React.createElement(WidgetEditorForm, {
      active: true,
      node: {
        id: 'rich-media:ktv-rows',
        label: 'Rich Media Panel',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        properties: {
          output: 'hello',
          imageUrl: 'https://example.invalid/panel.png',
        },
      },
      schema: defaultSchema,
      hideFields: true,
      labelInputRef: { current: null },
      onSetLabel: () => void 0,
      onSetType: () => void 0,
      onPatchProperties: () => void 0,
      onSetProperties: () => void 0,
      onValidate: () => void 0,
      registryEntry: registryEntry as any,
      registryEntries: [registryEntry as any],
    }),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const viewer = host.querySelector('[data-kg-rich-media-panel="1"]')
  if (viewer) throw new Error('expected Rich Media Panel KTV mode to hide the viewer surface')
  const resizeHandle = host.querySelector('[data-kg-resize-handle="se"]')
  if (resizeHandle) throw new Error('expected Rich Media Panel KTV mode to hide the resize-handle viewer surface')
  ;['Key', 'Type', 'Value', 'Output', 'Image URL', 'Video URL', 'HTML srcdoc'].forEach(text => {
    if (!host.textContent?.includes(text)) {
      throw new Error(`expected Rich Media Panel KTV mode to reuse shared widget table content ${text}`)
    }
  })
  const portButtons = host.querySelectorAll('button[data-kg-port-handle="1"]')
  if (portButtons.length !== 0) throw new Error(`expected Rich Media Panel KTV rows to suppress duplicate row handles, got ${portButtons.length}`)

  root.unmount()
}

export const testRichMediaPanelPoiViewReusesSharedIframeSurface = async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const registryDraft = buildRichMediaPanelRegistryDraft()
  const registryEntry = {
    ...registryDraft,
    id: 'rich-media-panel-default',
    updatedAt: '2026-04-25T00:00:00.000Z',
  }

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)

  root.render(
    React.createElement(WidgetEditorForm, {
      active: true,
      node: {
        id: 'rich-media:poi-view',
        label: 'Rich Media Panel',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        properties: {
          richMediaActiveTab: 'poi',
          richMediaPoiLabel: 'Merlion',
          outputSrcDoc: '<!doctype html><html><body><main>GrabMaps POI selection rendered on the Rich Media Panel surface.</main></body></html>',
        },
      },
      schema: defaultSchema,
      hideFields: false,
      labelInputRef: { current: null },
      onSetLabel: () => void 0,
      onSetType: () => void 0,
      onPatchProperties: () => void 0,
      onSetProperties: () => void 0,
      onValidate: () => void 0,
      registryEntry: registryEntry as any,
      registryEntries: [registryEntry as any],
    }),
  )

  await new Promise<void>(resolve => setTimeout(resolve, 20))

  const viewer = host.querySelector('[data-kg-rich-media-panel="1"]')
  if (!viewer) throw new Error('expected Rich Media Panel POI view to reuse the shared RichMediaPanel surface')
  const poiFrame = host.querySelector('iframe[src="about:blank"][srcdoc*="GrabMaps POI selection rendered on the Rich Media Panel surface."]')
  if (!poiFrame) throw new Error('expected Rich Media Panel POI view to render shared iframe srcdoc output')
  const markdownPreview = host.querySelector('[data-kg-rich-media-markdown-preview="1"]')
  if (markdownPreview) throw new Error('expected Rich Media Panel POI view to avoid falling back to markdown viewer mode')

  root.unmount()
}
