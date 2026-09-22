import { Simulate } from 'react-dom/test-utils'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { withGlbExporterFileReader } from '@/tests/lib/glbExporterFileReaderHarness'
import { XrSubjectAuthoringControls } from '@/features/three/XrSubjectAuthoringControls'
import { captureXrSubjectDraftContext, XrSubjectConstructionError } from '@/features/three/xrSubjectAuthoring'
import { ProceduralAssetSession } from '@/features/image-to-glb/proceduralAssetSession'
import { disposeProceduralAsset } from '@/features/image-to-glb/proceduralAssetBuilder'
import { inspectGlbBytes } from '@/lib/assets/gltfFormat'
import * as THREE from 'three'
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
    const downloads: Array<{ blob: Blob; name: string }> = []
    let onDownload = () => {}
    function ConstructionHarness() {
      const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
      const state = useGraphStore()
      const subject = runtime.plan.subjects[0]
      return <XrSubjectAuthoringControls subject={subject} context={captureXrSubjectDraftContext(state, runtime, subject.id)} resolveWorkspaceFs={() => resolveFs()}
        downloadFile={(blob, name) => { downloads.push({ blob, name }); onDownload() }} />
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
    const recipeField = container.querySelector<HTMLTextAreaElement>('textarea')!
    const twoClips = JSON.parse(recipeField.value)
    twoClips.clips.push({ ...twoClips.clips[0], id: 'salute' })
    await act(async () => Simulate.change(recipeField, { target: { value: JSON.stringify(twoClips) } } as never))
    await save('Apply recipe')
    await act(async () => Simulate.change(container.querySelector('input[type="number"]')!, { target: { valueAsNumber: 1.1 } } as never))
    await save('Apply controls')
    let editedDocument = readXrMotionReferenceRuntime().plan.subjects[0].construction!.proceduralAssetDocument
    assert.notEqual(editedDocument, createdDocument, 'A fresh accepted context permits the second edit on the same mounted adapter')
    assert.equal(JSON.parse(editedDocument).lastValid.values.width, 1.1)

    const openParts = async () => {
      const details = [...container.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent === 'Parts & rig')!
      await act(async () => { details.open = true; Simulate.toggle(details) })
      assert.ok(container.querySelector('select[aria-label="Part"]'), 'Part fields are lazily projected from the native document')
    }
    const changeField = async (label: string, value: string) => {
      const input = container.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!
      await act(async () => { input.value = value; Simulate.change(input) })
    }
    await openParts()
    assert.equal(container.querySelector<HTMLSelectElement>('[aria-label="Part"]')!.value, 'body')
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Size (m) X"]')!.value, '1.1', 'Inspector shows the effective procedural value')
    await changeField('Size (m) X', '1.3')
    await changeField('Position (m) Y', '1.6')
    await changeField('Pivot (m) X', '0.1')
    await changeField('Part color', '#336699')
    await save('Apply part')
    editedDocument = readXrMotionReferenceRuntime().plan.subjects[0].construction!.proceduralAssetDocument
    const partRecipe = JSON.parse(editedDocument).lastValid
    assert.equal(partRecipe.values.width, 1.3, 'Visual editing updates the same bounded control')
    assert.equal(partRecipe.parts[0].position[1], 1.6)
    assert.equal(partRecipe.parts[0].pivot[0], 0.1)
    assert.equal(partRecipe.values.color, '#336699')
    const partSavedSource = useGraphStore.getState().markdownDocumentText!
    const partMetadata = yaml.load(extractYamlFrontmatterBlock(partSavedSource)!.yamlText) as Record<string, unknown>
    assert.equal(readXrMotionReferencePlan(partMetadata.kgXrMotionReference).subjects[0].construction!.proceduralAssetDocument, editedDocument, 'Parts and rig persist through the actual scene source')
    await openParts()
    await changeField('Parent part', 'head')
    await act(async () => Simulate.click(button('Apply part')))
    assert.match(container.querySelector('[role="alert"]')?.textContent || '', /cyclic|parent/)
    assert.equal(useGraphStore.getState().markdownDocumentText, partSavedSource, 'A parent cycle retains the exact last valid source')
    assert.equal(readXrMotionReferenceRuntime().plan.subjects[0].construction!.proceduralAssetDocument, editedDocument)
    await act(async () => Simulate.click(button('Reset part draft')))
    assert.equal(container.querySelector<HTMLSelectElement>('[aria-label="Parent part"]')!.value, '')

    const clipField = () => container.querySelector<HTMLSelectElement>('[aria-label="Authored clip"]')!
    assert.equal(clipField().value, 'walk', 'Legacy construction selects its first clip')
    assert.deepEqual([...clipField().options].map(option => option.value), ['', 'walk', 'salute'])
    await changeField('Authored clip', 'salute')
    await changeField('At clip end', 'hold')
    const pendingClipField = clipField()
    await act(async () => { setXrMotionReferencePlayhead(3); setXrMotionReferencePlayhead(1) })
    assert.equal(clipField(), pendingClipField, 'Transport seeks retain the unsaved clip choice')
    await act(async () => Simulate.click(button('Apply playback')))
    const clipSource = useGraphStore.getState().markdownDocumentText!
    const clipMetadata = yaml.load(extractYamlFrontmatterBlock(clipSource)!.yamlText) as Record<string, unknown>
    const reopenedClip = readXrMotionReferencePlan(clipMetadata.kgXrMotionReference).subjects[0].construction!
    assert.deepEqual(reopenedClip.playback, { clipId: 'salute', loop: false }, 'Playback is saved to the actual scene source')
    assert.equal(reopenedClip.proceduralAssetDocument, editedDocument, 'Clip choices never regenerate editable model or GLB companions')
    assert.equal(readXrMotionReferenceRuntime().playheadSeconds, 1)
    assert.equal(readXrMotionReferenceRuntime().selectedShotTargetId, 'shared-id')
    await act(async () => { hydrateCanonicalXrMotionReferenceRuntime(); selectXrMotionReferenceShotTarget('shared-id') })
    assert.equal(clipField().value, 'salute', 'Source rehydration restores clip selection')
    assert.equal(container.querySelector<HTMLSelectElement>('[aria-label="At clip end"]')!.value, 'hold')
    const beforeMissingClip = readXrMotionReferenceRuntime()
    assert.throws(() => setXrSubjectConstruction('shared-id', { ...reopenedClip, playback: { clipId: 'missing', loop: true } }), XrSubjectConstructionError)
    assert.equal(readXrMotionReferenceRuntime(), beforeMissingClip)
    assert.equal(useGraphStore.getState().markdownDocumentText, clipSource)
    await changeField('Authored clip', '')
    await act(async () => Simulate.click(button('Apply playback')))
    assert.deepEqual(readXrMotionReferenceRuntime().plan.subjects[0].construction!.playback, { clipId: null, loop: false })
    assert.equal(container.querySelector<HTMLSelectElement>('[aria-label="At clip end"]')!.disabled, true)
    await changeField('Authored clip', 'walk')
    await changeField('At clip end', 'repeat')
    await act(async () => Simulate.click(button('Apply playback')))
    assert.deepEqual(readXrMotionReferenceRuntime().plan.subjects[0].construction!.playback, { clipId: 'walk', loop: true })
    await openParts()

    let finishFs: (() => void) | undefined
    resolveFs = () => new Promise(resolve => { finishFs = () => resolve(fs) })
    await act(async () => Simulate.click(button('Apply part')))
    assert.ok(finishFs, 'The stale operation reached an asynchronous native workspace boundary')
    await act(async () => {
      selectXrMotionReferenceShotTarget('xr-shot:scene')
      selectXrMotionReferenceShotTarget('shared-id')
      finishFs!()
    })
    assert.equal(readXrMotionReferenceRuntime().plan.subjects[0].construction!.proceduralAssetDocument, editedDocument, 'Selection away-and-back cannot revive the pending part operation')
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

    await withGlbExporterFileReader(async () => {
      await act(async () => {
        let timeout: ReturnType<typeof setTimeout>
        const delivered = new Promise<void>((resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Selected model GLB was not delivered')), 2000)
          onDownload = () => { clearTimeout(timeout); resolve() }
        })
        Simulate.click(button('Export selected model GLB')); await delivered
      })
    })
    assert.equal(downloads.length, 1)
    assert.equal(downloads[0].name, 'Crate.glb')
    const bytes = await downloads[0].blob.arrayBuffer()
    assert.equal(inspectGlbBytes(bytes).validContainer, true)
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const exported = await new GLTFLoader().parseAsync(bytes, '')
    const mixer = new THREE.AnimationMixer(exported.scene)
    try {
      assert.equal(exported.scene.getObjectByName('Pivot-body')!.position.y, 1.6, 'Export retains edited local part placement')
      const body = exported.scene.getObjectByName('Part-body') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
      body.geometry.computeBoundingBox()
      assert.ok(Math.abs(body.geometry.boundingBox!.getSize(new THREE.Vector3()).x - 1.3) < 1e-6)
      assert.equal(body.material.color.getHexString(), '336699')
      assert.equal(exported.animations[0].name, 'walk')
      mixer.clipAction(exported.animations[0]).play()
      const arm = exported.scene.getObjectByName('Pivot-arm-left')!
      mixer.setTime(0); const first = arm.quaternion.clone()
      mixer.setTime(0.5); assert.ok(first.angleTo(arm.quaternion) > 0.4, 'Actual exported clip still animates the native rigid joint')
    } finally { mixer.stopAllAction(); mixer.uncacheRoot(exported.scene); disposeProceduralAsset(exported.scene) }
    assert.equal(readXrMotionReferenceRuntime(), afterRecovery, 'Export never replaces or advances the live scene')

    await withGlbExporterFileReader(async () => {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
      const originalParse = GLTFExporter.prototype.parseAsync
      const bounded = async (promise: Promise<void>, label: string) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        try { await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(label)), 2000) })]) }
        finally { clearTimeout(timer) }
      }
      let enter!: () => void, release!: () => void, complete!: () => void
      const entered = new Promise<void>(resolve => { enter = resolve })
      const resumed = new Promise<void>(resolve => { release = resolve })
      const finished = new Promise<void>(resolve => { complete = resolve })
      GLTFExporter.prototype.parseAsync = async function (...args) {
        enter(); await resumed
        try { return await originalParse.apply(this, args) } finally { complete() }
      }
      try {
        await act(async () => { Simulate.click(button('Export selected model GLB')); await bounded(entered, 'GLB exporter did not start') })
        await act(async () => {
          selectXrMotionReferenceShotTarget('xr-shot:scene'); selectXrMotionReferenceShotTarget('shared-id')
          release(); await bounded(finished, 'GLB exporter did not finish')
        })
        assert.equal(downloads.length, 1, 'Selection away-and-back suppresses a late encoded download')
      } finally { release(); GLTFExporter.prototype.parseAsync = originalParse }
    })

    const beforeRejectedEdits = readXrMotionReferenceRuntime()
    const savedSource = useGraphStore.getState().markdownDocumentText
    const originalConstruction = beforeRejectedEdits.plan.subjects[0].construction!
    const belowGround = JSON.parse(originalConstruction.proceduralAssetDocument)
    belowGround.lastValid.parts[0].position[1] = -1
    assert.throws(() => setXrSubjectConstruction('shared-id', { ...originalConstruction, proceduralAssetDocument: JSON.stringify(belowGround) }),
      error => error instanceof XrSubjectConstructionError && /below its ground origin/.test(error.message))
    assert.equal(readXrMotionReferenceRuntime(), beforeRejectedEdits, 'Ground rejection retains the last valid subject and selection')
    assert.equal(useGraphStore.getState().markdownDocumentText, savedSource, 'Ground rejection leaves saved source bytes intact')
    assert.equal(readXrMotionReferenceRuntime().plan.subjects[0].construction, originalConstruction)

    const malformed = serializeXrMotionReferencePlan(beforeRejectedEdits.plan) as Record<string, unknown>
    const subjects = malformed.subjects as Array<Record<string, unknown>>
    subjects[0].construction = { ...beforeRejectedEdits.plan.subjects[0].construction, proceduralAssetDocument: '{invalid' }
    assert.throws(() => hydrateXrMotionReferenceRuntime({ sceneKey: beforeRejectedEdits.sceneKey, nodes: [], persistedValue: malformed }), XrSubjectConstructionError)
    assert.equal(readXrMotionReferenceRuntime(), beforeRejectedEdits, 'Malformed construction rejects before replacing runtime state')

  } finally {
    await unmountReactRoot(root)
    await settleWorkspaceSourceTextWrites()
    useGraphStore.setState(prior); restoreXrMotionReferenceRuntimeSnapshot(priorRuntime)
    env.restore()
  }
}
