import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertCanonicalReleaseOwnerStable,
  buildTerminalAuthorizationEvidence,
  challengeFor,
  extractAuthorizationReplyFromPromptText,
  finalizeAuthorizationPromptInteraction,
  formatTerminalAuthorizationComment,
  GITHUB_APPROVAL_COMMENT_MAX_BYTES,
  parseTerminalAuthorizationComment,
  prepareAuthorizationPromptInteraction,
  readAuthorizationRuntime,
  readCanonicalReleaseOwnerState,
  validateCanonicalReleaseOwnerState,
  responseFor,
  selectLifecycleCandidateArtifact,
  selectPendingProductionDeployment,
  selectProductionAuthorizationArtifact,
  validateReleaseRun,
  validateTerminalAuthorizationEvidence,
} from '../production-terminal-authorization.mjs'

test('authorization runtime retains the ownership digest from the in-process runtime contract', async () => {
  const expectedRuntime = { status: 'runtime-ready', ownershipTokenDigest: 'e'.repeat(64) }
  let requestedModuleUrl = ''
  let requestedOptions = null
  const runtime = await readAuthorizationRuntime({
    agenticCanvasOsRoot: '/workspace/agentic-canvas-os',
    repositoryRoot: '/workspace/agentic-graph',
    loadRuntimeModule: async moduleUrl => {
      requestedModuleUrl = moduleUrl
      return {
        readLocalRuntimeStatus: async options => {
          requestedOptions = options
          return expectedRuntime
        },
      }
    },
  })

  assert.equal(runtime, expectedRuntime)
  assert.match(requestedModuleUrl, /agentic-canvas-os\/scripts\/local-runtime-lib\.mjs$/)
  assert.deepEqual(requestedOptions, {
    repository: '/workspace/agentic-graph',
    agenticCanvasOsRoot: '/workspace/agentic-canvas-os',
  })
})

const run = {
  id: 123,
  event: 'workflow_dispatch',
  path: '.github/workflows/release.yml',
  head_branch: 'main',
  head_sha: 'a'.repeat(40),
  status: 'in_progress',
  conclusion: null,
}
const candidateDigest = 'b'.repeat(64)
const lifecycleCandidateDigest = 'd'.repeat(64)
const targetDigest = 'c'.repeat(64)
const releaseCandidate = { candidateDigest }
const lifecycleCandidate = { receiptDigest: lifecycleCandidateDigest, targetDigest }
const challengeDigest = challengeFor({
  repository: 'owner/repository',
  run,
  releaseCandidate,
  lifecycleCandidate,
})
const evidence = buildTerminalAuthorizationEvidence({
  repository: 'owner/repository',
  runId: '123',
  sourceRevision: run.head_sha,
  candidateDigest,
  lifecycleCandidateDigest,
  targetDigest,
  humanActorId: 'github-user:7:operator',
  challengeDigest,
  responseDigest: responseFor({ challengeDigest, candidateDigest }),
  recordedAt: '2026-07-29T00:00:00.000Z',
})

test('terminal evidence round-trips exact candidate, target, actor, transport, and browser independence', () => {
  const comment = formatTerminalAuthorizationComment(evidence)
  const parsed = parseTerminalAuthorizationComment(comment)
  assert.deepEqual(parsed, evidence)
  assert.equal(parsed.transportClass, 'interactive-terminal')
  assert.equal(parsed.browserRequired, false)
  assert.ok(Buffer.byteLength(comment, 'utf8') <= GITHUB_APPROVAL_COMMENT_MAX_BYTES)
})

test('terminal evidence parser accepts the uncompressed v2 transport', () => {
  const encoded = Buffer.from(JSON.stringify(evidence), 'utf8').toString('base64url')
  const parsed = parseTerminalAuthorizationComment(
    `agentic-graph-production-terminal-authorization/v2 ${encoded}`,
  )
  assert.deepEqual(parsed, evidence)
})

test('terminal evidence rejects drift, unknown fields, browser dependence, and unjoined comments', () => {
  assert.throws(
    () => validateTerminalAuthorizationEvidence({ ...evidence, candidateDigest: 'd'.repeat(64) }),
    /digest drifted/,
  )
  assert.throws(
    () => validateTerminalAuthorizationEvidence({ ...evidence, inferredApproval: true }),
    /missing or unknown fields/,
  )
  assert.throws(
    () => validateTerminalAuthorizationEvidence({ ...evidence, browserRequired: true }),
    /invalid profile/,
  )
  assert.throws(
    () => parseTerminalAuthorizationComment('approved'),
    /lacks exact terminal authorization evidence/,
  )
})

test('only the active protected-main Production Release run is eligible', () => {
  assert.equal(validateReleaseRun(run, 'owner/repository', '123'), run)
  for (const drift of [
    { event: 'push' },
    { path: '.github/workflows/other.yml' },
    { head_branch: 'feature' },
    { status: 'completed', conclusion: 'success' },
  ]) {
    assert.throws(
      () => validateReleaseRun({ ...run, ...drift }, 'owner/repository', '123'),
      /not an active protected-main/,
    )
  }
})

