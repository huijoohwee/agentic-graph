import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

export type ReadinessSummary = {
  ok?: boolean
  checks?: Array<{ name?: string; status?: string; details?: string }>
}

type LocalPaymentRouteResponse = { status: number; body: Record<string, unknown> }

type FakeWranglerReadinessArgs = {
  varsToml: string
  d1Tables: string[]
  d1Columns?: Record<string, string[]>
  d1NotNullColumns?: Record<string, string[]>
  secretNames?: string[]
  extraArgs?: string[]
}

export const repoRoot = resolve(process.cwd(), '..')
export const scriptPath = resolve(repoRoot, 'scripts', 'check-stripe-payment-readiness.mjs')
export const runtimePath = resolve(repoRoot, 'scripts', 'stripe-payment-script-runtime.mjs')
export const webhookProcessingMigrationPath = resolve(repoRoot, 'cloudflare', 'd1', 'migrations', '0006_stripe_webhook_processing_state.sql')

export const REQUIRED_D1_TABLES = [
  'stripe_checkout_sessions',
  'stripe_webhook_events',
  'agentic_commerce_sessions',
  'agentic_commerce_proofs',
  'agentic_commerce_trace_events',
]

export const REQUIRED_D1_COLUMNS: Record<string, string[]> = {
  stripe_webhook_events: [
    'id',
    'event_type',
    'payload_hash',
    'received_at',
    'processed_at',
    'processing_status',
    'processing_error',
  ],
}

export const REQUIRED_D1_NULLABLE_COLUMNS: Record<string, string[]> = {
  stripe_webhook_events: [
    'processed_at',
    'processing_error',
  ],
}

const REQUIRED_SECRET_NAMES = [
  'STRIPE_RESTRICTED_KEY',
  'STRIPE_WEBHOOK_SECRET',
]

export const runReadiness = (varsToml: string, extraArgs: string[] = []) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'agentic-graph-stripe-readiness-'))
  const configPath = join(tempDir, 'wrangler.toml')
  writeFileSync(configPath, `name = "agentic-graph-payment-test"\n${varsToml.trim()}\n`, 'utf8')
  try {
    const result = spawnSync(process.execPath, [
      scriptPath,
      '--config',
      configPath,
      '--skip-wrangler',
      '--json',
      ...extraArgs,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    const summary = JSON.parse(result.stdout || '{}') as ReadinessSummary
    return { result, summary }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

const createFakeWranglerReadinessWorkspace = (args: FakeWranglerReadinessArgs) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'agentic-graph-stripe-readiness-wrangler-'))
  const configPath = join(tempDir, 'wrangler.toml')
  const binDir = join(tempDir, 'bin')
  const npxPath = join(binDir, 'npx')
  const fakeSecretNames = Array.from(new Set([
    ...REQUIRED_SECRET_NAMES,
    ...(args.secretNames || []),
  ]))
  mkdirSync(binDir, { recursive: true })
  writeFileSync(configPath, [
    'name = "agentic-graph-payment-test"',
    args.varsToml.trim(),
    '',
    '[[d1_databases]]',
    'binding = "DB"',
    'database_name = "agentic-graph-storage-test"',
    'database_id = "test-d1"',
    '',
  ].join('\n'), 'utf8')
  writeFileSync(npxPath, `#!/usr/bin/env node
const args = process.argv.slice(2)
const command = String(args[args.indexOf('--command') + 1] || '')
if (args.includes('secret') && args.includes('list')) {
  const secretNames = String(process.env.SECRET_NAMES || '').split(',').filter(Boolean)
  console.log(JSON.stringify(secretNames.map(name => ({ name }))))
  process.exit(0)
}
if (args.includes('d1') && args.includes('execute')) {
  if (command.includes('pragma_table_info')) {
    const columns = ${JSON.stringify(args.d1Columns || REQUIRED_D1_COLUMNS)}
    const notNullColumns = ${JSON.stringify(args.d1NotNullColumns || {})}
    console.log(JSON.stringify([{ success: true, results: Object.entries(columns).flatMap(([table_name, columnNames]) => columnNames.map(column_name => ({ table_name, column_name, not_null: (notNullColumns[table_name] || []).includes(column_name) ? 1 : 0 }))) }]))
    process.exit(0)
  }
  console.log(JSON.stringify([{ success: true, results: ${JSON.stringify(args.d1Tables.map(name => ({ name })))} }]))
  process.exit(0)
  }
console.error('unexpected npx args ' + JSON.stringify(args))
process.exit(1)
`, 'utf8')
  chmodSync(npxPath, 0o755)
  return {
    configPath,
    tempDir,
    env: {
      ...process.env,
      SECRET_NAMES: fakeSecretNames.join(','),
      PATH: `${binDir}:${process.env.PATH || ''}`,
    },
  }
}

