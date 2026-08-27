import { escapeHtml, normalizeString as clean } from './mcpAppsContractText.mjs'

export const MCP_ONBOARDING_PROMISE = 'Map intent. Orchestrate agents. Prove outcomes.'
export const MCP_ONBOARDING_GRAMMAR_SUMMARY =
  'A source-backed canvas where / routes work, # sets meaning, and @ binds context.'
export const MCP_ONBOARDING_GRAMMAR_TOOL_NAME = 'agenticgraph.agentic_canvas_os.docs.invoke'
export const MCP_ONBOARDING_GRAMMAR_EXAMPLES = Object.freeze(['/mcp.capabilities', '#mcp', '@mcp-gateway'])
export const MCP_ONBOARDING_CANONICAL_OPERATOR_CONTRACT =
  'One canonical operator contract: install and discovery stay on the public endpoint, while live /, #, @ grammar stays on the approval-gated control plane or an app-owned forwarder until the host proves MCP session support.'
export const MCP_ONBOARDING_CANONICAL_TRANSPORT_RULE =
  'Canonicalize the contract first, not the transport. Keep the runtime split underneath until hosted proof supports a single runtime.'
export const MCP_ONBOARDING_HOSTED_BUILDER_EXAMPLES = Object.freeze(['Lovable', 'Vercel'])
export const MCP_ONBOARDING_HOSTED_GRAMMAR_DEFAULT =
  'Hosted app builders such as Lovable and Vercel should keep /mcp for discovery and use an app-owned forwarder for live /, #, @ unless the host proves MCP session support.'

export const resolveMcpOnboardingUrls = ({ baseUrl, transportUrl, surfaceRoles } = {}) => {
  const base = clean(baseUrl).replace(/\/+$/, '')
  return {
    publicReadMcpUrl: clean(surfaceRoles?.publicReadMcpUrl) || clean(transportUrl) || (base ? `${base}/mcp` : ''),
    controlPlaneMcpUrl: clean(surfaceRoles?.controlPlaneMcpUrl) || (base ? `${base}/control-plane/mcp` : ''),
  }
}

export const buildMcpOnboarding = ({ publicReadMcpUrl, controlPlaneMcpUrl } = {}) => ({
  promise: MCP_ONBOARDING_PROMISE,
  grammarSummary: MCP_ONBOARDING_GRAMMAR_SUMMARY,
  canonicalOperatorContract: MCP_ONBOARDING_CANONICAL_OPERATOR_CONTRACT,
  canonicalTransportRule: MCP_ONBOARDING_CANONICAL_TRANSPORT_RULE,
  publicReadMcpUrl: clean(publicReadMcpUrl),
  controlPlaneMcpUrl: clean(controlPlaneMcpUrl),
  controlPlaneCondition: 'Add the control plane only when the host can preserve MCP session state and needs live /, #, @ grammar lookup.',
  grammarToolName: MCP_ONBOARDING_GRAMMAR_TOOL_NAME,
  grammarExamples: MCP_ONBOARDING_GRAMMAR_EXAMPLES.map((value) => clean(value)),
  grammarExecutionBoundary: 'Keep install on the public discovery endpoint and execute live grammar on the approval-gated control plane.',
  hostedBuilderExamples: MCP_ONBOARDING_HOSTED_BUILDER_EXAMPLES.map((value) => clean(value)),
  hostedGrammarDefaultPath: MCP_ONBOARDING_HOSTED_GRAMMAR_DEFAULT,
  hostedGrammarFallback: 'app-owned-forwarder',
  cheapestProofPath: 'Use the source-side README.md quick start or docs/documents/agenticgraph-superagent-harness.md in the agenticgraph repo before hosted setup.',
  steps: [
    {
      order: 1,
      label: 'Map intent',
      action: publicReadMcpUrl
        ? `Map intent: install ${clean(publicReadMcpUrl)} first for public discovery, retrieval, and inspection.`
        : 'Map intent: install the public MCP endpoint first for discovery, retrieval, and inspection.',
    },
    {
      order: 2,
      label: 'Orchestrate agents',
      action: controlPlaneMcpUrl
        ? `Orchestrate agents: add ${clean(controlPlaneMcpUrl)} only when the host can preserve MCP session state and needs live /, #, @ grammar lookup through ${MCP_ONBOARDING_GRAMMAR_TOOL_NAME}.`
        : `Orchestrate agents: add the control plane only when the host can preserve MCP session state and needs live /, #, @ grammar lookup through ${MCP_ONBOARDING_GRAMMAR_TOOL_NAME}.`,
    },
    {
      order: 3,
      label: 'Prove outcomes',
      action:
        'Prove outcomes: for zero-spend evaluation, run the source-side README.md quick start or docs/documents/agenticgraph-superagent-harness.md first.',
    },
  ],
})

