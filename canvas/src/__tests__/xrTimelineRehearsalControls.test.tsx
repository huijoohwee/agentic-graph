import assert from 'node:assert/strict'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { settleWorkspaceSourceTextWrites } from '@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'
import yaml from 'js-yaml'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { upsertFrontmatterFlowMarkdownText } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { XrShootCameraSection } from '@/features/strybldr/XrShootCameraSection'
import { XrAnimationFloatingPanelView } from '@/features/three/XrAnimationFloatingPanelView'
import { XrRehearsalStatus } from '@/features/three/XrRehearsalStatus'
import { controlXrSharedAssetControls, inspectXrSharedAssetControls } from '@/features/three/xrSharedAssetControlRuntime'
import { serializeXrMotionReferencePlan } from '@/features/three/xrMotionReferenceModel'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { XrCameraMotionSection } from '@/features/three/XrCameraMotionSection'
import { XrTimelineRehearsalControls } from '@/features/three/XrTimelineRehearsalControls'
import { controlLocalAnimation, inspectLocalAnimation } from '@/features/three/xrAnimationMcpRuntime'
import { hydrateXrMotionReferenceRuntime, readXrMotionReferenceRuntime, markXrMotionReferenceSaved } from '@/features/three/xrMotionReferenceRuntime'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { sampleXrTimelineSceneObjects } from '@/features/three/xrTimelineSceneProjection'

export async function testXrTimelineRehearsalControlsPreserveSharedTransport() {
  const prior = useGraphStore.getState()
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = env.dom.window.document.getElementById('root')!
  const root = createRoot(container)
  try {
    completeSourceFilesBootstrap()
    useGraphStore.setState({ markdownDocumentName: 'Rehearsal.md', markdownDocumentText: '# Rehearsal',
      graphData: { type: 'Graph', nodes: [], edges: [], metadata: {} } })
    hydrateXrMotionReferenceRuntime({ sceneKey: 'rehearsal-buttons', nodes: [], persistedValue: { fps: 30, durationSeconds: 2 } })
    assert.equal(controlLocalAnimation({ invocation: '/animation.control @canvas operation=scrub frame=0' }).ok, true)
    await mountReactRoot(root, <XrTimelineRehearsalControls durationSeconds={2} fps={30} />)
    const button = (name: string) => container.querySelector<HTMLButtonElement>(`[aria-label="${name} XR animation frame"]`)!
    assert.equal(button('Previous').disabled, true)
    await act(async () => { controlLocalAnimation({ invocation: '/animation.control @canvas operation=play rate=0.25' }) })
    const authored = JSON.stringify(readXrMotionReferenceRuntime().plan)
    await act(async () => { button('Next').click() })
    assert.equal(inspectLocalAnimation().runtime.transport.frame, 1)
    assert.equal(inspectLocalAnimation().runtime.transport.playing, false)
    assert.equal(inspectLocalAnimation().runtime.transport.playbackRate, 0.25)
    assert.match(container.textContent!, /Frame 1 · 30 fps/)
    await act(async () => { button('Previous').click() })
    assert.equal(inspectLocalAnimation().runtime.transport.frame, 0)
    assert.equal(button('Previous').disabled, true)
    await act(async () => { controlLocalAnimation({ invocation: '/animation.control @canvas operation=scrub frame=60' }) })
    assert.equal(button('Next').disabled, true)
    assert.equal(JSON.stringify(readXrMotionReferenceRuntime().plan), authored)
    await mountReactRoot(root, <XrTimelineRehearsalControls durationSeconds={2} fps={30} disabled />)
    assert.equal(button('Previous').disabled, true)
    assert.equal(button('Next').disabled, true)
  } finally {
    await unmountReactRoot(root)
    useGraphStore.setState(prior)
    env.restore()
  }
}

