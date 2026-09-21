import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Box } from 'lucide-react'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan, sampleXrMotionReferenceMarks } from '../features/three/xrMotionReferenceModel'
import { sampleXrStoryPresentation } from '../features/three/xrStoryPresentation'
import { resolveXrRehearsalTimelineBeatAt } from '../features/three/xrRehearsalTimelineBeats'
import { XrCatalogArtwork } from '../features/command-menu/XrMediaCatalogThumbs'
import { isXrSceneLibraryAssetId } from '../features/three/xrSceneLibrary'

const source = readFileSync(new URL('../../../docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md', import.meta.url), 'utf8')
const frontmatter = load(source.split('---')[1]) as { kgXrMotionReference: unknown }
const plan = readXrMotionReferencePlan(frontmatter.kgXrMotionReference)
const track = (name: string) => plan.cast.find(candidate => candidate.actorId === `xr-subject:${name}:1`)!

test('the source-authored journey sails, collapses two houses, preserves brick and returns home', () => {
  assert.equal(plan.stageId, 'tropical-playground')
  assert.equal(plan.durationSeconds, 28)
  assert.equal(plan.castSource, 'subjects-only')
  for (const subject of plan.subjects) assert.ok(isXrSceneLibraryAssetId(subject.assetId), subject.assetId)
  assert.notDeepEqual(sampleXrMotionReferenceMarks(track('sailboat').marks, 0), sampleXrMotionReferenceMarks(track('sailboat').marks, 2.5))
  for (const [name, end] of [['straw-house', 6], ['stick-house', 12]] as const) {
    assert.equal(sampleXrStoryPresentation(track(name).marks, end).cue, 'collapse')
    assert.equal(sampleXrStoryPresentation(track(name).marks, end).progress, 1)
    assert.equal(sampleXrStoryPresentation(track(name).marks, 0).visible, false)
  }
  assert.equal(sampleXrStoryPresentation(track('brick-house').marks, 18).cue, 'build')
  assert.equal(sampleXrStoryPresentation(track('brick-house').marks, 18).progress, 1)
  assert.equal(sampleXrStoryPresentation(track('soup-pot').marks, 21.5).cue, 'splash')
  assert.ok(sampleXrMotionReferenceMarks(track('wolf').marks, 20.2)[1] > 4)
  assert.ok(sampleXrMotionReferenceMarks(track('wolf').marks, 21.3)[1] < 1)
  assert.equal(sampleXrStoryPresentation(track('wolf').marks, 25.6).visible, false)
  for (const name of ['first-pig', 'second-pig', 'third-pig']) {
    const final = sampleXrMotionReferenceMarks(track(name).marks, 28)
    assert.ok(final[0] >= 3 && final[0] <= 6 && final[2] === -0.8)
  }
})

test('seek/replay is deterministic and cues/captions survive save and hydration', () => {
  const saved = serializeXrMotionReferencePlan(plan)
  const reopened = readXrMotionReferencePlan(saved)
  assert.deepEqual(serializeXrMotionReferencePlan(reopened), saved)
  const times = [0, 4.2, 4.8, 5.6, 10.8, 11.6, 20.2, 21.3, 22.7, 28]
  const forward = times.map(time => sampleXrStoryPresentation(track('straw-house').marks, time))
  const backward = [...times].reverse().map(time => sampleXrStoryPresentation(track('straw-house').marks, time)).reverse()
  assert.deepEqual(forward, backward)
  assert.equal(resolveXrRehearsalTimelineBeatAt(reopened, 20.2)?.label, 'Chimney soup pot')
  assert.match(resolveXrRehearsalTimelineBeatAt(reopened, 20.2)?.caption || '', /My name is Nobody/)
  assert.match(resolveXrRehearsalTimelineBeatAt(reopened, 0)?.caption || '', /sailed far across the sea/)
  assert.match(resolveXrRehearsalTimelineBeatAt(reopened, 28)?.caption || '', /happily together.*The End/)
  assert.match(source, /\*\*The End\.\*\* 🐷⛵🌊/)
})

test('legacy plans stay neutral and invalid presentation input fails closed', () => {
  const legacy = readXrMotionReferencePlan({ subjects: [{ id: 'prop', assetId: 'prop-crate' }], cast: [{ actorId: 'prop', marks: [{ timeSeconds: 0, cue: '<script>' }] }] })
  assert.equal(legacy.cast[0]?.marks[0]?.cue, undefined)
  assert.deepEqual(sampleXrStoryPresentation([], NaN), { cue: 'idle', elapsed: 0, progress: 0, visible: true })
  const dirty = readXrMotionReferencePlan({ camera: [{ label: 'a'.repeat(100), caption: 'b'.repeat(1000) }] })
  assert.equal(dirty.camera[0]?.label?.length, 80)
  assert.equal(dirty.camera[0]?.caption?.length, 800)
})

test('story and terrain previews are native SVG illustrations, without remote resources', () => {
  for (const assetId of ['tropical-playground', 'character-pig', 'character-wolf', 'vehicle-sailboat', 'prop-house-straw', 'prop-house-stick', 'prop-house-brick', 'prop-soup-pot']) {
    const html = renderToStaticMarkup(<XrCatalogArtwork assetId={assetId} label={assetId} color="#f97316" Icon={Box} />)
    assert.ok(html.includes(`data-kg-xr-catalog-artwork="${assetId}"`))
    assert.ok(!/https?:|<image|<script/.test(html))
    assert.ok(html.includes('role="img"'))
  }
})