export const runReadinessWithFakeWrangler = (args: FakeWranglerReadinessArgs) => {
  const workspace = createFakeWranglerReadinessWorkspace(args)
  try {
    const result = spawnSync(process.execPath, [
      scriptPath,
      '--config',
      workspace.configPath,
      '--json',
      ...(args.extraArgs || []),
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: workspace.env,
    })
    const summary = JSON.parse(result.stdout || '{}') as ReadinessSummary
    return { result, summary }
  } finally {
    rmSync(workspace.tempDir, { recursive: true, force: true })
  }
}

const waitForReadinessProcess = (
  child: ReturnType<typeof spawn>,
  timeoutMs = 10_000,
) => new Promise<{ status: number | null; stdout: string; stderr: string }>((resolveProcess, rejectProcess) => {
  let stdout = ''
  let stderr = ''
  const timer = setTimeout(() => {
    child.kill('SIGTERM')
    rejectProcess(new Error(`timed out waiting for Stripe readiness script after ${timeoutMs}ms`))
  }, timeoutMs)
  child.stdout?.on('data', chunk => { stdout += String(chunk) })
  child.stderr?.on('data', chunk => { stderr += String(chunk) })
  child.once('error', error => {
    clearTimeout(timer)
    rejectProcess(error)
  })
  child.once('close', status => {
    clearTimeout(timer)
    resolveProcess({ status, stdout, stderr })
  })
})

export const runReadinessWithFakeWranglerAsync = async (args: FakeWranglerReadinessArgs) => {
  const workspace = createFakeWranglerReadinessWorkspace(args)
  try {
    const child = spawn(process.execPath, [
      scriptPath,
      '--config',
      workspace.configPath,
      '--json',
      ...(args.extraArgs || []),
    ], {
      cwd: repoRoot,
      env: workspace.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const result = await waitForReadinessProcess(child)
    const summary = JSON.parse(result.stdout || '{}') as ReadinessSummary
    return { result, summary }
  } finally {
    rmSync(workspace.tempDir, { recursive: true, force: true })
  }
}

export const readCheck = (summary: ReadinessSummary, name: string) => {
  const check = summary.checks?.find(entry => entry.name === name)
  if (!check) throw new Error(`expected readiness check ${name}, got ${JSON.stringify(summary)}`)
  return check
}

export const wait = (timeoutMs: number) => new Promise<void>(resolveWait => setTimeout(resolveWait, timeoutMs))

export const withLocalPaymentRoute = async (
  handler: (request: { method?: string; url?: string; body: string }) => LocalPaymentRouteResponse | Promise<LocalPaymentRouteResponse>,
  run: (baseUrl: string) => Promise<void>,
) => {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(Buffer.from(chunk)))
    request.on('end', async () => {
      try {
        const handled = await handler({
          method: request.method,
          url: request.url,
          body: Buffer.concat(chunks).toString('utf8'),
        })
        response.writeHead(handled.status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(handled.body))
      } catch (error) {
        response.writeHead(500, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
      }
    })
  })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => resolveListen())
  })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error(`unexpected local payment route address ${JSON.stringify(address)}`)
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => error ? rejectClose(error) : resolveClose())
    })
  }
}
