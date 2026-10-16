import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import type { GanttTimelineTransportChromeModel } from '../features/gitgraph/useGanttTimelineTransportChromeModel'
import { useGanttTimelineInteractions } from '../features/gitgraph/useGanttTimelineInteractions'

register(`data:text/javascript,${encodeURIComponent(`
import { readFileSync } from 'node:fs';
export function load(url, context, next) {
  if (url.startsWith('file:') && new URL(url).pathname.endsWith('.css')) {
    readFileSync(new URL(url));
    return { format: 'module', shortCircuit: true, source: 'export {};' };
  }
  return next(url, context);
}`)}`, import.meta.url)

async function mounted(run: (host: HTMLElement, root: ReturnType<typeof createRoot>, env: ReturnType<typeof initJsdomHarness>) => Promise<void>) {
  const env = initJsdomHarness(), host = document.createElement('section')
  document.body.append(host)
  const root = createRoot(host)
  try { await run(host, root, env) }
  finally { await act(async () => root.unmount()); host.remove(); env.restore() }
}
const bounds = (left = 0, width = 128) => ({ x: left, y: 0, left, top: 0, right: left + width, bottom: 40, width, height: 40, toJSON: () => ({}) })
function pointer(env: ReturnType<typeof initJsdomHarness>, target: EventTarget, type: string, x: number, pointerId = 1, primary = true) {
  const event = new env.dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0, buttons: type === 'pointerup' ? 0 : 1 })
  Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: primary } })
  target.dispatchEvent(event)
  return event
}

test('shared timeline marks activate once from keyboard and retain custom, disabled and nearest-hit behavior', async () => {
  const { TimelineTransportTimeAxisMark: Mark } = await import('../components/timeline/TimelineTransportControls')
  await mounted(async (host, root, env) => {
    const calls: string[] = [], custom: string[] = [], focused: number[] = []
    await act(async () => root.render(<section>
      <Mark laneStyle="video" role="button" tabIndex={0} aria-label="First cue" onClick={() => calls.push('first')}><span>1</span></Mark>
      <Mark laneStyle="video" role="button" tabIndex={0} aria-label="Second cue" onClick={() => calls.push('second')}><span>2</span></Mark>
      <Mark laneStyle="audio" role="button" tabIndex={0} aria-label="Disabled cue" aria-disabled="true" onClick={() => calls.push('disabled')}>3</Mark>
      <Mark laneStyle="audio" role="button" tabIndex={0} aria-label="Custom cue" onClick={() => calls.push('custom-click')} onKeyDown={event => custom.push(event.key)}>4</Mark>
    </section>))
    const marks = [...host.querySelectorAll<HTMLElement>('[data-kg-timeline-time-axis-mark]')]
    marks.forEach((mark, index) => { mark.getBoundingClientRect = () => bounds(index * 40, 40); mark.focus = () => { focused.push(index) } })
    const key = async (index: number, key: string) => {
      const event = new env.dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      await act(async () => { marks[index]!.dispatchEvent(event) })
      return event
    }
    assert.equal((await key(0, 'Enter')).defaultPrevented, true)
    assert.equal((await key(1, ' ')).defaultPrevented, true)
    await key(2, 'Enter'); await key(3, 'Enter'); await key(0, 'Escape')
    assert.deepEqual(calls, ['first', 'second'])
    assert.deepEqual(custom, ['Enter'])
    await act(async () => { marks[0]!.querySelector('span')!.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, clientX: 61, detail: 1 })) })
    assert.deepEqual(calls, ['first', 'second', 'second'], 'overlapping marker hits select the nearest existing marker exactly once')
    assert.equal(focused.at(-1), 1, 'native focus targets the selected marker; this harness stubs document.activeElement')
    assert.equal(host.querySelector('[aria-hidden="true"]'), null)
  })
})

