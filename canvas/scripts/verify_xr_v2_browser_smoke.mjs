import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import {
  assertExactXrV2RawObservation,
  assertObservedXrV2MediaErrors,
  assertPinnedXrV2ContractConformance,
  assertXrV2SourceCheckoutGraph,
  parseXrV2MediaErrors,
  resolveXrV2SourceCheckoutContext,
} from '../../scripts/xr-v2/browser-smoke-contract.mjs'
import {
  assertXrV2ExtendedBrowserObservation,
  observeXrV2MountedAuthoringDisposal,
  prepareXrV2MountedAuthoringObservation,
  readXrV2ExtendedBrowserEvidence,
} from '../../scripts/xr-v2/extended-browser-observation-contract.mjs'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'
import {
  isGitAncestor,
  resolveXrV2SourceAheadGitArgs,
} from './lib/xr-v2-source-checkout-traversal.mjs'

const baseUrl = String(process.env.KG_XR_V2_SMOKE_BASE_URL || 'http://localhost:4193').replace(/\/+$/u, '')
const smokePath = '/__smoke__/xr-v2-runtime'
const smokeUrl = `${baseUrl}/knowgrph/?kgPath=${encodeURIComponent(smokePath)}`
const outputDirectory = resolve(process.cwd(), '../data/outputs')
const observationPath = resolve(outputDirectory, 'xr-v2-browser-smoke.json')
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024
function readGitText(repositoryRoot, args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  }).trim()
}
function readGitBuffer(repositoryRoot, args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  })
}
function readGitPaths(repositoryRoot, args) {
  return readGitBuffer(repositoryRoot, args)
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort()
}
function updateDigestEntry(digest, label, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')
  digest.update(label)
  digest.update('\0')
  digest.update(String(bytes.length))
  digest.update('\0')
  digest.update(bytes)
  digest.update('\0')
}
function readSourceEvidence() {
  const repositoryRoot = readGitText(process.cwd(), ['rev-parse', '--show-toplevel'])
  const sourceRevision = readGitText(repositoryRoot, ['rev-parse', 'HEAD'])
  const checkoutContext = resolveXrV2SourceCheckoutContext({
    attachedBranch: readGitText(repositoryRoot, ['branch', '--show-current']),
    environment: process.env,
    headRevision: sourceRevision,
  })
  const sourceUpstreamRef = checkoutContext.sourceCheckoutState === 'attached'
    ? readGitText(repositoryRoot, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}',
    ])
    : `origin/${checkoutContext.sourceBranch}`
  const trackedDiff = readGitBuffer(repositoryRoot, [
    'diff',
    '--binary',
    '--full-index',
    '--no-ext-diff',
    '--no-textconv',
    'HEAD',
    '--',
  ])
  const trackedPaths = readGitPaths(repositoryRoot, ['diff', '--name-only', '-z', 'HEAD', '--'])
  const untrackedPaths = readGitPaths(
    repositoryRoot,
    ['ls-files', '--others', '--exclude-standard', '-z'],
  )
  const digest = createHash('sha256')
  updateDigestEntry(digest, 'schema', 'knowgrph-git-worktree-state/v1')
  updateDigestEntry(digest, 'tracked-diff', trackedDiff)
  for (const relPath of untrackedPaths) {
    const absPath = resolve(repositoryRoot, relPath)
    const fileStat = lstatSync(absPath)
    if (fileStat.isSymbolicLink()) {
      updateDigestEntry(digest, `untracked-symlink:${relPath}`, readlinkSync(absPath))
    } else if (fileStat.isFile()) {
      const mode = fileStat.mode & 0o111 ? '100755' : '100644'
      updateDigestEntry(digest, `untracked-file:${mode}:${relPath}`, readFileSync(absPath))
    } else {
      throw new Error(`unsupported untracked worktree entry: ${relPath}`)
    }
  }
  const dirtyPaths = [...new Set([...trackedPaths, ...untrackedPaths])].sort()
  const sourceHeadTree = readGitText(repositoryRoot, ['rev-parse', 'HEAD^{tree}'])
  const worktreeDirty = dirtyPaths.length > 0
  const observedOriginMainRevision = readGitText(
    repositoryRoot,
    ['rev-parse', 'refs/remotes/origin/main'],
  )
  const sourceUpstreamRevision = readGitText(repositoryRoot, ['rev-parse', sourceUpstreamRef])
  const checkoutIdentity = assertXrV2SourceCheckoutGraph(checkoutContext, {
    originMainRevision: observedOriginMainRevision,
    parentRevisions: readGitText(repositoryRoot, ['rev-list', '--parents', '-n', '1', 'HEAD'])
      .split(/\s+/u)
      .slice(1),
    remoteHeadRevision: sourceUpstreamRevision,
  })
  return Object.freeze({
    sourceRevision,
    sourceHeadTree,
    proofSourceTree: worktreeDirty ? null : sourceHeadTree,
    ...checkoutIdentity,
    sourceUpstreamRef,
    sourceUpstreamRevision,
    sourceAheadCount: Number(readGitText(
      repositoryRoot,
      resolveXrV2SourceAheadGitArgs({
        sourceCheckoutState: checkoutContext.sourceCheckoutState,
        sourceUpstreamRef,
      }),
    )),
    sourceBehindCount: Number(readGitText(repositoryRoot, ['rev-list', '--count', `HEAD..${sourceUpstreamRef}`])),
    sourceDescendsFromUpstream: isGitAncestor(repositoryRoot, sourceUpstreamRef, 'HEAD'),
    sourceDescendsFromOriginMain: isGitAncestor(
      repositoryRoot,
      'refs/remotes/origin/main',
      'HEAD',
    ),
    upstreamSynchronized: sourceUpstreamRevision === sourceRevision,
    // This is the checkout's observed remote-tracking ref. Fetch freshness is
    // owned by the surrounding collaboration workflow, not this smoke runner.
    observedOriginMainRevision,
    worktreeState: Object.freeze({
      schema: 'knowgrph-git-worktree-state/v1',
      digest: digest.digest('hex'),
      dirty: worktreeDirty,
      pathCount: dirtyPaths.length,
      trackedPathCount: trackedPaths.length,
      untrackedPathCount: untrackedPaths.length,
    }),
  })
}