export const buildMcpOnboardingHtml = ({ publicReadMcpUrl, controlPlaneMcpUrl } = {}) => `<section aria-label="Fastest path">
  <section id="onboarding" class="readiness">
    <strong>Fastest Path</strong>
    <p>${escapeHtml(MCP_ONBOARDING_PROMISE)}</p>
    <p>${escapeHtml(MCP_ONBOARDING_GRAMMAR_SUMMARY)}</p>
    <p>${escapeHtml(MCP_ONBOARDING_CANONICAL_OPERATOR_CONTRACT)}</p>
    <p>${escapeHtml(MCP_ONBOARDING_CANONICAL_TRANSPORT_RULE)}</p>
    <p>${escapeHtml(`Live grammar executes through ${MCP_ONBOARDING_GRAMMAR_TOOL_NAME} on the control plane. Try ${MCP_ONBOARDING_GRAMMAR_EXAMPLES.join(', ')}.`)}</p>
    <p>${escapeHtml(MCP_ONBOARDING_HOSTED_GRAMMAR_DEFAULT)}</p>
    <ol>
      <li>${escapeHtml(publicReadMcpUrl ? `Map intent: install ${clean(publicReadMcpUrl)} first for public discovery, retrieval, and inspection.` : 'Map intent: install the public MCP endpoint first for discovery, retrieval, and inspection.')}</li>
      <li>${escapeHtml(controlPlaneMcpUrl ? `Orchestrate agents: add ${clean(controlPlaneMcpUrl)} only when the host can preserve MCP session state and needs live /, #, @ grammar lookup through ${MCP_ONBOARDING_GRAMMAR_TOOL_NAME}.` : `Orchestrate agents: add the control plane only when the host can preserve MCP session state and needs live /, #, @ grammar lookup through ${MCP_ONBOARDING_GRAMMAR_TOOL_NAME}.`)}</li>
      <li>Prove outcomes: for zero-spend evaluation, use the source-side <code>README.md</code> quick start or <code>docs/documents/agenticgraph-superagent-harness.md</code> first.</li>
    </ol>
  </section>
</section>`

export const MCP_ONBOARDING_CLIENT_SCRIPT = `const renderOnboarding = (payload) => {
  onboardingEl.replaceChildren();
  const onboarding = payload && payload.onboarding && typeof payload.onboarding === 'object' ? payload.onboarding : boot.onboarding;
  appendText(onboardingEl, 'strong', 'Fastest Path');
  appendText(onboardingEl, 'p', onboarding && onboarding.promise ? String(onboarding.promise) : '${MCP_ONBOARDING_PROMISE}');
  appendText(onboardingEl, 'p', onboarding && onboarding.grammarSummary ? String(onboarding.grammarSummary) : '${MCP_ONBOARDING_GRAMMAR_SUMMARY}');
  appendText(
    onboardingEl,
    'p',
    onboarding && onboarding.canonicalOperatorContract
      ? String(onboarding.canonicalOperatorContract)
      : '${MCP_ONBOARDING_CANONICAL_OPERATOR_CONTRACT}',
  );
  appendText(
    onboardingEl,
    'p',
    onboarding && onboarding.canonicalTransportRule
      ? String(onboarding.canonicalTransportRule)
      : '${MCP_ONBOARDING_CANONICAL_TRANSPORT_RULE}',
  );
  appendText(
    onboardingEl,
    'p',
    onboarding && onboarding.grammarToolName
      ? 'Live grammar executes through ' + String(onboarding.grammarToolName) + ' on the control plane. Try ' + (Array.isArray(onboarding.grammarExamples) && onboarding.grammarExamples.length ? onboarding.grammarExamples.join(', ') : '${MCP_ONBOARDING_GRAMMAR_EXAMPLES.join(', ')}') + '.'
      : 'Live grammar executes through ${MCP_ONBOARDING_GRAMMAR_TOOL_NAME} on the control plane. Try ${MCP_ONBOARDING_GRAMMAR_EXAMPLES.join(', ')}.',
  );
  appendText(
    onboardingEl,
    'p',
    onboarding && onboarding.hostedGrammarDefaultPath
      ? String(onboarding.hostedGrammarDefaultPath)
      : '${MCP_ONBOARDING_HOSTED_GRAMMAR_DEFAULT}',
  );
  const list = document.createElement('ol');
  const steps = Array.isArray(onboarding && onboarding.steps) && onboarding.steps.length ? onboarding.steps : [
    { action: onboarding && onboarding.publicReadMcpUrl ? 'Map intent: install ' + onboarding.publicReadMcpUrl + ' first for public discovery, retrieval, and inspection.' : 'Map intent: install the public MCP endpoint first for discovery, retrieval, and inspection.' },
    { action: onboarding && onboarding.controlPlaneMcpUrl ? 'Orchestrate agents: add ' + onboarding.controlPlaneMcpUrl + ' only when the host can preserve MCP session state and needs live /, #, @ grammar lookup through ${MCP_ONBOARDING_GRAMMAR_TOOL_NAME}.' : 'Orchestrate agents: add the control plane only when the host can preserve MCP session state and needs live /, #, @ grammar lookup through ${MCP_ONBOARDING_GRAMMAR_TOOL_NAME}.' },
    { action: 'Prove outcomes: for zero-spend evaluation, use the source-side README.md quick start or docs/documents/agenticgraph-superagent-harness.md first.' },
  ];
  for (const step of steps) appendText(list, 'li', step && step.action ? String(step.action) : 'Follow the fastest onboarding path.');
  onboardingEl.appendChild(list);
};`
