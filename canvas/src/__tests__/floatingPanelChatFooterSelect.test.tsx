import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import FloatingPanelChat from '@/features/chat/FloatingPanelChat'
import {
  buildFloatingPanelChatWorkspaceContextCacheKey,
  createFloatingPanelChatContextItems,
} from '@/features/chat/floatingPanelChat/floatingPanelChatSurfaceState'
import { shouldRenderFloatingChatApiKeyPrompt } from '@/features/chat/floatingPanelChat/floatingPanelChatApiKeyPrompt'
import { FloatingPanelChatFooter, FloatingPanelChatMessagesSection } from '@/features/chat/FloatingPanelChatSections'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames, waitForTasks } from '@/tests/lib/reactRootHarness'

export async function testFloatingPanelChatFooterModelSelectStaysNativeLabeledAndChangeable() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const changedModels: string[] = []

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatFooter, {
        input: '',
        setInput: () => undefined,
        isLoading: false,
        errorText: null,
        connectivity: 'unknown',
        connectivityDetail: null,
        currentNode: null,
        modelId: 'gpt-5-nano',
        modelOptions: ['gpt-5-nano', 'gpt-5-mini', 'gpt-5'],
        onModelChanged: modelId => changedModels.push(modelId),
        uiPanelTextFontClass: 'text-sm',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        isSubmitDisabled: true,
        onSubmit: event => event.preventDefault(),
        onStop: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const control = container.querySelector('[data-kg-chat-model-control="true"]')
    if (!control) throw new Error('expected chat model control row to expose the stable data hook')
    const modelIcon = container.querySelector('[data-kg-chat-model-icon="true"]') as HTMLElement | null
    if (!modelIcon || modelIcon.tagName !== 'SPAN' || !modelIcon.className.includes('kg-responsive-control-icon-cell')) {
      throw new Error('expected model row to render a fixed-width model icon cell when BYOK is absent')
    }

    const select = container.querySelector('[data-kg-chat-model-select="true"]') as HTMLSelectElement | null
    if (!select) throw new Error('expected chat model select to expose the stable data hook')
    if (select.disabled) throw new Error('expected chat model select to stay enabled when not loading and multiple options exist')
    if (select.getAttribute('aria-label') !== 'Model') throw new Error('expected chat model select to expose a semantic label')
    if (!select.className.includes('kg-responsive-control-inline-fill') || !select.className.includes('kg-responsive-compact-panel-field-input')) {
      throw new Error('expected chat model select to use shared fill and compact field owners')
    }

    if (container.querySelector('[data-kg-chat-api-key-toggle="true"]') || container.querySelector('[data-kg-chat-api-key-input="true"]')) {
      throw new Error('expected non-BYOK footer not to render API-key controls')
    }
    if (container.querySelector('[data-kg-chat-skill-control="true"]') || container.querySelector('[data-kg-chat-skill-select="true"]')) {
      throw new Error('expected FloatingPanel chat footer not to render the deprecated Skills dropdown')
    }

    await act(async () => {
      select.value = 'gpt-5-mini'
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    if (changedModels[0] !== 'gpt-5-mini') {
      throw new Error(`expected native select change to publish next model, got ${JSON.stringify(changedModels)}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export function testFloatingPanelChatApiKeyPromptIsByokOnly() {
  if (!shouldRenderFloatingChatApiKeyPrompt({ chatAuthMode: 'byok', chatProvider: 'miromind-api' })) {
    throw new Error('expected BYOK MiroMind provider to render the floating chat API-key prompt')
  }
  if (shouldRenderFloatingChatApiKeyPrompt({ chatAuthMode: 'serverManaged', chatProvider: 'miromind-api' })) {
    throw new Error('expected server-managed MiroMind provider not to render BYOK API-key prompt UI')
  }
  if (shouldRenderFloatingChatApiKeyPrompt({ chatAuthMode: 'byok', chatProvider: 'lmstudio-local' })) {
    throw new Error('expected providers without API-key requirements not to render BYOK API-key prompt UI')
  }
}

export async function testFloatingPanelChatNewChatCreatesAndFollowsCanonicalWorkspaceFile() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  resetWorkspaceFsForTests()
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setWorkspaceViewMode('canvas')
  useGraphStore.getState().setEditorWorkspacePane('markdown')
  useGraphStore.getState().setChatStorageTarget('chatKnowgrph')
  useGraphStore.getState().setChatKnowgrphWorkspacePath(null)
  useMarkdownExplorerStore.getState().setActivePath(null)
  try {
    await mountReactRoot(root, React.createElement(FloatingPanelChat), {
      window: dom.window as unknown as Window,
      frames: 2,
      tasks: 1,
    })
    const newChatButton = (Array.from(container.querySelectorAll('button')) as HTMLButtonElement[])
      .find(button => String(button.textContent || '').trim() === 'New Chat') as HTMLButtonElement | undefined
    if (!newChatButton) throw new Error('expected FloatingPanel chat to render the New Chat command')
    await act(async () => {
      newChatButton.click()
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const state = useGraphStore.getState()
        if (String(state.chatKnowgrphWorkspacePath || '').trim() && state.workspaceViewMode === 'editor') break
        await waitForTasks(1)
        await waitForFrames(dom.window as unknown as Window, 1)
      }
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    const state = useGraphStore.getState()
    const chatPath = String(state.chatKnowgrphWorkspacePath || '')
    if (state.workspaceViewMode !== 'editor') throw new Error(`expected New Chat to open editor workspace, got ${state.workspaceViewMode}`)
    if (!/^\/.+\/\d{8}T\d{6}Z\/kgc_\d{8}T\d{6}Z\.md$/.test(chatPath)) {
      throw new Error(`expected New Chat to allocate canonical KGC workspace path, got ${JSON.stringify(chatPath)}`)
    }
    if (useMarkdownExplorerStore.getState().activePath !== chatPath) throw new Error('expected New Chat to select the canonical KGC workspace file')
    const workspaceFileText = await (await getWorkspaceFs()).readFileText(chatPath)
    if (workspaceFileText !== '') throw new Error(`expected New Chat to create an empty canonical KGC workspace file, got ${JSON.stringify(workspaceFileText)}`)
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    useMarkdownExplorerStore.getState().setActivePath(null)
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
    restore()
  }
}

export async function testFloatingPanelChatFooterByokApiKeyToggleStaysAtModelIconAndAlignsInput() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const apiKeyWrites: string[] = []

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatFooter, {
        input: '',
        setInput: () => undefined,
        isLoading: false,
        errorText: null,
        connectivity: 'unknown',
        connectivityDetail: null,
        apiKeyPrompt: {
          providerLabel: 'MiroMind API',
          credentialLabel: 'MiroMind API BYOK API key',
          value: '',
          onChange: value => apiKeyWrites.push(value),
        },
        currentNode: null,
        modelId: 'mirothinker-1-7-deepresearch-mini',
        modelOptions: ['mirothinker-1-7-deepresearch-mini', 'mirothinker-1-7-deepresearch', 'gpt-5-nano'],
        onModelChanged: () => undefined,
        uiPanelTextFontClass: 'text-sm',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        isSubmitDisabled: true,
        onSubmit: event => event.preventDefault(),
        onStop: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const modelControl = container.querySelector('[data-kg-chat-model-control="true"]') as HTMLElement | null
    const modelSelect = container.querySelector('[data-kg-chat-model-select="true"]') as HTMLSelectElement | null
    const toggle = container.querySelector('[data-kg-chat-api-key-toggle="true"]') as HTMLButtonElement | null
    if (!modelControl || !modelSelect || !toggle) {
      throw new Error('expected BYOK footer to render model control, model select, and API-key toggle')
    }
    if (toggle.getAttribute('data-kg-chat-model-icon') !== 'true' || toggle.tagName !== 'BUTTON') {
      throw new Error('expected API-key expand/collapse control to be restored at the model icon')
    }
    if ((toggle.compareDocumentPosition(modelSelect) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) === 0) {
      throw new Error('expected model-icon API-key toggle to render before the model select')
    }
    if (toggle.getAttribute('aria-expanded') !== 'false' || container.querySelector('[data-kg-chat-api-key-input="true"]')) {
      throw new Error('expected BYOK API-key input to be collapsed by default')
    }
    if (!toggle.className.includes('kg-responsive-control-icon-cell')) {
      throw new Error('expected model-icon toggle to use the shared fixed icon cell')
    }

    await act(async () => {
      toggle.click()
      await waitForFrames(dom.window as unknown as Window, 1)
    })

    const prompt = container.querySelector('[data-kg-chat-api-key-prompt="true"]') as HTMLElement | null
    const keyIcon = container.querySelector('[data-kg-chat-api-key-icon="true"]') as HTMLElement | null
    const keyInput = container.querySelector('[data-kg-chat-api-key-input="true"]') as HTMLInputElement | null
    if (!prompt || !keyIcon || !keyInput) {
      throw new Error('expected model-icon toggle to expand the API-key row')
    }
    if (container.querySelector('[data-kg-chat-skill-control="true"]') || container.querySelector('[data-kg-chat-skill-select="true"]')) {
      throw new Error('expected BYOK footer not to render the deprecated Skills dropdown')
    }
    if (prompt.querySelector('[data-kg-chat-api-key-toggle="true"]')) {
      throw new Error('expected expanded API-key row not to contain the collapse toggle')
    }
    if (!keyIcon.className.includes('kg-responsive-control-icon-cell') || !toggle.className.includes('kg-responsive-control-icon-cell')) {
      throw new Error('expected model and API-key rows to share the fixed icon cell for alignment')
    }
    if (keyInput.getAttribute('aria-label') !== 'MiroMind API BYOK API key') {
      throw new Error(`expected API-key input to expose provider-specific label, got ${keyInput.getAttribute('aria-label')}`)
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(keyInput, 'sk-miromind-test')
      Simulate.change(keyInput)
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    if (apiKeyWrites[0] !== 'sk-miromind-test') {
      throw new Error(`expected API-key input to write through callback, got ${JSON.stringify(apiKeyWrites)}`)
    }

    await act(async () => {
      toggle.click()
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    if (container.querySelector('[data-kg-chat-api-key-input="true"]')) {
      throw new Error('expected model-icon toggle to collapse only the API-key input')
    }
    if (!container.querySelector('[data-kg-chat-model-select="true"]')) {
      throw new Error('expected model select to remain visible after API-key collapse')
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export async function testFloatingPanelChatContextRailAndQuickActionsStayStateOwned() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const quickActionPrompts: string[] = []

  function Harness() {
    const [input, setInput] = React.useState('')
    return (
      <React.Fragment>
        <FloatingPanelChatMessagesSection
          messages={[]}
          isLoading={false}
          historyKey="kg:test"
          contextItems={[
            { id: 'scope', label: 'Scope', value: 'hybrid', tone: 'success' },
            { id: 'sources', label: 'Sources', value: '3', tone: 'success' },
            { id: 'workspace', label: 'Workspace', value: 'brief.md', tone: 'info' },
            { id: 'memory', label: 'Memory', value: 'ready', tone: 'neutral' },
          ]}
          uiPanelTextFontClass="text-sm"
          uiPanelKeyValueTextSizeClass="text-xs"
          uiPanelMicroLabelTextSizeClass="text-xs"
          quickActions={[
            {
              id: 'trace-pipeline',
              label: '/pipeline.trace',
              prompt: '/pipeline.trace Trace the current document from ingestion to parsing to canvas rendering.',
            },
          ]}
          onQuickAction={prompt => {
            quickActionPrompts.push(prompt)
            setInput(prompt)
          }}
          setMessages={() => undefined}
        />
        <FloatingPanelChatFooter
          input={input}
          setInput={setInput}
          isLoading={false}
          errorText={null}
          connectivity="unknown"
          connectivityDetail={null}
          currentNode={null}
          modelId="gpt-5-nano"
          modelOptions={['gpt-5-nano']}
          onModelChanged={() => undefined}
          uiPanelTextFontClass="text-sm"
          uiPanelMicroLabelTextSizeClass="text-xs"
          isSubmitDisabled={!input.trim()}
          onSubmit={event => event.preventDefault()}
          onStop={() => undefined}
        />
      </React.Fragment>
    )
  }

  try {
    await mountReactRoot(root, React.createElement(Harness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    const contextRail = container.querySelector('[data-kg-chat-context-rail="true"]') as HTMLElement | null
    if (!contextRail) throw new Error('expected FloatingPanel chat to render a stable context rail')
    if (contextRail.getAttribute('aria-label') !== 'Chat context') {
      throw new Error(`expected context rail to expose a semantic label, got ${contextRail.getAttribute('aria-label')}`)
    }
    const contextList = contextRail.querySelector('ul') as HTMLElement | null
    if (!contextList || !contextList.className.includes('grid-cols-2')) {
      throw new Error(`expected context rail to use a compact two-column grid, got ${contextList?.className || 'missing list'}`)
    }
    const contextChips = Array.from(container.querySelectorAll('[data-kg-chat-context-chip="true"]'))
    if (contextChips.length !== 4) throw new Error(`expected four context chips, got ${contextChips.length}`)
    const railText = String(contextRail.textContent || '')
    for (const snippet of ['Scope: hybrid', 'Sources: 3', 'Workspace: brief.md', 'Memory: ready']) {
      if (!railText.includes(snippet)) {
        throw new Error(`expected context rail to include ${snippet}, got ${JSON.stringify(railText)}`)
      }
    }
    const workspaceChip = container.querySelector('[data-kg-chat-context-id="workspace"]') as HTMLElement | null
    if (!workspaceChip?.getAttribute('title')?.includes('Workspace: brief.md')) {
      throw new Error(`expected workspace context chip to preserve the full value in title, got ${workspaceChip?.getAttribute('title')}`)
    }
    const workspaceValue = workspaceChip.querySelector('[data-kg-chat-context-chip-value="true"]') as HTMLElement | null
    if (!workspaceValue || !workspaceValue.className.includes('truncate')) {
      throw new Error('expected workspace context chip value to truncate instead of overflowing the floating panel')
    }
    const emptyState = container.querySelector('[data-kg-chat-empty-state="true"]') as HTMLElement | null
    if (!emptyState || !emptyState.className.includes('border-dashed') || !emptyState.className.includes('flex-1')) {
      throw new Error(`expected empty chat guidance to render as a compact thread state, got ${emptyState?.className || 'missing'}`)
    }
    const footer = container.querySelector('[data-kg-chat-footer="compact"]') as HTMLElement | null
    if (!footer || !footer.className.includes('p-2')) {
      throw new Error(`expected FloatingPanel chat footer to use the compact control density, got ${footer?.className || 'missing'}`)
    }

    const actionGroup = container.querySelector('[data-kg-chat-quick-actions="true"]') as HTMLElement | null
    if (!actionGroup || !actionGroup.className.includes('grid-cols-2') || !actionGroup.className.includes('auto-rows-[2rem]')) {
      throw new Error(`expected quick actions to use a compact two-column grid, got ${actionGroup?.className || 'missing actions'}`)
    }
    if (actionGroup.getAttribute('data-kg-chat-quick-actions-placement') !== 'thread') {
      throw new Error(`expected empty-thread quick actions to live in the chat viewport, got ${actionGroup.getAttribute('data-kg-chat-quick-actions-placement')}`)
    }
    const action = container.querySelector('[data-kg-chat-quick-action-id="trace-pipeline"]') as HTMLButtonElement | null
    if (!action) throw new Error('expected FloatingPanel chat viewport to render quick prompt actions')
    await act(async () => {
      action.click()
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    if (quickActionPrompts[0] !== '/pipeline.trace Trace the current document from ingestion to parsing to canvas rendering.') {
      throw new Error(`expected quick action to publish its prompt through state, got ${JSON.stringify(quickActionPrompts)}`)
    }
    const input = container.querySelector('[data-kg-chat-input="1"]') as HTMLElement | null
    const commandProxy = container.querySelector('[data-kg-card-inline-viewer-edit-command-proxy="1"]') as HTMLTextAreaElement | null
    if (!input) throw new Error('expected FloatingPanel chat input to expose the stable data hook')
    if (input.getAttribute('aria-label') !== 'Ask a question about the current graph or selection.') {
      throw new Error(`expected chat input to expose the shared placeholder as its aria label, got ${input.getAttribute('aria-label')}`)
    }
    if (!String(commandProxy?.value || '').includes('/pipeline.trace Trace the current document')) {
      throw new Error(`expected quick action to populate chat input, got ${JSON.stringify(commandProxy?.value)}`)
    }
    const traceChip = container.querySelector('[data-kg-inline-invocation-edit-token="1"][data-kg-inline-invocation-markdown="/pipeline.trace"]')
    if (!traceChip || !traceChip.getAttribute('title')?.includes('DICTIONARY-COMMAND.md')) {
      throw new Error(`expected slash quick action prompt to render through the shared Card/Widget edit chip, got ${input.outerHTML}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export function testFloatingPanelChatWorkspaceContextCacheKeyIsScopeAware() {
  const selectionKey = buildFloatingPanelChatWorkspaceContextCacheKey({
    chatContextScope: 'selection',
    markdownDocumentName: 'brief-a.md',
    docLocationRevision: 1,
    markdownText: '# A',
    sourceFilesSignature: 'sources-a',
  })
  if (selectionKey !== '') {
    throw new Error(`expected selection-only chat to disable workspace context cache key, got ${JSON.stringify(selectionKey)}`)
  }

  const workspaceKeyA = buildFloatingPanelChatWorkspaceContextCacheKey({
    chatContextScope: 'workspace',
    markdownDocumentName: 'brief-a.md',
    docLocationRevision: 1,
    markdownText: '# A',
    sourceFilesSignature: 'sources-a',
  })
  const workspaceKeyB = buildFloatingPanelChatWorkspaceContextCacheKey({
    chatContextScope: 'workspace',
    markdownDocumentName: 'brief-a.md',
    docLocationRevision: 1,
    markdownText: '# A',
    sourceFilesSignature: 'sources-b',
  })
  if (!workspaceKeyA || !workspaceKeyB || workspaceKeyA === workspaceKeyB) {
    throw new Error('expected workspace-scope chat to key cache by source/workspace signatures')
  }

  const contextItems = createFloatingPanelChatContextItems({
    chatContextScope: 'selection',
    enabledSourceFileCount: 2,
    activeWorkspaceLabel: 'brief-a.md',
    currentNode: null,
    messageCount: 0,
    workspaceContextCacheStatus: 'disabled',
  })
  const cacheChip = contextItems.find(item => item.id === 'context-cache')
  if (!cacheChip || cacheChip.value !== 'selection-only') {
    throw new Error(`expected context rail cache chip to report selection-only status, got ${JSON.stringify(cacheChip)}`)
  }
}

export async function testFloatingPanelChatFooterShowsRelayStatusSeparatelyFromEndpointConnectivity() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatFooter, {
        input: '',
        setInput: () => undefined,
        isLoading: false,
        errorText: null,
        connectivity: 'unknown',
        connectivityDetail: null,
        relayStatus: {
          tone: 'error',
          detail: 'Agnes AI server-managed relay is not enabled for this workspace.',
        },
        currentNode: null,
        modelId: 'agnes-2.0-flash',
        modelOptions: ['agnes-2.0-flash'],
        onModelChanged: () => undefined,
        uiPanelTextFontClass: 'text-sm',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        isSubmitDisabled: true,
        onSubmit: event => event.preventDefault(),
        onStop: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const relayStatus = container.querySelector('[data-kg-chat-relay-status="true"]') as HTMLElement | null
    if (!relayStatus) {
      throw new Error('expected footer to render a dedicated relay status row')
    }
    if (!String(relayStatus.textContent || '').includes('relay is not enabled for this workspace')) {
      throw new Error(`expected footer relay status row to expose the workspace policy detail, got ${JSON.stringify(relayStatus.textContent)}`)
    }
    if (!relayStatus.className.includes('text-yellow-700')) {
      throw new Error(`expected blocked relay status to use warning styling, got ${relayStatus.className}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export async function testFloatingPanelChatFooterShowsRelayWorkspacePolicySummary() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatFooter, {
        input: '',
        setInput: () => undefined,
        isLoading: false,
        errorText: null,
        connectivity: 'unknown',
        connectivityDetail: null,
        relayStatus: {
          tone: 'ok',
          detail: 'Agnes AI workspace relay is ready.',
        },
        relaySummary: 'Workspace kgws:test-chat · Role editor · Auth server-managed · Default model agnes-2.0-flash',
        currentNode: null,
        modelId: 'agnes-2.0-flash',
        modelOptions: ['agnes-2.0-flash'],
        onModelChanged: () => undefined,
        uiPanelTextFontClass: 'text-sm',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        isSubmitDisabled: true,
        onSubmit: event => event.preventDefault(),
        onStop: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const relaySummary = container.querySelector('[data-kg-chat-relay-summary="true"]') as HTMLElement | null
    if (!relaySummary) {
      throw new Error('expected footer to render a dedicated relay policy summary row')
    }
    const summaryText = String(relaySummary.textContent || '')
    for (const snippet of ['Workspace kgws:test-chat', 'Role editor', 'Auth server-managed', 'Default model agnes-2.0-flash']) {
      if (!summaryText.includes(snippet)) {
        throw new Error(`expected relay summary row to include ${snippet}, got ${JSON.stringify(summaryText)}`)
      }
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export async function testFloatingPanelChatFooterRelaySummaryActionOpensLogCallback() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  let openLogCount = 0

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatFooter, {
        input: '',
        setInput: () => undefined,
        isLoading: false,
        errorText: null,
        connectivity: 'unknown',
        connectivityDetail: null,
        relayStatus: {
          tone: 'error',
          detail: 'Agnes AI server-managed relay is not enabled for this workspace.',
        },
        relaySummary: 'Workspace kgws:test-chat · Requested auth server-managed',
        relayAction: {
          label: 'Open Log',
          onClick: () => { openLogCount += 1 },
        },
        currentNode: null,
        modelId: 'agnes-2.0-flash',
        modelOptions: ['agnes-2.0-flash'],
        onModelChanged: () => undefined,
        uiPanelTextFontClass: 'text-sm',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        isSubmitDisabled: true,
        onSubmit: event => event.preventDefault(),
        onStop: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const actionButton = container.querySelector('[data-kg-chat-relay-action="true"]') as HTMLButtonElement | null
    if (!actionButton) {
      throw new Error('expected footer to render a relay action button')
    }
    if (String(actionButton.textContent || '').trim() !== 'Open Log') {
      throw new Error(`expected relay action button label to stay explicit, got ${JSON.stringify(actionButton.textContent)}`)
    }
    await act(async () => {
      actionButton.click()
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    if (openLogCount !== 1) {
      throw new Error(`expected relay action button to invoke the log callback exactly once, got ${openLogCount}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}
