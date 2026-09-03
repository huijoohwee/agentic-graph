import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workerRoot = new URL('../../cloudflare/workers/agentic-graph-travel-ollama-overflow/', import.meta.url)
const config = JSON.parse(await readFile(new URL('wrangler.jsonc', workerRoot), 'utf8'))
const expectedModels = ['@cf/openai/gpt-oss-20b']
const lanes = [config, config.env?.staging]

for (const lane of lanes) {
  assert.deepEqual(lane?.ai, { binding: 'AI', remote: true }, 'overflow must bind remote Workers AI')
  assert.equal(lane?.containers, undefined, 'Workers Free overflow cannot declare Containers')
  assert.equal(lane?.durable_objects, undefined, 'Workers Free overflow cannot require a Container Durable Object')
  assert.equal(lane?.migrations, undefined, 'Workers Free overflow cannot require Container migrations')
  assert.deepEqual(JSON.parse(String(lane?.vars?.ALLOWED_MODELS_JSON)), expectedModels)
}

console.info(`TRAVEL_COMMERCE_OVERFLOW_WORKERS_AI_EVIDENCE ${JSON.stringify({
  schema: 'agentic-graph-travel-overflow-workers-ai-evidence/v1',
  status: 'passed',
  models: expectedModels,
  workerPlan: 'free',
  freeDailyNeuronLimit: 10_000,
  containersDeclared: false,
})}`)