function assertCleanCommitSource(sourceEvidence) {
  assert.match(sourceEvidence.sourceRevision, /^[0-9a-f]{40}$/u)
  assert.match(sourceEvidence.sourceHeadTree, /^[0-9a-f]{40}$/u)
  assert.match(sourceEvidence.sourceCandidateRevision, /^[0-9a-f]{40}$/u)
  assert.ok(Array.isArray(sourceEvidence.sourceParentRevisions))
  for (const revision of sourceEvidence.sourceParentRevisions) assert.match(revision, /^[0-9a-f]{40}$/u)
  assert.match(sourceEvidence.sourceUpstreamRevision, /^[0-9a-f]{40}$/u)
  assert.match(sourceEvidence.observedOriginMainRevision, /^[0-9a-f]{40}$/u)
  assert.match(sourceEvidence.worktreeState.digest, /^[0-9a-f]{64}$/u)
  assert.equal(
    sourceEvidence.worktreeState.dirty,
    false,
    'XR v2 browser observation requires an exact clean commit; dirty task worktrees fail closed',
  )
  assert.equal(sourceEvidence.worktreeState.pathCount, 0)
  assert.equal(sourceEvidence.worktreeState.trackedPathCount, 0)
  assert.equal(sourceEvidence.worktreeState.untrackedPathCount, 0)
  assert.equal(sourceEvidence.proofSourceTree, sourceEvidence.sourceHeadTree)
  assert.match(
    sourceEvidence.sourceBranch,
    /^(?:main|agent\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/u,
    'XR v2 browser observation requires canonical main or a contract-shaped task branch',
  )
  assert.equal(sourceEvidence.sourceUpstreamRef, `origin/${sourceEvidence.sourceBranch}`)
  assert.equal(sourceEvidence.sourceDescendsFromUpstream, true)
  assert.equal(sourceEvidence.sourceDescendsFromOriginMain, true)
  assert.equal(sourceEvidence.sourceBehindCount, 0)
  assert.ok(Number.isSafeInteger(sourceEvidence.sourceAheadCount) && sourceEvidence.sourceAheadCount >= 0)
  assert.equal(sourceEvidence.upstreamSynchronized, sourceEvidence.sourceAheadCount === 0)
  if (sourceEvidence.sourceCheckoutState === 'github-pull-request-merge') {
    assert.equal(sourceEvidence.sourceLane, 'pull-request-integration')
    assert.equal(sourceEvidence.sourceCandidateRevision, sourceEvidence.sourceUpstreamRevision)
    assert.deepEqual(sourceEvidence.sourceParentRevisions, [
      sourceEvidence.observedOriginMainRevision,
      sourceEvidence.sourceCandidateRevision,
    ])
    assert.equal(sourceEvidence.sourceAheadCount, 1)
    assert.equal(sourceEvidence.upstreamSynchronized, false)
  } else if (sourceEvidence.sourceLane === 'canonical-main') {
    assert.equal(sourceEvidence.sourceCheckoutState, 'attached')
    assert.equal(sourceEvidence.sourceCandidateRevision, sourceEvidence.sourceRevision)
    assert.equal(sourceEvidence.sourceRevision, sourceEvidence.observedOriginMainRevision)
    assert.equal(sourceEvidence.upstreamSynchronized, true)
    assert.equal(sourceEvidence.sourceAheadCount, 0)
  } else {
    assert.equal(sourceEvidence.sourceCheckoutState, 'attached')
    assert.equal(sourceEvidence.sourceCandidateRevision, sourceEvidence.sourceRevision)
    assert.equal(sourceEvidence.sourceLane, 'task-review')
    assert.notEqual(sourceEvidence.sourceBranch, 'main')
  }
}
function readNumber(value, label) {
  const number = Number(value)
  assert.ok(Number.isFinite(number), `${label} must be finite; received ${String(value)}`)
  return number
}

async function waitForBrowserObservationQuiescence(page, collectors) {
  let priorCounts = ''
  let stableCycles = 0
  for (let attempt = 0; attempt < 5 && stableCycles < 2; attempt += 1) {
    await page.evaluate(() => new Promise(resolve => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        window.setTimeout(resolve, 100)
      }))
    }))
    const counts = `${collectors.pageErrors.length}:${collectors.mediaErrors.length}`
    stableCycles = counts === priorCounts ? stableCycles + 1 : 0
    priorCounts = counts
  }
  assert.equal(stableCycles, 2, 'browser observation collectors did not reach quiescence')
}

