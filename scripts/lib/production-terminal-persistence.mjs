import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import yaml from 'js-yaml'

const hash = value => createHash('sha256').update(value).digest('hex')
const expectedSteps = [
  'Record publication receipt',
  'Seal and validate terminal lifecycle carrier',
  'Capture successful release rollback target',
  'Validate successful release rollback outputs',
  'Persist completed lifecycle receipts',
]
const unique = (items, predicate, label) => {
  const matches = items.filter(predicate)
  assert.equal(matches.length, 1, `${label} must be unique`)
  return matches[0]
}
const time = value => {
  const result = Date.parse(value)
  assert.ok(Number.isFinite(result), 'execution timestamp is required')
  return result
}

// Provider execution evidence for a new observed baseline, never a replacement
// terminal carrier. The adapter supplies authenticated records and trusted source.
export function verifyRemovedTerminalPersistence({ run, artifacts, jobs, workflow, trustedWorkflow }) {
  assert.deepEqual(artifacts, { total_count: 0, artifacts: [] }, 'removed-artifact recovery requires an empty complete inventory')
  assert.match(run.head_sha, /^[a-f0-9]{40}$/)
  assert.equal(run.path, '.github/workflows/release.yml')
  assert.equal(run.event, 'workflow_dispatch')
  assert.equal(run.head_branch, 'main')
  assert.equal(run.status, 'completed')
  assert.equal(run.conclusion, 'success')
  assert.ok(Number.isSafeInteger(run.id) && run.id > 0)
  assert.ok(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0)
  assert.equal(typeof workflow, 'string')
  assert.ok(Buffer.byteLength(workflow) > 0 && Buffer.byteLength(workflow) <= 500_000)
  assert.equal(workflow, trustedWorkflow, 'release workflow differs from trusted integrated controller')
  const definition = yaml.load(workflow)
  const deploy = definition.jobs?.deploy
  assert.equal(deploy?.environment?.name, 'production')
  assert.equal(deploy['continue-on-error'], undefined)
  assert.equal(deploy.strategy, undefined, 'matrix deployment is not admitted')
  const definitions = expectedSteps.map(name => unique(deploy.steps, step => step.name === name, name))
  for (const step of definitions) {
    assert.equal(step['continue-on-error'], undefined, 'terminal steps must fail closed')
    assert.equal(step.if, undefined, 'terminal steps must be unconditional')
  }
  const seal = definitions[1]
  assert.equal(seal.id, 'lifecycle_terminal')
  assert.match(seal.run, /release:lifecycle:receipts -- carrier /)
  assert.match(seal.run, /release:lifecycle:receipts -- validate /)
  const upload = definitions.at(-1)
  assert.equal(upload.id, 'persist_complete')
  assert.match(upload.uses, /^actions\/upload-artifact@[a-f0-9]{40}$/)
  assert.equal(upload.with.name, 'production-lifecycle-complete-${{ inputs.source_sha }}-${{ github.run_id }}')
  assert.equal(upload.with.path, '${{ runner.temp }}/production-lifecycle')
  assert.equal(upload.with['if-no-files-found'], 'error')
  assert.equal(jobs.total_count, jobs.jobs?.length, 'job inventory is truncated')
  assert.ok(jobs.total_count > 0 && jobs.total_count <= 100, 'job inventory exceeds its bound')
  const job = unique(jobs.jobs, item => item.name === deploy.name, 'production job')
  assert.ok(Number.isSafeInteger(job.id) && job.id > 0)
  assert.equal(job.run_id, run.id, 'job belongs to another run')
  assert.equal(job.run_attempt, run.run_attempt, 'job belongs to another attempt')
  assert.equal(job.head_sha, run.head_sha, 'job source differs')
  assert.equal(job.head_branch, 'main')
  assert.equal(job.status, 'completed')
  assert.equal(job.conclusion, 'success')
  assert.ok(time(run.run_started_at) <= time(job.started_at))
  let previousNumber = 0
  let previousEnd = time(job.started_at)
  const steps = expectedSteps.map(name => {
    const step = unique(job.steps, item => item.name === name, name)
    assert.equal(step.status, 'completed')
    assert.equal(step.conclusion, 'success', `${name} did not succeed`)
    assert.ok(Number.isSafeInteger(step.number) && step.number > previousNumber, 'terminal step order differs')
    assert.ok(time(step.started_at) >= previousEnd, 'terminal steps overlap or are out of order')
    assert.ok(time(step.completed_at) >= time(step.started_at))
    previousNumber = step.number
    previousEnd = time(step.completed_at)
    return { name, number: step.number, completedAt: step.completed_at }
  })
  assert.ok(previousEnd <= time(job.completed_at))
  assert.ok(time(job.completed_at) <= time(run.updated_at))
  return {
    schema: 'agentic-graph-terminal-persistence-observation/v1',
    adapterId: 'github-actions/exact-run-job-and-integrated-workflow/v1',
    releaseRunId: run.id, releaseAttempt: run.run_attempt, sourceRevision: run.head_sha,
    jobId: job.id, workflowDigest: hash(workflow), steps,
    artifactState: 'removed', historicalLifecycleReconstructed: false, productionAuthorized: false,
  }
}
