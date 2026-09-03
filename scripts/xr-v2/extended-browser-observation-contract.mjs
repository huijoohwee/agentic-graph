import assert from 'node:assert/strict'

function readNumber(value, label) {
  const number = Number(value)
  assert.ok(Number.isFinite(number), `${label} must be finite; received ${String(value)}`)
  return number
}

export async function prepareXrV2MountedAuthoringObservation(page, surface) {
  const mounted = surface.locator('[data-kg-xr-v2-mounted-authoring-surface="1"]').first()
  await mounted.waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-kg-xr-v2-mounted-authoring-surface="1"]')
    return Boolean(node?.getAttribute('data-kg-xr-v2-mounted-map-uuid'))
      && node?.getAttribute('data-kg-xr-v2-mounted-compile-status') === 'ready'
      && Number(node?.getAttribute('data-kg-xr-v2-mounted-render-calls')) > 0
  }, undefined, { timeout: 30_000 })
  const canvasIdentityBefore = await mounted.getAttribute('data-kg-xr-v2-mounted-canvas-identity')
  assert.match(String(canvasIdentityBefore), /^xr-v2-mounted-authoring-canvas$/u)
  await mounted.locator('[data-kg-xr-v2-mounted-scrub="1"]').click()
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-kg-xr-v2-mounted-authoring-surface="1"]')
    return Number(node?.getAttribute('data-kg-xr-v2-mounted-bone-playhead')) === 1
      && Math.abs(Number(node?.getAttribute('data-kg-xr-v2-mounted-bone-y')) - 0.5) < 1e-6
  }, undefined, { timeout: 10_000 })
  const canvas = mounted.locator('canvas').first()
  const box = await canvas.boundingBox()
  assert.ok(box && box.width > 0 && box.height > 0, 'mounted authoring canvas must have layout')
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await page.waitForFunction(() => (
    document.querySelector('[data-kg-xr-v2-mounted-authoring-surface="1"]')
      ?.getAttribute('data-kg-xr-v2-mounted-evidence-status') === 'ready'
  ), undefined, { timeout: 15_000 })
  return Object.freeze({ canvasIdentityBefore })
}

