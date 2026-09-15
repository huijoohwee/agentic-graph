import type { RunOperation } from 'agentic-os/agents/invocation'
// This lazy browser transport uses the authenticated same-origin host. Tool JSON cannot
// choose a destination, credential, principal, provider or executable adapter.
export async function invokeDurableRun(operation: RunOperation, input: Record<string, unknown>): Promise<unknown> {
  if (typeof window === 'undefined') throw new Error('Durable run browser host is unavailable.')
  const { createAgentRunClient } = await import('agentic-os/agents/invocation')
  return createAgentRunClient({ endpoint: new URL('/api/agent-swarm/', window.location.origin).href })
    .invoke(operation, input)
}
