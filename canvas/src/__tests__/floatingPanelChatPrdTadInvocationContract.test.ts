import {
  registerAgenticOsRemoteGrammarCatalogEntries,
  resetAgenticOsRemoteGrammarCatalogForTests,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { findAgenticOsInvocationByToken } from '@/features/agentic-os/agenticOsDocInvocations'
import {
  AGENTIC_OS_DOCS_MCP_BRIDGE_PATH,
  AGENTIC_OS_DOCS_MCP_TOOL_NAME,
} from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import {
  testKgcPrdTadSlashTraceUsesResponseOnlyNoBackfill as verifyTraceResponseOnly,
  testFloatingPanelChatPrdTadSlashMediaOnlyProviderPayloadCompilesRoute as verifyMediaOnlyProviderPayload,
  testFloatingPanelChatPrdTadSlashTextQueryMatchesNoSlashProviderPayload as verifyTextQueryProviderPayload,
  testFloatingPanelChatPrdTadSlashUsesStructuredKgcContract as verifyStructuredKgcContract,
} from './floatingPanelChatNoSlashInvocationContract.test'

const withPrdTadRemoteGrammarFixture = async (test: () => void | Promise<void>): Promise<void> => {
  resetAgenticOsRemoteGrammarCatalogForTests()
  registerAgenticOsRemoteGrammarCatalogEntries([{
    token: '/prd-tad.create',
    kind: 'command',
    label: 'PRD/TAD create',
    summary: 'Produce or refresh the combined PRD/TAD contract from validated context.',
    sourcePath: 'DICTIONARY-COMMAND.md#/prd-tad.create',
    keywords: ['prd', 'tad', 'architecture', 'vcc'],
  }])
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    if (url !== AGENTIC_OS_DOCS_MCP_BRIDGE_PATH) return originalFetch(input, init)
    const request = JSON.parse(String(init?.body || '{}')) as { invocationTokens?: unknown }
    const tokens = Array.isArray(request.invocationTokens)
      ? request.invocationTokens.map(token => String(token || '').trim()).filter(Boolean)
      : []
    return Response.json({
      ok: true,
      tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
      mcpInvoked: true,
      invocations: tokens.map(token => {
        const invocation = findAgenticOsInvocationByToken(token)
        return invocation
          ? { token, ok: true, ...invocation }
          : { token, ok: false, error: `Unknown test invocation: ${token}` }
      }),
    })
  }) as typeof fetch
  try {
    await test()
  } finally {
    globalThis.fetch = originalFetch
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
}

export async function testFloatingPanelChatPrdTadSlashUsesStructuredKgcContract() {
  await withPrdTadRemoteGrammarFixture(verifyStructuredKgcContract)
}

export async function testFloatingPanelChatPrdTadSlashTextQueryMatchesNoSlashProviderPayload() {
  await withPrdTadRemoteGrammarFixture(verifyTextQueryProviderPayload)
}

export async function testFloatingPanelChatPrdTadSlashMediaOnlyProviderPayloadCompilesRoute() {
  await withPrdTadRemoteGrammarFixture(verifyMediaOnlyProviderPayload)
}

export async function testKgcPrdTadSlashTraceUsesResponseOnlyNoBackfill() {
  await withPrdTadRemoteGrammarFixture(verifyTraceResponseOnly)
}
