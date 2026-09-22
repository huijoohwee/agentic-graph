import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import yaml from 'js-yaml'
import { XrSubjectTransformEditor } from '@/features/three/XrSubjectTransformEditor'
import { useGraphStore } from '@/hooks/useGraphStore'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan } from '@/features/three/xrMotionReferenceModel'
import { readXrMotionReferenceRuntime, restoreXrMotionReferenceRuntimeSnapshot, selectXrMotionReferenceShotTarget, setXrMotionReferencePlayhead } from '@/features/three/xrMotionReferenceRuntime'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { settleWorkspaceSourceTextWrites } from '@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

export async function testXrSubjectEditorFencesDuplicateDocumentsAndPersistsValidDraft() {
  const prior = useGraphStore.getState(), priorRuntime = readXrMotionReferenceRuntime()
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = env.dom.window.document.getElementById('root')!, root = createRoot(container)
  const plan = readXrMotionReferencePlan({ stageId: 'neutral-volume', subjects: [{ id: 'shared-id', assetId: 'prop-crate', label: 'Crate' }] })
  const install = (name: string) => {
    const metadata = { kgXrMotionReference: serializeXrMotionReferencePlan(plan) }
    const text = `---\n${yaml.dump(metadata)}---\n\n# Retain authored body\n`
    useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: text,
      sourceFiles: [{ id: name, name, text, enabled: true, status: 'parsed', source: { kind: 'local', path: `workspace:${name}` } }],
      graphData: { type: 'Graph', context: 'frontmatter-flow', nodes: [], edges: [], metadata },
      workspaceViewMode: 'canvas', workspaceCanvasPaneOpen: true, markdownWorkspaceIndexingInFlight: false,
      workspaceGraphMutationBlockUntilMs: 0, workspaceGraphMutationLayoutLockActive: false })
    hydrateCanonicalXrMotionReferenceRuntime(); selectXrMotionReferenceShotTarget('shared-id')
    return text
  }
  const nameInput = () => container.querySelector<HTMLInputElement>('input[aria-label^="Rename "]')!
  const focus = (input: HTMLInputElement) => input.dispatchEvent(new env.dom.window.FocusEvent('focusin', { bubbles: true }))
  const blur = (input: HTMLInputElement) => input.dispatchEvent(new env.dom.window.FocusEvent('focusout', { bubbles: true }))
  try {
    completeSourceFilesBootstrap()
    const originalA = install('/draft-a.md')
    await mountReactRoot(root, <XrSubjectTransformEditor />)
    const old = nameInput()
    await act(async () => { focus(old); old.value = 'Stale from A' })
    let originalB = ''
    await act(async () => {
      originalB = install('/draft-b.md')
      // A late blur can arrive before React commits the source replacement.
      blur(old)
    })
    assert.equal(useGraphStore.getState().markdownDocumentText, originalB)
    assert.equal(readXrMotionReferenceRuntime().plan.subjects[0]?.label, 'Crate')
    assert.notEqual(nameInput(), old, 'Equal IDs and values in a new document remount inputs')
    assert.equal(nameInput().value, 'Crate')
    assert.equal(originalA, originalB, 'The regression differs only by source identity')
    const valid = nameInput()
    await act(async () => { focus(valid); valid.value = 'Saved crate'; setXrMotionReferencePlayhead(2) })
    assert.equal(nameInput(), valid, 'Seeking must retain the active draft element')
    assert.equal(nameInput().value, 'Saved crate')
    await act(async () => { blur(valid) })
    const saved = useGraphStore.getState().markdownDocumentText!
    const metadata = yaml.load(extractYamlFrontmatterBlock(saved)!.yamlText) as Record<string, unknown>
    const reopened = readXrMotionReferencePlan(metadata.kgXrMotionReference)
    assert.equal(reopened.subjects[0]?.label, 'Saved crate')
    assert.equal(reopened.subjects[0]?.id, 'shared-id')
    assert.equal(useGraphStore.getState().sourceFiles[0]?.text, saved)
    assert.ok(saved.endsWith('# Retain authored body\n'))
    assert.equal(readXrMotionReferenceRuntime().selectedShotTargetId, 'shared-id')
  } finally {
    await unmountReactRoot(root)
    await settleWorkspaceSourceTextWrites()
    useGraphStore.setState(prior); restoreXrMotionReferenceRuntimeSnapshot(priorRuntime)
    env.restore()
  }
}
