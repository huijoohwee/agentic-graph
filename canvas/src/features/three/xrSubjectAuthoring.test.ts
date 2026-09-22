import assert from 'node:assert/strict'
import { captureXrSubjectDraftContext, isXrSubjectDraftCurrent } from './xrSubjectAuthoring'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan } from './xrMotionReferenceModel'
import type { XrMotionReferenceRuntimeSnapshot } from './xrMotionReferenceRuntimeSnapshot'

export function testXrSubjectDraftBindsDocumentPlanAndSelectionWithoutTransport() {
  const plan = readXrMotionReferencePlan({ subjects: [{ id: 'same-subject', assetId: 'prop-crate', label: 'Crate' }] })
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
}
