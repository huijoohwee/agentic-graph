import { Simulate } from 'react-dom/test-utils'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { withGlbExporterFileReader } from '@/tests/lib/glbExporterFileReaderHarness'
import { XrSubjectAuthoringControls } from '@/features/three/XrSubjectAuthoringControls'
import { captureXrSubjectDraftContext, XrSubjectConstructionError } from '@/features/three/xrSubjectAuthoring'
import { ProceduralAssetSession } from '@/features/image-to-glb/proceduralAssetSession'
import { createProceduralAssetFromText } from '@/features/image-to-glb/proceduralAssetTextRecipe'
import { persistXrScene } from '@/features/three/xrScenePersistence'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import yaml from 'js-yaml'
import { XrSubjectTransformEditor } from '@/features/three/XrSubjectTransformEditor'
import { useGraphStore } from '@/hooks/useGraphStore'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan } from '@/features/three/xrMotionReferenceModel'
import { readXrMotionReferenceRuntime, restoreXrMotionReferenceRuntimeSnapshot, selectXrMotionReferenceShotTarget, setXrMotionReferencePlayhead, setXrSubjectConstruction, subscribeXrMotionReferenceRuntime, hydrateXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
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
    assert.ok(container.querySelector('input[aria-label="Subject description"]'), 'Catalog subjects retain the opt-in construction entry')
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
    const constructionSession = new ProceduralAssetSession('/draft-b.md#shared-id', createProceduralAssetFromText('box'))
    try {
      const construction = { proceduralAssetDocument: constructionSession.serialize(), proceduralAssetManifestPath: '/models/r1/manifest.json', proceduralAssetWorkspaceParent: '/models', proceduralAssetSourcePath: '/draft-b.md' }
      await act(async () => { setXrSubjectConstruction('shared-id', construction); assert.equal(persistXrScene(), true) })
      assert.ok(container.querySelector('[data-kg-procedural-asset-controls]'), 'Subject inspector reuses the native procedural controls')
      const recipeInput = container.querySelector<HTMLTextAreaElement>('textarea')!
      assert.ok(recipeInput.value.includes('agentic-graph-procedural'))
      await act(async () => { setXrMotionReferencePlayhead(3) })
      assert.equal(container.querySelector('textarea'), recipeInput, 'Shared playhead leaves the native recipe editor mounted')
      const finalText = useGraphStore.getState().markdownDocumentText!
      const finalMetadata = yaml.load(extractYamlFrontmatterBlock(finalText)!.yamlText) as Record<string, unknown>
      assert.deepEqual(readXrMotionReferencePlan(finalMetadata.kgXrMotionReference).subjects[0].construction, construction)
      assert.ok(finalText.endsWith('# Retain authored body\n'))
    } finally { constructionSession.dispose() }

    // Keep this adapter mounted across accepted commits, without the parent inspector's key.
    const fs = createMemoryWorkspaceFs()
    let resolveFs = async () => fs
    function ConstructionHarness() {
      const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
      const state = useGraphStore()
      const subject = runtime.plan.subjects[0]
      return <XrSubjectAuthoringControls subject={subject} context={captureXrSubjectDraftContext(state, runtime, subject.id)} resolveWorkspaceFs={() => resolveFs()} />
    }
    await act(async () => { install('bare.md'); root.render(<ConstructionHarness />) })
    const button = (label: string) => [...container.querySelectorAll('button')].find(element => element.textContent === label)!
    const save = async (label: string) => {
      const before = readXrMotionReferenceRuntime().plan.subjects[0].construction?.proceduralAssetDocument
      await withGlbExporterFileReader(async () => {
        await act(async () => {
          let unsubscribe = () => {}
          const committed = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => { unsubscribe(); reject(new Error('Subject construction did not commit')) }, 2000)
            unsubscribe = subscribeXrMotionReferenceRuntime(() => {
              if (readXrMotionReferenceRuntime().plan.subjects[0].construction?.proceduralAssetDocument !== before) {
                clearTimeout(timeout); unsubscribe(); resolve()
              }
            })
          })
          Simulate.click(button(label)); await committed
        })
      })
    }
    await save('Create editable model')
    assert.equal(readXrMotionReferenceRuntime().plan.subjects[0].construction?.proceduralAssetWorkspaceParent, '/', 'Bare document names use the native workspace root')
    const createdDocument = readXrMotionReferenceRuntime().plan.subjects[0].construction!.proceduralAssetDocument
    await act(async () => Simulate.change(container.querySelector('input[type="number"]')!, { target: { valueAsNumber: 1.1 } } as never))
    await save('Apply controls')
    const editedDocument = readXrMotionReferenceRuntime().plan.subjects[0].construction!.proceduralAssetDocument
    assert.notEqual(editedDocument, createdDocument, 'A fresh accepted context permits the second edit on the same mounted adapter')
    assert.equal(JSON.parse(editedDocument).lastValid.values.width, 1.1)

    let finishFs: (() => void) | undefined
    resolveFs = () => new Promise(resolve => { finishFs = () => resolve(fs) })
    await act(async () => Simulate.click(button('Apply controls')))
    assert.ok(finishFs, 'The stale operation reached an asynchronous native workspace boundary')
    await act(async () => {
      selectXrMotionReferenceShotTarget('xr-shot:scene')
      selectXrMotionReferenceShotTarget('shared-id')
      finishFs!()
    })
    assert.equal(readXrMotionReferenceRuntime().plan.subjects[0].construction!.proceduralAssetDocument, editedDocument, 'Selection away-and-back cannot revive the pending operation')
    resolveFs = async () => fs
    await save('Apply controls')
    const afterRecovery = readXrMotionReferenceRuntime()
    assert.notEqual(afterRecovery.plan.subjects[0].construction!.proceduralAssetDocument, editedDocument, 'Fresh work remains possible after stale work is retired')
    finishFs = undefined
    resolveFs = () => new Promise(resolve => { finishFs = () => resolve(fs) })
    await act(async () => Simulate.click(button('Apply controls')))
    assert.ok(finishFs)
    await act(async () => {
      useGraphStore.setState({ markdownDocumentName: 'other.md' })
      useGraphStore.setState({ markdownDocumentName: 'bare.md' })
      finishFs!()
    })
    assert.equal(readXrMotionReferenceRuntime(), afterRecovery, 'Source away-and-back also retires the pending operation')

    const savedSource = useGraphStore.getState().markdownDocumentText
    const originalConstruction = afterRecovery.plan.subjects[0].construction!
    const belowGround = JSON.parse(originalConstruction.proceduralAssetDocument)
    belowGround.lastValid.parts[0].position[1] = -1
    assert.throws(() => setXrSubjectConstruction('shared-id', { ...originalConstruction, proceduralAssetDocument: JSON.stringify(belowGround) }),
      error => error instanceof XrSubjectConstructionError && /below its ground origin/.test(error.message))
    assert.equal(readXrMotionReferenceRuntime(), afterRecovery, 'Ground rejection retains the last valid subject and selection')
    assert.equal(useGraphStore.getState().markdownDocumentText, savedSource, 'Ground rejection leaves saved source bytes intact')
    assert.equal(readXrMotionReferenceRuntime().plan.subjects[0].construction, originalConstruction)

    const malformed = serializeXrMotionReferencePlan(afterRecovery.plan) as Record<string, unknown>
    const subjects = malformed.subjects as Array<Record<string, unknown>>
    subjects[0].construction = { ...afterRecovery.plan.subjects[0].construction, proceduralAssetDocument: '{invalid' }
    assert.throws(() => hydrateXrMotionReferenceRuntime({ sceneKey: afterRecovery.sceneKey, nodes: [], persistedValue: malformed }), XrSubjectConstructionError)
    assert.equal(readXrMotionReferenceRuntime(), afterRecovery, 'Malformed construction rejects before replacing runtime state')

  } finally {
    await unmountReactRoot(root)
    await settleWorkspaceSourceTextWrites()
    useGraphStore.setState(prior); restoreXrMotionReferenceRuntimeSnapshot(priorRuntime)
    env.restore()
  }
}
