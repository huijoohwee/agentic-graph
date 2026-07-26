import {
  analyzeKgcRequest,
  sanitizeScalar,
} from './chatKgcRequestProfile'
import {
  buildNamedTermSummary,
  fallbackActor,
  fallbackArtifact,
  fallbackDomain,
  fallbackObjective,
  fallbackProduct,
} from './chatHistoryWorkspace.kgc.fallbackSections'
import type { ChatResponseStructuredSource } from './chatResponseWidgetPaletteContract'

export type BaseFallbackArgs = {
  timestampMs: number
  fileName: string
  requestText: string
  assistantText?: string
  structuredResponseSource?: ChatResponseStructuredSource
}

export const slugify = (raw: string): string => {
  return String(raw || '')
    .replace(/\.[^.]+$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'kgc'
}

export const deriveOutputTargetFileName = (fileName: string): string => {
  const raw = String(fileName || '').trim()
  return raw && /^kgc_/i.test(raw) ? raw : 'kgc.md'
}

export const buildRequestSummary = (profile: ReturnType<typeof analyzeKgcRequest>): string => {
  const product = fallbackProduct(profile.product)
  const subject = fallbackActor(profile.subject)
  const artifact = fallbackArtifact(profile.artifact)
  if (profile.signals.creativeScript) {
    const parts = [
      `${artifact} request`,
      profile.outputFile ? `for ${profile.outputFile}` : '',
      subject !== '{{subject}}' ? `owned by ${subject}` : '',
      profile.signals.trademarkAvoidance ? 'with trademark-safe originality constraints' : '',
    ].filter(Boolean)
    return sanitizeScalar(parts.join(' '), 240)
  }
  const parts = [
    `${artifact} request for ${subject}`,
    product !== '{{product}}' ? `around ${product}` : '',
    profile.namedTerms.length ? `covering ${buildNamedTermSummary(profile)}` : '',
    profile.signals.mcp ? 'using MCP distribution' : '',
    profile.signals.externalUsers ? 'for external users' : '',
    profile.signals.openClaw ? 'with OpenClaw marketplace delivery' : (profile.signals.marketplace ? 'with marketplace delivery' : ''),
    profile.signals.b2c ? 'including B2C monetization' : '',
    profile.signals.stripe ? 'and Stripe payment flow' : '',
  ].filter(Boolean)
  return sanitizeScalar(parts.join(' '), 240)
}

export const buildFlowContextSummary = (profile: ReturnType<typeof analyzeKgcRequest>): string => {
  const namedTerms = buildNamedTermSummary(profile)
  const parts = [
    fallbackDomain(profile.domain, profile.topics),
    namedTerms ? `with explicit references to ${namedTerms}` : '',
  ].filter(Boolean)
  return sanitizeScalar(parts.join(' '), 220)
}

export const buildObjectiveSummary = (profile: ReturnType<typeof analyzeKgcRequest>): string => {
  if (profile.signals.creativeScript) {
    return sanitizeScalar([
      'original script development',
      profile.signals.trademarkAvoidance ? 'trademark-safe inspiration handling' : '',
      profile.outputFile ? `target file ${profile.outputFile}` : '',
    ].filter(Boolean).join('; '), 180)
  }
  const parts = [
    profile.signals.zeroBudget ? 'zero-budget execution' : '',
    profile.signals.bootstrap ? 'bootstrap delivery' : '',
    profile.signals.organicGrowth ? 'organic growth' : '',
    profile.signals.mcp ? 'MCP packaging' : '',
    profile.signals.openClaw ? 'OpenClaw distribution' : (profile.signals.marketplace ? 'marketplace distribution' : ''),
    profile.signals.b2c ? 'B2C monetization' : '',
    profile.signals.stripe ? 'Stripe-ready checkout' : (profile.signals.payments ? 'payment-ready checkout' : ''),
  ].filter(Boolean)
  return sanitizeScalar(parts.join('; '), 180)
}

export const typedBlockScalarEnvelopeLines = (
  indent: string,
  field: string,
  type: string,
  valueLines: string[],
): string[] => [
  `${indent}${field}:`,
  `${indent}  key: ${field}`,
  `${indent}  type: ${type}`,
  `${indent}  value: |`,
  ...valueLines.map(line => `${indent}    ${line}`),
]
