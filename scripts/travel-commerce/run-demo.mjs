import { spawn } from 'node:child_process'
import { unlink, writeFile } from 'node:fs/promises'
import process from 'node:process'

if (!process.argv.includes('--local-demo')) {
  throw new Error('Refusing to start deterministic service doubles without explicit --local-demo.')
}

const output = await run('npm', [
  'run', 'travel-commerce:test', '--',
  '--disableConsoleIntercept',
  'cloudflare/workers/knowgrph-travel-commerce/test/evidence/demo-runner.test.ts',
], { capture: true })
const report = readDemoReport(output)

if (process.argv.includes('--browser')) {
  const evidenceName = `travel-commerce-demo-evidence-${process.pid}.json`
  const evidenceUrl = `/${evidenceName}`
  const evidencePath = new URL(`../../canvas/public/${evidenceName}`, import.meta.url)
  await writeFile(evidencePath, `${JSON.stringify(report)}\n`, { flag: 'wx' })
  try {
    await run(process.execPath, ['scripts/travel-commerce/verify-demo-browser.mjs', '--local-demo'], {
      env: { ...process.env, KG_TRAVEL_COMMERCE_DEMO_EVIDENCE_URL: evidenceUrl },
    })
  } finally {
    await unlink(evidencePath).catch(() => undefined)
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const capture = options.capture === true
    const chunks = []
    const child = spawn(command, args, {
      cwd: new URL('../../', import.meta.url),
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: options.env ?? process.env,
    })
    if (capture) {
      child.stdout.on('data', chunk => {
        chunks.push(String(chunk))
        process.stdout.write(chunk)
      })
      child.stderr.on('data', chunk => {
        chunks.push(String(chunk))
        process.stderr.write(chunk)
      })
    }
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve(chunks.join(''))
      else reject(new Error(`${command} exited ${code ?? signal ?? 'unknown'}`))
    })
  })
}

function readDemoReport(output) {
  const line = output.split(/\r?\n/).find(value => value.startsWith('TRAVEL_COMMERCE_DEMO '))
  if (!line) throw new Error('Executable demo did not emit TRAVEL_COMMERCE_DEMO evidence.')
  const value = JSON.parse(line.slice('TRAVEL_COMMERCE_DEMO '.length))
  if (
    value?.schema !== 'knowgrph-travel-commerce-demo-evidence/v1'
    || value.status !== 'passed'
    || !Array.isArray(value.beats)
    || value.beats.length !== 8
    || !value.beats.every(beat => beat?.status === 'passed')
    || value.providerRequests !== 0
    || value.realPaymentCalls !== 0
    || value.productionMutations !== 0
  ) throw new Error('Executable demo evidence failed its safety contract.')
  return value
}