async function probeRevokedObjectUrl(page, revokedObjectUrl) {
  return page.evaluate(targetUrl => {
    const workerSource = [
      "self.postMessage({ kind: 'ready' })",
      'self.onmessage = async event => {',
      '  try {',
      '    const response = await fetch(event.data)',
      '    if (response.body) await response.body.cancel()',
      "    self.postMessage({ errorName: '', kind: 'result', resolved: true })",
      '  } catch (error) {',
      "    self.postMessage({ errorName: String(error && error.name || ''), kind: 'result', resolved: false })",
      '  }',
      '}',
    ].join('\n')
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
    const worker = new Worker(workerUrl)
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => reject(new Error('revoked object-URL probe timed out')), 5_000)
      const cleanup = () => {
        window.clearTimeout(timeoutId)
        worker.terminate()
        URL.revokeObjectURL(workerUrl)
      }
      worker.onerror = event => {
        cleanup()
        reject(new Error(event.message || 'revoked object-URL probe worker failed'))
      }
      worker.onmessage = event => {
        if (event.data?.kind === 'ready') {
          worker.postMessage(targetUrl)
          return
        }
        if (event.data?.kind !== 'result') return
        cleanup()
        resolve({
          errorName: String(event.data.errorName || ''),
          resolved: event.data.resolved === true,
        })
      }
    })
  }, revokedObjectUrl)
}

