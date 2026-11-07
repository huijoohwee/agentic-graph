import assert from 'node:assert/strict'
import test from 'node:test'
import { assertCompletedRollback, assertRollbackCarrierBinding, assertPriorBrowserRun } from '../production-browser-history.mjs'

const createFixture = () => {
  const run = { id: 41, run_attempt: 2, head_sha: 'a'.repeat(40), path: '.github/workflows/release.yml',
    event: 'workflow_dispatch', head_branch: 'main', status: 'completed', conclusion: 'failure' }
  const job = (name, conclusion, steps = []) => ({ name, conclusion, steps, run_id: run.id,
    run_attempt: run.run_attempt, head_sha: run.head_sha, status: 'completed' })
  const step = (name, conclusion) => ({ name, status: 'completed', conclusion })
  const expectedSteps = new Map([
    ['Require an exact successful deployment attempt', 'success'],
    ['Upload and activate exact-candidate travel mesh versions', 'failure'],
    ['Record normalized release failure observation', 'success'],
    ['Determine pre-publication rollback eligibility', 'success'],
    ['Preserve deployed state after publication boundary', 'skipped'],
    ['Preserve ambiguous travel mesh state', 'skipped'],
    ['Restore exact prior travel mesh versions', 'skipped'],
    ['Roll back Pages to exact last-known-good deployment', 'success'],
    ['Restore and reconcile last-known-good D1 state', 'success'],
    ['Capture authoritative restored Pages deployment', 'success'],
    ['Verify restored immutable Pages runtime', 'success'],
    ['Verify restored stable Pages runtime', 'success'],
    ['Verify restored public custom-domain runtime', 'success'],
    ['Record restored production transport evidence', 'success'],
    ['Seal and validate rolled-back lifecycle carrier', 'success'],
    ['Persist terminal rolled-back lifecycle receipts', 'success'],
    ['Persist raw production release observations', 'success'],
  ])
  const makeJobs = () => [job('Verify Release Candidate', 'success'),
    job('Human-Authorized Deploy, Verify, And Publish Mirror', 'failure',
      [...expectedSteps].map(([name, conclusion]) => step(name, conclusion)))]
  const carrier = { schema: 'agentic-collaborative-release-lifecycle/v2', completion: 'rolled-back', receipts: [
    { schema: 'agentic-integration-receipt/v2', sourceRevision: run.head_sha },
    { schema: 'agentic-candidate-manifest/v1', receiptDigest: 'candidate' },
    { schema: 'agentic-deployment-receipt/v1', receiptDigest: 'deployment', candidateDigest: 'candidate' },
    { schema: 'agentic-rollback-receipt/v1', status: 'rolled-back', failedStage: 'deployment',
      candidateDigest: 'candidate', deploymentReceiptDigest: 'deployment', terminalResult: 'restored-last-known-good' },
  ] }
  return { run, expectedSteps, makeJobs, carrier }
}

test('browser history accepts a validated rollback bound to its exact protected run', () => {
  const { run, makeJobs, carrier } = createFixture()
  const jobs = makeJobs()
  assert.doesNotThrow(() => assertRollbackCarrierBinding(run, carrier))
  assert.doesNotThrow(() => assertCompletedRollback(run, jobs, carrier))
  assert.doesNotThrow(() => assertPriorBrowserRun(run, '42', jobs, carrier))
  assert.throws(() => assertPriorBrowserRun(run, '42', jobs), /carrier schema/)
})

test('browser history rejects missing, ambiguous, or incomplete rollback steps', () => {
  const { run, makeJobs, carrier } = createFixture()
  const step = (name, conclusion) => ({ name, status: 'completed', conclusion })
  const cases = [
    jobs => { jobs[0].conclusion = 'failure' },
    jobs => { jobs[1].conclusion = 'success' },
    jobs => { jobs[1].steps.find(item => item.name === 'Restore and reconcile last-known-good D1 state').conclusion = 'failure' },
    jobs => { jobs[1].steps.find(item => item.name === 'Verify restored public custom-domain runtime').status = 'in_progress' },
    jobs => { jobs[1].steps.push(step('Unclassified failure', 'failure')) },
    jobs => { jobs[1].steps.push(structuredClone(jobs[1].steps[0])) },
  ]
  for (const mutate of cases) {
    const jobs = makeJobs(); mutate(jobs)
    assert.throws(() => assertCompletedRollback(run, jobs, carrier))
  }
})

test('rollback carrier must bind source, candidate, deployment, and restored terminal state', () => {
  const { run, carrier } = createFixture()
  const cases = [
    value => { value.receipts[0].sourceRevision = 'b'.repeat(40) },
    value => { value.receipts[2].candidateDigest = 'different' },
    value => { value.receipts[3].terminalResult = 'preserve-required' },
    value => { value.completion = 'production-complete' },
    value => { value.receipts.push(structuredClone(value.receipts[0])) },
  ]
  for (const mutate of cases) {
    const changed = structuredClone(carrier); mutate(changed)
    assert.throws(() => assertRollbackCarrierBinding(run, changed))
  }
})
