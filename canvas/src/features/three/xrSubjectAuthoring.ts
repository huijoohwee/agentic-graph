import type { XrMotionReferenceRuntimeSnapshot } from './xrMotionReferenceRuntimeSnapshot'

export type XrSubjectDraftContext = Readonly<{
  documentName: string
  documentText: string
  sceneKey: string
  sourceSignature: string
  plan: XrMotionReferenceRuntimeSnapshot['plan']
  subjectId: string
  selectedSubjectId: string
}>

/** References existing authored state; transport revisions are deliberately excluded. */
export function captureXrSubjectDraftContext(
  document: Readonly<{ markdownDocumentName?: string | null; markdownDocumentText?: string | null }>,
  runtime: XrMotionReferenceRuntimeSnapshot,
  subjectId: string,
): XrSubjectDraftContext {
  return Object.freeze({ documentName: document.markdownDocumentName || '', documentText: document.markdownDocumentText || '',
    sceneKey: runtime.sceneKey, sourceSignature: runtime.sourceSignature, plan: runtime.plan,
    subjectId, selectedSubjectId: runtime.selectedShotTargetId })
}

export function isXrSubjectDraftCurrent(draft: XrSubjectDraftContext, current: XrSubjectDraftContext): boolean {
  return Boolean(draft.documentName && draft.documentText && draft.sceneKey
    && draft.documentName === current.documentName && draft.documentText === current.documentText
    && draft.sceneKey === current.sceneKey && draft.sourceSignature === current.sourceSignature
    && draft.plan === current.plan && draft.subjectId === current.subjectId
    && draft.selectedSubjectId === draft.subjectId && current.selectedSubjectId === draft.subjectId
    && current.plan.subjects.some(subject => subject.id === draft.subjectId))
}
