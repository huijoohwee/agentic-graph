import React, { act } from 'react'
import { readFileSync } from 'node:fs'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { StoryboardWidgetInlineValueEditor } from '@/components/StoryboardWidget/StoryboardWidgetInlineValueEditor'
import CommandMenuCatalogPanel from '@/features/command-menu/CommandMenuCatalogPanel'
import {
  clearWorkspaceDataViewFloatingBinding,
  setWorkspaceDataViewFloatingBinding,
  setWorkspaceDataViewFloatingDensity,
  useWorkspaceDataViewFloatingDensity,
  type WorkspaceDataViewFloatingBinding,
} from '@/features/markdown-workspace/main/viewer/workspaceDataViewFloatingStore'
import { coerceWorkspaceDataViewConfig, type WorkspaceDataViewConfig } from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { CardMarkdownPreview } from '@/lib/cards/CardMarkdownPreview'
import { insertMediaIntoActiveCardInlineTextEditor } from '@/lib/cards/cardInlineTextExternalCommands'
import { writeCommandMenuMediaNameDraft } from '@/lib/command-menu/commandMenuMediaNameSync'
import { collectInlineKeywordCommandCandidates } from '@/lib/command-menu/inlineCommandMenuCatalog'
import {
  DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME,
  resolveDataViewChipClass,
} from '@/features/markdown/ui/dataViewChipStyles'
import { renderSafeHtmlBlock } from '@/features/markdown/ui/markdownPreviewLinks'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { waitForFrames } from '@/tests/lib/reactRootHarness'
const readUtf8 = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const buildFloatingBinding = (viewConfig: WorkspaceDataViewConfig): WorkspaceDataViewFloatingBinding => ({
  registrationId: 'storybook-refresh-density',
  contextLabel: 'Storyboard',
  activePanel: 'layout',
  canMutate: true,
  viewerLayout: 'kanban',
  viewerMode: 'multiDimTable',
  allowMultiDimLayout: true,
  columns: [],
  groupByColumnId: null,
  viewConfig,
  setViewConfig: () => void 0,
  onChangeLayout: () => void 0,
})
const buildViewConfig = (density: { rowHeightPreset: 'compact' | 'comfortable'; fieldLineMode: 'single' | 'double' }): WorkspaceDataViewConfig => {
  const viewConfig = coerceWorkspaceDataViewConfig({
    v: 2,
    id: 'v0',
    name: 'Kanban View',
    layout: 'kanban',
    groupByColumnId: null,
    visibleColumnIds: null,
    columnTypesById: null,
    filterGroups: [{ id: 'g0', rules: [] }],
    sortRules: [],
    rowHeightPreset: density.rowHeightPreset,
    fieldLineMode: density.fieldLineMode,
  })
  if (!viewConfig) throw new Error('expected test view config to coerce')
  return viewConfig
}
export function testPlainTextInputEditorUsesReactChangeContract() {
  const plainTextInput = readUtf8('../components/ui/PlainTextInputEditor.tsx')
  if (plainTextInput.includes('onInput=')) {
    throw new Error('expected PlainTextInputEditor to avoid native onInput handlers and reuse the shared React change contract')
  }
  const changeHandlerCount = (plainTextInput.match(/onChange=\{ev => onChange\?\.\(ev\.currentTarget\.value\)\}/g) || []).length
  if (changeHandlerCount < 2) {
    throw new Error(`expected PlainTextInputEditor to publish the React change contract for both input variants, got ${changeHandlerCount}`)
  }
  for (const snippet of ['value={value}', 'value={value}\n        defaultValue={defaultValue}', 'value={value}\n      defaultValue={defaultValue}']) {
    if (!plainTextInput.includes(snippet)) {
      throw new Error(`expected PlainTextInputEditor to keep controlled value ownership for shared editors: ${snippet}`)
    }
  }
}
export function testCardInlineTextEditorPreservesSharedMultilineCommitContract() {
  const cardInlineEditor = readUtf8('../lib/cards/CardInlineTextEditor.tsx')
  const cardInlineEditingSurface = readUtf8('../lib/cards/CardInlineTextEditingSurface.tsx')
  const cardInlineDisplaySurface = readUtf8('../lib/cards/CardInlineTextDisplaySurface.tsx')
  const sharedEditorRuntime = `${cardInlineEditor}\n${cardInlineEditingSurface}\n${cardInlineDisplaySurface}`
  const storyboardWidgetOverlayProxy = readUtf8('../lib/canvas/storyboard-widget-overlay-proxy.ts')
  for (const snippet of [
    '<PanelTextarea',
    '<PanelTextInput',
    'value: projectedEditorDisplayValue',
    'updateDraft(nextValue)',
    'readProjectedEditorRawValue',
    'rowHeightPreset={editorDensity.rowHeightPreset}',
    'fieldLineMode={editorDensity.fieldLineMode}',
    'density={editorDensity.rowHeightPreset}',
    "editActivation = 'doubleClick'",
    'data-kg-card-inline-edit-activation={props.editActivation}',
    'onPointerDown={event => {',
    'shouldOpenMarkdownViewerInlineEditorFromReadClick',
    'onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {',
    'commit()',
    "if (multiline && event.key === 'Enter' && (event.metaKey || event.ctrlKey))",
    'onCommit?.(next)',
  ]) {
    if (!sharedEditorRuntime.includes(snippet)) {
      throw new Error(`expected CardInlineTextEditor to preserve the shared multiline commit contract: ${snippet}`)
    }
  }
  if (!storyboardWidgetOverlayProxy.includes('[data-kg-card-inline-edit="1"]')) {
    throw new Error('expected Storyboard Widget overlay pointer routing to treat shared card inline editors as interactive controls')
  }
}
export async function testWorkspaceDataViewFloatingDensityResyncsSameRegistrationViewConfig() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const snapshots: string[] = []
  function DensityProbe() {
    const density = useWorkspaceDataViewFloatingDensity()
    snapshots.push(`${density.rowHeightPreset}:${density.fieldLineMode}`)
    return React.createElement('span', { 'data-density': `${density.rowHeightPreset}:${density.fieldLineMode}` })
  }
  try {
    await act(async () => {
      root.render(React.createElement(DensityProbe))
      await waitForFrames(dom.window, 4)
    })
    await act(async () => {
      setWorkspaceDataViewFloatingBinding(buildFloatingBinding(buildViewConfig({
        rowHeightPreset: 'comfortable',
        fieldLineMode: 'single',
      })))
      await waitForFrames(dom.window, 4)
    })
    await act(async () => {
      setWorkspaceDataViewFloatingBinding(buildFloatingBinding(buildViewConfig({
        rowHeightPreset: 'comfortable',
        fieldLineMode: 'double',
      })))
      await waitForFrames(dom.window, 4)
    })
    const latestDensity = container.querySelector('[data-density]')?.getAttribute('data-density')
    if (latestDensity !== 'comfortable:double') {
      throw new Error(`expected same-registration binding update to resync persisted density after refresh, got ${String(latestDensity)} snapshots=${snapshots.join(',')}`)
    }
  } finally {
    clearWorkspaceDataViewFloatingBinding('storybook-refresh-density')
    setWorkspaceDataViewFloatingDensity({ rowHeightPreset: 'comfortable', fieldLineMode: 'single' })
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export function testInlineKeywordCommandsReuseCompleteDashboardKeywordContext() {
  const dashboardKeywords = Array.from({ length: 36 }, (_, index) => `#Reusabletype${String(index).padStart(2, '0')}`)
  const candidates = collectInlineKeywordCommandCandidates({
    draftText: [
      ...dashboardKeywords,
      '#Strybldrimagesource',
      '#Storyboardframe',
      '#Storyboardelement',
      '#Fork',
      '#Review',
      '#Publish',
      'Review element cards, revise prompts, then send the approved sequence to video generation.',
    ].join('\n'),
  })
  const labels = new Set(candidates.map(candidate => candidate.label))
  for (const expectedLabel of ['Strybldrimagesource', 'Storyboardframe', 'Storyboardelement', 'Fork', 'Review', 'Publish', 'Agentic OS Runtime Readiness', 'Frontmatter']) {
    if (!labels.has(expectedLabel)) {
      throw new Error(`expected inline # command menu to include Dashboard keyword ${expectedLabel}, got ${JSON.stringify(candidates.map(candidate => candidate.label))}`)
    }
  }
}
export function testCardInlineTextEditorAvoidsRuntimeFocusPolyfill() {
  const cardInlineEditor = readUtf8('../lib/cards/CardInlineTextEditor.tsx')
  for (const fragment of ['attach' + 'Event', 'detach' + 'Event']) {
    if (cardInlineEditor.includes(fragment)) {
      throw new Error(`expected CardInlineTextEditor to avoid runtime focus polyfill fragment: ${fragment}`)
    }
  }
}
export async function testCardInlineTextEditorAllowsSharedClickActivation() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'Revenue card',
          ariaLabel: 'Card title',
          placeholder: 'Add title',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          onCommit: () => void 0,
        }),
      )
      await waitForFrames(dom.window, 8)
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) {
      throw new Error('expected shared card inline editor to expose the click activation marker')
    }
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const input = container.querySelector('input[aria-label="Card title"]')
    if (!(input instanceof dom.window.HTMLInputElement)) {
      throw new Error('expected shared card inline editor click activation to open the editable input')
    }
    if (input.value !== 'Revenue card') {
      throw new Error(`expected click activation to preserve current card value, got ${JSON.stringify(input.value)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCardInlineTextEditorExternalMediaInvokeTargetsActiveField() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  const selectedMediaUrls: string[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'Review source evidence.',
          ariaLabel: 'Action text',
          placeholder: 'Add action',
          canEdit: true,
          editorSurface: 'control',
          multiline: true,
          rows: 3,
          onCommit: value => committedValues.push(value),
          onMediaCommandSelect: candidate => selectedMediaUrls.push(candidate.url),
        }),
      )
      await waitForFrames(dom.window, 8)
    })
    const display = container.querySelector('[data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) {
      throw new Error('expected card inline display to expose the external invoke target')
    }
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 2)
    })
    let inserted = false
    await act(async () => {
      inserted = insertMediaIntoActiveCardInlineTextEditor({
        kind: 'image',
        url: 'https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/demo.jpg?kg_media_token=token',
        label: 'airvio_.JPEG',
        sourceKey: 'sha256:demo',
      })
      await waitForFrames(dom.window, 2)
    })
    if (!inserted) throw new Error('expected FloatingPanel Media invoke to insert into the active card field')
    const latest = committedValues.at(-1) || ''
    if (!latest.includes('Review source evidence.\n![airvio_.JPEG](https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/demo.jpg?kg_media_token=token)')) {
      throw new Error(`expected external Media invoke to append image markdown to Action field, got ${latest}`)
    }
    if (selectedMediaUrls.length !== 1 || !selectedMediaUrls[0]?.includes('/upload-demo/image/demo.jpg')) {
      throw new Error(`expected external @ media insertion to notify the Card/Widget graph owner once, got ${JSON.stringify(selectedMediaUrls)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCommandMenuMediaPanelActionInvokesActiveCardField() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(React.Fragment, null,
          React.createElement(CardInlineTextEditor, {
            value: 'Review source evidence.',
            ariaLabel: 'Action text',
            placeholder: 'Add action',
            canEdit: true,
            editorSurface: 'control',
            multiline: true,
            rows: 3,
            onCommit: value => committedValues.push(value),
          }),
          React.createElement(CommandMenuCatalogPanel),
        ),
      )
      await waitForFrames(dom.window, 8)
    })
    const display = container.querySelector('[data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected active card display field')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const imageAction = container.querySelector('[data-kg-command-menu-media-action="insert-image"]')
    if (!(imageAction instanceof dom.window.HTMLElement)) throw new Error('expected FloatingPanel Media image action row')
    await act(async () => {
      imageAction.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 2)
    })
    const latest = committedValues.at(-1) || ''
    if (!latest.includes('Review source evidence.\n![Image](image-url)')) {
      throw new Error(`expected FloatingPanel Media image action to insert into active Action field, got ${latest}`)
    }
    const audioAction = container.querySelector('[data-kg-command-menu-media-action="insert-audio"]')
    if (!(audioAction instanceof dom.window.HTMLElement)) throw new Error('expected FloatingPanel Media audio action row')
    await act(async () => {
      audioAction.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 2)
    })
    const latestAudioInvoke = committedValues.at(-1) || ''
    if (!latestAudioInvoke.includes('<audio src="audio-url" title="Audio" controls></audio>')) {
      throw new Error(`expected FloatingPanel Media audio action to insert media embed, got ${latestAudioInvoke}`)
    }
    for (const staleActionId of [
      'agentic-os-invocation:command:runtime-ready.check',
      'agentic-os-invocation:semantic:frontmatter',
      'agentic-os-invocation:binding:operator',
      'agentic-os-doc:agentic-os.runtime',
    ]) {
      if (container.querySelector(`[data-kg-command-menu-media-action="${staleActionId}"]`)) {
        throw new Error(`expected FloatingPanel Media to move non-media invocation action ${staleActionId} into Skills & Commands`)
      }
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCommandMenuMediaPanelPointerDownInvokesBeforeBlurClick() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(React.Fragment, null,
          React.createElement(CardInlineTextEditor, {
            value: 'Review source evidence.',
            ariaLabel: 'Action text',
            placeholder: 'Add action',
            canEdit: true,
            editorSurface: 'control',
            multiline: true,
            rows: 3,
            onCommit: value => committedValues.push(value),
          }),
          React.createElement(CommandMenuCatalogPanel),
        ),
      )
      await waitForFrames(dom.window, 8)
    })
    const display = container.querySelector('[data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected active card display field')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
      await waitForFrames(dom.window, 1)
    })
    const imageAction = container.querySelector('[data-kg-command-menu-media-action="insert-image"]')
    if (!(imageAction instanceof dom.window.HTMLElement)) throw new Error('expected FloatingPanel Media image action row')
    await act(async () => {
      imageAction.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
      await waitForFrames(dom.window, 2)
    })
    const latest = committedValues.at(-1) || ''
    if (!latest.includes('Review source evidence.\n![Image](image-url)')) {
      throw new Error(`expected FloatingPanel Media pointer-down invoke to insert before blur/click cleanup, got ${latest}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCommandMenuMediaPanelUploadedNameInvokesActiveCardField() {
  await (await import('./mediaCatalogPreviewKeyboardNavigation.test')).assertMediaCatalogPreviewKeyboardNavigation()
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  const storageKey = 'agenticgraph:floating-panel-media:uploaded-cloudflare-items:v1'
  const mediaUrl = 'https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg'
  try {
    dom.window.localStorage.setItem(storageKey, JSON.stringify([{
      id: 'cloudflare-media:sha256:uploaded-demo',
      name: 'airvio-demo.jpg',
      kind: 'image',
      localUrl: '',
      linkUrl: mediaUrl,
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      status: 'synced',
      storage: {
        workspaceId: 'airvio',
        runId: 'upload-demo',
        stageId: 'image',
        shotId: 'airvio-demo',
        objectKey: 'airvio/runs/upload-demo/image/airvio-demo.jpg',
        publicPath: '/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg',
        publicUrl: mediaUrl,
        accessUrl: `${mediaUrl}?kg_media_token=test`,
        contentHash: 'sha256:uploaded-demo',
        contentType: 'image/jpeg',
        provenance: { fileName: 'airvio-demo.jpg', sizeBytes: 1024 },
        response: {
          ok: true,
          apiVersion: 'agenticgraph.storage.v1',
          workspaceId: 'airvio',
          artifactId: 'upload-demo:image:airvio-demo',
          objectKey: 'airvio/runs/upload-demo/image/airvio-demo.jpg',
          publicPath: '/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg',
          durableR2Url: '/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg',
          contentHash: 'sha256:uploaded-demo',
          storage: { r2: 'confirmed', d1: 'persisted', kv: 'skipped', durableObject: 'skipped' },
          access: { cacheKey: null, expiresAtMs: null, url: `${mediaUrl}?kg_media_token=test` },
        },
      },
      error: null,
    }]))
    await act(async () => {
      root.render(
        React.createElement(React.Fragment, null,
          React.createElement(CardInlineTextEditor, {
            value: 'Review source evidence.',
            ariaLabel: 'Action text',
            placeholder: 'Add action',
            canEdit: true,
            editorSurface: 'control',
            multiline: true,
            rows: 3,
            onCommit: value => committedValues.push(value),
          }),
          React.createElement(CommandMenuCatalogPanel),
        ),
      )
      await waitForFrames(dom.window, 8)
    })
    const display = container.querySelector('[data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected active card display field')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
      await waitForFrames(dom.window, 1)
    })
    const mediaName = container.querySelector('[data-kg-media-upload-name-text="cloudflare-media:sha256:uploaded-demo"]')
    if (!(mediaName instanceof dom.window.HTMLElement)) throw new Error('expected uploaded media name text to be the primary insert target')
    const renameButton = container.querySelector('[data-kg-media-upload-rename="cloudflare-media:sha256:uploaded-demo"]')
    if (!(renameButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected uploaded media rename to stay an explicit row control')
    const downloadLink = container.querySelector('[data-kg-media-download-overlay="1"]')
    if (!(downloadLink instanceof dom.window.HTMLAnchorElement)) throw new Error('expected uploaded media row to expose Download Media overlay')
    const downloadHref = String(downloadLink.getAttribute('href') || '')
    if (!downloadHref.includes('__chat_asset_proxy') || !downloadHref.includes('airvio-demo.jpg')) {
      throw new Error(`expected Download Media to reuse the shared media download proxy, got ${downloadHref}`)
    }
    const previewButton = container.querySelector('[data-kg-media-thumbnail-fullscreen="cloudflare-media:sha256:uploaded-demo"]')
    if (!(previewButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected uploaded media thumbnail to open its Rich Media Panel preview')
    await act(async () => {
      previewButton.click()
      await waitForFrames(dom.window, 4)
    })
    const mediaPreview = dom.window.document.querySelector('[data-kg-media-catalog-preview="1"]')
    if (!(mediaPreview instanceof dom.window.HTMLElement)) throw new Error('expected thumbnail click to open the viewport-positioned FloatingPanel media preview')
    if (mediaPreview.getAttribute('data-kg-media-catalog-preview-kind') !== 'image') throw new Error(`expected image preview kind, got ${String(mediaPreview.getAttribute('data-kg-media-catalog-preview-kind') || '')}`)
    const richMediaPanel = mediaPreview.querySelector('[data-kg-rich-media-panel="1"]')
    if (!(richMediaPanel instanceof dom.window.HTMLElement)) throw new Error('expected inline preview to reuse Rich Media Panel')
    if (richMediaPanel.getAttribute('data-kg-overlay-placement-owner') !== 'parent') {
      throw new Error('expected FloatingPanel Media to retain ownership of Rich Media Panel placement')
    }
    const previewImage = mediaPreview.querySelector('img')
    if (!(previewImage instanceof dom.window.HTMLImageElement)) throw new Error('expected inline Rich Media Panel to render an image element')
    const previewSrc = String(previewImage.getAttribute('src') || '')
    if (!decodeURIComponent(previewSrc).includes(`${mediaUrl}?kg_media_token=`)) {
      throw new Error(`expected inline preview image to use uploaded access URL, got ${previewSrc}`)
    }
    if (dom.window.document.querySelector('[data-kg-media-lightbox="1"]') || mediaPreview.getAttribute('data-kg-media-catalog-preview-placement') !== 'legacy-lightbox') throw new Error('expected Rich Media Panel to reuse the previous lightbox placement without mounting MediaLightbox')
    const closePreview = mediaPreview.querySelector('[data-kg-media-catalog-preview-close="1"]')
    if (!(closePreview instanceof dom.window.HTMLButtonElement)) throw new Error('expected inline media preview to expose a Back to media catalog action')
    if (committedValues.length !== 0) {
      throw new Error(`expected thumbnail preview to avoid invoking active card insertion, got ${JSON.stringify(committedValues)}`)
    }
    await act(async () => {
      closePreview.click()
      await waitForFrames(dom.window, 2)
    })
    if (dom.window.document.querySelector('[data-kg-media-catalog-preview="1"]')) throw new Error('expected Close to dismiss the expanded media preview')
    const restoredMediaName = container.querySelector('[data-kg-media-upload-name-text="cloudflare-media:sha256:uploaded-demo"]')
    if (!(restoredMediaName instanceof dom.window.HTMLElement)) throw new Error('expected media catalog rows to return after closing preview')
    await act(async () => {
      restoredMediaName.click()
      await waitForFrames(dom.window, 2)
    })
    const latest = committedValues.at(-1) || ''
    if (!latest.includes('Review source evidence.\n![airvio-demo.jpg](https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg?kg_media_token=')) {
      throw new Error(`expected uploaded Media name click to insert Cloudflare image into active Action field, got ${latest}`)
    }
  } finally {
    dom.window.localStorage.removeItem(storageKey)
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCardInlineTextEditorSelectionOverridesStaleMediaTarget() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const actionValues: string[] = []
  const dialogueValues: string[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(React.Fragment, null,
          React.createElement(CardInlineTextEditor, {
            value: 'Review the source evidence into editable storyboard elements.',
            ariaLabel: 'Action',
            placeholder: 'Add action',
            canEdit: true,
            editorSurface: 'control',
            editActivation: 'click',
            multiline: true,
            rows: 3,
            onCommit: value => actionValues.push(value),
          }),
          React.createElement(CardInlineTextEditor, {
            value: 'Existing dialogue',
            ariaLabel: 'Dialogue',
            placeholder: 'Add dialogue',
            canEdit: true,
            editorSurface: 'control',
            editActivation: 'click',
            multiline: true,
            rows: 3,
            onCommit: value => dialogueValues.push(value),
          }),
        ),
      )
      await waitForFrames(dom.window, 8)
    })
    const actionDisplay = container.querySelector('[aria-label="Action"][data-kg-card-inline-edit="1"]')
    const dialogueDisplay = container.querySelector('[aria-label="Dialogue"][data-kg-card-inline-edit="1"]')
    if (!(actionDisplay instanceof dom.window.HTMLElement)) throw new Error('expected Action display field')
    if (!(dialogueDisplay instanceof dom.window.HTMLElement)) throw new Error('expected Dialogue display field')
    await act(async () => {
      dialogueDisplay.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
      dialogueDisplay.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }))
      await waitForFrames(dom.window, 1)
    })
    const range = dom.window.document.createRange()
    range.selectNodeContents(actionDisplay)
    const selection = dom.window.document.getSelection()
    if (!selection) throw new Error('expected browser selection')
    selection.removeAllRanges()
    selection.addRange(range)
    const inserted = insertMediaIntoActiveCardInlineTextEditor({
      kind: 'image',
      url: 'https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/action-target.jpg?kg_media_token=token',
      label: 'action-target.jpg',
      sourceKey: 'sha256:action-target',
    })
    if (!inserted) throw new Error('expected selected Action display field to accept Media insertion')
    const latestAction = actionValues.at(-1) || ''
    if (!latestAction.includes('Review the source evidence into editable storyboard elements.\n![action-target.jpg](https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/action-target.jpg?kg_media_token=token)')) {
      throw new Error(`expected selected Action field to receive media insertion, got ${latestAction}`)
    }
    if (dialogueValues.length !== 0) {
      throw new Error(`expected stale Dialogue target not to receive selected Action media insertion, got ${JSON.stringify(dialogueValues)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCardInlineTextEditorMultilineRowsFollowViewDensity() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const readOpenedTextareaRows = async (fieldLineMode: 'single' | 'double') => {
    await act(async () => {
      setWorkspaceDataViewFloatingDensity({ rowHeightPreset: 'compact', fieldLineMode })
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'Review element cards, revise prompts, then send the approved sequence to video generation.',
          ariaLabel: 'Action text',
          placeholder: 'Add action',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          multiline: true,
          rows: 3,
          onCommit: () => void 0,
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected shared card editor display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const textarea = container.querySelector('textarea[aria-label="Action text"]')
    if (!(textarea instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected multiline action textarea')
    const rows = textarea.rows
    const className = textarea.className
    await act(async () => {
      textarea.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    return { rows, className }
  }
  try {
    const single = await readOpenedTextareaRows('single')
    if (single.rows !== 1 || !single.className.includes('min-h-8')) {
      throw new Error(`expected single-line View density to open card textarea with one row, got rows=${single.rows} class=${single.className}`)
    }
    const double = await readOpenedTextareaRows('double')
    if (double.rows !== 2 || !double.className.includes('min-h-12') || !double.className.includes('resize-y')) {
      throw new Error(`expected two-line View density to open card textarea with two rows, got rows=${double.rows} class=${double.className}`)
    }
    if (double.className.split(/\s+/).includes('resize')) {
      throw new Error(`expected card textarea resizing to keep width fixed with resize-y, got class=${double.className}`)
    }
  } finally {
    setWorkspaceDataViewFloatingDensity({ rowHeightPreset: 'comfortable', fieldLineMode: 'single' })
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCardInlineTextEditorDisplaySurfaceFollowsViewDensity() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const readDisplayClassName = async (fieldLineMode: 'single' | 'double') => {
    await act(async () => {
      setWorkspaceDataViewFloatingDensity({ rowHeightPreset: 'compact', fieldLineMode })
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'Review element cards, revise prompts, then send the approved sequence to video generation.',
          ariaLabel: 'Action text',
          placeholder: 'Add action',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          multiline: true,
          rows: 3,
          displayClassName: 'm-0 mt-1 text-xs leading-5 whitespace-pre-wrap break-words',
          onCommit: () => void 0,
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected shared card editor display surface')
    return display.className
  }
  try {
    const singleClassName = await readDisplayClassName('single')
    if (!singleClassName.includes('truncate')) {
      throw new Error(`expected single-line View density to clamp card display surface to one line, got class=${singleClassName}`)
    }
    const doubleClassName = await readDisplayClassName('double')
    if (!doubleClassName.includes('line-clamp-2')) {
      throw new Error(`expected two-line View density to clamp card display surface to two lines, got class=${doubleClassName}`)
    }
    if (doubleClassName.split(/\s+/).includes('block')) {
      throw new Error(`expected two-line card display surface to avoid block display overriding line-clamp-2, got class=${doubleClassName}`)
    }
  } finally {
    setWorkspaceDataViewFloatingDensity({ rowHeightPreset: 'comfortable', fieldLineMode: 'single' })
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testStoryboardWidgetInlineValueEditorReusesDensityAwareViewerSurface() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      setWorkspaceDataViewFloatingDensity({ rowHeightPreset: 'compact', fieldLineMode: 'double' })
      root.render(
        React.createElement(StoryboardWidgetInlineValueEditor, {
          id: 'flow-widget-value',
          value: 'Widget output should reuse the shared card surface and textarea density controls.',
          active: true,
          ariaLabel: 'Widget value',
          multiline: true,
          rows: 6,
          className: 'h-6 whitespace-pre-wrap break-words',
          onCommit: () => void 0,
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected Storyboard Widget value display to reuse CardInlineTextEditor')
    if (!display.className.includes('line-clamp-2')) {
      throw new Error(`expected Storyboard Widget display surface to reuse two-line field density, got class=${display.className}`)
    }
    if (display.className.split(/\s+/).includes('block')) {
      throw new Error(`expected Storyboard Widget display surface to avoid block overriding line-clamp-2, got class=${display.className}`)
    }
    if (display.className.includes('h-6')) {
      throw new Error(`expected Storyboard Widget display surface to ignore single-line/editor sizing classes, got class=${display.className}`)
    }
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const editor = container.querySelector('textarea[aria-label="Widget value"]')
    if (!(editor instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected Storyboard Widget value to open the shared control textarea surface')
    if (!editor.className.includes('min-h-12') || !editor.className.includes('resize-y')) {
      throw new Error(`expected Storyboard Widget control textarea surface to use two-line panel density, class=${editor.className}`)
    }
    if (editor.className.split(/\s+/).includes('resize')) {
      throw new Error(`expected Storyboard Widget control textarea surface not to enable unconstrained two-axis resizing, class=${editor.className}`)
    }
  } finally {
    setWorkspaceDataViewFloatingDensity({ rowHeightPreset: 'comfortable', fieldLineMode: 'single' })
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCardInlineTextEditorCanPropagateActivationClick() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  let parentClicks = 0
  try {
    await act(async () => {
      root.render(
        React.createElement('section', {
          onClick: () => {
            parentClicks += 1
          },
        }, React.createElement(CardInlineTextEditor, {
          value: 'Metric target',
          ariaLabel: 'Metric target',
          placeholder: 'Add target',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          stopActivationPropagation: false,
          onCommit: () => void 0,
        })),
      )
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) {
      throw new Error('expected shared card inline editor to expose the click activation marker')
    }
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    if (parentClicks !== 1) {
      throw new Error(`expected shared inline editor to allow activation click propagation when requested, got ${parentClicks}`)
    }
    const input = container.querySelector('input[aria-label="Metric target"]')
    if (!(input instanceof dom.window.HTMLInputElement)) {
      throw new Error('expected propagated activation click to still open the editable input')
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCardInlineTextEditorMarkdownCommandMenusApplySlashAndVariableActions() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'Widget panel text',
          ariaLabel: 'Widget text',
          placeholder: 'Add text',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          multiline: true,
          markdownCommandContextText: [
            'imageUrl: "https://media.example.test/poster.jpg"',
            'videoUrl: "https://www.youtube.com/watch?v=demoVideoId"',
          ].join('\n'),
          onCommit: next => {
            committedValues.push(next)
          },
        }),
      )
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) {
      throw new Error('expected shared card editor display surface')
    }
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const textarea = container.querySelector('textarea[aria-label="Widget text"]')
    if (!(textarea instanceof dom.window.HTMLTextAreaElement)) {
      throw new Error('expected multiline card editor textarea')
    }
    const slashButton = container.querySelector('button[title="Slash commands"]')
    const variableButton = container.querySelector('button[title="Variable commands"]')
    const keywordButton = container.querySelector('button[title="Keyword commands"]')
    if (!(slashButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected slash command launcher')
    if (!(variableButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected variable command launcher')
    if (!(keywordButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected keyword command launcher')
    await act(async () => {
      slashButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      slashButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const slashInput = dom.window.document.querySelector('input[placeholder="Type a command"]')
    if (!(slashInput instanceof dom.window.HTMLInputElement)) throw new Error('expected slash command search input')
    const checklistButton = (Array.from(dom.window.document.querySelectorAll('section[aria-label="Card slash commands"] button')) as HTMLButtonElement[]).find(
      el => String(el.textContent || '').includes('Checklist'),
    )
    if (!(checklistButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected Checklist slash command')
    await act(async () => {
      checklistButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      checklistButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    if (!textarea.value.includes('- [ ] Widget panel text')) {
      throw new Error(`expected slash command to transform widget panel text into a checklist item, got ${JSON.stringify(textarea.value)}`)
    }
    await act(async () => {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      variableButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      variableButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const variableInput = dom.window.document.querySelector('input[placeholder="Find variable or action"]')
    if (!(variableInput instanceof dom.window.HTMLInputElement)) throw new Error('expected variable command search input')
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set
    if (!setter) throw new Error('expected input value setter')
    await act(async () => {
      setter.call(variableInput, 'venue')
      Simulate.change(variableInput)
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const insertReferenceButton = (Array.from(dom.window.document.querySelectorAll('section[aria-label="Card variable commands"] button')) as HTMLButtonElement[]).find(
      el => String(el.textContent || '').includes('Insert reference'),
    )
    if (!(insertReferenceButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected Insert reference variable command')
    await act(async () => {
      insertReferenceButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      insertReferenceButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    if (!textarea.value.includes('{{venue}}')) {
      throw new Error(`expected variable command to insert markdown variable token, got ${JSON.stringify(textarea.value)}`)
    }
    await act(async () => {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      keywordButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      keywordButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const keywordInput = dom.window.document.querySelector('input[placeholder="Find keyword"]')
    if (!(keywordInput instanceof dom.window.HTMLInputElement)) throw new Error('expected keyword command search input')
    await act(async () => {
      setter.call(keywordInput, 'story')
      Simulate.change(keywordInput)
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const storyboardKeywordButton = (Array.from(dom.window.document.querySelectorAll('section[aria-label="Card keyword commands"] button')) as HTMLButtonElement[]).find(
      el => String(el.textContent || '').includes('Storyboard'),
    )
    if (!(storyboardKeywordButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected Storyboard keyword command')
    await act(async () => {
      storyboardKeywordButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      storyboardKeywordButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    if (!textarea.value.includes('#storyboard')) {
      throw new Error(`expected keyword command to insert #storyboard token, got ${JSON.stringify(textarea.value)}`)
    }
    await act(async () => {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      variableButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      variableButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const imageInsertButton = (Array.from(dom.window.document.querySelectorAll('section[aria-label="Card variable commands"] button')) as HTMLButtonElement[]).find(
      el => String(el.textContent || '').includes('Image: imageUrl') && String(el.textContent || '').includes('https://media.example.test/poster.jpg'),
    )
    if (!(imageInsertButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected Image @ media insertion command with resolved URL')
    const imageThumbnail = imageInsertButton.querySelector('[data-kg-inline-command-thumbnail="image"] img')
    if (!(imageThumbnail instanceof dom.window.HTMLImageElement)) throw new Error('expected Image @ media insertion command to show a thumbnail')
    if (imageThumbnail.getAttribute('src') !== 'https://media.example.test/poster.jpg') {
      throw new Error(`expected Image @ media thumbnail to use the resolved image URL, got ${JSON.stringify(imageThumbnail.getAttribute('src'))}`)
    }
    await act(async () => {
      imageInsertButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      imageInsertButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    if (!committedValues.some(value => value.includes('](https://media.example.test/poster.jpg)'))) {
      throw new Error(`expected @ Image command to persist the resolved image embed immediately, got ${JSON.stringify(committedValues)}`)
    }
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const activeTextareaAfterImageInsert = container.querySelector('textarea[aria-label="Widget text"]')
    if (activeTextareaAfterImageInsert) {
      throw new Error('expected persisted @ Image insertion to close the editor so the saved thumbnail preview can render')
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCardInlineTextEditorVideoCommandPersistsPosterThumbnail() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'Send approved sequence to video generation.',
          ariaLabel: 'Action text',
          placeholder: 'Add action',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          multiline: true,
          markdownCommandContextText: 'videoUrl: "https://www.youtube.com/watch?v=demoVideoId"',
          onCommit: next => {
            committedValues.push(next)
          },
        }),
      )
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected shared card editor display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const textarea = container.querySelector('textarea[aria-label="Action text"]')
    if (!(textarea instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected multiline action textarea')
    const variableButton = container.querySelector('button[title="Variable commands"]')
    if (!(variableButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected variable command launcher')
    await act(async () => {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      variableButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      variableButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const videoInsertButton = (Array.from(dom.window.document.querySelectorAll('section[aria-label="Card variable commands"] button')) as HTMLButtonElement[]).find(
      el => el.id === 'Card variable commands-insert-video' && String(el.textContent || '').includes('https://www.youtube.com/watch?v=demoVideoId'),
    )
    if (!(videoInsertButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected generic Video @ media insertion command to resolve the contextual URL')
    const videoThumbnail = videoInsertButton.querySelector('[data-kg-inline-command-thumbnail="video"] img')
    if (!(videoThumbnail instanceof dom.window.HTMLImageElement)) throw new Error('expected Video @ media insertion command to show a thumbnail')
    if (videoThumbnail.getAttribute('src') !== 'https://i.ytimg.com/vi/demoVideoId/hqdefault.jpg') {
      throw new Error(`expected Video @ media thumbnail to use derived poster URL, got ${JSON.stringify(videoThumbnail.getAttribute('src'))}`)
    }
    await act(async () => {
      Simulate.blur(textarea, { relatedTarget: null })
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    if (!dom.window.document.querySelector('#Card\\ variable\\ commands-insert-video')) {
      throw new Error('expected @ Video command menu to stay open across null relatedTarget blur')
    }
    await act(async () => {
      videoInsertButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      videoInsertButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const persisted = committedValues.find(value => value.includes('<video'))
    if (!persisted) throw new Error(`expected @ Video command to persist a video embed, got ${JSON.stringify(committedValues)}`)
    if (!persisted.includes('poster="https://i.ytimg.com/vi/demoVideoId/hqdefault.jpg"')) {
      throw new Error(`expected persisted @ Video embed to include a poster thumbnail, got ${JSON.stringify(persisted)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCardInlineTextEditorGenericMediaPlaceholderStaysEditable() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'Inline media placeholder',
          ariaLabel: 'Action text',
          placeholder: 'Add action',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          multiline: true,
          onCommit: next => {
            committedValues.push(next)
          },
        }),
      )
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected shared card editor display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const textarea = container.querySelector('textarea[aria-label="Action text"]')
    if (!(textarea instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected multiline action textarea')
    const variableButton = container.querySelector('button[title="Variable commands"]')
    if (!(variableButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected variable command launcher')
    await act(async () => {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      variableButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      variableButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const imageInsertButton = dom.window.document.querySelector('#Card\\ variable\\ commands-insert-image')
    if (!(imageInsertButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected generic Image @ media insertion command')
    await act(async () => {
      imageInsertButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      imageInsertButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const activeTextarea = container.querySelector('textarea[aria-label="Action text"]')
    if (!(activeTextarea instanceof dom.window.HTMLTextAreaElement)) {
      throw new Error('expected unresolved @ Image insertion to stay in the inline text box')
    }
    if (!activeTextarea.value.includes('@Image alt') || activeTextarea.value.includes('![') || activeTextarea.value.includes('image-url')) {
      throw new Error(`expected unresolved @ Image insertion to show a compact editable media chip label, got ${JSON.stringify(activeTextarea.value)}`)
    }
    const mediaChip = container.querySelector('[data-kg-chat-input-media-chip="1"]')
    if (!mediaChip || activeTextarea.getAttribute('data-kg-card-inline-edit-media-overlay') !== '1') {
      throw new Error(`expected unresolved @ Image insertion to render through the shared card textarea media overlay, html=${container.innerHTML}`)
    }
    const committed = committedValues.at(-1) || ''
    if (!committed.includes('![Image alt](image-url)') || committed.includes('@Image alt')) {
      throw new Error(`expected unresolved @ Image insertion to persist raw markdown while displaying a chip, got ${JSON.stringify(committedValues)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCardInlineTextEditorMediaCommandsUseSharedCommandMenuRenameDraft() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const renamedUrl = 'https://www.youtube.com/watch?v=commandMenuRenameDraft'
  const committedValues: string[] = []
  try {
    writeCommandMenuMediaNameDraft(renamedUrl, 'sd1')
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'Review storyboard media',
          ariaLabel: 'Action text',
          placeholder: 'Add action',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          multiline: true,
          markdownPreview: 'auto',
          markdownCommandContextText: `videoUrl: "${renamedUrl}"`,
          onCommit: next => {
            committedValues.push(next)
          },
        }),
      )
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected shared card editor display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const textarea = container.querySelector('textarea[aria-label="Action text"]')
    if (!(textarea instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected multiline action textarea')
    const variableButton = container.querySelector('button[title="Variable commands"]')
    if (!(variableButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected variable command launcher')
    await act(async () => {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      variableButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      variableButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const mediaButtons = Array.from(dom.window.document.querySelectorAll('section[aria-label="Card variable commands"] button')) as HTMLButtonElement[]
    const renamedMediaButton = mediaButtons.find(button => String(button.textContent || '').includes('sd1') && String(button.textContent || '').includes(renamedUrl))
    if (!(renamedMediaButton instanceof dom.window.HTMLButtonElement)) {
      const buttonText = mediaButtons.map(button => String(button.textContent || '').replace(/\s+/g, ' ').trim()).join(' | ')
      throw new Error(`expected @ media dropdown to use shared Command Menu rename draft, got ${buttonText}`)
    }
    await act(async () => {
      renamedMediaButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      renamedMediaButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const persisted = committedValues.find(value => value.includes('<video'))
    if (!persisted || !persisted.includes('title="sd1"')) {
      throw new Error(`expected @ media insertion to persist the shared media name as the video label, got ${JSON.stringify(committedValues)}`)
    }
  } finally {
    writeCommandMenuMediaNameDraft(renamedUrl, '')
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCardInlineTextEditorKeywordTokenUsesInlineChipDisplay() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: '#storyboard #180kb @operator',
          ariaLabel: 'Output text',
          placeholder: 'Add output',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          multiline: true,
          markdownPreview: 'auto',
          onCommit: () => void 0,
        }),
      )
      await waitForFrames(dom.window, 8)
    })
    const chips = Array.from(container.querySelectorAll('[data-kg-card-inline-keyword-pill="1"]')) as HTMLElement[]
    const chip = chips[0] as HTMLElement | undefined
    if (!(chip instanceof dom.window.HTMLElement)) {
      throw new Error(`expected #keyword token to render as inline chip on the shared card display path, html=${container.innerHTML}`)
    }
    const numericChip = chips.find(candidate => String(candidate.textContent || '').trim() === '#180kb') as HTMLElement | undefined
    if (!(numericChip instanceof dom.window.HTMLElement)) {
      throw new Error(`expected numeric-leading #keyword token to render as the same inline chip path, html=${container.innerHTML}`)
    }
    const bindingChip = chips.find(candidate => String(candidate.textContent || '').trim() === '@operator') as HTMLElement | undefined
    if (!(bindingChip instanceof dom.window.HTMLElement)) {
      throw new Error(`expected @binding token to preserve the visible @ sigil on the shared card display path, html=${container.innerHTML}`)
    }
    for (const candidate of [chip, numericChip, bindingChip]) {
      if (!candidate.querySelector('.kg-inline-chip-label-15ch')) {
        throw new Error(`expected / # @ inline chip labels to use shared 15ch truncation, html=${candidate.outerHTML}`)
      }
      if (!candidate.className.includes('kg-inline-chip-shell-15ch')) {
        throw new Error(`expected / # @ inline chip shells to fit truncated labels without empty right-side width, html=${candidate.outerHTML}`)
      }
    }
    for (const expectedClass of DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME.split(' ')) {
      if (expectedClass && !chip.className.includes(expectedClass)) {
        throw new Error(`expected inline keyword chip to reuse DataView inline-text chip class ${expectedClass}, got ${chip.className}`)
      }
    }
    if (chip.className.includes('text-[10px]') || chip.className.includes('leading-[15px]')) {
      throw new Error(`expected card display / # @ chips to inherit surrounding text metrics for Viewer edit parity, got ${chip.className}`)
    }
    for (const expectedClass of resolveDataViewChipClass('storyboard').split(' ')) {
      if (expectedClass && !chip.className.includes(expectedClass)) {
        throw new Error(`expected inline keyword chip to reuse storyboard chip tone class ${expectedClass}, got ${chip.className}`)
      }
    }
    if (chip.className.includes('rounded-full')) {
      throw new Error(`expected inline keyword chip to restore rectangular chip radius, got ${chip.className}`)
    }
    const text = String(container.textContent || '').replace(/\s+/g, ' ').trim()
    if (text !== '#storyboard #180kb @operator') {
      throw new Error(`expected inline keyword chip preview to preserve token text, got ${JSON.stringify(text)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testCardInlineTextEditorMarkdownPreviewOneClickReopensDefaultEditor() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'Review evidence 123 ![image](https://media.example.test/poster.jpg)',
          ariaLabel: 'Action text',
          placeholder: 'Add action',
          canEdit: true,
          editorSurface: 'control',
          multiline: true,
          markdownPreview: 'auto',
          onCommit: value => committedValues.push(value),
        }),
      )
      await new Promise(resolve => setTimeout(resolve, 0))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="doubleClick"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected shared card editor display surface to preserve default double-click activation')
    const previewRoot = container.querySelector('[data-kg-card-markdown-preview="1"]')
    if (!(previewRoot instanceof dom.window.HTMLElement)) throw new Error('expected markdown preview read surface to render inside the shared card editor display')
    const previewMediaChip = previewRoot.querySelector('[data-kg-card-inline-media-pill="1"]')
    if (!(previewMediaChip instanceof dom.window.HTMLElement)) throw new Error('expected markdown preview media chip to render inside the shared card editor display')
    const previewThumbnail = previewMediaChip.querySelector('[data-kg-inline-command-thumbnail="image"]')
    if (!(previewThumbnail instanceof dom.window.HTMLElement)) throw new Error('expected markdown preview media chip to reuse the shared inline thumbnail owner')
    await act(async () => {
      previewRoot.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, detail: 1 }))
      previewRoot.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 }))
      previewRoot.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const textarea = container.querySelector('textarea[aria-label="Action text"]')
    if (!(textarea instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected one click on the markdown preview read surface to reopen the default shared inline editor')
    if (!textarea.value.includes('@image') || textarea.value.includes('![')) throw new Error(`expected reopened default editor to show compact media projection, got ${JSON.stringify(textarea.value)}`)
    await act(async () => {
      Simulate.blur(textarea, { relatedTarget: null })
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    if (committedValues.length > 0) throw new Error(`expected unchanged projected editor reopen not to mutate raw image markdown, got ${JSON.stringify(committedValues)}`)
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
export async function testStoryboardWidgetInlineValueEditorFirstInactiveClickCommits() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  let committed = ''
  let parentClicks = 0
  let parentPointerDowns = 0
  function Harness() {
    const [active, setActive] = React.useState(false)
    return React.createElement('section', {
      onPointerDown: () => {
        parentPointerDowns += 1
      },
      onClick: () => {
        parentClicks += 1
        setActive(true)
      },
    }, React.createElement(StoryboardWidgetInlineValueEditor, {
      id: 'storyboard-widget-first-click-value',
      value: '50',
      active,
      ariaLabel: 'Metric target',
      onCommit: next => {
        committed = next
      },
    }))
  }
  try {
    await act(async () => {
      root.render(React.createElement(Harness))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) {
      throw new Error('expected Storyboard Widget Value cell to render the shared click-activated inline editor')
    }
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    if (parentPointerDowns !== 0) {
      throw new Error(`expected first inactive Storyboard Widget value pointer-down to stay local and avoid workspace/indexing activation, got ${parentPointerDowns}`)
    }
    if (parentClicks !== 0) {
      throw new Error(`expected first inactive Storyboard Widget value click to stay local and avoid workspace/indexing activation, got ${parentClicks}`)
    }
    const input = container.querySelector('input[aria-label="Metric target"]')
    if (!(input instanceof dom.window.HTMLInputElement)) {
      throw new Error('expected first inactive Storyboard Widget value click to open the shared editable input')
    }
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set
    if (!setter) throw new Error('expected input value setter')
    await act(async () => {
      setter.call(input, '77')
      Simulate.change(input)
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await act(async () => {
      Simulate.keyDown(input, { key: 'Enter' })
    })
    if (committed !== '77') {
      throw new Error(`expected first Storyboard Widget inline edit value to commit without requiring a second click, got ${JSON.stringify(committed)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
