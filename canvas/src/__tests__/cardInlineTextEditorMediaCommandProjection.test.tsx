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
import { UPLOADED_MEDIA_PANEL_STORAGE_KEY } from '@/lib/storage/uploadedMediaPanelItems'
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
export async function testCardInlineTextEditorExternalGenericMediaPlaceholderStaysInline() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  const selectedMedia: unknown[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'Imported document source unit: Strybldr starter source.',
          ariaLabel: 'Summary for strybldr:source:3725310941',
          placeholder: 'Add summary',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          multiline: true,
          mediaCommandMode: 'external',
          onCommit: next => {
            committedValues.push(next)
          },
          onMediaCommandSelect: candidate => {
            selectedMedia.push(candidate)
          },
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected shared card editor display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 1)
    })
    const textarea = container.querySelector('textarea[aria-label="Summary for strybldr:source:3725310941"]')
    if (!(textarea instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected active Strybldr source summary textarea')
    const variableButton = container.querySelector('button[title="Variable commands"]')
    if (!(variableButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected variable command launcher')
    await act(async () => {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      variableButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      variableButton.click()
      await waitForFrames(dom.window, 2)
    })
    const imageInsertButton = dom.window.document.querySelector('#Card\\ variable\\ commands-insert-image')
    if (!(imageInsertButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected generic Image @ media insertion command')
    await act(async () => {
      imageInsertButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      imageInsertButton.click()
      await waitForFrames(dom.window, 2)
    })
    const activeTextarea = container.querySelector('textarea[aria-label="Summary for strybldr:source:3725310941"]')
    if (!(activeTextarea instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected external-mode summary textarea to stay mounted')
    if (selectedMedia.length !== 0) {
      throw new Error(`expected generic no-url @ media command not to route to the external media slot, got ${JSON.stringify(selectedMedia)}`)
    }
    if (!activeTextarea.value.includes('@Image alt') || activeTextarea.value.includes('![') || activeTextarea.value.includes('image-url')) {
      throw new Error(`expected external-mode generic @ media command to show inline chip display text, got ${JSON.stringify(activeTextarea.value)}`)
    }
    const mediaChip = container.querySelector('[data-kg-chat-input-media-chip="1"][data-kg-chat-input-media-source="image-url"]')
    if (!mediaChip || activeTextarea.getAttribute('data-kg-card-inline-edit-media-overlay') !== '1') {
      throw new Error(`expected external-mode generic @ media command to reuse the shared card textarea media chip overlay, html=${container.innerHTML}`)
    }
    const committed = committedValues.at(-1) || ''
    if (!committed.includes('![Image alt](image-url)') || committed.includes('@Image alt')) {
      throw new Error(`expected external-mode generic @ media command to persist raw markdown behind the chip, got ${JSON.stringify(committedValues)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardInlineTextEditorExternalResolvedMediaKeepsInlineTextareaChip() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  const selectedMedia: unknown[] = []
  const mutationOrder: string[] = []
  const mediaUrl = 'https://media.example.test/buddydrone.png'
  const renderEditor = (value: string) => {
    root.render(
      React.createElement(CardInlineTextEditor, {
        value,
        ariaLabel: 'Summary for starter-source-brief-card',
        placeholder: 'Add summary',
        canEdit: true,
        editorSurface: 'control',
        editActivation: 'click',
        multiline: true,
        mediaCommandMode: 'external',
        markdownCommandContextText: `imageUrl: "${mediaUrl}"`,
        onCommit: next => {
          committedValues.push(next)
          mutationOrder.push('text')
        },
        onMediaCommandSelect: candidate => {
          selectedMedia.push(candidate)
          mutationOrder.push('media')
        },
      }),
    )
  }
  try {
    await act(async () => {
      renderEditor('Capture the operator-owned source URL.')
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected shared card editor display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 1)
    })
    const textarea = container.querySelector('textarea[aria-label="Summary for starter-source-brief-card"]')
    if (!(textarea instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected starter source brief summary textarea')
    const variableButton = container.querySelector('button[title="Variable commands"]')
    if (!(variableButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected variable command launcher')
    await act(async () => {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      variableButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      variableButton.click()
      await waitForFrames(dom.window, 2)
    })
    const imageInsertButton = (Array.from(dom.window.document.querySelectorAll('section[aria-label="Card variable commands"] button')) as HTMLButtonElement[]).find(
      el => String(el.textContent || '').includes('Image: imageUrl') && String(el.textContent || '').includes(mediaUrl),
    )
    if (!(imageInsertButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected resolved Image @ media insertion command')
    await act(async () => {
      imageInsertButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      imageInsertButton.click()
      await waitForFrames(dom.window, 2)
    })
    if (selectedMedia.length !== 1) {
      throw new Error(`expected resolved external @ media command to still update the card media slot, got ${JSON.stringify(selectedMedia)}`)
    }
    if (mutationOrder.join('|') !== 'text|media') {
      throw new Error(`expected resolved external @ media text commit before graph reconciliation, got ${mutationOrder.join('|')}`)
    }
    const committed = committedValues.at(-1) || ''
    if (!committed.includes(`![Image: imageUrl](${mediaUrl})`)) {
      throw new Error(`expected resolved external @ media command to persist raw media markdown for textarea chip projection, got ${JSON.stringify(committedValues)}`)
    }
    await act(async () => {
      renderEditor(committed)
      await waitForFrames(dom.window, 2)
    })
    const updatedDisplay = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(updatedDisplay instanceof dom.window.HTMLElement)) throw new Error('expected updated shared card editor display surface')
    await act(async () => {
      updatedDisplay.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const updatedTextarea = container.querySelector('textarea[aria-label="Summary for starter-source-brief-card"]')
    if (!(updatedTextarea instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected updated starter source brief summary textarea')
    if (updatedTextarea.value.includes('![') || updatedTextarea.value.includes(mediaUrl) || !updatedTextarea.value.includes('@Image: imageUrl')) {
      throw new Error(`expected reopened card textarea to show compact @ media chip text, got ${JSON.stringify(updatedTextarea.value)}`)
    }
    const mediaChip = container.querySelector('[data-kg-chat-input-media-chip="1"][data-kg-chat-input-media-source="https://media.example.test/buddydrone.png"]')
    if (!mediaChip || updatedTextarea.getAttribute('data-kg-card-inline-edit-media-overlay') !== '1') {
      throw new Error(`expected resolved external @ media command to reuse the shared card textarea media chip overlay, html=${container.innerHTML}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardInlineTextEditorAttachedMediaStaysOutOfTextareaEditValue() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  const mediaUrl = 'http://localhost:5179/api/storage/media/airvio/runs/upload-demo/image/strybldr-starter-source.png?agentic_os_media_token=token'
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'I can ...',
          ariaLabel: 'Summary for workspace-source',
          placeholder: 'Add summary',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          multiline: true,
          rows: 2,
          projectedMediaAttachments: [{
            mediaKind: 'image',
            label: 'strybldr-starter-source.png',
            sourceUrl: mediaUrl,
            thumbnailUrl: mediaUrl,
          }],
          onCommit: next => {
            committedValues.push(next)
          },
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected shared card editor display surface')
    const initialDisplayChip = display.querySelector('[data-kg-card-inline-display-media-chip="1"][data-kg-chat-input-media-source]')
    if (!(initialDisplayChip instanceof dom.window.HTMLElement) || initialDisplayChip.getAttribute('data-kg-chat-input-media-source') !== mediaUrl) {
      throw new Error(`expected attached card media to project as an inactive display @ chip, html=${container.innerHTML}`)
    }
    if (!initialDisplayChip.querySelector('.kg-inline-chip-label-15ch')) {
      throw new Error(`expected inactive display @ media chip label to use shared 15ch truncation, html=${initialDisplayChip.outerHTML}`)
    }
    if (!initialDisplayChip.className.includes('kg-inline-chip-shell-15ch')) {
      throw new Error(`expected inactive display @ media chip shell to avoid empty right-side width, html=${initialDisplayChip.outerHTML}`)
    }
    const initialDisplayText = String(display.textContent || '')
    if (!initialDisplayText.includes('I can ...') || !initialDisplayText.includes('@strybldr-starter-source.png') || initialDisplayText.includes(mediaUrl) || initialDisplayText.includes('![')) {
      throw new Error(`expected inactive display chip to preserve prose plus compact @ label only, got ${JSON.stringify(initialDisplayText)}`)
    }
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const textarea = container.querySelector('textarea[aria-label="Summary for workspace-source"]') as HTMLTextAreaElement | null
    if (!(textarea instanceof dom.window.HTMLTextAreaElement)) throw new Error(`expected workspace source textarea, html=${container.innerHTML}`)
    if (textarea.value !== 'I can ...') {
      throw new Error(`expected attached card media to stay out of the active textarea value, got ${JSON.stringify(textarea.value)}`)
    }
    if (textarea.value.includes('@strybldr-starter-source.png') || textarea.value.includes(mediaUrl) || textarea.value.includes('![')) {
      throw new Error(`expected attached media editing to avoid compact-label, URL, and markdown mutation, got ${JSON.stringify(textarea.value)}`)
    }
    if (textarea.getAttribute('data-kg-card-inline-edit-media-overlay') === '1' || container.querySelector('[data-kg-chat-input-overlay="1"]')) {
      throw new Error(`expected attached media not to create an editing-mode textarea overlay, html=${container.innerHTML}`)
    }
    await act(async () => {
      Simulate.keyDown(textarea, { key: 'Enter', metaKey: true })
      await waitForFrames(dom.window, 4)
    })
    if (committedValues.length !== 0) {
      throw new Error(`expected unchanged attached media projection to avoid source backfill, got ${JSON.stringify(committedValues)}`)
    }
    const reopenedDisplay = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(reopenedDisplay instanceof dom.window.HTMLElement)) throw new Error('expected shared card display after unchanged commit')
    const postCommitDisplayChip = reopenedDisplay.querySelector('[data-kg-card-inline-display-media-chip="1"][data-kg-chat-input-media-source]')
    if (!(postCommitDisplayChip instanceof dom.window.HTMLElement) || postCommitDisplayChip.getAttribute('data-kg-chat-input-media-source') !== mediaUrl) {
      throw new Error(`expected attached card media @ chip to remain visible after exiting edit mode, html=${container.innerHTML}`)
    }
    if (!postCommitDisplayChip.querySelector('.kg-inline-chip-label-15ch')) {
      throw new Error(`expected post-commit @ media display chip label to keep shared 15ch truncation, html=${postCommitDisplayChip.outerHTML}`)
    }
    const postCommitDisplayText = String(reopenedDisplay.textContent || '')
    if (!postCommitDisplayText.includes('I can ...') || !postCommitDisplayText.includes('@strybldr-starter-source.png') || postCommitDisplayText.includes(mediaUrl) || postCommitDisplayText.includes('![')) {
      throw new Error(`expected post-commit display chip to keep compact @ label without source backfill, got ${JSON.stringify(postCommitDisplayText)}`)
    }
    await act(async () => {
      reopenedDisplay.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const reopenedTextarea = container.querySelector('textarea[aria-label="Summary for workspace-source"]') as HTMLTextAreaElement | null
    if (!(reopenedTextarea instanceof dom.window.HTMLTextAreaElement)) throw new Error(`expected reopened workspace source textarea, html=${container.innerHTML}`)
    if (reopenedTextarea.value !== 'I can ...') {
      throw new Error(`expected reopened attached-media textarea to keep raw summary text only, got ${JSON.stringify(reopenedTextarea.value)}`)
    }
    await act(async () => {
      reopenedTextarea.value = reopenedTextarea.value.replace('I can ...', 'I can summarize')
      reopenedTextarea.setSelectionRange(reopenedTextarea.value.length, reopenedTextarea.value.length)
      Simulate.change(reopenedTextarea)
      await waitForFrames(dom.window, 4)
    })
    await act(async () => {
      const updatedTextarea = container.querySelector('textarea[aria-label="Summary for workspace-source"]') as HTMLTextAreaElement | null
      if (!(updatedTextarea instanceof dom.window.HTMLTextAreaElement)) throw new Error(`expected updated workspace source textarea, html=${container.innerHTML}`)
      Simulate.keyDown(updatedTextarea, { key: 'Enter', metaKey: true })
      await waitForFrames(dom.window, 4)
    })
    const committed = committedValues[0] || ''
    if (committed !== 'I can summarize') {
      throw new Error(`expected attached media projection to commit only text edits without raw media backfill, got ${JSON.stringify(committedValues)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardInlineTextEditorAtCommandInsertsUploadedMedia() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  const publicUrl = 'https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg'
  const accessUrl = `${publicUrl}?agentic_os_media_token=token`
  const storage = {
    workspaceId: 'airvio',
    runId: 'upload-demo',
    stageId: 'image',
    shotId: 'airvio-demo',
    objectKey: 'airvio/runs/upload-demo/image/airvio-demo.jpg',
    publicPath: '/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg',
    publicUrl,
    accessUrl,
    contentHash: 'sha256:uploaded-at-command-demo',
    contentType: 'image/jpeg',
    provenance: {
      fileName: 'airvio_.JPEG',
      sizeBytes: 1234,
    },
    response: {
      ok: true,
      apiVersion: 1,
      workspaceId: 'airvio',
      artifactId: 'upload-demo:image:airvio-demo',
      objectKey: 'airvio/runs/upload-demo/image/airvio-demo.jpg',
      publicPath: '/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg',
      durableR2Url: '/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg',
      contentHash: 'sha256:uploaded-at-command-demo',
      storage: { r2: 'confirmed', d1: 'persisted', kv: 'skipped', durableObject: 'skipped' },
      access: { cacheKey: null, expiresAtMs: null, url: accessUrl },
    },
  }
  try {
    dom.window.localStorage.setItem(UPLOADED_MEDIA_PANEL_STORAGE_KEY, JSON.stringify([{
      id: 'cloudflare-media:sha256:uploaded-at-command-demo',
      name: 'airvio_.JPEG',
      kind: 'image',
      localUrl: '',
      linkUrl: accessUrl,
      contentType: 'image/jpeg',
      sizeBytes: 1234,
      status: 'synced',
      storage,
      error: null,
    }]))
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: 'Review the source evidence into editable storyboard elements.',
          ariaLabel: 'Action',
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
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[aria-label="Action"][data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected Action display field')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 1)
    })
    const textarea = container.querySelector('textarea[aria-label="Action"]')
    if (!(textarea instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected active Action textarea')
    const variableButton = container.querySelector('button[title="Variable commands"]')
    if (!(variableButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected variable command launcher')
    await act(async () => {
      textarea.setSelectionRange(0, 0)
      variableButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      variableButton.click()
      await waitForFrames(dom.window, 4)
    })
    const mediaButtons = Array.from(dom.window.document.querySelectorAll('section[aria-label="Card variable commands"] button')) as HTMLButtonElement[]
    const uploadMediaButton = mediaButtons.find(button => String(button.textContent || '').includes('New Media') && String(button.textContent || '').includes('Create or upload image, audio, or video through the shared Media storage flow'))
    if (!(uploadMediaButton instanceof dom.window.HTMLButtonElement)) {
      const buttonText = mediaButtons.map(button => String(button.textContent || '').replace(/\s+/g, ' ').trim()).join(' | ')
      throw new Error(`expected @ command menu to include shared New Media action, got ${buttonText}`)
    }
    const uploadedMediaButton = mediaButtons.find(button => String(button.textContent || '').includes('airvio_.JPEG') && String(button.textContent || '').includes('Uploaded media from FloatingPanel Media'))
    if (!(uploadedMediaButton instanceof dom.window.HTMLButtonElement)) {
      const buttonText = mediaButtons.map(button => String(button.textContent || '').replace(/\s+/g, ' ').trim()).join(' | ')
      throw new Error(`expected @ command menu to include uploaded FloatingPanel Media item, got ${buttonText}`)
    }
    await act(async () => {
      uploadedMediaButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      uploadedMediaButton.click()
      await waitForFrames(dom.window, 2)
    })
    const latest = committedValues.at(-1) || ''
    if (!latest.startsWith('![airvio_.JPEG](https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg?agentic_os_media_token=')) {
      throw new Error(`expected @ command media insertion to commit uploaded image into Action field, got ${JSON.stringify(committedValues)}`)
    }
    if (!latest.includes(')\n\nReview the source evidence into editable storyboard elements.')) {
      throw new Error(`expected @ command media insertion to keep media as its own block before existing Action text, got ${JSON.stringify(latest)}`)
    }
  } finally {
    dom.window.localStorage.removeItem(UPLOADED_MEDIA_PANEL_STORAGE_KEY)
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardInlineTextEditorAtCommandSkipsDuplicateUploadedMedia() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  const reconciledMediaUrls: string[] = []
  const publicUrl = 'https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg'
  const accessUrl = `${publicUrl}?agentic_os_media_token=token`
  const initialValue = [
    `![airvio_.JPEG](${accessUrl})`,
    '',
    'Review the source evidence into editable storyboard elements.',
  ].join('\n')
  try {
    dom.window.localStorage.setItem(UPLOADED_MEDIA_PANEL_STORAGE_KEY, JSON.stringify([{
      id: 'cloudflare-media:sha256:uploaded-at-command-demo',
      name: 'airvio_.JPEG',
      kind: 'image',
      localUrl: '',
      linkUrl: accessUrl,
      contentType: 'image/jpeg',
      sizeBytes: 1234,
      status: 'synced',
      storage: {
        workspaceId: 'airvio',
        runId: 'upload-demo',
        stageId: 'image',
        shotId: 'airvio-demo',
        objectKey: 'airvio/runs/upload-demo/image/airvio-demo.jpg',
        publicPath: '/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg',
        publicUrl,
        accessUrl,
        contentHash: 'sha256:uploaded-at-command-demo',
        contentType: 'image/jpeg',
        provenance: { fileName: 'airvio_.JPEG', sizeBytes: 1234 },
        response: {
          ok: true,
          apiVersion: 1,
          workspaceId: 'airvio',
          artifactId: 'upload-demo:image:airvio-demo',
          objectKey: 'airvio/runs/upload-demo/image/airvio-demo.jpg',
          publicPath: '/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg',
          durableR2Url: '/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg',
          contentHash: 'sha256:uploaded-at-command-demo',
          storage: { r2: 'confirmed', d1: 'persisted', kv: 'skipped', durableObject: 'skipped' },
          access: { cacheKey: null, expiresAtMs: null, url: accessUrl },
        },
      },
      error: null,
    }]))
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: initialValue,
          ariaLabel: 'Action',
          placeholder: 'Add action',
          canEdit: true,
          editorSurface: 'control',
          editActivation: 'click',
          multiline: true,
          mediaCommandMode: 'external',
          onMediaCommandSelect: candidate => reconciledMediaUrls.push(candidate.url),
          onCommit: next => {
            committedValues.push(next)
          },
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[aria-label="Action"][data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected Action display field')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 1)
    })
    const textarea = container.querySelector('textarea[aria-label="Action"]')
    if (!(textarea instanceof dom.window.HTMLTextAreaElement)) throw new Error('expected active Action textarea')
    const variableButton = container.querySelector('button[title="Variable commands"]')
    if (!(variableButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected variable command launcher')
    await act(async () => {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      variableButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      variableButton.click()
      await waitForFrames(dom.window, 4)
    })
    const uploadedMediaButton = (Array.from(dom.window.document.querySelectorAll('section[aria-label="Card variable commands"] button')) as HTMLButtonElement[])
      .find(button => String(button.textContent || '').includes('airvio_.JPEG'))
    if (!(uploadedMediaButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected uploaded Media item in @ command menu')
    await act(async () => {
      uploadedMediaButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      uploadedMediaButton.click()
      await waitForFrames(dom.window, 2)
    })
    if (committedValues.length !== 0) {
      throw new Error(`expected duplicate @ media insertion to no-op without mutating Action text, got ${JSON.stringify(committedValues)}`)
    }
    if (reconciledMediaUrls.length !== 1 || !reconciledMediaUrls[0]?.includes('/upload-demo/image/airvio-demo.jpg')) {
      throw new Error(`expected duplicate external @ media selection to reconcile the graph owner once, got ${JSON.stringify(reconciledMediaUrls)}`)
    }
  } finally {
    dom.window.localStorage.removeItem(UPLOADED_MEDIA_PANEL_STORAGE_KEY)
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
