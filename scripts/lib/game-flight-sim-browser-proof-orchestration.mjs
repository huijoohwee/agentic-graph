import {
  captureGitRepositoryState,
  describeRepositoryStateChange,
  repositoryStatesEqual,
} from './git-repository-state.mjs'
import {
  createGitVerificationWorkspace,
} from './git-verification-workspace.mjs'
import {
  NamedVerificationAggregateError,
  throwForNamedFailures,
} from './named-verification-runner.mjs'

function failure(name, error) {
  return Object.freeze({
    name,
    message: error instanceof Error ? error.message : String(error),
  })
}

function appendErrorFailures(failures, error) {
  if (error instanceof NamedVerificationAggregateError) {
    failures.push(...error.failures)
    return
  }
  failures.push(failure('isolated browser proof', error))
}

export async function runIsolatedBrowserProof({
  captureState = captureGitRepositoryState,
  createWorkspace = createGitVerificationWorkspace,
  prepareEvidence,
  repositoryRoot,
  runProof,
}) {
  const callerBefore = await captureState(repositoryRoot)
  if (callerBefore.status) {
    throw new NamedVerificationAggregateError(
      'Game Flight Sim browser smoke',
      [failure(
        'exact candidate preflight',
        `browser proof requires an initially clean checkout:\n${
          callerBefore.status.replaceAll('\0', '\n').trim()
        }`,
      )],
    )
  }
  const failures = []
  let callerIsolationReported = false
  let evidencePublication = null
  let proofResult
  let workspace = null
  try {
    workspace = await createWorkspace(repositoryRoot)
    const isolatedBefore = await captureState(workspace.repositoryRoot)
    try {
      proofResult = await runProof(
        workspace.repositoryRoot,
        workspace.token,
      )
    } catch (error) {
      appendErrorFailures(failures, error)
    }
    const isolatedAfter = await captureState(workspace.repositoryRoot)
    if (!repositoryStatesEqual(isolatedBefore, isolatedAfter)) {
      failures.push(failure(
        'repository source immutability',
        `browser proof changed its isolated checkout ${
          describeRepositoryStateChange(isolatedBefore, isolatedAfter)
        }`,
      ))
    }
    const callerAfterProof = await captureState(repositoryRoot)
    if (!repositoryStatesEqual(callerBefore, callerAfterProof)) {
      callerIsolationReported = true
      failures.push(failure(
        'caller checkout isolation',
        `caller checkout changed outside the isolated verification: ${
          describeRepositoryStateChange(callerBefore, callerAfterProof)
        }`,
      ))
    }
    if (failures.length === 0 && prepareEvidence) {
      try {
        evidencePublication = await prepareEvidence(
          workspace.repositoryRoot,
          proofResult,
        )
      } catch (error) {
        failures.push(failure('browser evidence staging', error))
      }
    }
  } catch (error) {
    appendErrorFailures(failures, error)
  } finally {
    if (workspace) {
      try {
        await workspace.dispose()
      } catch (error) {
        failures.push(failure('isolated browser cleanup', error))
      }
    }
  }
  const callerAfterCleanup = await captureState(repositoryRoot)
  if (
    !callerIsolationReported
    && !repositoryStatesEqual(callerBefore, callerAfterCleanup)
  ) {
    callerIsolationReported = true
    failures.push(failure(
      'caller checkout isolation',
      `caller checkout changed outside the isolated verification: ${
        describeRepositoryStateChange(callerBefore, callerAfterCleanup)
      }`,
    ))
  }
  if (evidencePublication) {
    if (failures.length === 0) {
      try {
        await evidencePublication.commit()
      } catch (error) {
        failures.push(failure('browser evidence publication', error))
      }
    } else {
      try {
        await evidencePublication.discard()
      } catch (error) {
        failures.push(failure('browser evidence discard', error))
      }
    }
  }
  const callerAfter = await captureState(repositoryRoot)
  if (
    !callerIsolationReported
    && !repositoryStatesEqual(callerBefore, callerAfter)
  ) {
    failures.push(failure(
      'caller checkout isolation',
      `caller checkout changed outside the isolated verification: ${
        describeRepositoryStateChange(callerBefore, callerAfter)
      }`,
    ))
  }
  throwForNamedFailures('Game Flight Sim browser smoke', failures)
  return proofResult
}

export async function runSerialBrowserProof({
  assertExactCandidate,
  clearPriorEvidence,
  executeRun,
  log = console,
  runCount,
  validateRunEvidence,
}) {
  try {
    await assertExactCandidate()
  } catch (error) {
    throw new NamedVerificationAggregateError(
      'Game Flight Sim browser smoke',
      [failure('exact candidate preflight', error)],
    )
  }
  try {
    await clearPriorEvidence()
  } catch (error) {
    throw new NamedVerificationAggregateError(
      'Game Flight Sim browser smoke',
      [failure('prior evidence cleanup', error)],
    )
  }

  const failures = []
  const runs = []
  for (let runIndex = 1; runIndex <= runCount; runIndex += 1) {
    let executed = false
    let evidenceValidated = false
    try {
      log.info?.(`[browser-verification:start] serial run ${runIndex}`)
      await executeRun(runIndex)
      executed = true
    } catch (error) {
      failures.push(failure(`serial browser run ${runIndex}`, error))
      log.error?.(`[browser-verification:fail] serial run ${runIndex}`)
    }

    if (executed) {
      try {
        runs.push(await validateRunEvidence(runIndex))
        evidenceValidated = true
      } catch (error) {
        failures.push(failure(`browser evidence run ${runIndex}`, error))
      }
    }

    let exactCandidateRetained = false
    try {
      await assertExactCandidate()
      exactCandidateRetained = true
    } catch (error) {
      failures.push(failure(
        `exact candidate after browser run ${runIndex}`,
        error,
      ))
      break
    }
    if (executed && evidenceValidated && exactCandidateRetained) {
      log.info?.(`[browser-verification:pass] serial run ${runIndex}`)
    }
  }

  throwForNamedFailures('Game Flight Sim browser smoke', failures)
  return Object.freeze(runs)
}
