import { analyzeAgenticOsRequest } from './chatAgenticOsRequestProfile'
import { buildNamedTermSummary } from './chatHistoryWorkspace.agenticOs.fallbackSections'

type Profile = ReturnType<typeof analyzeAgenticOsRequest>

export const buildUseCaseText = (profile: Profile): string => {
  const surfaces = [profile.signals.mcp ? 'MCP delivery' : '', profile.signals.externalUsers ? 'external-user access' : '', profile.signals.openClaw ? 'OpenClaw and related marketplace surfaces' : (profile.signals.marketplace ? 'marketplace surfaces' : 'the stated delivery surfaces'), profile.signals.stripe ? 'checkout completion' : (profile.signals.payments ? 'payment completion' : '')].filter(Boolean)
  const deliverySurface = profile.signals.openClaw ? 'OpenClaw and related marketplace surfaces' : (profile.signals.marketplace ? 'marketplace surfaces' : 'reusable delivery surfaces')
  const mcpSurface = profile.signals.mcp ? 'package `{{product}}` as an MCP offer for external users' : 'package `{{product}}` for external delivery'
  return `\`{{subject}}\` needs a reusable pipeline surface for \`{{product}}\` that can ${mcpSurface}, produce \`{{artifact}}\`, preserve the machine-readable AGENTIC_OS contract, and stay relevant across ${surfaces.join(', ') || deliverySurface}. The response should stay request-shaped without rewriting the base graph contract per request.`
}

export const buildProblemText = (profile: Profile): string => {
  if (profile.signals.creativeScript) return '`{{subject}}` needs `{{artifact}}` that feels distinctive and production-ready without copying named source properties. The response should preserve originality, turn high-level inspiration into a clear brief, and keep brand or franchise references out of the final wording.'
  const pressures = [profile.signals.zeroBudget ? 'zero-budget constraints' : '', profile.signals.bootstrap ? 'bootstrap execution pressure' : '', profile.signals.organicGrowth ? 'organic-growth expectations' : ''].filter(Boolean)
  const coverage = [profile.signals.mcp ? 'delivery packaging' : '', profile.signals.externalUsers ? 'external-user access' : '', profile.signals.marketplace || profile.signals.openClaw ? 'distribution and discovery' : '', profile.signals.b2c || profile.signals.subscriptions || profile.signals.payPerUse || profile.signals.conversion ? 'monetized user actions' : '', profile.signals.stripe || profile.signals.payments ? 'payment or checkout transitions' : '', profile.signals.rxdb || profile.signals.maplibre ? 'stated implementation boundaries' : ''].filter(Boolean)
  return `\`{{subject}}\` needs \`{{artifact}}\` for \`{{product}}\`${pressures.length ? ` under ${pressures.join(', ')}` : ''}. Generic planning prose is not enough because the response has to make ${coverage.join(', ') || 'the stated request constraints'} explicit in a form that can guide delivery, monetization, and follow-up implementation decisions.`
}

export const buildSolutionText = (profile: Profile): string => {
  if (profile.signals.creativeScript) return 'Shape the response as one coherent script package with explicit tone, pacing, scene logic, and guardrails. Keep the wording original, keep the handoff reusable, and make the creative direction concrete enough that another pass can refine execution without reinterpreting the brief.'
  const channels = [profile.signals.mcp ? '`{{product}}` as an MCP offer' : '', profile.signals.openClaw ? 'OpenClaw marketplace distribution' : (profile.signals.marketplace ? 'skills marketplace distribution' : ''), profile.signals.stripe ? 'Stripe checkout and payment completion' : '', profile.signals.rxdb ? 'RxDB local-first state' : '', profile.signals.maplibre ? 'MapLibre spatial presentation where maps add user value' : ''].filter(Boolean)
  const namedTerms = buildNamedTermSummary(profile)
  return `Shape a lean response package that turns the request into an actionable handoff covering ${channels.join(', ') || namedTerms || 'the active request terms'}. Keep text and rich-media handoff ready for editor workspace widgets, cards, edges, and Rich Media Panels when the response includes renderable handles such as \`outputSrcDoc\` or media URLs. Make the deliverable concrete enough for follow-through without drifting into boilerplate, stale template prose, or unrelated examples.`
}

export const buildUserFlowText = (profile: Profile): string => {
  const conversion = profile.signals.stripe ? 'completes the Stripe checkout flow and unlocks the paid entitlement or action' : (profile.signals.payments ? 'completes checkout and unlocks the paid entitlement or action' : 'crosses from free exploration into paid activation')
  if (profile.signals.payments || profile.signals.stripe || profile.signals.subscriptions || profile.signals.payPerUse || profile.signals.conversion) return `A user discovers the \`{{product}}\` offer, evaluates the entry point, reaches the requested paid or conversion action, ${conversion}, and then receives the promised output, capability, or follow-up access.`
  return '`{{subject}}` opens the workspace, provides the active request terms, reviews generated text plus connected render outputs, edits assumptions inline, and persists the validated handoff so downstream panels and cards stay aligned with the same source values.'
}