test('ruler tick time children seek exact authored positions through named native buttons', async () => {
  const { VideoSequenceTimelineRulerTicks: Ticks } = await import('../components/timeline/VideoSequenceTimelineRulerTicks')
  await mounted(async (host, root, env) => {
    const seeks: number[] = []
    const displayTicks = [{ minutes: 0, percent: 0, label: '0:00' }, { minutes: 0.5, percent: 50, label: '0:30' }, { minutes: 1, percent: 100, label: '60f' }]
    await act(async () => root.render(<Ticks displayTicks={displayTicks} onSeek={value => seeks.push(value)} />))
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')]
    assert.equal(buttons.length, displayTicks.length)
    for (const button of buttons) {
      assert.equal(button.type, 'button'); assert.ok(button.getAttribute('aria-label')); assert.equal(button.tabIndex, 0)
      assert.equal(button.querySelector('[aria-hidden="true"]'), null)
      assert.ok(button.querySelector('time')?.getAttribute('datetime')?.startsWith('PT'))
      await act(async () => { button.querySelector('time')!.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, detail: 1 })) })
    }
    assert.deepEqual(seeks, [0, 0.5, 1])
    await act(async () => root.render(<Ticks displayTicks={displayTicks} />))
    assert.ok([...host.querySelectorAll<HTMLButtonElement>('button')].every(button => button.disabled), 'ticks without a seek owner do not expose a false action')
  })
})

test('timeline command groups expose one named icon action with retained disabled, pressed and callback semantics', async () => {
  const { GanttTimelineTransportHeaderTools } = await import('../features/gitgraph/GanttTimelineTransportHeaderTools')
  await mounted(async (host, root, env) => {
    const calls: string[] = []
    const action = (name: string, disabled = false) => ({ ariaLabel: name, title: name, disabled, onClick: () => calls.push(name) })
    const model: GanttTimelineTransportChromeModel['headerTools'] = {
      runtimeOnly: false,
      mediaPlayerButton: { ...action('Preview'), active: true },
      syncModeButton: { ...action('Link timing'), active: false, mode: 'selected' },
      toolButtons: [{ ...action('Cut'), id: 'cut', label: 'Cut', active: false }, { ...action('Grade', true), id: 'grade', label: 'Grade', active: false }],
      clipActionButtons: [
        { ...action('Split'), key: 'split-at-playhead', action: 'split-at-playhead', icon: 'split', label: 'Split', active: true },
        { ...action('Nudge'), key: 'nudge-forward', action: 'nudge-forward', icon: 'nudge-forward', label: 'Nudge' },
      ],
      actionButtons: [{ ...action('Export'), key: 'video', icon: 'download', dataValue: 'video' }],
      zoomControls: { label: '100%', percent: 50, actionButtons: [
        { ...action('Zoom in'), key: 'zoom-in', icon: 'zoom-in' }, { ...action('Zoom out', true), key: 'zoom-out', icon: 'zoom-out' },
        { ...action('Fit'), key: 'fit', icon: 'fit' }, { ...action('Center'), key: 'center', icon: 'center' },
      ] },
    }
    await act(async () => root.render(<GanttTimelineTransportHeaderTools model={model} />))
    const names = ['Preview', 'Link timing', 'Cut', 'Grade', 'Split', 'Nudge', 'Export', 'Zoom in', 'Zoom out', 'Fit', 'Center']
    for (const name of names) {
      const matches = host.querySelectorAll<HTMLButtonElement>(`button[aria-label="${name}"]`)
      assert.equal(matches.length, 1, `${name} has one shared action, including collapsed tool menus`)
      const button = matches[0]!, icon = button.querySelector('svg[role="img"]')!
      assert.ok(icon?.getAttribute('aria-label'), `${name} icon is semantically named`)
      assert.equal(icon.getAttribute('aria-hidden'), null)
      assert.equal(button.type, 'button')
      await act(async () => { icon.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true })) })
    }
    assert.deepEqual(calls, names.filter(name => name !== 'Grade' && name !== 'Zoom out'))
    assert.equal(host.querySelector('[aria-label="Preview"]')?.getAttribute('aria-pressed'), 'true')
    assert.equal(host.querySelector('[aria-label="Split"]')?.getAttribute('aria-pressed'), 'true')
    assert.equal(host.querySelectorAll('button button').length, 0)
    assert.equal(host.querySelectorAll('[aria-label="Timeline command groups"]').length, 1)
    assert.equal(host.querySelector('div, [aria-hidden="true"]'), null)
    await act(async () => root.render(<GanttTimelineTransportHeaderTools model={{ ...model, runtimeOnly: true }} />))
    assert.deepEqual([...host.querySelectorAll('button')].map(button => button.getAttribute('aria-label')).sort(), ['Center', 'Fit', 'Zoom in', 'Zoom out'])
  })
})