export async function readXrV2ExtendedBrowserEvidence(surface) {
  return surface.evaluate(node => {
    const mounted = node.querySelector('[data-kg-xr-v2-mounted-authoring-surface="1"]')
    const readMounted = name => mounted?.getAttribute(name) ?? null
    return {
      connectedPreviewSchema: node.getAttribute('data-kg-xr-v2-connected-preview-schema'),
      connectedPreviewTransport: node.getAttribute('data-kg-xr-v2-connected-preview-transport'),
      connectedPreviewAuthorRevision: node.getAttribute('data-kg-xr-v2-connected-preview-author-revision'),
      connectedPreviewViewerRevision: node.getAttribute('data-kg-xr-v2-connected-preview-viewer-revision'),
      connectedPreviewApplied: node.getAttribute('data-kg-xr-v2-connected-preview-applied'),
      connectedPreviewLatencyMs: node.getAttribute('data-kg-xr-v2-connected-preview-latency-ms'),
      connectedPreviewWithinCeiling: node.getAttribute('data-kg-xr-v2-connected-preview-within-ceiling'),
      connectedPreviewNavigationBefore: node.getAttribute('data-kg-xr-v2-connected-preview-navigation-before'),
      connectedPreviewNavigationAfter: node.getAttribute('data-kg-xr-v2-connected-preview-navigation-after'),
      connectedPreviewDocumentPreserved: node.getAttribute('data-kg-xr-v2-connected-preview-document-preserved'),
      encodedTrackSchema: node.getAttribute('data-kg-xr-v2-encoded-track-schema'),
      encodedTrackByteSize: node.getAttribute('data-kg-xr-v2-encoded-track-byte-size'),
      encodedTrackCount: node.getAttribute('data-kg-xr-v2-encoded-track-count'),
      encodedTrackSourceCodecs: node.getAttribute('data-kg-xr-v2-encoded-track-source-codecs'),
      encodedTrackPackagedCodecs: node.getAttribute('data-kg-xr-v2-encoded-track-packaged-codecs'),
      encodedTrackSourceSamples: node.getAttribute('data-kg-xr-v2-encoded-track-source-samples'),
      encodedTrackDecodedSourceFrames: node.getAttribute('data-kg-xr-v2-encoded-track-decoded-source-frames'),
      encodedTrackPackagedSamples: node.getAttribute('data-kg-xr-v2-encoded-track-packaged-samples'),
      encodedTrackPayloadsVerified: node.getAttribute('data-kg-xr-v2-encoded-track-payloads-verified'),
      encodedTrackSeekHeadCount: node.getAttribute('data-kg-xr-v2-encoded-track-seek-head-count'),
      encodedTrackCueCount: node.getAttribute('data-kg-xr-v2-encoded-track-cue-count'),
      encodedTrackDecodedWidth: node.getAttribute('data-kg-xr-v2-encoded-track-decoded-width'),
      encodedTrackDecodedHeight: node.getAttribute('data-kg-xr-v2-encoded-track-decoded-height'),
      encodedTrackDuration: node.getAttribute('data-kg-xr-v2-encoded-track-duration'),
      encodedTrackSeekTime: node.getAttribute('data-kg-xr-v2-encoded-track-seek-time'),
      encodedTrackPlayback: node.getAttribute('data-kg-xr-v2-encoded-track-playback'),
      encodedTrackSourceReleased: node.getAttribute('data-kg-xr-v2-encoded-track-source-released'),
      mountedSchema: readMounted('data-kg-xr-v2-mounted-evidence-schema'),
      mountedStatus: readMounted('data-kg-xr-v2-mounted-evidence-status'),
      mountedSourceDigest: readMounted('data-kg-xr-v2-mounted-source-digest'),
      mountedEntityIds: readMounted('data-kg-xr-v2-mounted-entity-ids'),
      mountedRenderQuery: readMounted('data-kg-xr-v2-mounted-render-query'),
      mountedCanvasIdentity: readMounted('data-kg-xr-v2-mounted-canvas-identity'),
      mountedCanvasConnected: readMounted('data-kg-xr-v2-mounted-canvas-connected'),
      mountedMapUuid: readMounted('data-kg-xr-v2-mounted-map-uuid'),
      mountedMaterialStatus: readMounted('data-kg-xr-v2-mounted-material-status'),
      mountedParticleCapacity: readMounted('data-kg-xr-v2-mounted-particle-capacity'),
      mountedParticleLive: readMounted('data-kg-xr-v2-mounted-particle-live'),
      mountedParticleHighWater: readMounted('data-kg-xr-v2-mounted-particle-high-water'),
      mountedParticlePositionVersion: readMounted('data-kg-xr-v2-mounted-particle-position-version'),
      mountedBoneName: readMounted('data-kg-xr-v2-mounted-bone-name'),
      mountedBoneY: readMounted('data-kg-xr-v2-mounted-bone-y'),
      mountedBonePlayhead: readMounted('data-kg-xr-v2-mounted-bone-playhead'),
      mountedBehaviorRevision: readMounted('data-kg-xr-v2-mounted-behavior-revision'),
      mountedBehaviorEffects: readMounted('data-kg-xr-v2-mounted-behavior-effects'),
      mountedBehaviorTrigger: readMounted('data-kg-xr-v2-mounted-behavior-trigger'),
      mountedBehaviorActions: readMounted('data-kg-xr-v2-mounted-behavior-actions'),
      mountedCompileMethod: readMounted('data-kg-xr-v2-mounted-compile-method'),
      mountedCompileStatus: readMounted('data-kg-xr-v2-mounted-compile-status'),
      mountedRenderCalls: readMounted('data-kg-xr-v2-mounted-render-calls'),
      mountedObservedFrames: readMounted('data-kg-xr-v2-mounted-observed-frames'),
      mountedResourceCount: readMounted('data-kg-xr-v2-mounted-resource-count'),
      mountedDisposeCount: readMounted('data-kg-xr-v2-mounted-dispose-count'),
    }
  })
}

export async function observeXrV2MountedAuthoringDisposal(page, surface, beforeCount) {
  const mounted = surface.locator('[data-kg-xr-v2-mounted-authoring-surface="1"]').first()
  await mounted.locator('[data-kg-xr-v2-mounted-unmount="1"]').click()
  await page.waitForFunction(expectedBefore => {
    const node = document.querySelector('[data-kg-xr-v2-mounted-authoring-surface="1"]')
    return node?.getAttribute('data-kg-xr-v2-mounted-evidence-status') === 'idle'
      && Number(node?.getAttribute('data-kg-xr-v2-mounted-dispose-count')) > Number(expectedBefore)
      && !node?.querySelector('canvas')
  }, beforeCount, { timeout: 10_000 })
  const afterCount = readNumber(
    await mounted.getAttribute('data-kg-xr-v2-mounted-dispose-count'),
    'mounted disposal count after unmount',
  )
  return Object.freeze({ beforeCount, afterCount, disposedCount: afterCount - beforeCount })
}

