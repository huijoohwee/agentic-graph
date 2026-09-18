import assert from 'node:assert/strict'
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
import { XrTimelineRehearsalControls } from '@/features/three/XrTimelineRehearsalControls'
import { controlLocalAnimation, inspectLocalAnimation } from '@/features/three/xrAnimationMcpRuntime'
import { hydrateXrMotionReferenceRuntime, readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { activeXrTimelineBeatTime, buildXrTimelineBeats, sampleXrTimelineSceneObjects } from '@/features/three/xrTimelineSceneProjection'

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
    const beats = buildXrTimelineBeats(plan)
    assert.deepEqual(beats.map(beat => beat.timeSeconds), [0.125, 0.125, 1, 2])
    assert.equal(new Set(beats.map(beat => beat.id)).size, 4)
    assert.equal(activeXrTimelineBeatTime(beats, 0), null)
    assert.equal(activeXrTimelineBeatTime(beats, 0.5), 0.125)
    assert.equal(activeXrTimelineBeatTime(beats, 2), 2)
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
    assert.equal(buildXrTimelineBeats(withAnimation).find(beat => beat.kind === 'animation')?.timeSeconds, 0.5)
    const held = { ...plan, cast: [{ ...plan.cast[0]!, marks: plan.cast[0]!.marks.map(mark => ({ ...mark, transition: 'hold' as const })) }] }
    assert.equal(sampleXrTimelineSceneObjects(held, 1)[0]!.motion, 'hold')
    assert.deepEqual(sampleXrTimelineSceneObjects(held, 1)[0]!.position, [0, 0, 0])
    controlLocalAnimation({ invocation: '/animation.control @canvas operation=scrub frame=0' })
    await mountReactRoot(root, <><XrTimelineRehearsalControls durationSeconds={2} fps={30} /><XrRehearsalStatus /></>)
    assert.equal(container.querySelector('[aria-label="XR scene overview"]'), null)
    await import('@/features/three/XrTimelineSceneOverview')
    const toggle = container.querySelector<HTMLButtonElement>('[aria-expanded]')!
    await act(async () => { toggle.click() })
    assert.equal(toggle.getAttribute('aria-expanded'), 'true')
    assert.equal(container.querySelectorAll('[aria-current="step"]').length, 0)
    await act(async () => { controlLocalAnimation({ invocation: '/animation.control @canvas operation=play rate=0.25' }) })
    await act(async () => { assert.equal(controlXrSharedAssetControls({ operation: 'select-target', targetId: 'npc-scout' }).ok, true) })
    assert.equal(inspectXrSharedAssetControls().selectedKind, 'npc')
    const cue = container.querySelector<HTMLButtonElement>('[aria-label^="Jump to Courier"]')!
    await act(async () => { cue.click() })
    assert.equal(inspectLocalAnimation().runtime.transport.timeSeconds, 0.125)
    assert.equal(inspectLocalAnimation().runtime.transport.playing, false)
    assert.equal(inspectLocalAnimation().runtime.transport.playbackRate, 0.25)
    assert.equal(useGraphStore.getState().selectedNodeId, 'actor')
    assert.equal(inspectXrSharedAssetControls().selectedKind, 'object')
    assert.equal(inspectXrSharedAssetControls().selectedTargetId, 'actor')
    assert.equal(readXrMotionReferenceRuntime().selectedMark?.kind, 'cast')
    assert.equal(container.querySelectorAll('[aria-current="step"]').length, 2)
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label^="Jump to Camera"]')!.click() })
    assert.equal(inspectLocalAnimation().runtime.transport.frame, 30)
    assert.match(container.querySelector('[aria-label="Shared Timeline rehearsal"]')!.textContent!, /Frame 30 · 30 fps · 0.25× · Paused/)
    assert.equal(readXrMotionReferenceRuntime().selectedMark?.kind, 'camera')
    assert.match(container.querySelector('[aria-label="Select scene object Courier"]')!.textContent!, /walk · linear · \(0.9, 0.0, 0.0\)/)
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Select scene object Parcel"]')!.click() })
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
    await mountReactRoot(root, <><XrTimelineRehearsalControls durationSeconds={2} fps={30} disabled /><XrRehearsalStatus /></>)
    assert.ok([...container.querySelectorAll<HTMLButtonElement>('[aria-label^="Jump to"], [aria-label^="Select scene object"]')].every(button => button.disabled))
    await act(async () => { toggle.click() })
    assert.equal(container.querySelector('[aria-label="XR scene overview"]'), null)
    await act(async () => { hydrateXrMotionReferenceRuntime({ sceneKey: 'empty-cues', nodes: [], persistedValue: null }); toggle.click() })
    assert.match(container.textContent!, /No authored beats/)
    assert.match(container.textContent!, /No scene objects/)
  } finally {
    await unmountReactRoot(root)
    useGraphStore.setState(prior)
    env.restore()
  }
}

export function testXrTimelineAuthoredCuesSurviveSourceReparse() {
  const prior = useGraphStore.getState()
  try {
    completeSourceFilesBootstrap()
    const nodes = [{ id: 'courier', label: 'Courier', type: 'Entity', properties: {} }]
    const original = '---\ntitle: Rehearsal\ncustom:\n  kgXrMotionReference: nested\nkgXrMotionReference: {fps: 12, durationSeconds: 6}\n"buyer note": preserved\n---\n\n# Keep this body\n'
    useGraphStore.setState({ markdownDocumentName: 'Authored cues.md', markdownDocumentText: original,
      sourceFiles: [], graphData: { type: 'Graph', context: 'frontmatter-flow', nodes, edges: [],
        metadata: { kgXrMotionReference: { fps: 12, durationSeconds: 6 } } } })
    hydrateCanonicalXrMotionReferenceRuntime()
    assert.equal(controlLocalAnimation({ operation: 'apply', presetId: 'dance', targetId: 'courier' }).ok, true)
    const authored = JSON.stringify(readXrMotionReferenceRuntime().plan)
    const text = useGraphStore.getState().markdownDocumentText!
    assert.ok(text.endsWith('\n\n# Keep this body\n'))
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
    useGraphStore.setState(prior)
  }
}
