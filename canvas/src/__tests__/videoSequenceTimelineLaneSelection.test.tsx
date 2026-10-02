import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { VideoSequenceTimelineLaneLabels, VideoSequenceTimelineLaneRows, type VideoSequenceTimelineInsertedLaneRenderArgs } from '../components/timeline/VideoSequenceTimelineLanes'

test('lane labels select native rows through the clip owner without nesting inserted controls', async () => {
  const { restore } = initJsdomHarness()
  const host = document.createElement('section')
  document.body.append(host)
  const root = createRoot(host)
  const rowKeyToDisplayLaneId = new Map([['scene:first', 'scene'], ['scene:second', 'scene'], ['rehearsal', 'workflow']])
  const calls: string[] = []
  let changeSelected: (key: string) => void = () => {}
  function Harness() {
    const [selectedRowKey, setSelectedRowKey] = React.useState('')
    changeSelected = setSelectedRowKey
    const onSelectRowKey = (key: string) => { calls.push(key); setSelectedRowKey(key) }
    const lanes = [
      { id: 'scene', semanticId: 'scene' as const, label: 'Scene' },
      { id: 'workflow', semanticId: 'video' as const, label: 'Workflow' },
      { id: 'empty', semanticId: 'image' as const, label: 'Empty' },
      { id: 'object', insertAfterLaneId: 'scene', selected: selectedRowKey === 'object',
        label: <button onClick={() => onSelectRowKey('object')}>Object</button>, content: 'Object rail' },
      { id: 'actor', insertAfterLaneId: 'scene', selectRowKey: 'actor:row', label: 'Actor',
        content: ({ selectRow }: VideoSequenceTimelineInsertedLaneRenderArgs) => <button onClick={selectRow}>Actor cue</button> },
      { id: 'explicit', insertAfterLaneId: 'scene', selectRowKey: 'actor:row', selected: false,
        label: 'Explicit', content: 'Explicit rail' },
    ]
    const selectedDisplayLaneId = rowKeyToDisplayLaneId.get(selectedRowKey)
    return <>
      <VideoSequenceTimelineLaneLabels lanes={lanes} selectedDisplayLaneId={selectedDisplayLaneId}
        scrollRef={React.useRef<HTMLElement>(null)} rowKeyToDisplayLaneId={rowKeyToDisplayLaneId}
        selectedRowKey={selectedRowKey} onSelectRowKey={onSelectRowKey} />
      <VideoSequenceTimelineLaneRows lanes={lanes} selectedDisplayLaneId={selectedDisplayLaneId}
        selectedRowKey={selectedRowKey} onSelectRowKey={onSelectRowKey} />
    </>
  }
  const label = (id: string) => host.querySelector(`[data-kg-video-sequence-display-lane-label="${id}"]`)!
  const row = (id: string) => host.querySelector(`[data-kg-video-sequence-display-lane-row="${id}"]`)!
  const click = async (id: string) => act(async () => label(id).querySelector<HTMLButtonElement>('button')!.click())
  try {
    await act(async () => root.render(<Harness />))
    await click('scene')
    assert.equal(calls.at(-1), 'scene:first')
    assert.equal(label('scene').getAttribute('aria-current'), 'true')
    assert.equal(row('scene').getAttribute('aria-current'), 'true')
    assert.equal(label('scene').querySelector('button')?.getAttribute('aria-pressed'), 'true')
    await act(async () => changeSelected('scene:second'))
    await click('scene')
    assert.equal(calls.at(-1), 'scene:second', 'reselecting a multi-clip lane preserves its current clip')
    await click('workflow')
    assert.equal(calls.at(-1), 'rehearsal')
    assert.equal(row('workflow').getAttribute('aria-current'), 'true')
    assert.equal(row('scene').getAttribute('aria-current'), null)
    await click('object')
    assert.equal(row('object').getAttribute('aria-current'), 'true')
    assert.equal(row('workflow').getAttribute('aria-current'), null)
    assert.equal(label('object').querySelectorAll('button').length, 1)
    assert.equal(label('empty').querySelector('button'), null, 'empty lanes cannot select a missing clip')
    await click('actor')
    assert.equal(calls.at(-1), 'actor:row')
    assert.equal(label('actor').querySelector('button')?.getAttribute('aria-pressed'), 'true')
    assert.equal(row('actor').getAttribute('aria-current'), 'true')
    assert.equal(row('object').getAttribute('aria-current'), null)
    assert.equal(row('explicit').getAttribute('aria-current'), null, 'explicit adapter selection remains authoritative')
    await click('scene')
    await act(async () => row('actor').querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(row('actor').getAttribute('aria-current'), 'true', 'cue and label reuse the same selection owner')
    assert.equal(row('scene').getAttribute('aria-current'), null)
    assert.equal(host.querySelectorAll('button button').length, 0)
    assert.deepEqual(calls, ['scene:first', 'scene:second', 'rehearsal', 'object', 'actor:row', 'scene:first', 'actor:row'])
  } finally { await act(async () => root.unmount()); host.remove(); restore() }
})
