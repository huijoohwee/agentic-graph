import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { restoreProceduralAssetWorkspace } from './proceduralAssetWorkspace'
import { withGlbExporterFileReader } from '@/tests/lib/glbExporterFileReaderHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { ProceduralAssetControls } from './ProceduralAssetControls'
import { ProceduralAssetSession } from './proceduralAssetSession'
import { createProceduralAssetFromText } from './proceduralAssetTextRecipe'

export async function testProceduralControlsRetainInvalidDraftAndPriorModel() {
  const env = initJsdomHarness(), root = createRoot(env.dom.window.document.body.appendChild(env.dom.window.document.createElement('div')))
  const source = useGraphStore.getState(), session = new ProceduralAssetSession('/controls.md#request', createProceduralAssetFromText('blue robot'))
  const previousModel = 'data:model/gltf-binary;base64,cHJldmlvdXM='
  let props: Record<string, unknown> = { proceduralAssetDocument: session.serialize(), proceduralAssetSourcePath: '/controls.md', proceduralAssetWorkspaceParent: '/', modelUrl: previousModel }
  let patches = 0
  const fs = createMemoryWorkspaceFs()
  let resolveFs = async () => fs
  const render = () => root.render(<ProceduralAssetControls nodeId="output" properties={props} resolveWorkspaceFs={() => resolveFs()} onPatchProperties={patch => { patches++; props = { ...props, ...patch }; render() }} />)
  const doc = env.dom.window.document
  const button = (text: string) => [...doc.querySelectorAll('button')].find(node => node.textContent === text)!
  try {
    useGraphStore.setState({ markdownDocumentName: '/controls.md', markdownDocumentText: '# Source' })
    await act(async () => render())
    assert.equal(doc.querySelectorAll('input[type="number"]').length, 3)
    assert.ok(doc.querySelector('input[type="color"]'))
    assert.ok(doc.querySelector('input[type="checkbox"]'))
    assert.ok(doc.querySelector('select'))
    const width = doc.querySelector('input[type="number"]') as HTMLInputElement
    await act(async () => Simulate.change(width, { target: { valueAsNumber: 2 } } as never))
    assert.equal(width.value, '2')
    await act(async () => Simulate.click(doc.querySelector('[aria-label="Reset body width"]')!))
    assert.equal(width.value, '0.85')
    await act(async () => Simulate.change(doc.querySelector('textarea')!, { target: { value: '{broken' } } as never))
    await withGlbExporterFileReader(async () => {
      await act(async () => { Simulate.click(button('Apply recipe')); await new Promise(resolve => setTimeout(resolve, 100)) })
    })
    assert.equal(patches, 1)
    assert.ok(String(props.modelUrl).startsWith('data:model/gltf-binary;base64,'))
    const saved = await restoreProceduralAssetWorkspace({ fs, manifestPath: String(props.proceduralAssetManifestPath) })
    try { assert.equal(saved.snapshot.draft, '{broken'); assert.deepEqual(saved.snapshot.lastValid, session.snapshot.lastValid) } finally { saved.dispose() }
    const restored = ProceduralAssetSession.restore(String(props.proceduralAssetDocument))
    try {
      assert.equal(restored.snapshot.draft, '{broken')
      assert.deepEqual(restored.snapshot.lastValid, session.snapshot.lastValid)
    } finally { restored.dispose() }
    assert.equal((doc.querySelector('textarea') as HTMLTextAreaElement).value, '{broken')
    assert.ok(doc.querySelector('[role="alert"]')?.textContent)
    assert.equal(doc.querySelector('a[download]')?.getAttribute('href'), props.modelUrl)
    useGraphStore.setState({ markdownDocumentName: '/other.md' })
    await act(async () => Simulate.click(button('Apply controls')))
    assert.equal(patches, 1, 'an inactive source document cannot be edited')
    assert.match(doc.querySelector('[role="alert"]')?.textContent || '', /source document/)
    useGraphStore.setState({ markdownDocumentName: '/controls.md' })
    let completeFs: (() => void) | undefined
    resolveFs = () => new Promise(resolve => { completeFs = () => resolve(fs) })
    await act(async () => Simulate.click(button('Apply controls')))
    assert.ok(completeFs, 'save reached the asynchronous workspace boundary')
    useGraphStore.setState({ graphDataRevision: source.graphDataRevision + 1 })
    await act(async () => completeFs!())
    assert.equal(patches, 1, 'graph changes invalidate a pending control edit')
    assert.match(doc.querySelector('[role="alert"]')?.textContent || '', /Document changed/)
  } finally {
    await act(async () => root.unmount())
    session.dispose()
    useGraphStore.setState({ markdownDocumentName: source.markdownDocumentName, markdownDocumentText: source.markdownDocumentText, graphDataRevision: source.graphDataRevision })
    env.restore()
  }
}
