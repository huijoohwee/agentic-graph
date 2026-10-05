import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { readChangedPaths, readExecutionPartition, partitionAffectedCommands, validateExecutionPartitions, sourcePlanReuse } from '../run-affected-ci.mjs'
import { readContract, resolveCiCommandTimeoutMs, selectAffectedCommands, validateContract } from '../collaboration-contract.mjs'
import { selectValidationChecks, validateValidationPolicy } from '../../node_modules/agentic-os/bin/agentic-os-validation-policy.mjs'

test('nonempty partitions retain independent immutable reuse decisions', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'graph-partition-reuse-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const environment = { AGENTIC_OS_CI_SOURCE_EVIDENCE_DIR: directory,
    GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' }
  const partitions = { standard: [['node', 'standard']], 'extended-123456789abc': [['node', 'browser']],
    'extended-abcdef123456': [] }
  let captures = 0, verifications = 0
  const options = { environment, log: () => {}, captureInputs: async () => { captures++; return 'exact-inputs' },
    verify: (args, env) => {
      verifications++
      assert.equal(env.AGENTIC_OS_CI_OWNER_INPUTS, 'exact-inputs')
      const receipt = { reused: true, runUrl: 'https://example.test/exact-run' }
      writeFileSync(args.find(arg => arg.startsWith('--output=')).slice(9), JSON.stringify(receipt), { flag: 'wx' })
      return receipt
    } }
  for (const partition of ['standard', 'extended-123456789abc', 'all'])
    assert.equal((await sourcePlanReuse(partition, partitions, options)).reused, true)
  assert.equal(await sourcePlanReuse('extended-abcdef123456', partitions, options), null)
  assert.equal(captures, 3)
  assert.equal(verifications, 3)
  assert.equal(readdirSync(directory).length, 3, 'later partitions must not collide with the first receipt')
  const snapshots = readdirSync(directory).map(file => [file, readFileSync(join(directory, file), 'utf8')])
  assert.equal(await sourcePlanReuse('standard', partitions, options), null, 'a genuine repeated write falls back to fresh checks')
  for (const [file, bytes] of snapshots) assert.equal(readFileSync(join(directory, file), 'utf8'), bytes)
})

