export type AgentReadyOnboarding = {
  promise?: string
  grammarSummary?: string
  canonicalOperatorContract?: string
  canonicalTransportRule?: string
  grammarToolName?: string
  grammarExamples?: string[]
  grammarExecutionBoundary?: string
  hostedBuilderExamples?: string[]
  hostedGrammarDefaultPath?: string
  hostedGrammarFallback?: string
  publicReadMcpUrl?: string
  controlPlaneMcpUrl?: string
  cheapestProofPath?: string
  steps?: Array<{ order?: number; label?: string; action?: string }>
}

export function assertAgentReadyOnboardingHtml(html: string) {
  if (
    !html.includes('Fastest Path')
    || !html.includes('Map intent. Orchestrate agents. Prove outcomes.')
    || !html.includes('A source-backed canvas where / routes work, # sets meaning, and @ binds context.')
    || !html.includes('One canonical operator contract: install and discovery stay on the public endpoint')
    || !html.includes('Canonicalize the contract first, not the transport.')
    || !html.includes('agentic-graph.agentic_canvas_os.docs.invoke')
    || !html.includes('/mcp.capabilities')
    || !html.includes('control-plane/mcp')
    || !html.includes('app-owned forwarder')
    || !html.includes('agentic-graph-superagent-harness.md')
  ) {
    throw new Error('expected MCP Apps HTML to expose the fastest onboarding path')
  }
}

export function assertAgentReadyOnboardingReadiness(onboarding?: AgentReadyOnboarding) {
  if (onboarding?.promise !== 'Map intent. Orchestrate agents. Prove outcomes.'
    || onboarding?.grammarSummary !== 'A source-backed canvas where / routes work, # sets meaning, and @ binds context.'
    || onboarding?.canonicalOperatorContract !== 'One canonical operator contract: install and discovery stay on the public endpoint, while live /, #, @ grammar stays on the approval-gated control plane or an app-owned forwarder until the host proves MCP session support.'
    || onboarding?.canonicalTransportRule !== 'Canonicalize the contract first, not the transport. Keep the runtime split underneath until hosted proof supports a single runtime.'
    || onboarding?.grammarToolName !== 'agentic-graph.agentic_canvas_os.docs.invoke'
    || !Array.isArray(onboarding?.grammarExamples)
    || onboarding.grammarExamples.join('|') !== '/mcp.capabilities|#mcp|@mcp-gateway'
    || onboarding?.grammarExecutionBoundary !== 'Keep install on the public discovery endpoint and execute live grammar on the approval-gated control plane.'
    || !Array.isArray(onboarding?.hostedBuilderExamples)
    || onboarding.hostedBuilderExamples.join('|') !== 'Lovable|Vercel'
    || onboarding?.hostedGrammarDefaultPath !== 'Hosted app builders such as Lovable and Vercel should keep /mcp for discovery and use an app-owned forwarder for live /, #, @ unless the host proves MCP session support.'
    || onboarding?.hostedGrammarFallback !== 'app-owned-forwarder'
    || onboarding?.publicReadMcpUrl !== 'https://airvio.co/agentic-graph/mcp'
    || onboarding?.controlPlaneMcpUrl !== 'https://airvio.co/agentic-os/control-plane/mcp'
    || !String(onboarding?.cheapestProofPath || '').includes('agentic-graph-superagent-harness.md')
    || !Array.isArray(onboarding?.steps)
    || onboarding.steps.length !== 3
    || !String(onboarding.steps[1]?.action || '').includes('live /, #, @ grammar lookup through agentic-graph.agentic_canvas_os.docs.invoke')) {
    throw new Error(`expected readiness onboarding details to expose the install-first sequence, got ${JSON.stringify(onboarding)}`)
  }
}
