import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readChangedPaths, readExecutionPartition, partitionAffectedCommands, validateExecutionPartitions } from '../run-affected-ci.mjs'
import { readContract, selectAffectedCommands, validateContract } from '../collaboration-contract.mjs'
import { selectValidationChecks, validateValidationPolicy } from '../../node_modules/agentic-os/bin/agentic-os-validation-policy.mjs'

test('local affected inventory joins committed, working and untracked paths', () => {
  const paths = readChangedPaths({ environment: {}, gitText: args => {
    if (args.at(-1) === 'origin/main...HEAD') return 'canvas/src/committed.ts\0'
    if (args.at(-1) === 'HEAD') return 'canvas/src/working.ts\0'
    return 'scripts/new.mjs\0'
  } })
  assert.deepEqual(paths, ['canvas/src/committed.ts', 'canvas/src/working.ts', 'scripts/new.mjs'])
})

test('verified event base replaces moving refs and previous-commit guesses', () => {
  const base = 'a'.repeat(40), calls = []
  const paths = readChangedPaths({ baseRevision: base, environment: {
    GITHUB_ACTIONS: 'true', GITHUB_BASE_REF: 'main', GITHUB_EVENT_BEFORE: 'b'.repeat(40),
  }, gitText: args => { calls.push(args); return 'committed.ts\0deleted.ts\0' } })
  assert.deepEqual(calls, [['diff', '--no-renames', '--name-only', '-z', `${base}...HEAD`]])
  assert.deepEqual(paths, ['committed.ts', 'deleted.ts'])
  for (const invalid of ['main', '0'.repeat(40), '--all']) {
    assert.throws(() => readChangedPaths({ baseRevision: invalid, environment: {}, gitText: () => {
      assert.fail('invalid base must fail before Git')
    } }), /invalid validation base/)
  }
})

test('default and protected affected validation share one owner command map', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)))
  const policy = JSON.parse(readFileSync(new URL('../../.agentic-os-validation.json', import.meta.url)))
  assert.equal(pkg.scripts.test, 'npm run ci:affected')
  assert.equal(pkg.scripts['test:all'], 'npm run test:ci --workspace=@agentic-graph/canvas')
  assert.equal(pkg.scripts['ci:affected'], 'node node_modules/agentic-os/bin/agentic-os-validation.mjs run')
  assert.equal(pkg.scripts['ci:affected:source'], 'node ./scripts/run-affected-ci.mjs')
  assert.ok(pkg.scripts['ci:integration'].endsWith('npm run ci:affected'))
  validateValidationPolicy(policy)
  const partitions = partitionAffectedCommands([], await readContract())
  validateExecutionPartitions(partitions, policy)
  assert.deepEqual(policy.fallback, Object.keys(partitions).map(name => `graph-${name}-plan`))
  assert.equal(policy.checks.length, Object.keys(partitions).length)
  for (const [index, partition] of Object.keys(partitions).entries()) {
    const check = policy.checks[index]
    assert.deepEqual(check.command, ['npm', 'run', 'ci:affected:source', '--', `--partition=${partition}`])
    assert.equal(check.reuse, 'local-plan')
    assert.deepEqual(check.inputs, ['*'], 'reuse binds the entire source-selected plan')
    assert.equal(check.timeoutMs, 900000)
  }
  for (const paths of [['canvas/src/scene.ts'], ['unmatched-input'], ['.github/workflows/integration.yml']]) {
    assert.deepEqual(selectValidationChecks(policy, paths).checks.map(check => check.id), policy.fallback)
  }
  for (const check of policy.checks.slice(1)) {
    assert.deepEqual(selectValidationChecks(policy, ['canvas/src/scene.ts'], { only: [check.id] })
      .checks.map(check => check.id), [policy.checks[0].id, check.id],
    'extended validation cannot omit its standard prerequisite')
  }
})

test('execution groups preserve every affected check once and retain contract timeout ownership', async () => {
  const contract = await readContract()
  for (const paths of [
    ['canvas/src/app/main.ts', 'docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md'],
    ['scripts/run-affected-ci.mjs'], ['unknown-input'], [],
  ]) {
    const { commands } = selectAffectedCommands(paths, contract)
    const before = JSON.stringify(commands)
    const partitions = partitionAffectedCommands(commands, contract)
    for (const [name, group] of Object.entries(partitions)) {
      if (name !== 'standard') assert.ok(group.length <= 1, 'long command budgets must never share an aggregate check')
    }
    const actual = Object.values(partitions).flat().map(command => JSON.stringify(command))
    assert.equal(new Set(actual).size, commands.length)
    assert.deepEqual(actual.sort(), commands.map(command => JSON.stringify(command)).sort())
    assert.equal(JSON.stringify(commands), before)
    const nativePolicy = JSON.parse(readFileSync(new URL('../../.agentic-os-validation.json', import.meta.url)))
    assert.deepEqual(nativePolicy.checks.map(check => readExecutionPartition(check.command.slice(4))), Object.keys(partitions))
  }
  const browser = ['node', 'canvas/scripts/run_agent_mission_browser_smoke.mjs']
  const groups = partitionAffectedCommands([browser], contract)
  assert.deepEqual(groups.standard, [])
  assert.deepEqual(groups['extended-5bcce945a301'], [browser])
  assert.deepEqual(partitionAffectedCommands([browser], {
    ...contract, ci_command_timeout_overrides: [...contract.ci_command_timeout_overrides].reverse(),
  }), groups, 'selectors remain bound to exact commands when declarations are reordered')
  const ordinary = structuredClone(contract)
  ordinary.ci_command_timeout_overrides = []
  validateContract(ordinary)
  assert.deepEqual(partitionAffectedCommands([browser], ordinary), { standard: [browser] })
  assert.throws(() => partitionAffectedCommands([browser, browser], contract), /duplicate/)
})