test('empty plans and non-main events make no provider or input-capture calls', async () => {
  const environment = { AGENTIC_OS_CI_SOURCE_EVIDENCE_DIR: '/unused',
    GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' }
  let calls = 0
  const forbidden = () => { calls++; return null }
  for (const partitions of [{ standard: [] }, { standard: [], 'extended-123456789abc': [['node', 'other']] }])
    assert.equal(await sourcePlanReuse('standard', partitions, { environment, verify: forbidden, captureInputs: forbidden }), null)
  for (const override of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/heads/task' }, { AGENTIC_OS_CI_SOURCE_EVIDENCE_DIR: '' }])
    assert.equal(await sourcePlanReuse('standard', { standard: [['node', 'check']] }, {
      environment: { ...environment, ...override }, verify: forbidden, captureInputs: forbidden,
    }), null)
  assert.equal(calls, 0, 'ineligible selection must not capture inputs or contact the provider')
})

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
  const contract = await readContract()
  const partitions = partitionAffectedCommands([], contract)
  validateExecutionPartitions(partitions, policy)
  assert.deepEqual(policy.fallback, Object.keys(partitions).map(name => `graph-${name}-plan`))
  assert.equal(policy.checks.length, Object.keys(partitions).length)
  const freshCommands = contract.ci_command_timeout_overrides.filter(row =>
    row.command[1] === 'scripts/browser-proof-build.mjs' || row.command.includes('--verified-build')).map(row => row.command)
  const freshPartitions = new Set(Object.entries(partitionAffectedCommands(freshCommands, contract))
    .filter(([, commands]) => commands.length).map(([partition]) => partition))
  for (const [index, partition] of Object.keys(partitions).entries()) {
    const check = policy.checks[index]
    assert.deepEqual(check.command, ['npm', 'run', 'ci:affected:source', '--', `--partition=${partition}`])
    assert.equal(check.reuse, freshPartitions.has(partition) ? 'never' : 'local-plan')
    assert.deepEqual(check.inputs, ['*'], 'reuse binds the entire source-selected plan')
    assert.equal(check.timeoutMs, 900000)
  }
  for (const paths of [['canvas/src/scene.ts'], ['unmatched-input'], ['.github/workflows/integration.yml']]) {
    assert.deepEqual(selectValidationChecks(policy, paths).checks.map(check => check.id), policy.fallback)
  }
  for (const check of policy.checks.slice(1)) {
    assert.deepEqual(selectValidationChecks(policy, ['canvas/src/scene.ts'], { only: [check.id] })
      .checks.map(check => check.id), [...new Set([policy.checks[0].id, ...check.requires, check.id])],
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

test('declared command budgets fit both native stages and their enclosing checks', async () => {
  const contract = await readContract()
  const policy = JSON.parse(readFileSync(new URL('../../.agentic-os-validation.json', import.meta.url)))
  const commands = contract.ci_command_timeout_overrides.map(entry => entry.command)
  const groups = partitionAffectedCommands(commands, contract)
  assert(contract.ci_command_timeout_ms <= 900000, 'native stages allow at most 15 minutes')
  for (const [partition, group] of Object.entries(groups)) {
    const parent = policy.checks.find(check => readExecutionPartition(check.command.slice(4)) === partition)
    assert(parent, `missing native check for ${partition}`)
    for (const command of group) {
      const timeout = resolveCiCommandTimeoutMs(command, contract)
      assert(timeout <= Math.min(900000, parent.timeoutMs),
        `${command.join(' ')} exceeds its native execution budget`)
    }
  }
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
  extra.ci_command_timeout_overrides.push({ command: ['npm', 'run', 'spatial-workspace:browser'], timeout_ms: 600000 })
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

test('measured slow checks are isolated without raising their command timeout', async () => {
  const contract = await readContract()
  const policy = JSON.parse(readFileSync(new URL('../../.agentic-os-validation.json', import.meta.url)))
  const isolated = contract.ci_command_timeout_overrides.filter(row => row.timeout_ms === contract.ci_command_timeout_ms)
  assert.equal(isolated.length, 4)
  const combined = ['node', 'canvas/scripts/run_spatial_workspace_full_app_smoke.mjs', '--verified-build']
  assert.equal(resolveCiCommandTimeoutMs(combined, contract), 600000)
  const combinedGroups = partitionAffectedCommands([combined], contract)
  validateExecutionPartitions(combinedGroups, policy)
  assert.equal(combinedGroups.standard.length, 0)
  assert.deepEqual(Object.values(combinedGroups).flat(), [combined])
  const ordinary = { ...contract, ci_command_timeout_overrides: [] }
  const commands = isolated.map(row => row.command)
  const groups = partitionAffectedCommands(commands, contract)
  validateExecutionPartitions(groups, policy)
  for (const { command } of isolated) {
    assert.equal(resolveCiCommandTimeoutMs(command, contract), resolveCiCommandTimeoutMs(command, ordinary))
    const key = JSON.stringify(command)
    assert(!groups.standard.some(row => JSON.stringify(row) === key))
    assert.equal(Object.values(groups).flat().filter(row => JSON.stringify(row) === key).length, 1)
  }
})


test('browser checks share one fresh build and cannot reuse generated-input evidence', async () => {
  const contract = await readContract()
  const policy = JSON.parse(readFileSync(new URL('../../.agentic-os-validation.json', import.meta.url)))
  const build = ['node', 'scripts/browser-proof-build.mjs']
  const { BUILD_PHASE_LIMITS } = await import('../browser-proof-build.mjs')
  assert.deepEqual(BUILD_PHASE_LIMITS, { input: 60000, compile: 300000, output: 60000 })
  assert.equal(resolveCiCommandTimeoutMs(build, contract), Object.values(BUILD_PHASE_LIMITS).reduce((sum, value) => sum + value, 0))
  const buildPartition = Object.entries(partitionAffectedCommands([build], contract)).find(([, commands]) => commands.length)[0]
  const buildId = `graph-${buildPartition}-plan`
  assert.equal(policy.checks.find(check => check.id === buildId).reuse, 'never')
  for (const paths of [['canvas/src/features/three/SpatialWorkspaceReview.tsx'],
    ['canvas/src/features/block-editor/change.ts'], ['canvas/src/features/python-learning/change.ts'],
    ['scripts/browser-proof-build.mjs']]) {
    const { commands } = selectAffectedCommands(paths, contract)
    assert.equal(commands.filter(command => JSON.stringify(command) === JSON.stringify(build)).length, 1)
    const browsers = commands.filter(command => command.includes('--verified-build'))
    assert(browsers.length > 0)
    for (const browser of browsers) {
      const partition = Object.entries(partitionAffectedCommands([browser], contract)).find(([, rows]) => rows.length)[0]
      const check = policy.checks.find(check => check.id === `graph-${partition}-plan`)
      assert.deepEqual(check.requires, ['graph-standard-plan', buildId])
      assert.equal(check.reuse, 'never')
      assert(!browser.includes('--build'))
    }
  }
  let calls = 0
  const forbidden = () => { calls++; throw Error('must execute fresh') }
  for (const command of [build, ['node', 'browser.mjs', '--verified-build']])
    assert.equal(await sourcePlanReuse('standard', { standard: [command] }, {
      environment: { AGENTIC_OS_CI_SOURCE_EVIDENCE_DIR: '/unused', GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' },
      verify: forbidden, captureInputs: forbidden,
    }), null)
  assert.equal(calls, 0)
})
