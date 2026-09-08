import assert from 'node:assert/strict'
import {
  captureNativeGeospatialMapLibreLease,
  claimMapLibreMapLease,
  NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
} from 'gympgrph'
import { useGraphStore } from '@/hooks/useGraphStore'
import { activateFirstImportedWorkspaceFile } from '@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'
import { waitForCanvasFrontmatterSurfaceTransition } from '@/features/parsers/canvasFrontmatterSurfaceTransition'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testImportedWorkspaceActivationSettlesSurfaceBeforeReturning() {
  const { restore } = initJsdomHarness()
  const failures: unknown[] = []
  let surfaceTail: Promise<void> | null = null
  let activationStarted = false
  try {
    useGraphStore.getState().resetAll()
    const path = '/surface-completion.md'
    const text = [
      '---',
      'title: "Imported surface"',
      'kgCanvasRenderMode: "2d"',
      'kgCanvas2dRenderer: "storyboard"',
      'kgDocumentSemanticMode: "document"',
      'kgFrontmatterModeEnabled: true',
      '---',
      '',
      '```mermaid',
      'graph LR',
      '  A --> B',
      '```',
      '',
    ].join('\n')
    const fs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        { path, parentPath: '/', kind: 'file', name: 'surface-completion.md', text, updatedAtMs: 1 },
      ],
    })
    activationStarted = true
    const activated = await activateFirstImportedWorkspaceFile({
      fs,
      createdPaths: [path],
      applyToGraph: true,
    })
    surfaceTail = waitForCanvasFrontmatterSurfaceTransition()
    let surfaceSettled = false
    void surfaceTail.then(
      () => { surfaceSettled = true },
      () => { surfaceSettled = true },
    )
    await Promise.resolve()

    assert.equal(activated, true, 'the imported document must activate through the real store API')
    assert.equal(
      surfaceSettled,
      true,
      'successful import activation must leave its frontmatter surface transition settled',
    )
  } catch (error) {
    failures.push(error)
  } finally {
    // Even a failed completion assertion must join its exact native work before
    // closing the window that owns the surface frame and disposal timeout.
    try { if (activationStarted) await (surfaceTail ?? waitForCanvasFrontmatterSurfaceTransition()) }
    catch (error) { failures.push(error) }
    try { restore() } catch (error) { failures.push(error) }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, failures.map(error => String((error as Error)?.message ?? error)).join('; '))
  }
}

export async function testImportedWorkspaceActivationRejectsFailedSurfaceOwnership() {
  const { restore } = initJsdomHarness()
  const failures: unknown[] = []
  const expectedFailure = /MapLibre Flight sources could not be cleared before the exclusive Canvas handoff/
  let releaseLease: (() => void) | null = null
  let surfaceTail: Promise<void> | null = null
  let activationStarted = false
  try {
    assert.equal(captureNativeGeospatialMapLibreLease(), null, 'the test must not replace an existing native lease')
    useGraphStore.getState().resetAll()
    let cancellations = 0
    let disposals = 0
    releaseLease = claimMapLibreMapLease({
      map: {},
      root: null,
      ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
      prepareForDisposal: () => false,
      cancelDisposalPreparation: () => { cancellations += 1 },
      dispose: () => { disposals += 1 },
    })
    const path = '/surface-failure.md'
    const text = '---\nkgCanvasRenderMode: "2d"\n---\n\n# Failed surface handoff\n'
    const fs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        { path, parentPath: '/', kind: 'file', name: 'surface-failure.md', text, updatedAtMs: 1 },
      ],
    })
    activationStarted = true
    const activated = await activateFirstImportedWorkspaceFile({ fs, createdPaths: [path], applyToGraph: true })
    surfaceTail = waitForCanvasFrontmatterSurfaceTransition()
    await assert.rejects(surfaceTail, expectedFailure)
    assert.equal(activated, false, 'a failed native surface handoff must not report successful activation')
    assert.ok(cancellations > 0, 'failed preparation must cancel its owned disposal fence')
    assert.equal(disposals, 0, 'failed preparation must preserve the undisposed native owner')
  } catch (error) {
    failures.push(error)
  } finally {
    try {
      if (activationStarted) await (surfaceTail ?? waitForCanvasFrontmatterSurfaceTransition())
    } catch (error) {
      // The asserted native preparation failure is terminal; any other cleanup
      // rejection still fails this test and cannot disappear during teardown.
      if (!expectedFailure.test(String((error as Error)?.message ?? error))) failures.push(error)
    }
    try { releaseLease?.() } catch (error) { failures.push(error) }
    try { restore() } catch (error) { failures.push(error) }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, failures.map(error => String((error as Error)?.message ?? error)).join('; '))
  }
}
