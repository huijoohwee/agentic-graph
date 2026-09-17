import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readContract, selectAffectedCommands, resolveCiCommandTimeoutMs, validateExpansionScripts } from '../collaboration-contract.mjs'
import { createMissionPhaseObservation } from '../../canvas/scripts/lib/mission-phase-observation.mjs'

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
  assert.equal(resolveCiCommandTimeoutMs(steps[2], contract), 600000)
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
