import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import type { CommandMenuRichMediaItem } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { buildPreviewNarration, localPreviewVoices, PREVIEW_NARRATION_LIMIT, scopePreviewItems } from '@/features/panels/views/preview-context/previewContext'
import { MediaCatalogModeControls } from '@/features/command-menu/MediaCatalogModeControls'
import { readMediaCatalogMode, setMediaCatalogMode, type MediaCatalogMode } from '@/features/command-menu/mediaCatalogModeRuntime'
import PreviewVoicePanel from '@/features/panels/views/preview-context/PreviewVoicePanel'

export function testPreviewContextScopeAndNarration() {
  const item = (key: string, source: 'markdown' | 'graph', nodeId?: string): CommandMenuRichMediaItem => ({ key, source, nodeId, kind: 'image', startLine: 0, label: key })
  const items = [item('document', 'markdown'), item('selected', 'graph', 'a'), item('unrelated', 'graph', 'b')]
  assert.deepEqual(scopePreviewItems(items, 'a').map(value => value.key), ['document', 'selected'])
  assert.deepEqual(scopePreviewItems(items, null).map(value => value.key), ['document'])
  const markdown = '---\nsecret: metadata\n---\n# Read this\n[Visible link](https://example.test/private)\n![Photo](https://example.test/photo.png)\n```js\nprivateCode()\n```\n<script>privateScript()</script>\nEnd.'
  assert.deepEqual(buildPreviewNarration(markdown), { text: 'Read this\nVisible link\n\nEnd.', truncated: false })
  assert.equal(buildPreviewNarration('---\nUnclosed metadata').text, '')
  assert.equal(buildPreviewNarration('```js\nUnclosed code').text, '')
  const bounded = buildPreviewNarration(('A visible paragraph.\n').repeat(500))
  assert.equal(bounded.text.length, PREVIEW_NARRATION_LIMIT)
  assert.equal(bounded.truncated, true)
  assert.deepEqual(localPreviewVoices([{ localService: false, name: 'Remote' }, { localService: true, name: 'Local' }]).map(voice => voice.name), ['Local'])
}

export async function testPreviewContextModeIsolation() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section') as HTMLElement
  dom.window.document.body.append(container)
  const root = createRoot(container)
  const previous = readMediaCatalogMode()
  function PreviewModes() {
    const [mode, setMode] = React.useState<MediaCatalogMode>('media')
    return React.createElement(MediaCatalogModeControls, { mode, onChange: setMode, context: 'preview' })
  }
  try {
    setMediaCatalogMode('voice-studio')
    await mountReactRoot(root, React.createElement(PreviewModes), { window: dom.window as unknown as Window })
    const xr = container.querySelector<HTMLButtonElement>('[aria-label="Preview 3D for XR"]')!
    await act(async () => xr.click())
    assert.equal(xr.getAttribute('aria-pressed'), 'true')
    assert.equal(readMediaCatalogMode(), 'voice-studio')
    assert.equal(container.querySelectorAll('nav[aria-label="Preview modes"] button').length, 3)
    assert.equal(container.querySelector('[aria-hidden="true"]'), null)
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    setMediaCatalogMode(previous)
    restore()
  }
}

export async function testPreviewVoiceLocalLifecycle() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section') as HTMLElement
  dom.window.document.body.append(container)
  const root = createRoot(container)
  let cancels = 0
  const spoken: Array<{ voice: { localService: boolean }; text: string; onend?: () => void }> = []
  const voices = [{ localService: false, voiceURI: 'remote', name: 'Remote', lang: 'en' }, { localService: true, voiceURI: 'local', name: 'Local', lang: 'en' }]
  Object.defineProperty(dom.window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => voices, cancel: () => { cancels += 1 }, speak: (utterance: typeof spoken[number]) => spoken.push(utterance), addEventListener: () => {}, removeEventListener: () => {},
  } })
  Object.defineProperty(dom.window, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(public text: string) {} } })
  const render = (documentText: string) => mountReactRoot(root, React.createElement(PreviewVoicePanel, { documentText, selectionText: 'Selected image caption' }), { window: dom.window as unknown as Window })
  const button = (label: string) => Array.from(container.querySelectorAll('button')).find(value => value.textContent === label)!
  try {
    await render('# First document')
    assert.equal(container.querySelectorAll('select option').length, 1)
    assert.equal(container.querySelector('option')?.textContent, 'Local · en')
    assert.equal(container.querySelector('textarea')?.value, 'First document')
    await act(async () => button('Play preview').click())
    assert.equal(spoken.length, 1)
    assert.equal(spoken[0].voice.localService, true)
    assert.equal(button('Stop preview').disabled, false)
    const beforeChange = cancels
    await render('# Second document')
    assert.ok(cancels > beforeChange)
    assert.equal(container.querySelector('textarea')?.value, 'Second document')
    await act(async () => spoken[0].onend?.())
    assert.ok(container.textContent?.includes('Ready to audition'))
    await act(async () => button('Use selected item text').click())
    assert.equal(container.querySelector('textarea')?.value, 'Selected image caption')
    await act(async () => button('Play preview').click())
    const beforeUnmount = cancels
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    assert.ok(cancels > beforeUnmount)
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    restore()
  }
}
