import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimelinePlayhead } from '@/components/timeline/TimelinePlayhead'

export function testTimelinePlayhead() {
  const seeks: number[] = []
  const control = TimelinePlayhead({ maxMinutes: 1, positionMinutes: 0.5, frameRate: 12, onSeek: value => seeks.push(value), 'aria-label': 'Timeline playhead' })
  const html = renderToStaticMarkup(control)
  assert.match(html, /^<button/)
  assert.match(html, /role="slider"/)
  assert.match(html, /aria-valuenow="30"/)
  assert.match(html, /aria-valuemax="60"/)
  assert.match(html, /data-kg-video-sequence-ruler-scrub-target="1"/)
  assert.ok(!html.includes('aria-hidden') && !html.includes('<div'))
  let prevented = 0
  const press = (key: string, element = control) => element.props.onKeyDown({ key, preventDefault: () => prevented++, stopPropagation: () => {} })
  press('ArrowRight')
  assert.equal(seeks.pop(), 0.5 + 1 / 720)
  press('ArrowLeft')
  assert.equal(seeks.pop(), 0.5 - 1 / 720)
  press('Home')
  assert.equal(seeks.pop(), 0)
  press('End')
  assert.equal(seeks.pop(), 1)
  press('Escape')
  assert.equal(seeks.length, 0)
  assert.equal(prevented, 4)
  const end = TimelinePlayhead({ maxMinutes: 1, positionMinutes: 1, onSeek: value => seeks.push(value) })
  press('PageUp', end)
  assert.equal(seeks.pop(), 1)
  const start = TimelinePlayhead({ maxMinutes: 1, positionMinutes: 0, onSeek: value => seeks.push(value) })
  press('ArrowLeft', start)
  assert.equal(seeks.pop(), 0)
  assert.equal(TimelinePlayhead({ maxMinutes: 0, positionMinutes: 1, onSeek: () => {} }).props.disabled, true)
}