export async function testXrTimelineSceneCuesShareSelectionAndTransport() {
  const prior = useGraphStore.getState()
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = env.dom.window.document.getElementById('root')!
  const root = createRoot(container)
  try {
    completeSourceFilesBootstrap()
    const nodes = [{ id: 'actor', label: 'Courier', type: 'Entity', properties: {} }, { id: 'prop', label: 'Parcel', type: 'Entity', properties: {} }]
    useGraphStore.setState({ markdownDocumentName: 'Cues.md', markdownDocumentText: '# Cues',
      graphData: { type: 'Graph', nodes, edges: [], metadata: {} } })
    hydrateXrMotionReferenceRuntime({ sceneKey: 'scene-cues', nodes, persistedValue: {
      fps: 30, durationSeconds: 2,
      cast: [{ actorId: 'actor', marks: [
        { timeSeconds: 0.125, position: [0, 0, 0], transition: 'linear', gait: 'walk' },
        { timeSeconds: 2, position: [2, 0, 0], transition: 'hold', gait: 'walk' },
      ] }, { actorId: 'prop', marks: [{ timeSeconds: 0.125, position: [3, 0, 0], transition: 'hold' }] }],
      camera: [{ timeSeconds: 1, anchorId: 'actor', rig: 'dolly' }],
    } })
    useGraphStore.setState({ graphData: { type: 'Graph', nodes, edges: [], metadata: { kgXrMotionReference: serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan) } } })
    hydrateCanonicalXrMotionReferenceRuntime()
    const plan = readXrMotionReferenceRuntime().plan
    const authored = JSON.stringify(plan)
    assert.equal(sampleXrTimelineSceneObjects(plan, 0)[0]!.motion, 'hold')
    assert.equal(sampleXrTimelineSceneObjects(plan, 1)[0]!.motion, 'walk · linear')
    assert.deepEqual(sampleXrTimelineSceneObjects(plan, 2)[0]!.position, [2, 0, 0])
    assert.equal(sampleXrTimelineSceneObjects(plan, 2)[0]!.motion, 'hold')
    assert.equal(sampleXrTimelineSceneObjects(plan, 1)[1]!.motion, 'hold')
    const withAnimation = { ...plan, cast: [{ ...plan.cast[0]!, animation: {
      kind: 'character-motion' as const, presetId: 'dance' as const, startTimeSeconds: 0.5, loop: true,
    } }, ...plan.cast.slice(1)], subjects: [{ id: 'actor', label: 'Courier', assetId: 'person',
      category: 'people' as const, position: [0, 0, 0] as const, color: '#ffffff', rotationYDegrees: 0, scale: 1 }] }
    assert.equal(sampleXrTimelineSceneObjects(withAnimation, 1).filter(object => object.id === 'actor').length, 1)
    const held = { ...plan, cast: [{ ...plan.cast[0]!, marks: plan.cast[0]!.marks.map(mark => ({ ...mark, transition: 'hold' as const })) }] }
    assert.equal(sampleXrTimelineSceneObjects(held, 1)[0]!.motion, 'hold')
    assert.deepEqual(sampleXrTimelineSceneObjects(held, 1)[0]!.position, [0, 0, 0])
    controlLocalAnimation({ invocation: '/animation.control @canvas operation=scrub frame=0' })
    await mountReactRoot(root, <><XrCameraMotionSection /><XrRehearsalStatus /></>)
    assert.equal(container.querySelector('[aria-label="XR scene overview"]'), null)
    assert.equal(container.querySelectorAll('[aria-label="Gantt-Timeline transport"]').length, 1)
    assert.equal(container.querySelector('[aria-label="Jump to authored beat"]'), null, 'no duplicate cue picker')
    assert.ok(container.querySelector('[aria-label="XR frame rehearsal"]')!.closest('.timeline-player'))
    assert.equal(container.querySelectorAll('[data-kg-xr-lane-cast-mark]').length, 3)
    assert.equal(container.querySelectorAll('[data-kg-xr-lane-camera-mark]').length, 1)
    const castMark = () => container.querySelector<HTMLElement>('[data-kg-xr-choreography-cast-lane="actor"] [data-kg-xr-lane-cast-mark="1"]')!
    const cameraMark = () => container.querySelector<HTMLElement>('[data-kg-xr-lane-camera-mark="1"]')!
    await act(async () => { controlLocalAnimation({ invocation: '/animation.control @canvas operation=play rate=0.25' }) })
    await act(async () => { assert.equal(controlXrSharedAssetControls({ operation: 'select-target', targetId: 'npc-scout' }).ok, true) })
    assert.equal(inspectXrSharedAssetControls().selectedKind, 'npc')
    await act(async () => { castMark().click() })
    assert.equal(inspectLocalAnimation().runtime.transport.timeSeconds, 0.125)
    assert.equal(inspectLocalAnimation().runtime.transport.playing, false)
    assert.equal(inspectLocalAnimation().runtime.transport.playbackRate, 0.25)
    assert.equal(useGraphStore.getState().selectedNodeId, 'actor')
    assert.equal(inspectXrSharedAssetControls().selectedKind, 'object')
    assert.equal(inspectXrSharedAssetControls().selectedTargetId, 'actor')
    assert.equal(readXrMotionReferenceRuntime().selectedMark?.kind, 'cast')
    await act(async () => { cameraMark().dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    assert.equal(inspectLocalAnimation().runtime.transport.frame, 30)
    assert.match(container.querySelector('[aria-label="Shared Timeline rehearsal"]')!.textContent!, /Frame 30 · 30 fps · 0.25× · Paused/)
    assert.equal(readXrMotionReferenceRuntime().selectedMark?.kind, 'camera')
    assert.match(container.querySelector('[data-kg-xr-shot-target-bar="actor"]')!.textContent!, /walk · linear · \(0.9, 0.0, 0.0\)/)
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Link SHOOT to 3D Object Parcel"]')!.click() })
    assert.equal(readXrMotionReferenceRuntime().selectedShotTargetId, 'prop')
    assert.equal(useGraphStore.getState().selectedNodeId, 'prop')
    assert.equal(inspectLocalAnimation().runtime.transport.frame, 30)
    assert.equal(JSON.stringify(readXrMotionReferenceRuntime().plan), authored)
    await act(async () => { useGraphStore.setState({ canvasRenderMode: '3d', canvas3dMode: 'xr' }) })
    const cameraHost = env.dom.window.document.createElement('div')
    container.appendChild(cameraHost)
    const cameraRoot = createRoot(cameraHost)
    try {
      await mountReactRoot(cameraRoot, <XrShootCameraSection />)
      await act(async () => { controlXrSharedAssetControls({ operation: 'select-target', targetId: 'npc-scout' }) })
      const cameraTarget = cameraHost.querySelector<HTMLSelectElement>('[aria-label="SHOOT scene or 3D object target"]')!
      assert.equal(cameraTarget.value, '', 'Camera must not present the prior authored object as a selected NPC')
      assert.equal(cameraTarget.disabled, false)
      await mountReactRoot(cameraRoot, <XrAnimationFloatingPanelView />)
      assert.match(cameraHost.textContent!, /No cast target selected/)
      const presetButtons = [...cameraHost.querySelectorAll<HTMLButtonElement>('[data-kg-animation-card-apply]')]
      assert.ok(presetButtons.length > 0 && presetButtons.every(button => button.disabled))
      await mountReactRoot(cameraRoot, <XrShootCameraSection />)
      const restoredCameraTarget = cameraHost.querySelector<HTMLSelectElement>('[aria-label="SHOOT scene or 3D object target"]')!
      await act(async () => {
        restoredCameraTarget.value = 'actor'
        restoredCameraTarget.dispatchEvent(new env.dom.window.Event('change', { bubbles: true }))
      })
      assert.equal(inspectXrSharedAssetControls().selectedKind, 'object')
      assert.equal(inspectXrSharedAssetControls().selectedTargetId, 'actor')
      assert.equal(useGraphStore.getState().selectedNodeId, 'actor')
      assert.equal(inspectLocalAnimation().runtime.transport.frame, 30)
      assert.match(cameraHost.querySelector('[aria-label="Shared Timeline rehearsal"]')!.textContent!, /Frame 30 · 30 fps · 0.25× · Paused/)
    } finally {
      await unmountReactRoot(cameraRoot)
      cameraHost.remove()
    }
    await act(async () => { useGraphStore.setState({ canvasRenderMode: '3d', canvas3dMode: 'xr' }) })
    assert.ok(castMark(), `cast lane retained: ${JSON.stringify(readXrMotionReferenceRuntime().plan.cast.map(track => track.actorId))}`)
    const axis = castMark().closest<HTMLElement>('[data-kg-xr-choreography-lane-axis="1"]')!
    axis.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 60, right: 1000, bottom: 60, x: 0, y: 0, toJSON: () => ({}) })
    await act(async () => { castMark().dispatchEvent(new env.dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: 50 })) })
    await act(async () => { env.dom.window.dispatchEvent(new env.dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 100 })) })
    await act(async () => { env.dom.window.dispatchEvent(new env.dom.window.MouseEvent('pointerup', { bubbles: true, clientX: 100 })); castMark().click() })
    assert.notEqual(readXrMotionReferenceRuntime().plan.cast[0]!.marks[0]!.timeSeconds, 0.125)
    assert.equal(inspectLocalAnimation().runtime.transport.timeSeconds, 1, 'retiming must not also seek')
    const loadPlan = async (nextPlan: typeof plan) => {
      await act(async () => {
        markXrMotionReferenceSaved(serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan))
        useGraphStore.setState({ graphData: { type: 'Graph', nodes, edges: [], metadata: { kgXrMotionReference: serializeXrMotionReferencePlan(nextPlan) } } })
        hydrateCanonicalXrMotionReferenceRuntime()
      })
    }
    await loadPlan({ ...withAnimation, subjects: [] })
    const animationClip = container.querySelector<HTMLElement>('[data-kg-gantt-timeline-track-row-key*="xr_animation_effect_actor"] button.timeline-transport-track-clip-move')
    assert.ok(animationClip, 'animation cue uses the existing effect clip')
    await act(async () => { animationClip.click() })
    assert.equal(inspectLocalAnimation().runtime.transport.timeSeconds, 0.5)
    assert.equal(inspectXrSharedAssetControls().selectedTargetId, 'actor')
    assert.equal(container.querySelectorAll('[data-kg-xr-lane-cast-mark]').length, 3, 'animation does not add duplicate cast markers')
    const objectLane = container.querySelector<HTMLElement>('[data-kg-xr-shot-target-lane="actor"]')!
    objectLane.getBoundingClientRect = axis.getBoundingClientRect
    const addAtPointer = async () => act(async () => {
      container.querySelector('[data-kg-xr-shot-target-bar="actor"]')!.dispatchEvent(new env.dom.window.MouseEvent('dblclick', { bubbles: true, clientX: 14 + 972 * 0.15 }))
    })
    await addAtPointer()
    const created = readXrMotionReferenceRuntime().plan.cast[0]!.marks.find(mark => mark.timeSeconds === 1.5)
    assert.ok(created, 'double-click creates a mark at the clicked authored frame')
    assert.equal(readXrMotionReferenceRuntime().selectedMark?.markId, created.id)
    assert.equal(inspectLocalAnimation().runtime.transport.timeSeconds, 1.5)
    assert.equal(readXrMotionReferenceRuntime().dirty, true, 'native Save owns mark persistence')
    assert.equal(readXrMotionReferenceRuntime().plan.cast[0]!.marks.length, 3)
    await addAtPointer()
    assert.equal(readXrMotionReferenceRuntime().plan.cast[0]!.marks.length, 3, 'same-time creation selects without duplication')
    const existingMark = container.querySelector<HTMLElement>('[aria-label="Courier mark 2 at 1.5 seconds"]')!
    await act(async () => { existingMark.dispatchEvent(new env.dom.window.MouseEvent('dblclick', { bubbles: true, clientX: 250 })) })
    assert.equal(readXrMotionReferenceRuntime().plan.cast[0]!.marks.length, 3, 'double-clicking a marker does not create another')
    await act(async () => { controlLocalAnimation({ operation: 'scrub', timeSeconds: 1.7 }) })
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Add cast mark at playhead"]')!.click() })
    assert.ok(readXrMotionReferenceRuntime().plan.cast[0]!.marks.some(mark => mark.timeSeconds === 1.7), 'selected editor supports keyboard/tap creation')
    await loadPlan({ ...plan, durationSeconds: 10, cast: [{ ...plan.cast[0]!, marks: [{ ...plan.cast[0]!.marks[0]!, timeSeconds: 0, position: [0, 4, 0] }] }],
      subjects: [{ id: 'actor', label: 'Courier', assetId: 'vehicle-helicopter', category: 'vehicles', position: [0, 4, 0], color: '#ffffff', rotationYDegrees: 0, scale: 1 }] })
    await act(async () => { controlLocalAnimation({ operation: 'scrub', timeSeconds: 0 }) })
    await mountReactRoot(root, <><XrCameraMotionSection /><XrAnimationFloatingPanelView /></>)
    await act(async () => { castMark().click() })
    const presetSelect = () => container.querySelector<HTMLSelectElement>('[aria-label="XR animation preset"]')!
    await act(async () => {
      presetSelect().value = 'helicopter-orbit'
      presetSelect().dispatchEvent(new env.dom.window.Event('change', { bubbles: true }))
    })
    assert.equal(presetSelect().value, 'helicopter-orbit')
    assert.equal(container.querySelector('[data-kg-animation-card="helicopter-orbit"]')!.getAttribute('data-kg-animation-card-applied'), '1')
    assert.match(container.querySelector('[data-kg-xr-choreography-card="cast"]')!.textContent!, /Helicopter orbit/)
    assert.equal(readXrMotionReferenceRuntime().selectedMark?.kind, 'cast', 'replacement path retains an editable Timeline mark')
    const pathCount = readXrMotionReferenceRuntime().plan.cast[0]!.marks.length
    assert.ok(pathCount > 1)
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-kg-animation-clear="selected-actor"]')!.click() })
    assert.equal(presetSelect().value, '')
    assert.equal(container.querySelector('[data-kg-animation-card="helicopter-orbit"]')!.getAttribute('data-kg-animation-card-applied'), '0')
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-kg-animation-card-apply="helicopter-orbit"]')!.click() })
    assert.equal(presetSelect().value, 'helicopter-orbit', 'FloatingPanel apply updates the existing Timeline preset')
    assert.equal(readXrMotionReferenceRuntime().plan.cast[0]!.marks.length, pathCount)
    assert.equal(inspectLocalAnimation().runtime.transport.timeSeconds, 0, 'assignment preserves the shared playhead')
    await mountReactRoot(root, <XrTimelineRehearsalControls durationSeconds={2} fps={30} disabled />)
    assert.ok([...container.querySelectorAll<HTMLButtonElement>('button')].every(button => button.disabled))
    assert.equal(container.querySelector('[aria-label="XR scene overview"]'), null)
    assert.equal(container.querySelector('[aria-label="Jump to authored beat"]'), null)
  } finally {
    await unmountReactRoot(root)
    useGraphStore.setState(prior)
    env.restore()
  }
}

