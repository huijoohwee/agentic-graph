const PROPERTY_TITLES = Object.freeze([
  'Zero external calls during runtime',
  'Blocked gameplay/inference attempt fails closed and preserves state',
  'Successful model-free tick emits exactly one canonical zero Cost_Log',
  'Decisions-only persistence path',
  'Transactional boundary is enforced',
  'Ephemeral in-memory state with no durable World writes',
  'Per-system rollback preserves prior commits',
  'Deterministic byte-equivalent replay',
  'Frame-derived, refresh-independent, bounded-accumulator advance',
  'Projection is read-only and post-commit',
  'Replay rejects mismatched inputs without mutation',
  'Replay halts on determinism divergence',
  'Flight integration stays finite and bounded',
  'Input clamping to valid ranges',
  'Swept AABB collision yields a non-penetrating result',
  'Earliest-hit selection with stable tie-break',
  'Start-of-tick penetration is resolved',
  'Asset_Spec preference over GLB fallback',
  'Valid Asset_Spec resolves offline from in-repo data',
  'Asset_Spec validation fails closed',
  'GLB fallback is opaque, local, and correctly counted',
  'Remote GLB references are rejected without fetch',
  'Invocation grammar strictness',
  'Supported lifecycle operation is applied exactly once',
  'Unsupported operation is rejected without state change',
  'Inspect is read-only',
  'Normalized input frame composition',
  'Motion_Control is optional input only',
  'Ordered waypoint progression to terminal success',
  'Terminal results are pending until explicit successful Save',
  'Decisions-only idempotent byte-preserving Save',
  'HUD projection reflects underlying state',
  'Fresh mission when no save exists',
  'Fail-closed hydration with reset gating',
  'Write failure retains pending Decisions and supports retry',
  'Hydration reconstructs saved progress before first tick',
  'Fail-closed admission keeps mission stopped',
  'Hold at tick zero until first input',
  'Focus-loss pauses the clock; Free_Orbit pointer-lock exit does not',
  'Stop-then-Start resumes exact state',
  'Valid framing selection applied independently of aircraft',
  'Timeline camera-mark framing ownership round-trip',
  'Invalid camera value is rejected',
  'Canvas ownership preserved across enter/exit and failures',
  'Source-authored activation identity with fail-closed conflicts',
])

const TAG_PREFIX = 'Feature: knowgrph-game-flight-sim, Property '

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function assertFlightSimPropertyReadiness({ readText, listFiles }) {
  const testPaths = (await listFiles('canvas/src/__tests__'))
    .filter(relativePath => /\/flightSimProperties.*\.test\.ts$/.test(relativePath))
  if (testPaths.length === 0) {
    throw new Error('Flight Sim property readiness requires focused fast-check test files')
  }

  const records = []
  for (const relativePath of testPaths) {
    const source = await readText(relativePath)
    const comments = [...source.matchAll(
      /^\/\/ Feature: knowgrph-game-flight-sim, Property (\d+) - ([^\r\n]+)$/gm,
    )]
    for (let index = 0; index < comments.length; index += 1) {
      const match = comments[index]
      const start = match.index
      const end = comments[index + 1]?.index ?? source.length
      records.push({
        relativePath,
        number: Number(match[1]),
        title: match[2],
        segment: source.slice(start, end),
      })
    }
  }

  if (records.length !== PROPERTY_TITLES.length) {
    throw new Error(
      `Flight Sim requires exactly ${PROPERTY_TITLES.length} tagged properties, received ${records.length}`,
    )
  }

  const seen = new Set()
  for (const record of records) {
    const expectedTitle = PROPERTY_TITLES[record.number - 1]
    if (!expectedTitle || record.title !== expectedTitle) {
      throw new Error(
        `${record.relativePath} has an unknown or mismatched Flight Sim Property ${record.number}: ${record.title}`,
      )
    }
    if (seen.has(record.number)) {
      throw new Error(`Flight Sim Property ${record.number} is implemented more than once`)
    }
    seen.add(record.number)

    const exactTag = `${TAG_PREFIX}${record.number} - ${expectedTitle}`
    const testPattern = new RegExp(`\\btest\\(\\s*['"]${escapeRegExp(exactTag)}['"]`, 'g')
    if (countMatches(record.segment, testPattern) !== 1) {
      throw new Error(`${record.relativePath} must name exactly one test ${exactTag}`)
    }
    if (countMatches(record.segment, /\bfc\.assert\s*\(/g) !== 1) {
      throw new Error(`${exactTag} must contain exactly one fast-check assertion`)
    }
    if (countMatches(record.segment, /\bfc\.(?:asyncProperty|property)\s*\(/g) !== 1) {
      throw new Error(`${exactTag} must contain exactly one fast-check property`)
    }
    const parameterPattern = new RegExp(
      `\\bflightSimPropertyParameters\\(\\s*${record.number}\\s*\\)`,
      'g',
    )
    if (countMatches(record.segment, parameterPattern) !== 1) {
      throw new Error(`${exactTag} must use its deterministic 100-run parameter set exactly once`)
    }
  }

  const missing = PROPERTY_TITLES
    .map((_, index) => index + 1)
    .filter(number => !seen.has(number))
  if (missing.length > 0) {
    throw new Error(`Flight Sim property inventory is missing: ${missing.join(', ')}`)
  }

  const harness = await readText(
    'canvas/src/__tests__/helpers/flightSimPropertyHarness.ts',
  )
  if (
    !harness.includes('export const FLIGHT_SIM_PROPERTY_RUNS = 100')
    || !harness.includes('numRuns: FLIGHT_SIM_PROPERTY_RUNS')
  ) {
    throw new Error('Flight Sim fast-check properties must use the shared 100-run harness')
  }

  return Object.freeze({
    propertyCount: PROPERTY_TITLES.length,
    generatedCaseCount: PROPERTY_TITLES.length * 100,
    testFileCount: testPaths.length,
  })
}
