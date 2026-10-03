import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { useGanttTimelineInteractions } from '../features/gitgraph/useGanttTimelineInteractions'
import { buildVideoSequenceTimelineLaneOrder, resolveVideoSequenceTimelineDragLaneDelta, resolveVideoSequenceTimelineInsertedLaneOffset } from '../components/timeline/videoSequenceTimeline'
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

test('source annotation allocation preserves collapsed rows and maps auxiliary drags to VIDEO', () => {
  const lanes = [{ id: 'video' }, { id: 'audio' }, { id: 'fbf' }]
  const inserted = [{ id: 'annotations', insertAfterLaneId: 'video', dragLaneId: 'video', selectRowKey: 'video:row' }]
  assert.deepEqual(buildVideoSequenceTimelineLaneOrder(lanes, []).map(row => row.id), ['video', 'audio', 'fbf'])
  const expanded = buildVideoSequenceTimelineLaneOrder(lanes, inserted)
  assert.deepEqual(expanded.map(row => row.id), ['video', 'annotations', 'audio', 'fbf'])
  const ids = expanded.map(row => 'dragLaneId' in row ? String(row.dragLaneId) : row.id)
  assert.equal(resolveVideoSequenceTimelineDragLaneDelta(ids, 0, 61), 0, 'auxiliary row cannot become an authored destination')
  assert.equal(resolveVideoSequenceTimelineDragLaneDelta(ids, 0, 122), 1)
  assert.equal(resolveVideoSequenceTimelineDragLaneDelta(ids, 2, -61), -1)
  assert.equal(resolveVideoSequenceTimelineDragLaneDelta(ids, 3, -183), -2)
  assert.equal(resolveVideoSequenceTimelineDragLaneDelta(ids, 0, -61), -1, 'travel beyond the first visual row keeps its authored delta')
  assert.equal(resolveVideoSequenceTimelineDragLaneDelta(ids, 3, 61), 1)
  assert.equal(resolveVideoSequenceTimelineDragLaneDelta(['video', 'audio', 'fbf'], 0, 61), 1)
  const sharedAnchor = buildVideoSequenceTimelineLaneOrder(lanes, [{ id: 'notes', insertAfterLaneId: 'video' }, ...inserted])
  assert.deepEqual(sharedAnchor.map(row => row.id), ['video', 'notes', 'annotations', 'audio', 'fbf'])
  assert.equal(resolveVideoSequenceTimelineInsertedLaneOffset(expanded, 'video', 'video:row'), 61)
  assert.equal(resolveVideoSequenceTimelineInsertedLaneOffset(sharedAnchor, 'video', 'video:row'), 122, 'annotation controls use their actual allocated row after caller content')
})

for (const scenario of ['move', 'cancel', 'allocation', 'summary'] as const) {
  test(`annotation lane interactions preserve ${scenario}`, async () => {
    const { dom, restore } = initJsdomHarness(), host = document.createElement('section')
    document.body.append(host); const root = createRoot(host), commits: number[] = [], effects: string[] = []
    const span = { rowKey: 'video', label: 'Video', raw: 'Video :video, 0, 10m', lineIndex: 1,
      startMinutes: 0, endMinutes: 10, durationMinutes: 10 }
    let api: ReturnType<typeof useGanttTimelineInteractions>
    function Harness() {
      api = useGanttTimelineInteractions({ autoSnappingEnabled: false, markdownDocumentName: 'doc',
        markdownText: '', maxMinutes: 60, positionMinutes: 0, selectedRowKey: 'other', spans: [span],
        resolveRowKeyAtPosition: () => 'video', setSelectedRowKey: () => effects.push('select'),
        setTransportPlaybackPosition: () => effects.push('seek'), setTransportPlaying: () => effects.push('playback'),
        onCommitDrag: value => commits.push(value.displayLaneDelta) })
      return <section data-kg-gantt-timeline-ruler-content="1" onPointerDown={api.handleRulerPointerScrub}>
        {['video', 'video', 'audio'].map((id, index) => <section key={index}
          data-row={index} data-kg-video-sequence-drag-lane-id={id} />)}
        <article data-kg-video-sequence-display-lane="video" data-kg-gantt-timeline-track-span="1">
          <button onPointerDown={event => api.handleTrackPointerStart(event, span, 'move')}>Move</button>
        </article>
        <details data-kg-source-annotation-layer="1"><summary>Annotations</summary></details>
      </section>
    }
    const pointer = (type: string, x = 10, y = 10) => Object.assign(new dom.window.MouseEvent(type,
      { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y }), { pointerId: 7 })
    try {
      await act(async () => root.render(<Harness />))
      const ruler = host.querySelector<HTMLElement>('[data-kg-gantt-timeline-ruler-content]')!
      ruler.getBoundingClientRect = () => ({ left: 0, width: 610 } as DOMRect)
      ruler.setPointerCapture = () => effects.push('capture')
      if (scenario === 'summary') {
        const down = pointer('pointerdown')
        await act(async () => { host.querySelector('summary')!.dispatchEvent(down) })
        assert.deepEqual(effects, [], 'disclosure must not capture, change playback, select, or seek')
        assert.equal(down.defaultPrevented, false, 'native disclosure retains its default action')
        return
      }
      await act(async () => { host.querySelector('button')!.dispatchEvent(pointer('pointerdown')) })
      assert.equal(api!.draggingRowKey, 'video')
      await act(async () => { window.dispatchEvent(pointer('pointermove', 80, 132)) })
      assert.notEqual(api!.dragPreview, null)
      if (scenario === 'allocation') ruler.querySelector('[data-row="1"]')!.remove()
      await act(async () => { window.dispatchEvent(pointer(scenario === 'cancel' ? 'pointercancel' : 'pointerup', 80, 132)) })
      assert.deepEqual(commits, scenario === 'move' ? [1] : [])
      assert.equal(api!.draggingRowKey, '')
      assert.equal(api!.dragPreview, null)
    } finally { await act(async () => root.unmount()); host.remove(); restore() }
  })
}
