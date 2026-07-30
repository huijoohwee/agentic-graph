import fs from 'node:fs'
import path from 'node:path'
import {
  NATIVE_IMPORT_URL_INVOCATION_TEMPLATE,
  NativeImportUrlMutationError,
  executeStructuredImportUrl,
  isNativeImportUrlInvocationAttempt,
  parseNativeImportUrlInvocation,
  tryActivateNativeImportUrlInvocation,
} from '@/features/chat/nativeImportUrlInvocation'
import { buildChatInvocationCatalog, resolveChatInvocationCatalogEntryInsertionText } from '@/features/chat/chatInvocationRegistry'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'
import { registerMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import { buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'

export const testNativeImportUrlInvocationUsesAuthoritativeTuple = async () => {
  const parsed = parseNativeImportUrlInvocation(
    '/ingest-url @url:https://example.invalid/docs @reference-policy #canvas',
  )
  if (!parsed || parsed.url !== 'https://example.invalid/docs') {
    throw new Error('expected the canonical Import URL tuple to parse')
  }
  const spaced = parseNativeImportUrlInvocation(
    '/ingest-url @url :https://example.invalid/spaced @reference-policy #canvas',
  )
  if (!spaced || spaced.url !== 'https://example.invalid/spaced') {
    throw new Error('expected Widget Card token spacing to remain executable')
  }
  if (parseNativeImportUrlInvocation('/import-url @url:https://example.invalid @reference-policy #canvas')) {
    throw new Error('expected the non-canonical /import-url alias to remain rejected')
  }
  if (parseNativeImportUrlInvocation('/ingest-url https://example.invalid')) {
    throw new Error('expected the legacy direct-URL shape to remain rejected')
  }
  if (!isNativeImportUrlInvocationAttempt('/ingest-url https://example.invalid')) {
    throw new Error('expected malformed canonical-command attempts to remain on the native error path')
  }
  if (parseNativeImportUrlInvocation('/ingest-url @url:https://example.invalid #canvas')) {
    throw new Error('expected @reference-policy to be required')
  }
  if (parseNativeImportUrlInvocation('/ingest-url @url:https://example.invalid @reference-policy')) {
    throw new Error('expected #canvas to be required')
  }
  if (parseNativeImportUrlInvocation('/ingest-url @url:file:///tmp/source.md @reference-policy #canvas')) {
    throw new Error('expected invocations to remain HTTP(S)-only')
  }
  if (parseNativeImportUrlInvocation('/ingest-url @url:https://user:secret@example.invalid @reference-policy #canvas')) {
    throw new Error('expected credential-bearing URLs to remain rejected')
  }
  await executeStructuredImportUrl({ invocation: NATIVE_IMPORT_URL_INVOCATION_TEMPLATE, url: 'https://example.invalid' })
    .then(() => {
      throw new Error('expected mixed invocation and structured fields to fail closed')
    })
    .catch(error => {
      if (!String(error).includes('either invocation or structured URL fields')) throw error
    })

  let invalidDispatches = 0
  const unregister = registerMarkdownWorkspaceActionBridge('native-import-url-invalid-input-test', {
    importUrl: async () => {
      invalidDispatches += 1
      return { createdPaths: ['/should-not-exist.md'] }
    },
  })
  try {
    for (const invalidInput of [
      { url: 'https://example.invalid/', invocation: 42 },
      { url: 'https://example.invalid/', unexpected: true },
      { url: 'https://example.invalid/', canvas2dRenderer: null },
    ]) {
      await executeStructuredImportUrl(invalidInput)
        .then(() => {
          throw new Error(`expected closed runtime input validation for ${JSON.stringify(invalidInput)}`)
        })
        .catch(error => {
          if (!String(error).includes('Import URL')) throw error
        })
    }
  } finally {
    unregister()
  }
  if (invalidDispatches !== 0) {
    throw new Error(`expected invalid WebMCP inputs to fail before workspace mutation, got ${invalidDispatches} dispatches`)
  }
}

export const testNativeImportUrlInvocationReusesLaunchBridgeAndCatalog = async () => {
  let receivedUrl = ''
  let receivedOptions: Record<string, unknown> | undefined
  const unregister = registerMarkdownWorkspaceActionBridge('native-import-url-test', {
    importUrl: async (url, options) => {
      receivedUrl = url
      receivedOptions = options as Record<string, unknown>
      return {
        createdPaths: ['/imports/example/docs.md', '/imports/example/assets/hero.png'],
        removedPaths: ['/imports/example/old.md'],
      }
    },
  })
  try {
    const result = await executeStructuredImportUrl({
      url: 'https://example.invalid/docs',
      canvas2dRenderer: 'design',
      documentSemanticMode: 'keyword',
    })
    if (receivedUrl !== 'https://example.invalid/docs') {
      throw new Error(`expected native invocation to reuse the Launch bridge, got ${receivedUrl}`)
    }
    if (receivedOptions?.canvas2dRenderer !== 'design' || receivedOptions?.documentSemanticMode !== 'keyword') {
      throw new Error(`expected structured renderer options to reach the shared Import URL owner, got ${JSON.stringify(receivedOptions)}`)
    }
    if ('kind' in result) {
      throw new Error(`expected the protected file-import success wire shape to remain unchanged, got ${JSON.stringify(result)}`)
    }
    if (result.createdPaths.length !== 2 || result.removedPaths.length !== 1) {
      throw new Error(`expected typed workspace mutation evidence, got ${JSON.stringify(result)}`)
    }
    if (!result.outputText.includes('# URL imported') || !result.outputText.includes('/imports/example/docs.md')) {
      throw new Error('expected native Import URL to format a durable run result')
    }
  } finally {
    unregister()
  }

  const catalogEntry = buildChatInvocationCatalog().find(entry => entry.token === '/ingest-url')
  if (!catalogEntry) throw new Error('expected Import URL in the FloatingPanel invocation catalog')
  if (resolveChatInvocationCatalogEntryInsertionText(catalogEntry) !== NATIVE_IMPORT_URL_INVOCATION_TEMPLATE) {
    throw new Error('expected the Import URL row to insert its complete runnable tuple')
  }
  if (catalogEntry.mcpTool !== 'knowgrph.control_local_import_url') {
    throw new Error(`expected the Import URL catalog behavior to name its browser MCP owner, got ${catalogEntry.mcpTool}`)
  }

  const unregisterPartialFailure = registerMarkdownWorkspaceActionBridge('native-import-url-partial-failure-test', {
    importUrl: async () => ({
      handled: true,
      createdPaths: ['/imports/partial.md'],
      removedPaths: ['/imports/replaced.md'],
      error: 'finalize failed',
    }),
  })
  try {
    await executeStructuredImportUrl({ url: 'https://example.invalid/partial' })
      .then(() => {
        throw new Error('expected a post-mutation failure to remain typed')
      })
      .catch(error => {
        if (!(error instanceof NativeImportUrlMutationError)) throw error
        const failure = error.failure
        if (
          failure.mutationState !== 'partial'
          || failure.createdPaths[0] !== '/imports/partial.md'
          || failure.removedPaths[0] !== '/imports/replaced.md'
          || !failure.outputText.includes('Inspect the workspace before retrying')
        ) {
          throw new Error(`expected typed partial-mutation evidence, got ${JSON.stringify(failure)}`)
        }
      })
  } finally {
    unregisterPartialFailure()
  }
}

export const testNativeImportUrlChatRedactsRejectedCredentials = async () => {
  const secret = 'must-not-persist'
  const rawInput = `/ingest-url @url:https://operator:${secret}@example.invalid/private @reference-policy #canvas`
  let messages: ChatMessage[] = []
  const runtimeRequests: string[] = []
  const persistedRequests: string[] = []
  const submitArgs = buildSubmitArgsFixture({
    setMessages: update => {
      messages = typeof update === 'function' ? update(messages) : update
    },
    pushChatExchangeLog: payload => {
      runtimeRequests.push(payload.request)
    },
    persistChatExchangeLog: async payload => {
      persistedRequests.push(payload.request)
    },
  })
  const handled = await tryActivateNativeImportUrlInvocation({ input: rawInput, submitArgs })
  if (!handled) throw new Error('expected credential-bearing Import URL attempts to stay on the native error path')
  const persisted = JSON.stringify({ messages, runtimeRequests, persistedRequests })
  if (persisted.includes(secret) || persisted.includes('operator:')) {
    throw new Error(`expected rejected URL credentials to be absent from Chat persistence, got ${persisted}`)
  }
  if (!persisted.includes('[credentials-redacted]')) {
    throw new Error(`expected Chat persistence to retain an explicit redaction marker, got ${persisted}`)
  }
}

export const testNativeImportUrlCardAndChatDispatchBeforeProvider = () => {
  const chatSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/chat/floatingPanelChat/useFloatingPanelChatSubmit.ts'),
    'utf8',
  )
  const chatDispatchIndex = chatSource.indexOf('await tryActivateNativeImportUrlInvocation({')
  const providerDispatchIndex = chatSource.indexOf('resolveRequestUrlOrSetError({')
  if (chatDispatchIndex < 0 || providerDispatchIndex < 0 || chatDispatchIndex >= providerDispatchIndex) {
    throw new Error('expected Chat Import URL invocation to dispatch before any provider or API-key path')
  }
  const chatSurfaceSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/chat/FloatingPanelChat.tsx'),
    'utf8',
  )
  for (const forbidden of ['parseChatIngestUrlCommand', 'importUrlViaDeerFlowAndApply']) {
    if (chatSurfaceSource.includes(forbidden)) {
      throw new Error(`expected Chat to have no legacy Import URL bypass through ${forbidden}`)
    }
  }
  if (!chatSurfaceSource.includes('isNativeImportUrlInvocationAttempt(input)')) {
    throw new Error('expected model-free Chat submission to remain enabled for typed Import URL errors')
  }

  const workflowSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction.ts'),
    'utf8',
  )
  const nativeDispatchIndex = workflowSource.indexOf('await runStoryboardWidgetNativeImportUrlInvocation({')
  const textGenerationIndex = workflowSource.indexOf('await runHeadlessTextGeneration(textGeneration', nativeDispatchIndex)
  if (nativeDispatchIndex < 0 || textGenerationIndex < 0 || nativeDispatchIndex >= textGenerationIndex) {
    throw new Error('expected Card Run Import URL invocation to dispatch before provider text generation')
  }

  const nativeRunSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowNativeImportUrlRun.ts'),
    'utf8',
  )
  for (const expected of [
    'executeNativeImportUrlInvocation(invocation)',
    'workflowOutputPanelOnly: true',
    "updateStatus('done')",
    "updateStatus('error')",
    "model: 'native-import-url'",
    "'createdPaths' in result",
  ]) {
    if (!nativeRunSource.includes(expected)) {
      throw new Error(`expected native Import URL Card Run owner to include ${expected}`)
    }
  }
  const workspaceImportSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/markdown-workspace/useWorkspaceFileActions/importActions.ts'),
    'utf8',
  )
  const handledOwnershipIndex = workspaceImportSource.indexOf('let bridgeResult: WorkspaceBridgeImportResult = { handled: true }')
  const importerDispatchIndex = workspaceImportSource.indexOf('return importWorkspaceUrl({', handledOwnershipIndex)
  if (handledOwnershipIndex < 0 || importerDispatchIndex < 0 || handledOwnershipIndex >= importerDispatchIndex) {
    throw new Error('expected workspace bridge ownership to be recorded before Import URL can partially mutate files')
  }
}
