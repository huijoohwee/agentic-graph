import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  AGENTIC_OS_MEMORY_LAYER_CONTRACT_VERSION,
  requireMemoryScope,
} from '@/features/memory/aiAgentsMemoryLayerContract.mjs'

type MemoryRuntimeModule = {
  addMemoryLayerMemory: (input: Record<string, unknown>, options: { rootDir: string, storePath?: string }) => Promise<{
    contractVersion?: string
    memory_ids?: string[]
    results?: Array<{ event?: string, memory?: string }>
    cost_log?: { estimated_cost_usd?: number | null }
  }>
  searchMemoryLayerMemories: (input: Record<string, unknown>, options: { rootDir: string, storePath?: string }) => Promise<{
    contractVersion?: string
    results?: Array<{ memory?: string, score?: number }>
    cost_log?: { operation?: string, estimated_cost_usd?: number | null }
  }>
  assembleMemoryLayerPrompt: (input: Record<string, unknown>) => {
    contractVersion?: string
    enriched_system_message?: string
    injected_memory_count?: number
    injected_token_estimate?: number
  }
}

const importMemoryRuntime = async (): Promise<MemoryRuntimeModule> => {
  const runtimeUrl = pathToFileURL(path.resolve(process.cwd(), '..', 'mcp', 'memory-layer-runtime.js')).href
  return await import(runtimeUrl) as MemoryRuntimeModule
}

export async function testAgenticGraphMemoryLayerRuntimeAddsSearchesAndAssemblesScopedContext() {
  const runtime = await importMemoryRuntime()
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-graph-memory-layer-'))
  const storePath = 'memory-store.json'

  const added = await runtime.addMemoryLayerMemory({
    messages: [
      { role: 'user', content: 'Prefer local-first research memory and avoid Cloudflare deployment unless explicitly instructed.' },
      { role: 'assistant', content: 'I will keep memory local-first and leave deployment gated.' },
    ],
    user_id: 'user-contract-test',
    agent_id: 'agent-contract-test',
    metadata: { memory_key: 'deployment-boundary' },
  }, { rootDir, storePath })

  if (added.contractVersion !== AGENTIC_OS_MEMORY_LAYER_CONTRACT_VERSION) {
    throw new Error(`expected memory add contract version, got ${JSON.stringify(added)}`)
  }
  if (added.results?.[0]?.event !== 'ADD' || !added.memory_ids?.[0]) {
    throw new Error(`expected first memory add to create a record, got ${JSON.stringify(added)}`)
  }
  if (added.cost_log?.estimated_cost_usd !== null) {
    throw new Error(`expected local-json memory add to have null cost, got ${JSON.stringify(added.cost_log)}`)
  }

  const updated = await runtime.addMemoryLayerMemory({
    text: 'Prefer local-first research memory; Cloudflare deployment remains operator-gated.',
    user_id: 'user-contract-test',
    agent_id: 'agent-contract-test',
    metadata: { memory_key: 'deployment-boundary' },
  }, { rootDir, storePath })
  if (updated.results?.[0]?.event !== 'UPDATE') {
    throw new Error(`expected memory_key to update the existing memory, got ${JSON.stringify(updated)}`)
  }

  const found = await runtime.searchMemoryLayerMemories({
    query: 'Should deployment happen automatically?',
    user_id: 'user-contract-test',
    top_k: 3,
  }, { rootDir, storePath })
  if (found.contractVersion !== AGENTIC_OS_MEMORY_LAYER_CONTRACT_VERSION || found.cost_log?.operation !== 'search') {
    throw new Error(`expected memory search contract output, got ${JSON.stringify(found)}`)
  }
  if (!found.results?.length || !String(found.results[0].memory || '').includes('operator-gated')) {
    throw new Error(`expected search to return the updated scoped memory, got ${JSON.stringify(found)}`)
  }

  const assembled = runtime.assembleMemoryLayerPrompt({
    base_system_message: 'Answer the user directly.',
    memories: found.results,
    max_memory_tokens: 80,
  })
  if (!assembled.enriched_system_message?.includes('## Relevant Context')) {
    throw new Error(`expected prompt assembler to inject relevant context, got ${JSON.stringify(assembled)}`)
  }
  if (Number(assembled.injected_token_estimate || 0) > 80 || assembled.injected_memory_count !== 1) {
    throw new Error(`expected prompt assembler to respect token budget, got ${JSON.stringify(assembled)}`)
  }
}

export function testAgenticGraphMemoryLayerRequiresExplicitRuntimeScope() {
  let errorMessage = ''
  try {
    requireMemoryScope({ query: 'missing scope' })
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error)
  }
  if (!errorMessage.includes('user_id') || !errorMessage.includes('agent_id') || !errorMessage.includes('run_id')) {
    throw new Error(`expected memory scope validation to reject missing runtime scope, got ${JSON.stringify(errorMessage)}`)
  }
}
