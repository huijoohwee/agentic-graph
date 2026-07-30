function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message
  return String(error || 'unknown verification failure')
}

export class NamedVerificationAggregateError extends Error {
  constructor(scope, failures) {
    const frozenFailures = Object.freeze(failures.map(failure => Object.freeze({
      name: String(failure.name),
      message: errorMessage(failure.message),
    })))
    super([
      `${scope} failed ${frozenFailures.length} named verification(s):`,
      ...frozenFailures.map(
        (failure, index) => `${index + 1}. ${failure.name}: ${failure.message}`,
      ),
    ].join('\n'))
    this.name = 'NamedVerificationAggregateError'
    this.scope = scope
    this.failures = frozenFailures
  }
}

export async function collectNamedVerifications({
  execute,
  log = console,
  verifications,
}) {
  const failures = []
  const results = []
  for (const verification of verifications) {
    log.info?.(`[verification:start] ${verification.name}`)
    try {
      const result = await execute(verification)
      results.push(Object.freeze({
        name: verification.name,
        ok: true,
        result,
      }))
      log.info?.(`[verification:pass] ${verification.name}`)
    } catch (error) {
      const message = errorMessage(error)
      failures.push(Object.freeze({ name: verification.name, message }))
      results.push(Object.freeze({
        name: verification.name,
        ok: false,
        message,
      }))
      log.error?.(`[verification:fail] ${verification.name}: ${message}`)
    }
  }
  return Object.freeze({
    failures: Object.freeze(failures),
    results: Object.freeze(results),
  })
}

export function throwForNamedFailures(scope, failures) {
  if (failures.length > 0) {
    throw new NamedVerificationAggregateError(scope, failures)
  }
}
