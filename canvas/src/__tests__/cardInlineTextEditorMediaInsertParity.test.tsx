import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { buildMarkdownInlineTextEditHtml, readMarkdownInlineTextEditDraft } from '@/lib/markdown-core/ui/markdownInlineTextEditModel'
import { buildInlineMediaEmbed, collectInlineMediaCommandCandidates } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { buildCardInlineTextMediaEmbed } from '@/lib/cards/cardInlineTextExternalCommands'
import { waitForFrames } from '@/tests/lib/reactRootHarness'

export async function testCardViewerMediaInsertParity() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const source = 'Keep the authored summary.'
  let saved = source
  const commits: string[] = []
  function Fixture() {
    const [value, setValue] = React.useState(source)
    return <CardInlineTextEditor value={value} ariaLabel="Widget summary" placeholder="Add summary" canEdit editActivation="click"
      multiline editorSurface="viewer" mediaCommandMode="external" markdownPreview="auto"
      onCommit={next => { saved = next; commits.push(next); setValue(next) }} />
  }
  try {
    await act(async () => { root.render(<Fixture />); await waitForFrames(dom.window, 3) })
    const display = container.querySelector<HTMLElement>('[data-kg-card-inline-edit-activation="click"]')!
    await act(async () => { display.click(); await waitForFrames(dom.window, 3) })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="Variable commands"]')!.click()
      await waitForFrames(dom.window, 3)
    })
    const option = dom.window.document.getElementById('Card variable commands-insert-image')!
    await act(async () => {
      option.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
      option.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      option.click()
      await waitForFrames(dom.window, 3)
    })
    const editor = container.querySelector<HTMLElement>('[data-kg-card-inline-viewer-edit-surface="1"]')!
    if (!editor?.querySelector('[data-kg-inline-media-edit-token="1"]')) throw new Error(`Missing inserted media chip: ${container.innerHTML}`)
    if (!saved.includes('![Image alt](image-url)') || !saved.includes(source)) throw new Error(`Lost inserted source: ${JSON.stringify(commits)}`)
    await act(async () => {
      editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
      await waitForFrames(dom.window, 3)
    })
    if (!saved.includes('![Image alt](image-url)')) throw new Error('Blur overwrote inserted media')
    if (!container.querySelector('[data-kg-card-inline-media-pill="1"]')) throw new Error(`Missing read chip: ${container.innerHTML}`)
  } finally {
    await act(async () => root.unmount())
    restore()
  }
}

export async function testCardViewerMediaSerializationParity() {
  const { dom, restore } = initJsdomHarness()
  try {
    for (const kind of ['image', 'audio', 'video'] as const) {
      const ext = { image: 'png', audio: 'mp3', video: 'mp4' }[kind]
      const candidate = { kind, url: `https://media.example.test/clip.${ext}?one=1&two=2`, label: 'Authored asset', thumbnailUrl: 'https://media.example.test/poster.png' }
      const embed = buildInlineMediaEmbed(candidate)
      if (embed !== buildCardInlineTextMediaEmbed(candidate)) throw new Error('Divergent media builders')
      const root = dom.window.document.createElement('section')
      root.innerHTML = buildMarkdownInlineTextEditHtml({ value: `Before ${embed} after`, inlineChipDensity: 'compact' })
      const chips = root.querySelectorAll('[data-kg-inline-media-edit-token="1"]')
      if (chips.length !== 1 || chips[0]!.querySelector('[data-kg-inline-media-edit-token="1"]')) throw new Error(`${kind}: nested or missing chip`)
      root.append(' edited')
      const edited = readMarkdownInlineTextEditDraft(root)
      if (edited !== `Before ${embed} after edited`) throw new Error(`${kind}: mutated authored media: ${edited}`)
      const candidates = collectInlineMediaCommandCandidates({ draftText: candidate.url })
      if (!candidates.some(item => item.kind === kind && item.url === candidate.url)) throw new Error(`${kind}: URL is not insertable`)
    }
  } finally { restore() }
}