async function scrubHarness(run: (args: {
  host: HTMLElement; env: ReturnType<typeof initJsdomHarness>; seeks: number[]; selected: string[]; playing: boolean[]; clicks: string[];
  render: (name?: string, text?: string) => Promise<void>; target: (kind: string) => Element; capture: () => HTMLElement;
}) => Promise<void>) {
  await mounted(async (host, root, env) => {
    const seeks: number[] = [], selected: string[] = [], playing: boolean[] = [], clicks: string[] = []
    let captured: HTMLElement | undefined
    function Harness({ name, text }: { name: string; text: string }) {
      const interaction = useGanttTimelineInteractions({ autoSnappingEnabled: false, markdownDocumentName: name, markdownText: text,
        maxMinutes: 1, positionMinutes: 0.25, selectedRowKey: 'original', selectionFollowsPlayhead: false,
        resolveRowKeyAtPosition: () => 'resolved', setSelectedRowKey: row => selected.push(row), setTransportPlaybackPosition: value => seeks.push(value),
        setTransportPlaying: value => playing.push(value), spans: [], onCommitDrag: () => assert.fail('ruler drag cannot edit authored clips') })
      return <section data-kg-video-sequence-ruler-axis="1" onPointerDown={interaction.handleRulerPointerScrub}>
        <button type="button" data-kind="control" aria-label="Tool" onClick={() => clicks.push('control')}><svg role="img" aria-label="Tool icon"><path d="M0 0h1" /></svg></button>
        <button type="button" data-kind="lane" aria-label="Generic lane" data-kg-video-sequence-ruler-scrub-target="1"
          data-kg-video-sequence-ruler-scrub-row-key="lane:generic" data-kg-video-sequence-ruler-scrub-intent="drag" onClick={() => clicks.push('lane')}>
          <svg role="img" aria-label="Lane icon"><path d="M0 0h1" /></svg>
        </button>
        <button type="button" data-kind="playhead" aria-label="Playhead" data-kg-video-sequence-ruler-scrub-target="1"><svg role="img" aria-label="Playhead icon"><path d="M0 0h1" /></svg></button>
      </section>
    }
    const render = async (name = 'generic.md', text = 'Authored source') => {
      await act(async () => root.render(<Harness name={name} text={text} />))
      host.querySelector<HTMLElement>('[data-kg-video-sequence-ruler-axis]')!.getBoundingClientRect = () => bounds()
      for (const node of host.querySelectorAll<HTMLElement>('section, button')) node.setPointerCapture = () => { captured = node }
    }
    await render()
    await run({ host, env, seeks, selected, playing, clicks, render, capture: () => captured || assert.fail('gesture did not capture a native target'), target: kind => host.querySelector(`[data-kind="${kind}"] path`)! })
  })
}

test('shared ruler distinguishes SVG control hits, immediate seek and drag-only lane selection', async () => {
  await scrubHarness(async ({ env, target, seeks, selected, playing, clicks }) => {
    await act(async () => { pointer(env, target('control'), 'pointerdown', 64) })
    assert.deepEqual([seeks, selected, playing], [[], [], []], 'icon descendants retain their containing tool action')
    await act(async () => { pointer(env, target('lane'), 'pointerdown', 24) })
    assert.deepEqual(selected, ['lane:generic']); assert.deepEqual(seeks, []); assert.deepEqual(playing, [])
    await act(async () => { pointer(env, env.dom.window, 'pointermove', 26) })
    assert.deepEqual(seeks, [], 'sub-threshold lane gestures do not scrub or pause')
    await act(async () => { pointer(env, env.dom.window, 'pointerup', 26) })
    await act(async () => { target('lane').dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, detail: 1 })) })
    assert.deepEqual(clicks, ['lane'])
    await act(async () => { pointer(env, target('playhead'), 'pointerdown', 64) })
    assert.equal(seeks.at(-1), 0.5); assert.equal(playing.at(-1), false)
    await act(async () => { pointer(env, env.dom.window, 'pointerup', 64) })
  })
})

