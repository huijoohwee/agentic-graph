import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { XrTimelineRehearsalControls } from '@/features/three/XrTimelineRehearsalControls'
import { controlLocalAnimation, inspectLocalAnimation } from '@/features/three/xrAnimationMcpRuntime'
import { hydrateXrMotionReferenceRuntime, readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

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
