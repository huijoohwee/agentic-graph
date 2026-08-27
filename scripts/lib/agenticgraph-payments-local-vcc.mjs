import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import process from 'node:process'

export const KNOWGRPH_PAYMENTS_LOCAL_VCC_SCHEMA_ID =
  'knowgrph-payments-local-vcc-attestation/v1'

const HEX_64_PATTERN = /^[0-9a-f]{64}$/
const COMMAND_TIMEOUT_MS = 180_000
const COMMAND_MAX_BUFFER_BYTES = 16 * 1024 * 1024

const PREPARATION = Object.freeze({
  id: 'build-payment-client-and-shared-contracts',
  executable: 'npm',
  args: Object.freeze(['--prefix', 'canvas', 'run', 'build']),
  env: Object.freeze({ KG_SKIP_DOCS_UPDATE: '1' }),
})

export const KNOWGRPH_PAYMENTS_LOCAL_VCC_SUITES = Object.freeze([
  Object.freeze({
    id: 'shared-payment-contracts',
    executable: process.execPath,
    args: Object.freeze([
      '--test',
      '--test-reporter=tap',
      'grph-shared/__tests__/agentic-purchase-runtime-contract.test.mjs',
      'grph-shared/__tests__/payment-rail-ssot.test.mjs',
      'grph-shared/__tests__/payment-record-document.test.mjs',
      'grph-shared/__tests__/payment-runtime-contract.test.mjs',
      'grph-shared/__tests__/straitsx-payment-ssot.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'worker-payment-runtime',
    executable: process.execPath,
    args: Object.freeze([
      '--import',
      'tsx',
      '--test',
      '--test-reporter=tap',
      'cloudflare/workers/knowgrph-payment/__tests__/agentic-purchase-safety.test.ts',
      'cloudflare/workers/knowgrph-payment/__tests__/payment-runtime-service.test.ts',
      'cloudflare/workers/knowgrph-payment/__tests__/payment-rail-adapters.test.ts',
      'cloudflare/workers/knowgrph-payment/__tests__/payment-event-ingress.test.ts',
      'cloudflare/workers/knowgrph-payment/__tests__/payment-runtime-routes.test.ts',
    ]),
  }),
  Object.freeze({
    id: 'canvas-payment-runtime',
    executable: 'npm',
    args: Object.freeze([
      '--prefix',
      'canvas',
      'run',
      'test:ci:unit',
      '--',
      'ui.payments.runtime',
    ]),
  }),
  Object.freeze({
    id: 'mcp-payment-contracts',
    executable: process.execPath,
    args: Object.freeze([
      '--test',
      '--test-reporter=tap',
      'mcp/__tests__/payment-tool-contract.test.mjs',
      'mcp/__tests__/payment-runtime.test.mjs',
      'mcp/__tests__/payment-stdio-e2e.test.mjs',
      'mcp/__tests__/payment-os-status.test.mjs',
      'mcp/__tests__/os-status-runtime.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'local-vcc-evaluator-contract',
    executable: process.execPath,
    args: Object.freeze([
      '--test',
      '--test-reporter=tap',
      'scripts/__tests__/knowgrph-payments-local-vcc.test.mjs',
    ]),
  }),
])

const sha256 = value => createHash('sha256').update(value).digest('hex')
const exactKeys = (value, expected) =>
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.keys(value).sort().join('\n') === [...expected].sort().join('\n')

const commandIdentity = command => ({
  id: command.id,
  executable: command.executable === process.execPath ? '{node}' : command.executable,
  args: [...command.args],
  ...(command.env ? { env: command.env } : {}),
})

const commandEnvironment = command => {
  const environment = { ...process.env, NO_COLOR: '1', ...command.env }
  // A readiness CLI invoked from `node --test` must launch an independent
  // nested test runner, not inherit the parent's internal child marker.
  delete environment.NODE_TEST_CONTEXT
  return environment
}

export const KNOWGRPH_PAYMENTS_LOCAL_VCC_INVENTORY_DIGEST = sha256(JSON.stringify({
  preparation: commandIdentity(PREPARATION),
  suites: KNOWGRPH_PAYMENTS_LOCAL_VCC_SUITES.map(commandIdentity),
}))

const defaultExecutor = command => new Promise(resolve => {
  execFile(command.executable, [...command.args], {
    cwd: command.root,
    encoding: 'utf8',
    env: commandEnvironment(command),
    maxBuffer: COMMAND_MAX_BUFFER_BYTES,
    timeout: COMMAND_TIMEOUT_MS,
  }, (error, stdout, stderr) => {
    resolve({
      exitCode: error ? Number.isSafeInteger(error.code) ? error.code : 1 : 0,
      stdout: String(stdout || ''),
      stderr: String(stderr || error?.message || ''),
    })
  })
})

const normalizedCommandResult = result => ({
  exitCode: Number.isSafeInteger(result?.exitCode) ? result.exitCode : 1,
  output: `${String(result?.stdout || '')}\n${String(result?.stderr || '')}`,
})

const readTapCount = (output, name) => {
  const matches = [...output.matchAll(new RegExp(`^# ${name} (\\d+)\\s*$`, 'gm'))]
  return matches.length > 0 ? Number(matches.at(-1)[1]) : 0
}

const readSuiteCounts = (suite, output) => {
  if (suite.id !== 'canvas-payment-runtime') {
    return {
      testCount: readTapCount(output, 'tests'),
      passCount: readTapCount(output, 'pass'),
      failCount: readTapCount(output, 'fail'),
    }
  }
  const summary = output.match(/^SUMMARY total=(\d+) ok=(\d+) failed=(\d+)\s*$/m)
  return {
    testCount: Number(summary?.[1] || 0),
    passCount: Number(summary?.[2] || 0),
    failCount: Number(summary?.[3] || 0),
  }
}

const executePreparation = async ({ root, executor }) => {
  const result = normalizedCommandResult(await executor({ ...PREPARATION, root }))
  return Object.freeze({
    id: PREPARATION.id,
    exitCode: result.exitCode,
    status: result.exitCode === 0 ? 'pass' : 'fail',
    outputDigest: sha256(result.output),
  })
}

const skippedSuiteResult = suite => Object.freeze({
  id: suite.id,
  exitCode: null,
  status: 'skipped',
  testCount: 0,
  passCount: 0,
  failCount: 0,
  outputDigest: sha256(''),
})

const executeSuite = async ({ root, suite, executor }) => {
  const result = normalizedCommandResult(await executor({ ...suite, root }))
  const { testCount, passCount, failCount } = readSuiteCounts(suite, result.output)
  const passed =
    result.exitCode === 0
    && testCount > 0
    && passCount === testCount
    && failCount === 0
  return Object.freeze({
    id: suite.id,
    exitCode: result.exitCode,
    status: passed ? 'pass' : 'fail',
    testCount,
    passCount,
    failCount,
    outputDigest: sha256(result.output),
  })
}

export function validateKnowgrphPaymentsLocalVccAttestation(
  attestation,
  expectedSourceEvidenceDigest,
) {
  const failures = []
  if (!exactKeys(attestation, [
    'schemaId',
    'sourceEvidenceDigest',
    'inventoryDigest',
    'preparation',
    'suites',
  ])) {
    failures.push('Local VCC attestation must contain only the canonical fields.')
  }
  if (attestation?.schemaId !== KNOWGRPH_PAYMENTS_LOCAL_VCC_SCHEMA_ID) {
    failures.push('Local VCC attestation schema is unknown.')
  }
  if (
    !HEX_64_PATTERN.test(attestation?.sourceEvidenceDigest || '')
    || attestation.sourceEvidenceDigest !== expectedSourceEvidenceDigest
  ) {
    failures.push('Local VCC attestation is not bound to this source evidence digest.')
  }
  if (attestation?.inventoryDigest !== KNOWGRPH_PAYMENTS_LOCAL_VCC_INVENTORY_DIGEST) {
    failures.push('Local VCC command inventory does not match the repository allowlist.')
  }
  if (!exactKeys(attestation?.preparation, ['id', 'exitCode', 'status', 'outputDigest'])) {
    failures.push('Local VCC preparation result is malformed.')
  } else if (
    attestation.preparation.id !== PREPARATION.id
    || attestation.preparation.exitCode !== 0
    || attestation.preparation.status !== 'pass'
    || !HEX_64_PATTERN.test(attestation.preparation.outputDigest)
  ) {
    failures.push('Local VCC preparation did not complete successfully.')
  }

  const expectedSuiteIds = KNOWGRPH_PAYMENTS_LOCAL_VCC_SUITES.map(suite => suite.id)
  const suites = Array.isArray(attestation?.suites) ? attestation.suites : []
  if (
    suites.length !== expectedSuiteIds.length
    || suites.map(suite => suite?.id).join('\n') !== expectedSuiteIds.join('\n')
  ) {
    failures.push('Local VCC suite results do not match the exact ordered allowlist.')
  }
  for (const suite of suites) {
    if (!exactKeys(suite, [
      'id',
      'exitCode',
      'status',
      'testCount',
      'passCount',
      'failCount',
      'outputDigest',
    ])) {
      failures.push(`Local VCC suite ${String(suite?.id)} result is malformed.`)
      continue
    }
    if (
      suite.exitCode !== 0
      || suite.status !== 'pass'
      || !Number.isSafeInteger(suite.testCount)
      || suite.testCount < 1
      || suite.passCount !== suite.testCount
      || suite.failCount !== 0
      || !HEX_64_PATTERN.test(suite.outputDigest)
    ) {
      failures.push(`Local VCC suite ${suite.id} did not execute a passing non-zero test set.`)
    }
  }
  return Object.freeze({ valid: failures.length === 0, failures: Object.freeze(failures) })
}

export async function runKnowgrphPaymentsLocalVcc({
  root,
  sourceEvidenceDigest,
  executor = defaultExecutor,
}) {
  const preparation = await executePreparation({ root, executor })
  const suites = preparation.status === 'pass'
    ? await Promise.all(KNOWGRPH_PAYMENTS_LOCAL_VCC_SUITES.map(suite =>
        executeSuite({ root, suite, executor })))
    : KNOWGRPH_PAYMENTS_LOCAL_VCC_SUITES.map(skippedSuiteResult)
  const attestation = Object.freeze({
    schemaId: KNOWGRPH_PAYMENTS_LOCAL_VCC_SCHEMA_ID,
    sourceEvidenceDigest,
    inventoryDigest: KNOWGRPH_PAYMENTS_LOCAL_VCC_INVENTORY_DIGEST,
    preparation,
    suites: Object.freeze(suites),
  })
  const validation = validateKnowgrphPaymentsLocalVccAttestation(
    attestation,
    sourceEvidenceDigest,
  )
  return Object.freeze({ ok: validation.valid, attestation, validation })
}