test('shared lane drag uses its owning pointer and suppresses only the resulting pointer click', async () => {
  await scrubHarness(async ({ env, target, seeks, selected, playing, clicks }) => {
    await act(async () => { pointer(env, target('lane'), 'pointerdown', 24, 2, false) })
    assert.deepEqual([seeks, selected, playing], [[], [], []])
    await act(async () => { pointer(env, target('lane'), 'pointerdown', 24) })
    await act(async () => { pointer(env, env.dom.window, 'pointermove', 100, 2) })
    assert.deepEqual(seeks, [])
    await act(async () => { pointer(env, env.dom.window, 'pointermove', 74) })
    assert.equal(seeks.at(-1), 0.6); assert.equal(playing.at(-1), false)
    assert.ok(selected.every(row => row === 'lane:generic'))
    await act(async () => { pointer(env, env.dom.window, 'pointerup', 74); target('lane').dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, detail: 1 })) })
    assert.deepEqual(clicks, [], 'the drag completion cannot reactivate the lane command')
    await act(async () => { target('lane').dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, detail: 0 })) })
    assert.deepEqual(clicks, ['lane'], 'keyboard activation remains available')
    await act(async () => { target('lane').dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, detail: 1 })) })
    assert.deepEqual(clicks, ['lane', 'lane'], 'suppression is consumed rather than permanently swallowing clicks')
  })
})

for (const reason of ['source-text', 'source-name', 'removed', 'blur', 'escape', 'cancel', 'lost-capture'] as const) {
  test(`shared lane drag stops without later publication after ${reason}`, async () => {
    await scrubHarness(async ({ env, target, seeks, playing, render, capture }) => {
      await act(async () => { pointer(env, target('lane'), 'pointerdown', 24) })
      if (reason === 'source-text') await render('generic.md', 'Changed authored source')
      else if (reason === 'source-name') await render('other.md')
      else if (reason === 'removed') target('lane').closest('button')!.remove()
      else await act(async () => {
        if (reason === 'blur') env.dom.window.dispatchEvent(new env.dom.window.Event('blur'))
        else if (reason === 'escape') env.dom.window.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        else pointer(env, reason === 'lost-capture' ? capture() : env.dom.window, reason === 'lost-capture' ? 'lostpointercapture' : 'pointercancel', 24)
      })
      await act(async () => { pointer(env, env.dom.window, 'pointermove', 74); pointer(env, env.dom.window, 'pointerup', 74) })
      assert.deepEqual(seeks, []); assert.deepEqual(playing, [], 'cancelled lane gestures do not pause the document transport')
    })
  })
}

