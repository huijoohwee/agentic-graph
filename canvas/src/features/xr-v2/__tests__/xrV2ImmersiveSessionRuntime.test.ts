import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { readXrArPlacementRuntime } from '@/features/three/xrArPlacementRuntime'
import {
  installXrV2ImmersiveSessionRuntimeTestReadiness,
  readXrV2ImmersiveSession,
  registerXrV2ImmersiveRenderer,
  resolveXrV2ImmersiveMode,
  startXrV2ImmersiveSession,
  stopXrV2ImmersiveSession,
} from '../xrV2ImmersiveSessionRuntime'

test('immersive entry is admitted only by one ready pinned tier', () => {
  assert.equal(resolveXrV2ImmersiveMode({
    canOfferUserActions: false,
    capabilityTier: 'webxr-ar',
  }), null)
  assert.equal(resolveXrV2ImmersiveMode({
    canOfferUserActions: true,
    capabilityTier: 'webxr-ar',
  }), 'immersive-ar')
  assert.equal(resolveXrV2ImmersiveMode({
    canOfferUserActions: true,
    capabilityTier: 'webxr-vr',
  }), 'immersive-vr')
  assert.equal(resolveXrV2ImmersiveMode({
    canOfferUserActions: true,
    capabilityTier: 'pseudo-ar-depth-parallax',
  }), null)
  assert.equal(resolveXrV2ImmersiveMode({
    canOfferUserActions: true,
    capabilityTier: 'flat-fallback',
  }), null)
})

test('XR v2 session runtime consumes readiness and never re-probes support', () => {
  const source = readFileSync(new URL('../xrV2ImmersiveSessionRuntime.ts', import.meta.url), 'utf8')
  assert.match(source, /readXrV2WorkspaceReadiness/)
  assert.doesNotMatch(source, /reportXrV2ImmersiveSessionObservation/)
  assert.doesNotMatch(source, /isSessionSupported/)
  assert.match(source, /requestSession/)
})

test('a browser-ended VR session clears placement ownership and detaches the renderer', async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let onEnd: (() => void) | null = null
  const legacySession = { legacy: true }
  let attachedSession: object | null = legacySession
  let requestObservedAfterRelease = false
  const session = {
    requestReferenceSpace: async () => ({}),
    addEventListener: (type: string, listener: () => void) => { if (type === 'end') onEnd = listener },
    removeEventListener: () => undefined,
    end: async () => undefined,
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { xr: { requestSession: async () => {
      requestObservedAfterRelease = attachedSession === null
      return session
    } } },
  })
  const renderer = {
    xr: {
      enabled: false,
      getSession: () => attachedSession,
      setSession: async (next: object | null) => { attachedSession = next },
      setReferenceSpaceType: () => undefined,
      setReferenceSpace: () => undefined,
    },
  }
  const restoreReadiness = installXrV2ImmersiveSessionRuntimeTestReadiness(() => ({
    canOfferUserActions: true,
    capabilityTier: 'webxr-vr',
  }) as ReturnType<typeof import('../xrV2WorkspaceReadinessRuntime').readXrV2WorkspaceReadiness>)
  const releaseRenderer = registerXrV2ImmersiveRenderer(renderer as never)
  try {
    setTimeout(() => { if (attachedSession === legacySession) attachedSession = null }, 10)
    assert.equal((await startXrV2ImmersiveSession()).phase, 'active')
    assert.equal(requestObservedAfterRelease, true)
    assert.equal(readXrArPlacementRuntime().immersiveSessionActive, true)
    assert.ok(onEnd)
    onEnd!()
    await Promise.resolve()
    assert.equal(readXrV2ImmersiveSession().phase, 'ready')
    assert.equal(readXrArPlacementRuntime().immersiveSessionActive, false)
    assert.equal(attachedSession, null)
  } finally {
    await stopXrV2ImmersiveSession()
    releaseRenderer()
    restoreReadiness()
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else delete (globalThis as { navigator?: unknown }).navigator
  }
})
