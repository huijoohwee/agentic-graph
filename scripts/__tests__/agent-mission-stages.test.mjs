import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasMissionWorkspaceSelection } from '../../canvas/scripts/lib/verify-workspace-observation.mjs'
import { readContract, selectAffectedCommands, resolveCiCommandTimeoutMs, validateExpansionScripts } from '../collaboration-contract.mjs'
import { createMissionPhaseObservation } from '../../canvas/scripts/lib/mission-phase-observation.mjs'
import { executeMissionEntry } from '../../canvas/scripts/lib/verify-mission-dashboard-entry.mjs'

test('Mission entry dispatches once and disposes its module handle on success or dispatch failure', async () => {
  for (const failure of [null, new Error('Execution context was destroyed')]) {
    let dispatches = 0, disposed = 0
    const control = { evaluate: async effect => effect({ executeCanvasViewControl(input) {
      dispatches++; assert.deepEqual(input, { optionId: 'agent-run:tree' })
      if (failure) throw failure
      return { status: 'applied', ...input }
    } }), dispose: async () => { disposed++ } }
    const page = { waitForFunction: async (_predicate, _arg, options) => {
      assert.equal(dispatches, 0); assert.equal(options.timeout, 60000); return control
    } }
    if (failure) await assert.rejects(executeMissionEntry(page), error => error === failure)
    else await executeMissionEntry(page)
    assert.equal(dispatches, 1); assert.equal(disposed, 1)
  }
})

test('failed module readiness never dispatches a Mission entry', async () => {
  const failure = new Error('module readiness deadline elapsed')
  await assert.rejects(executeMissionEntry({ waitForFunction: async () => { throw failure } }), error => error === failure)
})

test('only an unselected repository can use the native workspace source without fixture isolation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mission-selection-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  try {
    assert.throws(() => hasMissionWorkspaceSelection(root))
    git('init')
    assert.equal(hasMissionWorkspaceSelection(root), false)
    for (const value of ['', '/private/archive/manifest.json', 'invalid-selection']) {
      git('config', '--local', 'agentic-os.workflowManifest', value)
      assert.equal(hasMissionWorkspaceSelection(root), true)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('mission expansion retains ingress, both unit selections, browser and lifecycle hook guards', async () => {
  const contract = await readContract()
  const steps = contract.ci_command_expansions.find(item => item.command.join(' ') === 'npm run agent-mission:check').steps
  assert.deepEqual(steps, [
    ['node', '--test', 'scripts/__tests__/workflow-archive-bridge.test.mjs', 'scripts/__tests__/agent-mission-stages.test.mjs'],
    ['npm', '-C', 'canvas', 'run', 'test:ci:unit', '--', 'agentReady.missionControl.projection', 'agentReady.webMcpRuntime.durableRun'],
    ['node', 'canvas/scripts/run_agent_mission_browser_smoke.mjs'],
  ])
  const plan = selectAffectedCommands(['canvas/scripts/verify_agent_mission_browser_smoke.mjs', 'canvas/scripts/lib/mission-phase-observation.mjs'], contract)
  for (const step of steps) assert.equal(plan.commands.filter(command => JSON.stringify(command) === JSON.stringify(step)).length, 1)
  assert.ok(!plan.commands.some(command => command.join(' ') === 'npm run agent-mission:check'))
  assert.equal(resolveCiCommandTimeoutMs(steps[2], contract), 900000)
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.throws(() => validateExpansionScripts(contract, { ...pkg.scripts, 'preagent-mission:check': 'node required.mjs' }), /lifecycle hooks/)
  assert.throws(() => validateExpansionScripts(contract, { ...pkg.scripts, 'agent-mission:check': 'node incomplete.mjs' }), /expansion drift/)
})

test('browser checkpoints partition host monotonic time and retain unknown resources', () => {
  let time = 100
  const emitted = [], observation = createMissionPhaseObservation({ now: () => time, out: line => emitted.push(line) })
  time = 125; observation.checkpoint('entry')
  time = 170; observation.checkpoint('selection')
  const snapshot = observation.snapshot()
  assert.deepEqual(snapshot.stages, [{ label: 'entry', offsetMs: 0, elapsedMs: 25 }, { label: 'selection', offsetMs: 25, elapsedMs: 45 }])
  assert.equal(snapshot.cpuMs, null); assert.equal(snapshot.tokens, null); assert.equal(snapshot.authority, false)
  snapshot.stages.pop(); assert.equal(observation.snapshot().stages.length, 2)
  time = 169; assert.throws(() => observation.checkpoint('backwards'), /clock/)
  assert.throws(() => observation.checkpoint('x'.repeat(161)), /checkpoint/)
  time = 171
  for (let i = 2; i < 32; i++) observation.checkpoint('checkpoint-' + i)
  assert.throws(() => observation.checkpoint('overflow'), /checkpoint/)
  assert.equal(emitted.length, 32)
})