test('affected CLI defaults to all checks and rejects misspelled or repeated partitions', () => {
  assert.equal(readExecutionPartition([]), 'all')
  for (const value of ['standard', 'extended-5bcce945a301']) assert.equal(readExecutionPartition([`--partition=${value}`]), value)
  for (const args of [['--partition=none'], ['--partition=extended'], ['--partition=standard', '--partition=extended-5bcce945a301'], ['--skip-browser']]) {
    assert.throws(() => readExecutionPartition(args), /accepts only/)
  }
})

test('native partition drift fails before any affected check can be omitted', async () => {
  const contract = await readContract()
  const groups = partitionAffectedCommands([], contract)
  const policy = JSON.parse(readFileSync(new URL('../../.agentic-os-validation.json', import.meta.url)))
  for (const checks of [policy.checks.slice(0, -1), [...policy.checks, policy.checks[0]]]) {
    assert.throws(() => validateExecutionPartitions(groups, { ...policy, checks }), /exactly once/)
  }
  const extra = structuredClone(contract)
  extra.ci_command_timeout_overrides.push({ command: ['npm', 'run', 'runtime:test:core'], timeout_ms: 600000 })
  validateContract(extra)
  assert.throws(() => validateExecutionPartitions(partitionAffectedCommands([], extra), policy), /exactly once/)
  const foreign = structuredClone(policy)
  foreign.checks[0].command = ['npm', 'run', 'unrelated', '--', '--partition=standard']
  assert.throws(() => validateExecutionPartitions(groups, foreign), /source owner/)
})

test('Launch Copilot test-only changes select their executable owner checks', async () => {
  const plan = selectAffectedCommands([
    'canvas/src/__tests__/launchCopilot.test.ts',
    'mcp/__tests__/launch-copilot-contract.test.mjs',
  ], await readContract())
  assert.deepEqual(plan.unmatchedPaths, [])
  assert.deepEqual(plan.commands, [
    ['env', 'TSX_TSCONFIG_PATH=canvas/tsconfig.json', 'node', '--import', 'tsx',
      '--import', './canvas/scripts/source-authority-test-bootstrap.mjs', '--test',
      'canvas/src/__tests__/launchCopilot.test.ts'],
    ['node', '--test', 'mcp/__tests__/launch-copilot-contract.test.mjs'],
  ])
})

test('Launch Copilot runtime changes retain the broader source checks', async () => {
  const contract = await readContract()
  const plan = selectAffectedCommands([
    'mcp/agent-graph/launch-copilot-contract.js',
    'mcp/__tests__/launch-copilot-contract.test.mjs',
  ], contract)
  assert.deepEqual(plan.unmatchedPaths, [])
  assert(plan.commands.some(command => command.join(' ') === 'npm run runtime:test:core'))
  const canvas = selectAffectedCommands(['canvas/src/features/agent-graph/launchCopilotWorkspace.ts'], contract)
  assert(canvas.commands.some(command => command.join(' ') === 'npm run check --workspace=@agentic-graph/canvas'))
})

test('scope-local mapping preserves unmatched fallback and rejects invalid boundaries', async () => {
  const contract = await readContract()
  const plan = selectAffectedCommands(['mcp/__tests__/launch-copilot-contract.test.mjs', 'unknown-input'], contract)
  assert.deepEqual(plan.unmatchedPaths, ['unknown-input'])
  assert(plan.commands.some(command => command.join(' ') === 'npm run runtime:test:core'))
  for (const value of [false, 'true', 1]) {
    const changed = structuredClone(contract)
    changed.ci_exact_path_scopes.runtime.scope_local = value
    assert.throws(() => validateContract(changed), /scope_local must be true/)
  }
})

test('selected CI control checks run first without adding or repeating catalog commands', async () => {
  const contract = await readContract()
  const paths = ['package.json', '.github/workflows/integration.yml', 'scripts/ci-evidence-inputs.mjs']
  const { commands } = selectAffectedCommands(paths, contract)
  const controlKeys = new Set(['collaboration', 'protected_ci_evidence'].flatMap(scope =>
    contract.ci_scopes[scope].commands.map(command => JSON.stringify(command))))
  const controls = commands.filter(command => controlKeys.has(JSON.stringify(command)))
  const groups = partitionAffectedCommands(commands, contract)
  assert.equal(controls.length, 3)
  assert.deepEqual(groups.standard.slice(0, controls.length), controls)
  const ordinary = structuredClone(contract)
  delete ordinary.ci_scopes
  const original = partitionAffectedCommands(commands, ordinary)
  assert.deepEqual(groups.standard.slice(controls.length),
    original.standard.filter(command => !controlKeys.has(JSON.stringify(command))))
  assert.deepEqual(Object.values(groups).flat().map(JSON.stringify).sort(),
    commands.map(JSON.stringify).sort())
  const product = commands.filter(command => !controlKeys.has(JSON.stringify(command)))
  assert.deepEqual(partitionAffectedCommands(product, contract), partitionAffectedCommands(product, ordinary))
})
