import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'

register(`data:text/javascript,${encodeURIComponent(`
import { readFileSync } from 'node:fs';
export function load(url, context, next) {
  if (url.startsWith('file:') && new URL(url).pathname.endsWith('.css')) {
    readFileSync(new URL(url));
    return { format: 'module', shortCircuit: true, source: 'export {};' };
  }
  return next(url, context);
}`)}`, import.meta.url)

const text = (reply: string) => `\`\`\`mermaid
sequenceDiagram
actor A as Reader
participant B as Index
participant C as Archive
A->>B: Find item
B->>C: Read entry
C-->>B: ${reply}
\`\`\``

test('sequence ruler shares native whole-row selection and seeking', { timeout: 10000 }, async () => {
  const { SequenceTimelineRuler } = await import('../features/sequence/SequenceTimelineRuler')
  const { useSequenceDocument } = await import('../features/sequence/useSequenceDocument')
  const { useGraphStore: store } = await import('../hooks/useGraphStore')
  const env = initJsdomHarness(), initial = store.getState()
  const host = document.createElement('section')
  document.body.append(host)
  const root = createRoot(host)
  let sequence!: ReturnType<typeof useSequenceDocument>
  function Harness() {
    sequence = useSequenceDocument()
    return <SequenceTimelineRuler sequence={sequence} viewportRef={React.useRef<HTMLElement>(null)} timelineZoom={1} sceneControls={null} />
  }
  const query = (selector: string) => host.querySelector<HTMLElement>(selector)!
  const lane = (id: string, kind = 'label') => query(`[data-kg-video-sequence-display-lane-${kind}="${id}"]`)
  const button = (id: string) => lane(id).querySelector<HTMLButtonElement>('button')!
  const selected = (ids: string[]) => {
    for (const id of ['workflow', 'A', 'B', 'C']) {
      for (const kind of ['label', 'row']) {
        assert.equal(lane(id, kind).classList.contains(`timeline-video-sequence-lane-${kind}--selected`), ids.includes(id))
      }
      assert.equal(button(id).getAttribute('aria-pressed'), String(ids.includes(id)))
    }
  }
  const click = (node: HTMLElement) => act(async () => node.click())
  const key = (node: HTMLElement, key: string) => act(async () => { node.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
  const position = () => sequence.transport.playbackPosition
  try {
    store.setState({ markdownDocumentText: text('Found'), markdownDocumentName: 'lanes.md', markdownDocumentSourceUrl: '', markdownTokensPath: '', markdownDocumentApplyRevision: 24687 })
    await act(async () => root.render(<Harness />))
    selected(['A', 'B'])
    assert.equal(button('C').type, 'button')
    assert.equal(button('C').tabIndex, 0)
    assert.equal(button('C').getAttribute('aria-label'), 'Select Archive timeline lane')
    await click(button('C')); selected(['C'])
    assert.equal(position(), 0)
    await click(button('workflow')); selected(['workflow'])
    await click(button('A')); selected(['A'])
    await click(lane('A', 'row').querySelector<HTMLElement>('[data-sequence-timeline-event]')!)
    selected(['A', 'B']); assert.equal(position(), 0)
    await click(button('workflow'))
    await key(lane('C', 'row').querySelector<HTMLElement>('[data-sequence-timeline-event]')!, 'Enter')
    selected(['B', 'C']); assert.equal(position(), 1000)
    assert.equal(sequence.current?.label, 'Read entry')
    assert.equal(host.querySelectorAll('button button').length, 0)
    await click(button('workflow'))
    await act(async () => store.setState({ markdownDocumentText: text('Missing'), markdownDocumentApplyRevision: 24688 }))
    selected(['A', 'B']); assert.equal(position(), 0)
  } finally {
    await act(async () => root.unmount())
    store.setState(initial); host.remove(); env.restore()
  }
})