async function main() {
  const sourceEvidenceBefore = readSourceEvidence()
  assertCleanCommitSource(sourceEvidenceBefore)

  const executablePath = findLocalChromiumExecutable(process.env.KG_XR_V2_CHROMIUM_EXECUTABLE, chromium.executablePath())
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
    headless: process.env.KG_XR_V2_HEADLESS !== '0',
    ...(executablePath ? { executablePath } : {}),
  })
  let browserClosed = false
  let context = await browser.newContext()
  let page = await context.newPage()
  const pageErrors = []
  const mediaErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })
  await page.exposeBinding('__kgRecordXrV2MediaError', (_source, mediaError) => {
    mediaErrors.push(mediaError)
  })
  await page.addInitScript(() => {
    document.addEventListener('error', event => {
      const media = event.target
      if (!(media instanceof HTMLMediaElement)) return
      const source = media.currentSrc || media.getAttribute('src') || ''
      void globalThis.__kgRecordXrV2MediaError({
        code: Number(media.error?.code || 0),
        message: String(media.error?.message || 'HTMLMediaElement emitted an error event.'),
        networkState: media.networkState,
        readyState: media.readyState,
        sourceKind: source.startsWith('blob:') ? 'blob' : source ? 'other' : 'none',
        tagName: media.tagName,
      })
    }, true)
  })

  try {
    await page.goto(smokeUrl, { waitUntil: 'domcontentloaded' })
    const surface = page.locator('[data-kg-xr-v2-runtime-smoke="1"]').first()
    await surface.waitFor({ state: 'visible', timeout: 30_000 })
    const mountedPreparation = await prepareXrV2MountedAuthoringObservation(page, surface)
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-kg-xr-v2-runtime-smoke="1"]')
      const state = node?.getAttribute('data-kg-xr-v2-browser-observation-state')
      return state === 'observed' || state === 'failed'
    }, undefined, { timeout: 45_000 })
    await waitForBrowserObservationQuiescence(page, { mediaErrors, pageErrors })

    const rawEvidenceBase = await surface.evaluate(node => {
      const video = node.querySelector('video[aria-label="XR v2 edited-media playback proof"]')
      return {
        observationState: node.getAttribute('data-kg-xr-v2-browser-observation-state'),
        readinessSchema: node.getAttribute('data-kg-xr-v2-readiness-schema'),
        readinessScope: node.getAttribute('data-kg-xr-v2-readiness-scope'),
        readinessStatus: node.getAttribute('data-kg-xr-v2-readiness-status'),
        rawObservationSchema: node.getAttribute('data-kg-xr-v2-raw-observation-schema'),
        rawObservationValidation: node.getAttribute('data-kg-xr-v2-raw-observation-validation'),
        entryMode: node.getAttribute('data-kg-xr-v2-entry-mode'),
        capabilityStatus: node.getAttribute('data-kg-xr-v2-capability-status'),
        captureStatus: node.getAttribute('data-kg-xr-v2-capture-status'),
        authoringStatus: node.getAttribute('data-kg-xr-v2-authoring-status'),
        modelAssetStatus: node.getAttribute('data-kg-xr-v2-model-asset-status'),
        browserStatus: node.getAttribute('data-kg-xr-v2-browser-status'),
        physicalDeviceStatus: node.getAttribute('data-kg-xr-v2-physical-device-status'),
        blockedReasons: node.getAttribute('data-kg-xr-v2-blocked-reasons'),
        canonicalEcsEntityZero: node.getAttribute('data-kg-xr-v2-ecs-entity-zero-probe'),
        materialApplied: node.getAttribute('data-kg-xr-v2-material-applied-probe'),
        timelineCommandRouted: node.getAttribute('data-kg-xr-v2-timeline-command-probe'),
        timelineCommandKind: node.getAttribute('data-kg-xr-v2-timeline-command-kind'),
        timelineCommandAction: node.getAttribute('data-kg-xr-v2-timeline-command-action'),
        timelineCommandHandledCount: node.getAttribute('data-kg-xr-v2-timeline-command-handled-count'),
        timelinePanelRouteProven: node.getAttribute('data-kg-xr-v2-timeline-panel-route-probe'),
        timelinePanelMount: node.querySelector('[data-kg-xr-v2-timeline-panel-route="mounted"]')
          ?.getAttribute('data-kg-xr-v2-timeline-panel-route'),
        timelineCommandTargetIdentity: node.getAttribute('data-kg-xr-v2-timeline-command-target-identity'),
        blobByteSize: node.getAttribute('data-kg-xr-v2-blob-byte-size'),
        blobMimeType: node.getAttribute('data-kg-xr-v2-blob-mime-type'),
        decodedWidth: node.getAttribute('data-kg-xr-v2-decoded-width'),
        decodedHeight: node.getAttribute('data-kg-xr-v2-decoded-height'),
        decodedDurationSeconds: node.getAttribute('data-kg-xr-v2-decoded-duration-seconds'),
        unboundedDuration: node.getAttribute('data-kg-xr-v2-unbounded-duration'),
        playbackObserved: node.getAttribute('data-kg-xr-v2-playback-observed'),
        playbackCurrentTime: node.getAttribute('data-kg-xr-v2-playback-current-time'),
        playbackEnded: node.getAttribute('data-kg-xr-v2-playback-ended'),
        mediaErrors: node.getAttribute('data-kg-xr-v2-media-errors'),
        videoSrcAttributeRemoved: node.getAttribute('data-kg-xr-v2-video-src-attribute-removed'),
        videoNetworkStateEmpty: node.getAttribute('data-kg-xr-v2-video-network-state-empty'),
        objectUrlRevoked: node.getAttribute('data-kg-xr-v2-object-url-revoked'),
        revokedObjectUrl: node.getAttribute('data-kg-xr-v2-revoked-object-url'),
        browserQuiescent: node.getAttribute('data-kg-xr-v2-browser-quiescent'),
        pinnedConformanceValidation: node.getAttribute('data-kg-xr-v2-pinned-conformance-validation'),
        pinnedConformance: node.querySelector('[data-kg-xr-v2-pinned-conformance-artifact="1"]')
          ?.getAttribute('data-kg-xr-v2-pinned-conformance-evidence'),
        videoSrcAttribute: video?.getAttribute('src') ?? null,
        videoCurrentSrc: video instanceof HTMLVideoElement ? video.currentSrc : null,
        videoNetworkState: video instanceof HTMLVideoElement ? video.networkState : null,
        observationError: node.getAttribute('data-kg-xr-v2-observation-error'),
      }
    })
    const rawEvidence = Object.freeze({
      ...rawEvidenceBase,
      ...await readXrV2ExtendedBrowserEvidence(surface),
      mountedCanvasIdentityBefore: mountedPreparation.canvasIdentityBefore,
    })

    assert.equal(rawEvidence.observationState, 'observed', rawEvidence.observationError || 'XR v2 observation failed')
    assert.equal(rawEvidence.observationError, '')
    assert.equal(rawEvidence.readinessSchema, 'knowgrph-xr-v2-readiness/v1')
    assert.equal(rawEvidence.readinessScope, 'xr-authoring-edited-media-delivery')
    assert.equal(rawEvidence.readinessStatus, 'source-ready')
    assert.equal(rawEvidence.rawObservationSchema, 'knowgrph-xr-v2-dev-runtime-evidence/v1')
    assert.equal(rawEvidence.rawObservationValidation, 'valid')
    assert.equal(rawEvidence.pinnedConformanceValidation, 'valid')
    const pinnedContractConformance = JSON.parse(String(rawEvidence.pinnedConformance || 'null'))
    assertPinnedXrV2ContractConformance(pinnedContractConformance)
    assert.equal(rawEvidence.entryMode, 'monocular-capture')
    assert.equal(rawEvidence.capabilityStatus, 'source-backed')
    assert.equal(rawEvidence.captureStatus, 'source-backed')
    assert.equal(rawEvidence.authoringStatus, 'source-backed')
    assert.equal(rawEvidence.browserStatus, 'blocked')
    assert.equal(rawEvidence.modelAssetStatus, 'blocked')
    assert.equal(rawEvidence.physicalDeviceStatus, 'blocked')
    assert.match(String(rawEvidence.blockedReasons), /same-origin depth model assets are not admitted/u)
    assert.match(String(rawEvidence.blockedReasons), /reference-device frame-budget proof is absent/u)
    assert.match(String(rawEvidence.blockedReasons), /canonical-main browser runtime proof is absent/u)
    assert.match(String(rawEvidence.blockedReasons), /physical XR device proof is absent/u)

    assert.equal(rawEvidence.canonicalEcsEntityZero, 'true')
    assert.equal(rawEvidence.materialApplied, 'true')
    assert.equal(rawEvidence.timelineCommandRouted, 'true')
    assert.equal(rawEvidence.timelineCommandKind, 'clip-edit')
    assert.equal(rawEvidence.timelineCommandAction, 'nudge-forward')
    assert.equal(rawEvidence.timelineCommandHandledCount, '1')
    assert.equal(rawEvidence.timelinePanelMount, 'mounted')
    assert.equal(rawEvidence.timelinePanelRouteProven, 'true')
    assert.match(
      String(rawEvidence.timelineCommandTargetIdentity),
      /^xr-v2-runtime-smoke\.md\|[^|]*xr_v2_runtime_smoke_media[^|]*\|0$/u,
    )

    const {
      connectedPreviewObservation,
      encodedTrackContainerObservation,
      mountedAuthoringObservation,
    } = assertXrV2ExtendedBrowserObservation(rawEvidence)

    const blobByteSize = readNumber(rawEvidence.blobByteSize, 'edited-media Blob byte size')
    const decodedWidth = readNumber(rawEvidence.decodedWidth, 'decoded video width')
    const decodedHeight = readNumber(rawEvidence.decodedHeight, 'decoded video height')
    const unboundedDuration = rawEvidence.unboundedDuration === 'true'
    const decodedDurationSeconds = rawEvidence.decodedDurationSeconds
      ? readNumber(rawEvidence.decodedDurationSeconds, 'decoded duration')
      : null
    assert.ok(blobByteSize > 0)
    assert.match(String(rawEvidence.blobMimeType), /^video\/webm(?:;|$)/u)
    assert.equal(decodedWidth, 1280)
    assert.equal(decodedHeight, 720)
    assert.ok((decodedDurationSeconds !== null && decodedDurationSeconds > 0) || unboundedDuration)
    assert.equal(rawEvidence.playbackObserved, 'true')
    const playbackCurrentTime = readNumber(rawEvidence.playbackCurrentTime, 'playback currentTime')
    const playbackEnded = rawEvidence.playbackEnded === 'true'
    assert.ok(playbackCurrentTime >= 0.05 || playbackEnded)

    const pageReportedMediaErrors = parseXrV2MediaErrors(rawEvidence.mediaErrors)
    assert.deepEqual(pageReportedMediaErrors, [])
    assert.equal(rawEvidence.videoSrcAttributeRemoved, 'true')
    assert.equal(rawEvidence.videoNetworkStateEmpty, 'true')
    assert.equal(rawEvidence.objectUrlRevoked, 'true')
    assert.match(String(rawEvidence.revokedObjectUrl), /^blob:/u)
    assert.equal(rawEvidence.browserQuiescent, 'true')
    assert.equal(rawEvidence.videoSrcAttribute, null)
    assert.ok(
      rawEvidence.videoCurrentSrc === ''
        || rawEvidence.videoCurrentSrc === rawEvidence.revokedObjectUrl,
    )
    assert.equal(rawEvidence.videoNetworkState, 0)
    const revokedObjectUrlProbe = await probeRevokedObjectUrl(page, rawEvidence.revokedObjectUrl)
    assert.equal(revokedObjectUrlProbe.resolved, false)
    assert.equal(typeof revokedObjectUrlProbe.errorName, 'string')
    await waitForBrowserObservationQuiescence(page, { mediaErrors, pageErrors })
    const mountedDisposalObservation = await observeXrV2MountedAuthoringDisposal(
      page,
      surface,
      mountedAuthoringObservation.disposeEventCountBeforeUnmount,
    )
    assert.ok(mountedDisposalObservation.disposedCount > 0)

    const rawObservation = Object.freeze({
      schema: rawEvidence.rawObservationSchema,
      authoringAdapters: Object.freeze({
        canonicalEcsEntityZero: true,
        materialApplied: true,
        timelineCommandRouted: true,
      }),
      editedMedia: Object.freeze({
        byteSize: blobByteSize,
        mimeType: rawEvidence.blobMimeType,
        decodedWidth,
        decodedHeight,
        durationSeconds: decodedDurationSeconds,
        unboundedDuration,
        playbackObserved: true,
      }),
    })
    assertExactXrV2RawObservation(rawObservation)
    const navigatorProvenance = await page.evaluate(() => ({
      language: navigator.language,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    }))
    const browserProvenance = Object.freeze({
      engine: 'chromium',
      version: browser.version(),
      userAgent: navigatorProvenance.userAgent,
      navigatorLanguage: navigatorProvenance.language,
      navigatorPlatform: navigatorProvenance.platform,
      hostPlatform: process.platform,
      hostArchitecture: process.arch,
      headless: process.env.KG_XR_V2_HEADLESS !== '0',
    })
    assert.match(browserProvenance.version, /\d+(?:\.\d+)+/u)
    assert.match(browserProvenance.userAgent, /Chrom(?:e|ium)\//u)

    await page.close()
    page = null
    await context.close()
    context = null
    await browser.close()
    browserClosed = true

    const sourceEvidence = readSourceEvidence()
    assert.deepEqual(
      sourceEvidence,
      sourceEvidenceBefore,
      'source or worktree state changed during the browser observation',
    )
    assertCleanCommitSource(sourceEvidence)
    assertObservedXrV2MediaErrors(mediaErrors)
    assert.deepEqual(mediaErrors, [])
    assert.deepEqual(pageErrors, [])

    const observationContent = {
      schema: 'knowgrph-xr-v2-browser-smoke/v1',
      classification: 'review-candidate-observation',
      candidateScope: 'browser-observation-only',
      observedAt: new Date().toISOString(),
      browserProvenance,
      route: smokeUrl,
      ...sourceEvidence,
      pageReadiness: Object.freeze({
        schema: rawEvidence.readinessSchema,
        scope: rawEvidence.readinessScope,
        status: rawEvidence.readinessStatus,
        entryMode: rawEvidence.entryMode,
        capabilityStatus: rawEvidence.capabilityStatus,
        captureStatus: rawEvidence.captureStatus,
        authoringStatus: rawEvidence.authoringStatus,
        browserStatus: rawEvidence.browserStatus,
        modelAssetStatus: rawEvidence.modelAssetStatus,
        physicalDeviceStatus: rawEvidence.physicalDeviceStatus,
        blockedReasons: String(rawEvidence.blockedReasons || '').split('|').filter(Boolean),
      }),
      rawObservation,
      pinnedContractConformance,
      timelineCommandObservation: Object.freeze({
        commandKind: rawEvidence.timelineCommandKind,
        commandAction: rawEvidence.timelineCommandAction,
        handledCount: 1,
        panelMounted: rawEvidence.timelinePanelMount === 'mounted',
        panelRouteProven: rawEvidence.timelinePanelRouteProven === 'true',
        targetIdentity: rawEvidence.timelineCommandTargetIdentity,
      }),
      connectedPreviewObservation,
      encodedTrackContainerObservation,
      mountedAuthoringObservation: Object.freeze({
        ...mountedAuthoringObservation,
        disposal: mountedDisposalObservation,
      }),
      playbackObservation: Object.freeze({
        currentTime: playbackCurrentTime,
        ended: playbackEnded,
      }),
      mediaCleanupObservation: Object.freeze({
        browserQuiescent: true,
        objectUrlRevoked: true,
        revokedObjectUrlInaccessible: true,
        videoNetworkStateEmpty: true,
        videoSrcAttributeRemoved: true,
      }),
      surfaceRendered: true,
      mediaErrors,
      pageErrors: [...pageErrors],
    }
    const serializedContent = JSON.stringify(observationContent)
    const fullObservation = {
      ...observationContent,
      artifact: Object.freeze({
        schema: 'knowgrph-xr-v2-browser-smoke-artifact/v1',
        digestAlgorithm: 'sha256',
        digestScope: 'JSON.stringify(observationContent)',
        contentByteSize: Buffer.byteLength(serializedContent),
        contentDigest: createHash('sha256').update(serializedContent).digest('hex'),
      }),
    }
    assert.match(fullObservation.observedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
    assert.match(fullObservation.artifact.contentDigest, /^[0-9a-f]{64}$/u)
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(observationPath, `${JSON.stringify(fullObservation, null, 2)}\n`, 'utf8')
    console.log(`[xr-v2-browser-review-candidate] PASS ${observationPath}`)
  } finally {
    if (page) await page.close().catch(() => undefined)
    if (context) await context.close().catch(() => undefined)
    if (!browserClosed) await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
