import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

const root = new URL('../../', import.meta.url)
const workerRoot = new URL('../../cloudflare/workers/knowgrph-travel-ollama-overflow/', import.meta.url)
const config = JSON.parse(await readFile(new URL('wrangler.jsonc', workerRoot), 'utf8'))
const dockerfile = await readFile(new URL('Dockerfile', workerRoot), 'utf8')
const definitions = [
  config.containers?.[0]?.image_vars,
  config.env?.staging?.containers?.[0]?.image_vars,
]
assert.equal(definitions.length, 2)
const [expected] = definitions
assert.ok(expected)
for (const definition of definitions) assert.deepEqual(definition, expected)

const modelRef = String(expected.OLLAMA_MODEL_REF || '')
const manifestSha256 = String(expected.OLLAMA_MODEL_MANIFEST_SHA256 || '')
assert.match(modelRef, /^[a-z0-9][a-z0-9._-]*:[A-Za-z0-9][A-Za-z0-9._-]*$/)
assert.match(manifestSha256, /^[0-9a-f]{64}$/)
assert.ok(!modelRef.includes('@'), 'Ollama pull references must use supported name:tag syntax')
assert.match(dockerfile, /ollama pull "\$OLLAMA_MODEL_REF"/)
assert.match(dockerfile, /sha256sum "\$manifest_path"/)
assert.match(dockerfile, /test "\$actual_manifest_sha256" = "\$OLLAMA_MODEL_MANIFEST_SHA256"/)

const [model, tag] = modelRef.split(':')
const registryUrl = `https://registry.ollama.ai/v2/library/${encodeURIComponent(model)}/manifests/${encodeURIComponent(tag)}`
const response = await fetch(registryUrl, {
  headers: { accept: 'application/vnd.docker.distribution.manifest.v2+json' },
  signal: AbortSignal.timeout(30_000),
})
assert.equal(response.status, 200, `Ollama manifest lookup failed: ${response.status}`)
const manifest = new Uint8Array(await response.arrayBuffer())
const observedSha256 = createHash('sha256').update(manifest).digest('hex')
assert.equal(observedSha256, manifestSha256, 'Ollama tag no longer matches the committed manifest digest')

let localBuild = 'not-requested'
if (process.argv.includes('--build')) {
  await run('docker', [
    'build',
    '--pull',
    '--build-arg', `OLLAMA_MODEL_REF=${modelRef}`,
    '--build-arg', `OLLAMA_MODEL_MANIFEST_SHA256=${manifestSha256}`,
    '--tag', `knowgrph-travel-ollama-overflow:verify-${manifestSha256.slice(0, 12)}`,
    workerRoot.pathname,
  ])
  localBuild = 'passed'
}

console.info(`TRAVEL_COMMERCE_OVERFLOW_IMAGE_EVIDENCE ${JSON.stringify({
  schema: 'knowgrph-travel-overflow-image-evidence/v1',
  status: 'passed',
  modelRef,
  manifestSha256,
  registryManifestVerified: true,
  dockerfileDigestGatePresent: true,
  localBuild,
})}`)

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited ${code ?? signal ?? 'unknown'}`))
    })
  })
}