test('shared video ruler sample surfaces and trim icons retain semantic selection and edit actions', async () => {
  const { VideoSequenceTimelineRuler: Ruler } = await import('../components/timeline/VideoSequenceTimelineRuler')
  const { buildMermaidGanttTimelineModel } = await import('../lib/mermaid/mermaidGanttBarInteraction')
  const authored = ['gantt', 'dateFormat HH:mm', 'section Edits', ...['Grade', 'Audio', 'Key', 'Morph', 'Text', 'Nested'].map((label, index) => `${label} : item_${index}, 00:00, 1m`)].join('\n')
  const taskSpans = buildMermaidGanttTimelineModel(authored).taskSpans
  assert.equal(taskSpans.length, 6)
  const originalSpans = JSON.stringify(taskSpans)
  await mounted(async (host, root, env) => {
    const selected: string[] = [], moved: string[] = [], seek: number[] = []
    function Harness({ editable }: { editable: boolean }) {
      return <Ruler contentRef={React.useRef<HTMLElement>(null)} viewportRef={React.useRef<HTMLElement>(null)} displayTicks={[{ minutes: 0, percent: 0, label: '0:00' }]}
        dragPreview={null} draggingMode={null} draggingRowKey="" maxMinutes={1} playheadPercent={0} selectedRowKey={taskSpans[0]!.rowKey} editable={editable}
        taskSpans={taskSpans} timelineZoom={1} disabledLaneIds={[]} onRulerPointerDown={() => {}}
        onSelectRowKey={row => selected.push(row)} onSelectRowPosition={(_row, position) => seek.push(position)} onDropMedia={() => false}
        onTrackPointerStart={(event, span, mode) => { event.stopPropagation(); moved.push(`${span.rowKey}:${mode}`) }} />
    }
    await act(async () => root.render(<Harness editable />))
    for (const attribute of ['clip-frames', 'clip-cues', 'audio-waveform', 'keyframes', 'vector-morph', 'text-animation', 'nested-composite-strip']) {
      const button = host.querySelector<HTMLButtonElement>(`button[data-kg-video-sequence-${attribute}]`)
      assert.ok(button, `${attribute} is an actual sample control`)
      assert.equal(button.type, 'button'); assert.ok(button.getAttribute('aria-label'))
      assert.equal(button.hasAttribute('aria-hidden'), false)
      const row = button.closest('[data-kg-gantt-timeline-track-row-key]')!.getAttribute('data-kg-gantt-timeline-track-row-key')!
      const child = button.firstElementChild || button
      await act(async () => { child.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true })) })
      assert.equal(selected.at(-1), row)
      await act(async () => { pointer(env, child, 'pointerdown', 30) })
      assert.equal(moved.at(-1), `${row}:move`)
    }
    const trims = [...host.querySelectorAll<HTMLButtonElement>('[data-kg-gantt-timeline-track-drag-mode^="resize-"]')]
    assert.ok(trims.length > 0)
    for (const trim of trims) {
      assert.ok(trim.querySelector('svg[role="img"]')?.getAttribute('aria-label'))
      assert.equal(trim.querySelector('[aria-hidden="true"]'), null)
      await act(async () => { pointer(env, trim.querySelector('path')!, 'pointerdown', 30) })
      assert.ok(moved.at(-1)?.endsWith(`:${trim.getAttribute('data-kg-gantt-timeline-track-drag-mode')}`))
    }
    assert.equal(host.querySelectorAll('button button').length, 0)
    assert.equal(JSON.stringify(taskSpans), originalSpans, 'presentation actions preserve authored task identities and timing')
    assert.deepEqual(seek, [])
    moved.length = 0
    await act(async () => root.render(<Harness editable={false} />))
    const readonlySample = host.querySelector<HTMLButtonElement>('button[data-kg-video-sequence-keyframes]')!
    await act(async () => { pointer(env, readonlySample, 'pointerdown', 30) })
    assert.deepEqual(moved, [], 'read-only ruler samples retain selection without exposing edit gestures')
  })
})

for (const cancellation of ['escape', 'lost-capture'] as const) {
  test(`moved lane ${cancellation} keeps its release-click fence across a timer boundary`, async () => {
    await scrubHarness(async ({ env, target, seeks, clicks, capture }) => {
      const click = (pointerId: number) => {
        const event = new env.dom.window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
        Object.defineProperty(event, 'pointerId', { value: pointerId })
        target('lane').dispatchEvent(event)
      }
      await act(async () => { pointer(env, target('lane'), 'pointerdown', 24) })
      await act(async () => { pointer(env, env.dom.window, 'pointermove', 74) })
      assert.deepEqual(seeks, [0.6])
      await act(async () => {
        if (cancellation === 'escape') env.dom.window.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        else pointer(env, capture(), 'lostpointercapture', 74)
      })
      await new Promise<void>(resolve => env.dom.window.setTimeout(resolve, 0))
      await act(async () => { pointer(env, target('lane'), 'pointerdown', 24, 2, false); click(2) })
      assert.deepEqual(clicks, ['lane'], 'another pointer neither loses its command nor consumes the canceled pointer fence')
      await act(async () => { pointer(env, env.dom.window, 'pointermove', 100); pointer(env, env.dom.window, 'pointerup', 100); click(1) })
      assert.deepEqual(seeks, [0.6], 'a canceled gesture cannot resume seeking')
      assert.deepEqual(clicks, ['lane'], 'the canceled drag cannot activate its lane workbench on release')
      await act(async () => { pointer(env, target('lane'), 'pointerdown', 24, 3) })
      await act(async () => { pointer(env, env.dom.window, 'pointerup', 24, 3); click(3) })
      assert.deepEqual(clicks, ['lane', 'lane'], 'the next native gesture remains usable')
    })
  })
}
