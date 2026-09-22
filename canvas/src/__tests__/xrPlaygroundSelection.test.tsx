import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Box } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan, XR_MOTION_REFERENCE_GRAPH_METADATA_KEY } from '@/features/three/xrMotionReferenceModel'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { readXrMotionReferenceRuntime, setXrMotionReferenceSubjectLabel, setXrMotionReferenceSubjectTransform, retimeXrMotionReferenceCastMark } from '@/features/three/xrMotionReferenceRuntime'
import { controlXrSharedAssetControls, inspectXrSharedAssetControls } from '@/features/three/xrSharedAssetControlRuntime'
import { readBoundXrSelectedActorId } from '@/features/three/xrSelectedActorBinding'
import { buildXrShotTargets, resolveXrShotTargetPosition } from '@/features/three/xrShotTargets'
import { buildXrStageMediaDragPayload } from '@/features/three/xrSceneMediaDrag'
import { resolveXrStageObjects, XR_MOTION_REFERENCE_STAGE_PRESETS } from '@/features/three/xrSceneLibrary'
import { XrSceneLibrarySubject } from '@/features/three/XrSceneLibrarySubject'
import { XrLibraryCard } from '@/features/command-menu/XrMediaLibraryCards'
import { XrSubjectTransformEditor } from '@/features/three/XrSubjectTransformEditor'
import { selectXrStageObject } from '@/features/three/XrStageObjectSelection'

export function testXrPlaygroundSelection() {
  const previous = useGraphStore.getState()
  const plan = readXrMotionReferencePlan({ stageId: 'tropical-playground', subjects: [
    { id: 'pig', assetId: 'character-pig', label: 'Pig', position: [1, 0, 1] },
    { id: 'house', assetId: 'prop-house-straw', label: 'House', position: [2, 0, 2] },
  ], cast: [{ actorId: 'pig', marks: [{ timeSeconds: 0, position: [1, 0, 1], cue: 'huff' }] },
    { actorId: 'house', marks: [{ timeSeconds: 0, position: [2, 0, 2], cue: 'build' }, { timeSeconds: 2, position: [2, 0, 2], cue: 'collapse' }] }] })
  try {
    completeSourceFilesBootstrap()
    useGraphStore.setState({ markdownDocumentName: 'XR selection test.md', markdownDocumentText: '# XR selection',
      graphData: { type: 'Graph', nodes: [], edges: [], metadata: { [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serializeXrMotionReferencePlan(plan) } },
      selectedNodeId: null, canvasRenderMode: '3d', canvas3dMode: 'xr' } as never)
    hydrateCanonicalXrMotionReferenceRuntime()
    assert.equal(controlXrSharedAssetControls({ operation: 'select-target', targetId: 'pig' }).ok, true)
    const before = serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)
    // Explicit native commands must not fall through to the previously selected pig.
    assert.equal(controlXrSharedAssetControls({ operation: 'apply-animation', targetId: 'xr-stage:cannon-left', presetId: 'dance' }).ok, false)
    assert.deepEqual(serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan), before)
    for (const object of resolveXrStageObjects('tropical-playground')) {
      assert.equal(selectXrStageObject(object.id), true, object.id)
      assert.equal(readXrMotionReferenceRuntime().selectedShotTargetId, object.id)
      assert.equal(readBoundXrSelectedActorId(), '')
      assert.equal(inspectXrSharedAssetControls().selectedActorId, '')
      assert.equal(inspectXrSharedAssetControls().selectedLabel, object.label)
      assert.equal(controlXrSharedAssetControls({ operation: 'apply-animation', presetId: 'dance' }).ok, false)
    }
    assert.deepEqual(serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan), before, 'selection must not add, promote or change authored subjects')
    assert.deepEqual(resolveXrShotTargetPosition(plan, 'xr-stage:cannon-left', 0), [1.6, 0, -6.25])
    const targets = buildXrShotTargets(plan)
    assert.equal(new Set(targets.map(target => target.id)).size, targets.length)
    assert.equal(resolveXrStageObjects('neutral-volume').length, 0)
    selectXrStageObject('xr-stage:cannon-left')
    assert.match(renderToStaticMarkup(<XrSubjectTransformEditor />), /Placement belongs to the Tropical Playground/)
    controlXrSharedAssetControls({ operation: 'select-target', targetId: 'house' })
    setXrMotionReferenceSubjectLabel('house', 'Renamed house')
    setXrMotionReferenceSubjectTransform({ subjectId: 'house', position: [3, 0, 2] })
    const collapse = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === 'house')!.marks[1]
    retimeXrMotionReferenceCastMark('house', collapse.id, 3)
    const edited = readXrMotionReferenceRuntime().plan
    assert.deepEqual(edited.subjects.find(subject => subject.id === 'house')!.position, [3, 0, 2])
    assert.deepEqual(edited.cast.find(track => track.actorId === 'house')!.marks.map(mark => mark.cue), ['build', 'collapse'])
    const inspector = renderToStaticMarkup(<XrSubjectTransformEditor />)
    assert.match(inspector, /Renamed house X position/)
    assert.match(inspector, /data-kg-xr-timeline-object-inspector="house"/)
    assert.equal(XrSceneLibrarySubject({ subject: plan.subjects[1], position: [0, 0, 0], stageScale: 1,
      presentation: { cue: 'hidden', visible: false, elapsed: 0, progress: 0 }, onSelect: () => { throw new Error('hidden object intercepted selection') } }), null)
    const card = renderToStaticMarkup(<XrLibraryCard Icon={Box} color="#887766" label="Pig" description="Pig performer" metadata="animals" footer={<button>Timeline</button>} onSelect={() => {}} />)
    assert.match(card, /draggable="false"/)
    assert.match(card, /data-kg-media-xr-card-layout="media-3-rows"/)
    assert.ok(!card.includes('position-axis'), 'Media instance cards must not duplicate the Timeline transform form')
  } finally {
    useGraphStore.setState(previous, true)
    hydrateCanonicalXrMotionReferenceRuntime()
  }
}

export function assertSingaporeEnvironmentCardSemantics() {
  const stage = XR_MOTION_REFERENCE_STAGE_PRESETS.find(stage => stage.id === 'singapore')!
  const card = renderToStaticMarkup(<XrLibraryCard Icon={Box} color="#778899" label={stage.label} description={stage.description}
    metadata="terrain" footer={null} dragPayload={buildXrStageMediaDragPayload(stage)} />)
  assert.match(card, /<article[^>]*draggable="true"/)
  assert.match(card, /aria-label="Singapore. Drag onto the Canvas."/)
  assert.ok(!card.slice(0, card.indexOf('>')).includes('aria-hidden'))
}