export async function testXrTimelineAuthoredCuesSurviveSourceReparse() {
  const prior = useGraphStore.getState()
  const env = initJsdomHarness()
  resetWorkspaceFsForTests()
  try {
    completeSourceFilesBootstrap()
    const nodes = [{ id: 'courier', label: 'Courier', type: 'Entity', properties: {} }]
    const original = '---\ntitle: Rehearsal\ncustom:\n  kgXrMotionReference: nested\nkgXrMotionReference: {fps: 12, durationSeconds: 6}\n"buyer note": preserved\n---\n\n# Keep this body\n'
    useGraphStore.setState({ markdownDocumentName: '/notes/authoring-sync.md', markdownDocumentText: original,
      sourceFiles: [{ id: 'authoring-sync', name: '/notes/authoring-sync.md', text: original, enabled: true, status: 'parsed', source: { kind: 'local', path: 'workspace:/notes/authoring-sync.md' } }], graphData: { type: 'Graph', context: 'frontmatter-flow', nodes, edges: [],
        metadata: { kgXrMotionReference: { fps: 12, durationSeconds: 6 } } } })
    hydrateCanonicalXrMotionReferenceRuntime()
    assert.equal(controlLocalAnimation({ operation: 'apply', presetId: 'dance', targetId: 'courier' }).ok, true)
    const authored = JSON.stringify(readXrMotionReferenceRuntime().plan)
    const text = useGraphStore.getState().markdownDocumentText!
    assert.ok(text.endsWith('\n\n# Keep this body\n'))
    assert.equal(useGraphStore.getState().sourceFiles[0]!.text, text, 'Editor and Source Files share the saved plan')
    await settleWorkspaceSourceTextWrites()
    assert.equal(await (await getWorkspaceFs()).readFileText('/notes/authoring-sync.md'), text, 'the active source path is written through the native workspace queue')
    const frontmatter = yaml.load(extractYamlFrontmatterBlock(text)!.yamlText) as Record<string, unknown>
    assert.deepEqual(frontmatter.custom, { kgXrMotionReference: 'nested' })
    assert.equal(frontmatter['buyer note'], 'preserved')
    assert.equal((text.match(/^kgXrMotionReference:/gm) || []).length, 1)
    assert.equal(upsertFrontmatterFlowMarkdownText(text, useGraphStore.getState().graphData!), text)
    useGraphStore.setState({ graphData: { type: 'Graph', context: 'frontmatter-flow', nodes, edges: [],
      metadata: { frontmatterMeta: frontmatter as never } } })
    hydrateCanonicalXrMotionReferenceRuntime()
    assert.equal(JSON.stringify(readXrMotionReferenceRuntime().plan), authored)
    assert.equal(readXrMotionReferenceRuntime().plan.cast[0]?.animation?.presetId, 'dance')
  } finally {
    await settleWorkspaceSourceTextWrites()
    useGraphStore.setState(prior)
    resetWorkspaceFsForTests()
    env.restore()
  }
}