export function assertXrV2ExtendedBrowserObservation(rawEvidence) {
  assert.equal(
    rawEvidence.connectedPreviewSchema,
    'agentic-graph-xr-v2-connected-preview-browser-observation/v1',
  )
  assert.equal(rawEvidence.connectedPreviewTransport, 'webrtc-data-channel')
  const authorRevision = readNumber(
    rawEvidence.connectedPreviewAuthorRevision,
    'connected preview author revision',
  )
  const viewerRevision = readNumber(
    rawEvidence.connectedPreviewViewerRevision,
    'connected preview viewer revision',
  )
  const latencyMs = readNumber(rawEvidence.connectedPreviewLatencyMs, 'connected preview latency')
  const navigationEntryCountBefore = readNumber(
    rawEvidence.connectedPreviewNavigationBefore,
    'connected preview navigation count before',
  )
  const navigationEntryCountAfter = readNumber(
    rawEvidence.connectedPreviewNavigationAfter,
    'connected preview navigation count after',
  )
  assert.equal(authorRevision, 1)
  assert.equal(viewerRevision, authorRevision)
  assert.equal(rawEvidence.connectedPreviewApplied, 'true')
  assert.ok(latencyMs >= 0 && latencyMs <= 250)
  assert.equal(rawEvidence.connectedPreviewWithinCeiling, 'true')
  assert.equal(navigationEntryCountAfter, navigationEntryCountBefore)
  assert.equal(rawEvidence.connectedPreviewDocumentPreserved, 'true')

  assert.equal(
    rawEvidence.encodedTrackSchema,
    'agentic-graph-xr-v2-encoded-track-browser-observation/v1',
  )
  const byteSize = readNumber(rawEvidence.encodedTrackByteSize, 'encoded-track WebM bytes')
  const trackCount = readNumber(rawEvidence.encodedTrackCount, 'encoded-track count')
  const seekHeadEntryCount = readNumber(
    rawEvidence.encodedTrackSeekHeadCount,
    'encoded-track SeekHead entries',
  )
  const cuePointCount = readNumber(rawEvidence.encodedTrackCueCount, 'encoded-track Cues')
  const decodedWidth = readNumber(rawEvidence.encodedTrackDecodedWidth, 'encoded-track decoded width')
  const decodedHeight = readNumber(rawEvidence.encodedTrackDecodedHeight, 'encoded-track decoded height')
  const durationSeconds = readNumber(rawEvidence.encodedTrackDuration, 'encoded-track duration')
  const seekTimeSeconds = readNumber(rawEvidence.encodedTrackSeekTime, 'encoded-track seek time')
  assert.ok(byteSize > 0)
  assert.equal(trackCount, 2)
  assert.equal(rawEvidence.encodedTrackSourceCodecs, 'vp8,vp9')
  assert.equal(rawEvidence.encodedTrackPackagedCodecs, rawEvidence.encodedTrackSourceCodecs)
  assert.equal(rawEvidence.encodedTrackSourceSamples, '8,8')
  assert.equal(rawEvidence.encodedTrackDecodedSourceFrames, rawEvidence.encodedTrackSourceSamples)
  assert.equal(rawEvidence.encodedTrackPackagedSamples, rawEvidence.encodedTrackSourceSamples)
  assert.equal(rawEvidence.encodedTrackPayloadsVerified, 'true')
  assert.ok(seekHeadEntryCount >= 3)
  assert.ok(cuePointCount >= 2)
  assert.ok(decodedWidth > 0 && decodedHeight > 0)
  assert.ok(durationSeconds > 0)
  assert.ok(seekTimeSeconds >= 0.05)
  assert.equal(rawEvidence.encodedTrackPlayback, 'true')
  assert.equal(rawEvidence.encodedTrackSourceReleased, 'true')

  assert.equal(rawEvidence.mountedSchema, 'agentic-graph-xr-v2-mounted-authoring-evidence/v1')
  assert.equal(rawEvidence.mountedStatus, 'ready')
  assert.match(String(rawEvidence.mountedSourceDigest), /^fnv1a32:[0-9a-f]{8}$/u)
  assert.equal(rawEvidence.mountedEntityIds, '0,1')
  assert.equal(rawEvidence.mountedRenderQuery, '0')
  assert.equal(rawEvidence.mountedCanvasIdentity, rawEvidence.mountedCanvasIdentityBefore)
  assert.equal(rawEvidence.mountedCanvasConnected, 'true')
  assert.match(String(rawEvidence.mountedMapUuid), /^[0-9a-f-]{36}$/iu)
  assert.equal(rawEvidence.mountedMaterialStatus, 'ready')
  const particleCapacity = readNumber(rawEvidence.mountedParticleCapacity, 'mounted particle capacity')
  const particleLive = readNumber(rawEvidence.mountedParticleLive, 'mounted live particles')
  const particleHighWater = readNumber(rawEvidence.mountedParticleHighWater, 'mounted particle high water')
  assert.equal(particleCapacity, 64)
  assert.ok(particleLive > 0 && particleLive <= particleCapacity)
  assert.ok(particleHighWater >= 8 && particleHighWater <= particleCapacity)
  assert.ok(readNumber(rawEvidence.mountedParticlePositionVersion, 'mounted particle buffer version') > 0)
  assert.equal(rawEvidence.mountedBoneName, 'Arm')
  assert.ok(Math.abs(readNumber(rawEvidence.mountedBoneY, 'mounted Bone y') - 0.5) < 1e-6)
  assert.equal(readNumber(rawEvidence.mountedBonePlayhead, 'mounted Bone playhead'), 1)
  assert.ok(readNumber(rawEvidence.mountedBehaviorRevision, 'mounted behavior revision') >= 1)
  assert.equal(readNumber(rawEvidence.mountedBehaviorEffects, 'mounted behavior effects'), 1)
  assert.equal(rawEvidence.mountedBehaviorTrigger, 'select')
  assert.equal(rawEvidence.mountedBehaviorActions, 'hero-burst')
  assert.match(String(rawEvidence.mountedCompileMethod), /^compile(?:Async)?$/u)
  assert.equal(rawEvidence.mountedCompileStatus, 'ready')
  assert.ok(readNumber(rawEvidence.mountedRenderCalls, 'mounted renderer calls') > 0)
  assert.ok(readNumber(rawEvidence.mountedObservedFrames, 'mounted observed frames') > 0)
  const mountedResourceCount = readNumber(rawEvidence.mountedResourceCount, 'mounted resources')
  const mountedDisposeCount = readNumber(rawEvidence.mountedDisposeCount, 'mounted disposal count')
  assert.ok(mountedResourceCount > 0 && mountedDisposeCount >= 0)

  return Object.freeze({
    connectedPreviewObservation: Object.freeze({
      schema: rawEvidence.connectedPreviewSchema,
      transport: rawEvidence.connectedPreviewTransport,
      authorRevision,
      viewerRevision,
      editApplied: true,
      latencyMs,
      withinCeiling: true,
      navigationEntryCountBefore,
      navigationEntryCountAfter,
      documentIdentityPreserved: true,
    }),
    encodedTrackContainerObservation: Object.freeze({
      schema: rawEvidence.encodedTrackSchema,
      byteSize,
      trackCount,
      sourceCodecs: String(rawEvidence.encodedTrackSourceCodecs).split(','),
      packagedCodecs: String(rawEvidence.encodedTrackPackagedCodecs).split(','),
      sourceSampleCounts: String(rawEvidence.encodedTrackSourceSamples).split(',').map(Number),
      decodedSourceFrameCounts: String(rawEvidence.encodedTrackDecodedSourceFrames).split(',').map(Number),
      packagedSampleCounts: String(rawEvidence.encodedTrackPackagedSamples).split(',').map(Number),
      exactPayloadsVerified: true,
      seekHeadEntryCount,
      cuePointCount,
      decodedWidth,
      decodedHeight,
      durationSeconds,
      seekTimeSeconds,
      playbackObserved: true,
      sourceReleased: true,
    }),
    mountedAuthoringObservation: Object.freeze({
      schema: rawEvidence.mountedSchema,
      sourceDigest: rawEvidence.mountedSourceDigest,
      entityIds: [0, 1],
      renderQuery: [0],
      canvasIdentity: rawEvidence.mountedCanvasIdentity,
      materialMapUuid: rawEvidence.mountedMapUuid,
      particleCapacity,
      particleLive,
      particleHighWater,
      boneName: rawEvidence.mountedBoneName,
      boneY: readNumber(rawEvidence.mountedBoneY, 'mounted Bone y'),
      bonePlayheadSeconds: 1,
      behaviorEffectCount: 1,
      compileMethod: rawEvidence.mountedCompileMethod,
      renderCallCount: readNumber(rawEvidence.mountedRenderCalls, 'mounted renderer calls'),
      observedFrameCount: readNumber(rawEvidence.mountedObservedFrames, 'mounted observed frames'),
      observedResourceCount: mountedResourceCount,
      disposeEventCountBeforeUnmount: mountedDisposeCount,
    }),
  })
}