test('candidate artifact and pending environment selection are exact and singular', () => {
  const artifact = {
    id: 9,
    name: `production-lifecycle-${run.head_sha}-${run.id}`,
    expired: false,
  }
  assert.equal(selectLifecycleCandidateArtifact([artifact], run), artifact)
  assert.throws(
    () => selectLifecycleCandidateArtifact([artifact, { ...artifact, id: 10 }], run),
    /one exact lifecycle candidate artifact/,
  )
  const authorizationArtifact = {
    id: 11,
    name: `production-authorization-${run.head_sha}`,
    expired: false,
  }
  assert.equal(
    selectProductionAuthorizationArtifact([authorizationArtifact], run),
    authorizationArtifact,
  )
  assert.throws(
    () => selectProductionAuthorizationArtifact([
      authorizationArtifact,
      { ...authorizationArtifact, id: 12 },
    ], run),
    /one exact authorization candidate artifact/,
  )
  const pending = {
    environment: { id: 13, name: 'production' },
    current_user_can_approve: true,
  }
  assert.equal(selectPendingProductionDeployment([pending]), pending)
  assert.throws(
    () => selectPendingProductionDeployment([pending, {
      environment: { id: 12, name: 'staging' },
      current_user_can_approve: true,
    }]),
    /one approvable production deployment/,
  )
})

test('canonical release owner state requires clean exact main at the reviewed revision', () => {
  const execGit = argumentsList => {
    const key = argumentsList.join(' ')
    return ({
      'branch --show-current': 'main',
      'rev-parse HEAD': run.head_sha,
      'rev-parse origin/main': run.head_sha,
      'status --porcelain': '',
    })[key]
  }
  const state = readCanonicalReleaseOwnerState({
    repositoryRoot: '/workspace/agentic-graph',
    execGit,
  })
  assert.deepEqual(state, {
    branch: 'main',
    head: run.head_sha,
    originMain: run.head_sha,
    status: '',
  })
  assert.equal(
    validateCanonicalReleaseOwnerState({
      state,
      expectedRevision: run.head_sha,
      label: 'agentic-graph',
    }),
    state,
  )
  assert.throws(
    () => validateCanonicalReleaseOwnerState({
      state: { ...state, branch: 'agent/device/scope' },
      expectedRevision: run.head_sha,
      label: 'agentic-graph',
    }),
    /canonical main drifted/,
  )
})

test('authorization prompt interaction captures the printed exact reply and requires prompt stability', () => {
  const promptText = [
    'The release is verified and awaiting fresh human authorization.',
    '',
    `Candidate: \`${candidateDigest}\``,
    '',
    'Reply exactly:',
    '',
    `\`authorize ${candidateDigest}\``,
  ].join('\n')
  assert.equal(
    extractAuthorizationReplyFromPromptText(promptText),
    `authorize ${candidateDigest}`,
  )
  assert.throws(
    () => extractAuthorizationReplyFromPromptText('Reply exactly:\n\n`authorize not-a-digest`'),
    /did not print one exact candidate-bound reply/,
  )
  const interaction = prepareAuthorizationPromptInteraction({
    prompt: { authorizationReply: `authorize ${candidateDigest}` },
    promptText,
    repositoryRoot: '/workspace/agentic-graph',
    expectedRevision: run.head_sha,
    label: 'agentic-graph',
    readCanonicalState: () => ({
      branch: 'main',
      head: run.head_sha,
      originMain: run.head_sha,
      status: '',
    }),
  })
  assert.equal(interaction.printedReply, `authorize ${candidateDigest}`)
  assert.equal(
    finalizeAuthorizationPromptInteraction({
      interaction,
      answer: `authorize ${candidateDigest}`,
      repositoryRoot: '/workspace/agentic-graph',
      readCanonicalState: () => ({
        branch: 'main',
        head: run.head_sha,
        originMain: run.head_sha,
        status: '',
      }),
    }),
    `authorize ${candidateDigest}`,
  )
})

test('authorization prompt interaction fails closed on branch flip, local drift, or out-of-order reply', () => {
  const before = {
    branch: 'main',
    head: run.head_sha,
    originMain: run.head_sha,
    status: '',
  }
  const interaction = {
    before,
    expectedRevision: run.head_sha,
    label: 'agentic-graph',
    printedReply: `authorize ${candidateDigest}`,
  }
  assert.throws(
    () => assertCanonicalReleaseOwnerStable({
      before,
      after: { ...before, branch: 'agent/huis-macbook-pro-3.local/release-receipt' },
      expectedRevision: run.head_sha,
      label: 'agentic-graph',
    }),
    /canonical main drifted/,
  )
  assert.throws(
    () => finalizeAuthorizationPromptInteraction({
      interaction,
      answer: `authorize ${candidateDigest}`,
      repositoryRoot: '/workspace/agentic-graph',
      readCanonicalState: () => ({ ...before, head: 'f'.repeat(40), originMain: 'f'.repeat(40) }),
    }),
    /canonical main drifted/,
  )
  assert.throws(
    () => finalizeAuthorizationPromptInteraction({
      interaction,
      answer: `authorize ${'f'.repeat(64)}`,
      repositoryRoot: '/workspace/agentic-graph',
      readCanonicalState: () => before,
    }),
    /did not match the printed exact reply/,
  )
})
