import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_NPM_AUDIT_RETRY_DELAYS_MS = Object.freeze([1_000, 3_000])
export const DEFAULT_NPM_AUDIT_FETCH_TIMEOUT_MS = 10_000
export const DEFAULT_NPM_AUDIT_COMMAND_TIMEOUT_MS = 12_000
export const NPM_AUDIT_TIMEOUT_MARKER = '[agentic-graph] npm audit command timed out'
export const OSV_QUERY_BATCH_SIZE = 500
export const OSV_QUERY_TIMEOUT_MS = 30_000

const sleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs))

export const isTransientNpmAuditFailure = output => (
  String(output).includes(NPM_AUDIT_TIMEOUT_MARKER)
  || (
    /npm warn audit (?:503 Service Unavailable|network timeout)/iu.test(String(output))
    && /npm error audit endpoint returned an error/iu.test(String(output))
  )
)

export const runNpmAuditWithRetry = async ({
  retryDelaysMs = DEFAULT_NPM_AUDIT_RETRY_DELAYS_MS,
  runAudit,
  runFallback,
  sleepImpl = sleep,
}) => {
  for (let attempt = 0; ; attempt += 1) {
    const result = await runAudit()
    if (result.code === 0) return result
    const transient = isTransientNpmAuditFailure(result.output)
    if (transient && attempt >= retryDelaysMs.length && runFallback) {
      const fallback = await runFallback()
      process.stdout.write(fallback.output)
      if (fallback.code === 0) return fallback
      throw new Error(`OSV audit fallback exited with ${fallback.code ?? 1}`)
    }
    if (!transient || attempt >= retryDelaysMs.length) {
      const attempts = attempt + 1
      const suffix = attempts > 1 ? ` after ${attempts} attempts` : ''
      throw new Error(`npm audit exited with ${result.code ?? 1}${suffix}`)
    }
    await sleepImpl(retryDelaysMs[attempt])
  }
}

export const runAuditCommand = (args, {
  spawnProcess = spawn,
  timeoutMs = DEFAULT_NPM_AUDIT_COMMAND_TIMEOUT_MS,
  killGraceMs = 5_000,
} = {}) => new Promise((resolve, reject) => {
  const child = spawnProcess('npm', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  let settled = false
  let timedOut = false
  let forceKillTimer
  const timeoutTimer = setTimeout(() => {
    timedOut = true
    output += `${NPM_AUDIT_TIMEOUT_MARKER} after ${timeoutMs}ms\n`
    child.kill('SIGTERM')
    forceKillTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs)
  }, timeoutMs)
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  child.on('error', error => {
    if (settled) return
    settled = true
    clearTimeout(timeoutTimer)
    clearTimeout(forceKillTimer)
    reject(error)
  })
  child.on('close', code => {
    if (settled) return
    settled = true
    clearTimeout(timeoutTimer)
    clearTimeout(forceKillTimer)
    process.stdout.write(output)
    resolve({ code: timedOut ? 124 : code, output })
  })
})

export const collectOsvPackages = (lockfile, { omitDev = false } = {}) => {
  const packages = new Map()
  for (const [packagePath, metadata] of Object.entries(lockfile?.packages || {})) {
    const markerIndex = packagePath.lastIndexOf('node_modules/')
    if (markerIndex < 0 || typeof metadata?.version !== 'string') continue
    if (!String(metadata.resolved || '').startsWith('https://registry.npmjs.org/')) continue
    if (omitDev && metadata.dev === true) continue
    const name = packagePath.slice(markerIndex + 'node_modules/'.length)
    if (name === '') continue
    packages.set(`${name}\0${metadata.version}`, { name, version: metadata.version })
  }
  return [...packages.values()].sort((left, right) => {
    const identity = `${left.name}\0${left.version}`
    const compared = `${right.name}\0${right.version}`
    return identity < compared ? -1 : identity > compared ? 1 : 0
  })
}

