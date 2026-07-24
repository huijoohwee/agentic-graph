import {
  registerAgenticOsRemoteGrammarCatalogEntries,
  resetAgenticOsRemoteGrammarCatalogForTests,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
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
  try {
    await test()
  } finally {
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
