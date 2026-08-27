import path from 'node:path'
import { buffer } from 'node:stream/consumers'
import {
  COLLABORATION_RUNTIME_VALIDATION_SCHEMA,
  validateCollaborationRuntimeReportArtifact,
  validateCollaborationRuntimeReportSource,
  validateCollaborationRuntimeValidation,
} from './collaboration-runtime-report.mjs'

const args = process.argv.slice(2)
const jsonOutput = args[0] === '--json'
const inputArgs = jsonOutput ? args.slice(1) : args
const inputType = inputArgs[0] === '-' ? 'stdin' : inputArgs[0] ? 'file' : 'unknown'

const classifyError = error => {
  const message = error instanceof Error ? error.message : String(error)
  if (message.startsWith('usage:')) return { code: 'invalid-arguments', message }
  if (error instanceof SyntaxError) return { code: 'invalid-json', message }
  if (message.startsWith('invalid agenticgraph.collaboration-runtime-report/')) {
    return { code: 'schema-validation-failed', message }
  }
  if (error && typeof error === 'object' && typeof error.code === 'string') {
    return { code: 'input-read-failed', message }
  }
  return { code: 'validation-failed', message }
}

const writeValidationEnvelope = async (stream, envelope) => {
  await validateCollaborationRuntimeValidation(envelope)
  stream.write(`${JSON.stringify(envelope, null, 2)}\n`)
}

const main = async () => {
  if (inputArgs.length !== 1) {
    throw new Error('usage: npm run collaboration:report:check -- [--json] <report.json|->')
  }

  const input = inputArgs[0]
  const result = inputType === 'stdin'
    ? await validateCollaborationRuntimeReportSource(await buffer(process.stdin))
    : await validateCollaborationRuntimeReportArtifact(path.resolve(input))

  if (jsonOutput) {
    await writeValidationEnvelope(process.stdout, {
      schema: COLLABORATION_RUNTIME_VALIDATION_SCHEMA,
      status: 'passed',
      schemaId: result.schemaId,
      schemaVersion: result.schemaVersion,
      sourceRevision: result.sourceRevision,
      reportDigest: result.reportDigest,
      input: inputType,
    })
  } else {
    console.log(`[agenticgraph] collaboration runtime report passed (${result.schemaVersion})`)
  }
}

try {
  await main()
} catch (error) {
  if (!jsonOutput) throw error
  await writeValidationEnvelope(process.stderr, {
    schema: COLLABORATION_RUNTIME_VALIDATION_SCHEMA,
    status: 'failed',
    input: inputType,
    error: classifyError(error),
  })
  process.exitCode = 1
}