export const runOsvAudit = async ({
  prefix,
  omitDev = false,
  fetchImpl = fetch,
  readFileImpl = readFile,
  timeoutMs = OSV_QUERY_TIMEOUT_MS,
} = {}) => {
  const lockfilePath = path.resolve(process.cwd(), prefix || '.', 'package-lock.json')
  const lockfile = JSON.parse(await readFileImpl(lockfilePath, 'utf8'))
  const packages = collectOsvPackages(lockfile, { omitDev })
  if (packages.length === 0) throw new Error('OSV audit found no registry package versions to verify')
  const findings = []

  for (let offset = 0; offset < packages.length; offset += OSV_QUERY_BATCH_SIZE) {
    const batch = packages.slice(offset, offset + OSV_QUERY_BATCH_SIZE)
    const response = await fetchImpl('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        queries: batch.map(({ name, version }) => ({ package: { ecosystem: 'npm', name }, version })),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`OSV audit endpoint returned HTTP ${response.status}`)
    const body = await response.json()
    if (!Array.isArray(body?.results) || body.results.length !== batch.length) {
      throw new Error('OSV audit result cardinality does not match the exact package inventory')
    }
    body.results.forEach((result, index) => {
      if (result?.next_page_token) throw new Error('OSV audit result requires unhandled pagination')
      if (result?.vulns !== undefined && !Array.isArray(result.vulns)) {
        throw new Error('OSV audit returned a malformed vulnerability inventory')
      }
      for (const vulnerability of result?.vulns || []) {
        if (typeof vulnerability?.id !== 'string' || vulnerability.id === '') {
          throw new Error('OSV audit returned a vulnerability without an id')
        }
        findings.push({ ...batch[index], id: vulnerability.id })
      }
    })
  }

  const uniqueFindings = [...new Map(findings.map(finding => [
    `${finding.name}\0${finding.version}\0${finding.id}`,
    finding,
  ])).values()]
  if (uniqueFindings.length > 0) {
    const inventory = uniqueFindings.slice(0, 50)
      .map(({ name, version, id }) => `${name}@${version} ${id}`)
      .join('\n')
    const suffix = uniqueFindings.length > 50 ? `\n... ${uniqueFindings.length - 50} more` : ''
    return { code: 1, output: `[agentic-graph] OSV audit found ${uniqueFindings.length} vulnerabilities\n${inventory}${suffix}\n` }
  }
  return {
    code: 0,
    output: `[agentic-graph] OSV fallback audited ${packages.length} exact npm package versions: 0 vulnerabilities\n`,
  }
}

const parseAuditArgs = argumentsList => {
  const prefixArgument = argumentsList.find(argument => argument.startsWith('--prefix='))
  const prefix = prefixArgument?.slice('--prefix='.length)
  if (prefix !== undefined && (prefix === '' || path.isAbsolute(prefix) || prefix.split(/[\\/]+/u).includes('..'))) {
    throw new Error('npm audit prefix must be a non-empty relative path without parent traversal')
  }
  const auditArguments = argumentsList.filter(argument => argument !== prefixArgument)
  return {
    auditArguments: [
    ...(prefix ? ['--prefix', prefix] : []),
    'audit',
    '--fetch-retries=0',
    `--fetch-timeout=${DEFAULT_NPM_AUDIT_FETCH_TIMEOUT_MS}`,
    ...auditArguments,
    ],
    omitDev: auditArguments.includes('--omit=dev'),
    prefix,
  }
}

export const main = async (argumentsList = process.argv.slice(2)) => {
  const { auditArguments, omitDev, prefix } = parseAuditArgs(argumentsList)
  await runNpmAuditWithRetry({
    retryDelaysMs: [],
    runAudit: () => runAuditCommand(auditArguments),
    runFallback: () => runOsvAudit({ prefix, omitDev }),
  })
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) await main()
