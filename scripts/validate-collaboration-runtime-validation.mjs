import path from 'node:path'
import { text } from 'node:stream/consumers'
import {
  validateCollaborationRuntimeSourceRevision,
  validateCollaborationRuntimeValidationArtifact,
  validateCollaborationRuntimeReportArtifact,
  validateCollaborationRuntimeValidationPair,
  validateCollaborationRuntimeValidationSource,
} from './collaboration-runtime-report.mjs'

const usage = 'usage: npm run collaboration:report:check-result -- <validation.json|-> [--report <report.json>] [--source-revision <40-hex-sha>]'
const args = process.argv.slice(2)
if (args.length < 1 || args.length % 2 === 0) throw new Error(usage)

const input = args[0]
let reportPath = null
let expectedSourceRevision = null
for (let index = 1; index < args.length; index += 2) {
  const option = args[index]
  const value = args[index + 1]
  if (!value || value === '-') throw new Error(usage)
  if (option === '--report' && !reportPath) reportPath = value
  else if (option === '--source-revision' && !expectedSourceRevision) {
    expectedSourceRevision = validateCollaborationRuntimeSourceRevision(value)
  } else throw new Error(usage)
}
if (expectedSourceRevision && !reportPath) throw new Error(usage)

const result = input === '-'
  ? await validateCollaborationRuntimeValidationSource(await text(process.stdin))
  : await validateCollaborationRuntimeValidationArtifact(path.resolve(input))

if (reportPath) {
  const reportIdentity = await validateCollaborationRuntimeReportArtifact(path.resolve(reportPath))
  validateCollaborationRuntimeValidationPair(result, reportIdentity, expectedSourceRevision)
}

const pairStatus = reportPath ? `, report ${result.reportDigest}, source ${result.sourceRevision}` : ''
console.log(`[agentic-graph] collaboration validation result passed (${result.schema}, ${result.status}${pairStatus})`)
