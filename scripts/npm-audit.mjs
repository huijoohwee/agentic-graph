import { spawn } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_NPM_AUDIT_RETRY_DELAYS_MS = Object.freeze([1_000, 3_000])
export const DEFAULT_NPM_AUDIT_FETCH_TIMEOUT_MS = 90_000

const sleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs))

export const isTransientNpmAuditFailure = output => (
  /npm warn audit (?:503 Service Unavailable|network timeout)/iu.test(String(output))
  && /npm error audit endpoint returned an error/iu.test(String(output))
)

export const runNpmAuditWithRetry = async ({
  retryDelaysMs = DEFAULT_NPM_AUDIT_RETRY_DELAYS_MS,
  runAudit,
  sleepImpl = sleep,
}) => {
  for (let attempt = 0; ; attempt += 1) {
    const result = await runAudit()
    if (result.code === 0) return result
    if (!isTransientNpmAuditFailure(result.output) || attempt >= retryDelaysMs.length) {
      const attempts = attempt + 1
      const suffix = attempts > 1 ? ` after ${attempts} attempts` : ''
      throw new Error(`npm audit exited with ${result.code ?? 1}${suffix}`)
    }
    await sleepImpl(retryDelaysMs[attempt])
  }
}

const runAuditCommand = args => new Promise((resolve, reject) => {
  const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  child.on('error', reject)
  child.on('close', code => {
    process.stdout.write(output)
    resolve({ code, output })
  })
})

const parseAuditArgs = argumentsList => {
  const prefixArgument = argumentsList.find(argument => argument.startsWith('--prefix='))
  const prefix = prefixArgument?.slice('--prefix='.length)
  if (prefix !== undefined && (prefix === '' || path.isAbsolute(prefix) || prefix.split(/[\\/]+/u).includes('..'))) {
    throw new Error('npm audit prefix must be a non-empty relative path without parent traversal')
  }
  const auditArguments = argumentsList.filter(argument => argument !== prefixArgument)
  return [
    ...(prefix ? ['--prefix', prefix] : []),
    'audit',
    '--fetch-retries=0',
    `--fetch-timeout=${DEFAULT_NPM_AUDIT_FETCH_TIMEOUT_MS}`,
    ...auditArguments,
  ]
}

export const main = async (argumentsList = process.argv.slice(2)) => {
  const args = parseAuditArgs(argumentsList)
  await runNpmAuditWithRetry({ runAudit: () => runAuditCommand(args) })
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) await main()
