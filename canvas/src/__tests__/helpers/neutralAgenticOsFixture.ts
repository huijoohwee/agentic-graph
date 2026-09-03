import { isAgenticOsStructuredMarkdown, normalizeAgenticOsAssistantBodyForStorage } from '@/features/chat/chatHistoryWorkspace'

export type NeutralAgenticOsFixtureArgs = {
  timestampMs: number
  workspacePath?: string
  requestText: string
  assistantText?: string
  expectationLabel?: string
}

const DEFAULT_NEUTRAL_ASSISTANT_TEXT = [
  'Create a neutral AGENTIC_OS document that proves Source Files landing, Editor Workspace handoff,',
  'and Canvas apply through the shared chat finalization path.',
].join(' ')

export const buildNeutralAgenticOsFixtureDocument = (args: NeutralAgenticOsFixtureArgs): string => {
  const markdown = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: args.timestampMs,
    workspacePath: args.workspacePath,
    requestText: args.requestText,
    assistantText: args.assistantText || DEFAULT_NEUTRAL_ASSISTANT_TEXT,
  }).trim()
  if (!isAgenticOsStructuredMarkdown(markdown)) {
    const label = args.expectationLabel || 'neutral AGENTIC_OS fixture'
    throw new Error(`expected ${label} builder to produce structured AGENTIC_OS markdown`)
  }
  return markdown
}

export const buildCanonicalAgenticOsTemplateFixtureDocument = (
  overrides: Partial<NeutralAgenticOsFixtureArgs> = {},
): string => buildNeutralAgenticOsFixtureDocument({
  timestampMs: Date.UTC(2026, 3, 19, 18, 2, 22),
  workspacePath: '/chat-log/20260419T180222Z/agenticOs_20260419T180222Z.md',
  // Use an explicit runtime-style request with canonical sections so this helper
  // always materializes the full AGENTIC_OS pipeline template instead of the response-only scaffold.
  requestText: '#canvas Generate a structured AGENTIC_OS response with User Flow, Data Flow, Integration Boundaries, and Monetization Surface.',
  assistantText: 'Create a neutral AGENTIC_OS response document.',
  expectationLabel: 'canonical AGENTIC_OS template fixture',
  ...overrides,
})
