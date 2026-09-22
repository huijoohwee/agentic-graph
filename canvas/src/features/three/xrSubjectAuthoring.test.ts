import * as THREE from 'three'
import { ProceduralAssetSession } from '@/features/image-to-glb/proceduralAssetSession'
import { createProceduralAssetFromText, PROCEDURAL_ASSET_TEXT_SUBJECTS } from '@/features/image-to-glb/proceduralAssetTextRecipe'
import { resolveXrSubjectFootprint } from './xrMotionReferenceSubjectPlacement'
import assert from 'node:assert/strict'
import { captureXrSubjectDraftContext, isXrSubjectDraftCurrent, readXrSubjectPart, editXrSubjectPart, readXrSubjectConstruction, readXrSubjectPlayback, XR_SUBJECT_GROUND_EPSILON_METERS, XrSubjectConstructionError } from './xrSubjectAuthoring'
import { sampleXrSubjectPlayback } from './XrAuthoredSubjectGeometry'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan } from './xrMotionReferenceModel'
import type { XrMotionReferenceRuntimeSnapshot } from './xrMotionReferenceRuntimeSnapshot'

export function testXrSubjectDraftBindsDocumentPlanAndSelectionWithoutTransport() {
  const recipe = createProceduralAssetFromText('blue robot', 17), original = JSON.stringify(recipe)
  const patch = { size: [1.7, 1.2, 0.9] as [number, number, number], color: '#123456', visible: false }
  const edited = editXrSubjectPart(recipe, 'body', patch), projected = readXrSubjectPart(edited, 'body')
  assert.deepEqual(projected.size, patch.size); assert.equal(projected.color, patch.color); assert.equal(projected.visible, false)
  assert.deepEqual(edited.values, { ...recipe.values, width: 1.7, height: 1.2, depth: 0.9, color: '#123456', visible: false })
  assert.deepEqual(edited.parts, recipe.parts, 'Keep controlled base parts')
  assert.deepEqual(edited.controls, recipe.controls, 'Keep defaults and bounds')
  assert.deepEqual(edited.clips, recipe.clips); assert.equal(edited.seed, 17)
  assert.deepEqual(editXrSubjectPart(recipe, 'body', patch), edited)
  projected.size[0] = 4; assert.equal(readXrSubjectPart(edited, 'body').size[0], 1.7)
  const armPatch = { parentId: 'head', primitive: 'cylinder' as const, position: [1, 2, 3] as [number, number, number],
    rotation: [0, Math.PI / 2, 0] as [number, number, number], pivot: [0, 0.2, 0] as [number, number, number] }
  const reparented = editXrSubjectPart(edited, 'arm-left', armPatch)
  assert.deepEqual(readXrSubjectPart(reparented, 'arm-left'), { ...readXrSubjectPart(edited, 'arm-left'), ...armPatch })
  assert.deepEqual(reparented.values, edited.values); assert.deepEqual(reparented.clips, recipe.clips)
  assert.deepEqual(reparented.parts.filter(part => part.id !== 'arm-left'), edited.parts.filter(part => part.id !== 'arm-left'))
  for (const invalid of [{ parentId: 'head' }, { parentId: 'missing' }, { size: [6, 1, 1] },
    { position: [NaN, 0, 0] }, { rotation: [Infinity, 0, 0] }, { primitive: 'custom' }, { id: 'renamed' }, { unknown: true }]) {
    assert.throws(() => editXrSubjectPart(recipe, 'body', invalid as Parameters<typeof editXrSubjectPart>[2]))
  }
  assert.throws(() => readXrSubjectPart(recipe, 'missing'), /missing/)
  assert.throws(() => editXrSubjectPart(recipe, 'missing', {}), /missing/)
  assert.equal(JSON.stringify(recipe), original, 'Success and rejection leave the original recipe immutable')

  const plan = readXrMotionReferencePlan({ subjects: [{ id: 'same-subject', assetId: 'prop-crate', label: 'Crate' }] })
  const clipsRecipe = createProceduralAssetFromText('blue robot', 9)
  clipsRecipe.clips.push({ id: 'wave', duration: 1, tracks: [{ partId: 'arm-right', keys: [
    { time: 0, rotation: [0, 0, 0] }, { time: 1, rotation: [0, 0, 1] },
  ] }] })
  const clipsSession = new ProceduralAssetSession('/clips.md#subject', clipsRecipe)
  const clipsDocument = clipsSession.serialize()
  const legacy = { proceduralAssetDocument: clipsDocument, proceduralAssetManifestPath: '/models/clips/manifest.json',
    proceduralAssetWorkspaceParent: '/models', proceduralAssetSourcePath: '/clips.md' }
  let clipMixer: THREE.AnimationMixer | null = null
  try {
    assert.deepEqual(readXrSubjectPlayback(legacy), { clipId: 'walk', loop: true, clips: [{ id: 'walk', duration: 2 }, { id: 'wave', duration: 1 }] })
    assert.equal(Object.hasOwn(readXrSubjectConstruction(legacy)!, 'playback'), false, 'Legacy bytes stay implicit')
    assert.deepEqual(readXrSubjectConstruction({ ...legacy, playback: undefined }), legacy, 'Undefined optional settings normalize to legacy absence')
    for (const playback of [{ clipId: 'wave', loop: false }, { clipId: null, loop: true }]) {
      const construction = readXrSubjectConstruction({ ...legacy, playback })!
      const authored = readXrMotionReferencePlan({ subjects: [{ ...plan.subjects[0], construction }] })
      const roundtrip = readXrMotionReferencePlan(JSON.parse(JSON.stringify(serializeXrMotionReferencePlan(authored))))
      assert.deepEqual(roundtrip.subjects[0].construction, construction)
      assert.deepEqual(readXrSubjectPlayback(construction), { ...playback, clips: readXrSubjectPlayback(legacy).clips })
    }
    for (const playback of [null, [], {}, { clipId: 'missing', loop: true }, { clipId: 'wave', loop: 'once' },
      { clipId: 1, loop: false }, { clipId: null, loop: false, speed: 2 }]) {
      assert.throws(() => readXrSubjectConstruction({ ...legacy, playback }), /playback|clip/)
    }
    const removed = JSON.parse(clipsDocument)
    removed.lastValid.clips = removed.lastValid.clips.filter((clip: { id: string }) => clip.id !== 'wave')
    assert.throws(() => readXrSubjectConstruction({ ...legacy, proceduralAssetDocument: JSON.stringify(removed), playback: { clipId: 'wave', loop: false } }), /missing/)
    assert.equal(clipsSession.serialize(), clipsDocument, 'Rejected settings/source leave the valid document unchanged')
    const scene = clipsSession.current.scene, left = scene.getObjectByName('Pivot-arm-left')!, right = scene.getObjectByName('Pivot-arm-right')!
    const restLeft = left.quaternion.clone(), restRight = right.quaternion.clone()
    clipMixer = new THREE.AnimationMixer(scene)
    const sample = (clipId: string | null, loop: boolean, seconds: number) => sampleXrSubjectPlayback(scene, clipMixer!, { clipId, loop }, seconds)
    sample('walk', true, 0.5); assert.ok(left.quaternion.angleTo(restLeft) > 0.4)
    sample('wave', true, 0.25)
    assert.ok(left.quaternion.angleTo(restLeft) < 1e-6, 'Switching clips restores untargeted joints')
    const quarter = right.quaternion.clone()
    assert.ok(Math.abs(quarter.angleTo(restRight) - 0.25) < 1e-6)
    sample('wave', true, 2.25); assert.deepEqual(right.quaternion.toArray(), quarter.toArray(), 'Repeat samples the selected duration exactly')
    sample('wave', false, 2); assert.ok(Math.abs(right.quaternion.angleTo(restRight) - 1) < 1e-6, 'Once holds the final pose')
    sample('wave', false, 0.25); assert.deepEqual(right.quaternion.toArray(), quarter.toArray(), 'Backward seek clears a previous clamp exactly')
    sample(null, false, 99); assert.ok(right.quaternion.angleTo(restRight) < 1e-6); assert.ok(left.quaternion.angleTo(restLeft) < 1e-6)
    sample('walk', true, 0.5); assert.ok(left.quaternion.angleTo(restLeft) > 0.4, 'Resume after rest reuses the mixer')
    assert.throws(() => sample('missing', true, 0), /missing/)
    assert.throws(() => sample('wave', true, NaN), /Invalid/)
    assert.equal(clipsSession.serialize(), clipsDocument, 'Sampling never rewrites the native recipe')
  } finally { clipMixer?.stopAllAction(); if (clipMixer) clipMixer.uncacheRoot(clipsSession.current.scene); clipsSession.dispose() }

  const runtime: XrMotionReferenceRuntimeSnapshot = { sceneKey: 'scene-a', sourceSignature: 'source-a', plan,
    selectedActorId: '', selectedShotTargetId: 'same-subject', selectedCameraRig: 'dolly', selectedMark: null,
    castMarkArmed: false, playheadSeconds: 0, dirty: false, revision: 1 }
  const source = { markdownDocumentName: '/a.md', markdownDocumentText: '# A' }
  const capture = (document = source, next = runtime) => captureXrSubjectDraftContext(document, next, 'same-subject')
  const draft = capture()
  assert.equal(isXrSubjectDraftCurrent(draft, capture()), true)
  assert.equal(isXrSubjectDraftCurrent(draft, capture({ ...source, markdownDocumentName: '/b.md' })), false, 'Duplicate IDs cannot cross documents')
  assert.equal(isXrSubjectDraftCurrent(draft, capture({ ...source, markdownDocumentText: '# Replaced' })), false, 'Pending source replacement invalidates a draft before hydration')
  assert.equal(isXrSubjectDraftCurrent(draft, capture(source, { ...runtime, sourceSignature: 'replacement' })), false)
  assert.equal(isXrSubjectDraftCurrent(draft, capture(source, { ...runtime, plan: readXrMotionReferencePlan(serializeXrMotionReferencePlan(plan)) })), false, 'Reparse is a new authoring boundary even with equal bytes')
  assert.equal(isXrSubjectDraftCurrent(draft, capture(source, { ...runtime, selectedShotTargetId: 'other' })), false)
  assert.equal(isXrSubjectDraftCurrent(draft, capture(source, { ...runtime, playheadSeconds: 2, revision: 93 })), true, 'Transport publication is not authored source replacement')
  assert.equal(isXrSubjectDraftCurrent(draft, capture(source, { ...runtime, plan: { ...plan, subjects: [] } })), false)

  const session = new ProceduralAssetSession('/a.md#same-subject', createProceduralAssetFromText('blue robot', 7))
  try {
    assert.equal(session.setControl('width', 1.6), true)
    const beforeInvalid = session.snapshot.lastValid
    assert.equal(session.apply('{"arbitrary":"source"}'), false)
    const construction = { proceduralAssetDocument: session.serialize(), proceduralAssetManifestPath: '/models/r1/manifest.json',
      proceduralAssetWorkspaceParent: '/models', proceduralAssetSourcePath: '/a.md' }
    const authored = readXrMotionReferencePlan({ subjects: [{ ...plan.subjects[0], construction }] })
    const reloaded = readXrMotionReferencePlan(JSON.parse(JSON.stringify(serializeXrMotionReferencePlan(authored))))
    assert.deepEqual(reloaded.subjects[0].construction, construction, 'Native document, recipe identity, controls and recoverable draft survive scene round-trip')
    assert.equal(reloaded.subjects[0].id, 'same-subject')
    assert.equal(reloaded.subjects[0].assetId, 'prop-crate', 'Catalog fallback identity is retained')
    const restored = ProceduralAssetSession.restore(reloaded.subjects[0].construction!.proceduralAssetDocument)
    try {
      assert.deepEqual(restored.snapshot.lastValid, beforeInvalid)
      assert.equal(restored.snapshot.draft, '{"arbitrary":"source"}')
      const scene = restored.current.scene, mixer = new THREE.AnimationMixer(scene)
      mixer.clipAction(scene.animations[0]).play()
      const arm = scene.getObjectByName('Pivot-arm-left')!
      mixer.setTime(0); const start = arm.quaternion.clone()
      mixer.setTime(0.5); assert.ok(start.angleTo(arm.quaternion) > 0.4, 'Native joint clip samples shared seconds')
      mixer.setTime(0); assert.ok(start.angleTo(arm.quaternion) < 1e-6, 'Backward scrubbing is deterministic')
      mixer.stopAllAction(); mixer.uncacheRoot(scene)
      assert.ok(resolveXrSubjectFootprint(reloaded.subjects[0]).sizeMeters[0] >= 1.6)
    } finally { restored.dispose() }
    const malformed = JSON.parse(construction.proceduralAssetDocument)
    malformed.lastValid.parts[0].parentId = malformed.lastValid.parts[0].id
    assert.throws(() => readXrMotionReferencePlan({ subjects: [{ ...plan.subjects[0], construction: { ...construction, proceduralAssetDocument: JSON.stringify(malformed) } }] }), /cycle|parent|hierarchy/i)
    assert.throws(() => readXrMotionReferencePlan({ subjects: [{ ...plan.subjects[0], construction: { ...construction, proceduralAssetManifestPath: '/models/../outside' } }] }), /workspace path/)
    assert.equal(readXrMotionReferencePlan(serializeXrMotionReferencePlan(plan)).subjects[0].construction, undefined)
  } finally { session.dispose() }

  const subjectFromSession = (native: ProceduralAssetSession, scale = 1) => readXrMotionReferencePlan({ subjects: [{
    ...plan.subjects[0], scale, construction: { proceduralAssetDocument: native.serialize(),
      proceduralAssetManifestPath: '/models/r1/manifest.json', proceduralAssetWorkspaceParent: '/models', proceduralAssetSourcePath: '/a.md' },
  }] }).subjects[0]
  for (const name of PROCEDURAL_ASSET_TEXT_SUBJECTS) {
    const native = new ProceduralAssetSession(`/defaults.md#${name}`, createProceduralAssetFromText(name))
    try {
      const exactDocument = native.serialize()
      const bounds = new THREE.Box3().setFromObject(native.current.scene)
      const subject = subjectFromSession(native, 2)
      const footprint = resolveXrSubjectFootprint(subject)
      assert.ok(bounds.min.y >= -XR_SUBJECT_GROUND_EPSILON_METERS, `${name} remains a supported native default`)
      assert.ok(Math.abs(footprint.sizeMeters[1] - bounds.max.y * 2) < 1e-10, `${name} height spans the ground origin to its scaled top`)
      assert.equal(footprint.halfY, footprint.sizeMeters[1] / 2)
      assert.equal(subject.construction!.proceduralAssetDocument, exactDocument, 'Ground admission does not translate or rewrite the recipe')
    } finally { native.dispose() }
  }
  const elevated = createProceduralAssetFromText('box')
  elevated.parts[0].position[1] = 2
  const positiveSession = new ProceduralAssetSession('/a.md#elevated', elevated)
  try { assert.equal(resolveXrSubjectFootprint(subjectFromSession(positiveSession)).sizeMeters[1], 2.5, 'Floating geometry conservatively includes its gap above the ground') }
  finally { positiveSession.dispose() }
  for (const [offset, accepted] of [[-XR_SUBJECT_GROUND_EPSILON_METERS / 2, true], [-XR_SUBJECT_GROUND_EPSILON_METERS * 2, false], [-1, false]] as const) {
    const recipe = createProceduralAssetFromText('box')
    recipe.parts[0].position[1] += offset
    const native = new ProceduralAssetSession('/a.md#ground-boundary', recipe)
    try {
      const before = native.serialize()
      if (accepted) assert.ok(subjectFromSession(native).construction, 'Only floating-point scale ground noise is tolerated')
      else assert.throws(() => subjectFromSession(native), error => error instanceof XrSubjectConstructionError && /below its ground origin/.test(error.message))
      assert.equal(native.serialize(), before, 'Admission rejection preserves the editable native document')
    } finally { native.dispose() }
  }
}
