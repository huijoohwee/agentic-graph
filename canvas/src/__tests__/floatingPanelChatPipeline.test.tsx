import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FloatingPanelChatFooter, FloatingPanelChatMessagesSection } from '@/features/chat/FloatingPanelChatSections'
import { CHAT_INPUT_APPEND_EVENT, FLOATING_PANEL_OPEN_EVENT } from '@/features/canvas/utils'
import { useFloatingPanelChatSurfaceModel } from '@/features/chat/floatingPanelChat/useFloatingPanelChatSurfaceModel'
import { applyFloatingPanelChatInputAppend, resolveFloatingPanelChatInputAppend } from '@/features/chat/floatingPanelChat/floatingPanelChatInputAppend'
import {
  buildFloatingPanelChatSourceFilesSignature,
  buildFloatingPanelChatWorkspaceContextCacheKey,
  createFloatingPanelChatPipelineStages,
  createFloatingPanelChatQuickActions,
} from '@/features/chat/floatingPanelChat/floatingPanelChatSurfaceState'
import { installFloatingPanelBridge } from '@/features/toolbar/floatingPanelBridge'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

const createSource = (overrides: Record<string, unknown> = {}) => ({
  id: 'source-a',
  name: 'source-a.md',
  text: '# Source A',
  enabled: true,
  status: 'parsed' as const,
  parsedParserId: 'markdown',
  parsedTextHash: 'hash-a',
  ...overrides,
})

export function testFloatingPanelChatPipelineStagesDeriveFromRuntimeState() {
  const stages = createFloatingPanelChatPipelineStages({
    sourceFiles: [createSource(), createSource({ id: 'source-b', status: 'loading', parsedTextHash: '' })],
    graphData: { context: '', type: 'Graph', nodes: [{ id: 'node-a', label: 'A', type: 'Node', properties: {} }], edges: [] },
    workspaceViewMode: 'canvas',
  })
  const ingest = stages.find(stage => stage.id === 'ingest')
  const parse = stages.find(stage => stage.id === 'parse')
  const render = stages.find(stage => stage.id === 'render')
  if (ingest?.status !== 'active' || ingest.detail !== '2 sources') {
    throw new Error(`expected ingestion to reflect loading source state, got ${JSON.stringify(ingest)}`)
  }
  if (ingest.label !== 'Ingest' || parse?.label !== 'Parse' || render?.label !== 'Render') {
    throw new Error(`expected pipeline labels to stay human-readable, got ${JSON.stringify(stages.map(stage => stage.label))}`)
  }
  if (parse?.status !== 'active' || parse.detail !== '1/2 parsed') {
    throw new Error(`expected parse progress from source lifecycle, got ${JSON.stringify(parse)}`)
  }
  if (render?.status !== 'active') {
    throw new Error(`expected rendering to remain active while parsing is active, got ${JSON.stringify(render)}`)
  }
}

export async function testFloatingPanelChatFooterAutoSubmitUsesNativeForm(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  let submitCount = 0
  try {
    await mountReactRoot(root, (
      <FloatingPanelChatFooter
        input="/video-agent @provider.byteplus @text"
        setInput={() => undefined}
        submitRequestKey={1}
        isLoading={false}
        errorText={null}
        connectivity="unknown"
        connectivityDetail={null}
        currentNode={null}
        modelId="seed-model"
        modelOptions={['seed-model']}
        onModelChanged={() => undefined}
        uiPanelTextFontClass="text-sm"
        uiPanelMicroLabelTextSizeClass="text-xs"
        isSubmitDisabled={false}
        onSubmit={event => {
          event.preventDefault()
          submitCount += 1
        }}
        onStop={() => undefined}
      />
    ), { window: dom.window as unknown as Window, frames: 2 })
    if (submitCount !== 1) throw new Error(`expected one native form auto-submit, got ${submitCount}`)
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export function testFloatingPanelChatContextKeysRejectSameLengthMiddleEditStaleness() {
  const documentA = '# Title\nalpha payload\nfooter'
  const documentB = '# Title\nomega payload\nfooter'
  if (documentA.length !== documentB.length) throw new Error('test setup requires same-length documents')
  const keyA = buildFloatingPanelChatWorkspaceContextCacheKey({
    chatContextScope: 'workspace',
    markdownDocumentName: 'brief.md',
    markdownText: documentA,
    sourceFilesSignature: 'sources',
  })
  const keyB = buildFloatingPanelChatWorkspaceContextCacheKey({
    chatContextScope: 'workspace',
    markdownDocumentName: 'brief.md',
    markdownText: documentB,
    sourceFilesSignature: 'sources',
  })
  if (keyA === keyB) throw new Error('expected exact document hashing to reject stale same-length middle edits')

  const sourceSignatureA = buildFloatingPanelChatSourceFilesSignature([createSource({ text: documentA })])
  const sourceSignatureB = buildFloatingPanelChatSourceFilesSignature([createSource({ text: documentB })])
  if (sourceSignatureA === sourceSignatureB) throw new Error('expected source signature to include exact source text')
}

export async function testFloatingPanelChatPipelineStagesAreSemanticAndActionable() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const prompts: string[] = []
  const stages = createFloatingPanelChatPipelineStages({
    sourceFiles: [createSource()],
    graphData: { context: '', type: 'Graph', nodes: [{ id: 'node-a', label: 'A', type: 'Node', properties: {} }], edges: [] },
    workspaceViewMode: 'canvas',
  })

  try {
    await mountReactRoot(root, React.createElement(FloatingPanelChatMessagesSection, {
      messages: [],
      isLoading: false,
      historyKey: 'kg:pipeline-test',
      pipelineStages: stages,
      onPipelineStageAction: prompt => prompts.push(prompt),
      uiPanelTextFontClass: 'text-sm',
      uiPanelKeyValueTextSizeClass: 'text-xs',
      uiPanelMicroLabelTextSizeClass: 'text-xs',
      setMessages: () => undefined,
    }), { window: dom.window as unknown as Window, frames: 2 })

    const pipeline = container.querySelector('nav[data-kg-chat-pipeline="true"]')
    if (!pipeline || pipeline.getAttribute('aria-label') !== 'Document pipeline') {
      throw new Error('expected a semantic document pipeline navigation region')
    }
    const stageButtons = container.querySelectorAll('[data-kg-chat-pipeline-stage]')
    if (stageButtons.length !== 3) throw new Error(`expected three pipeline stages, got ${stageButtons.length}`)
    const parseButton = container.querySelector('[data-kg-chat-pipeline-stage="parse"]') as HTMLButtonElement | null
    if (!parseButton || parseButton.getAttribute('data-status') !== 'ready') {
      throw new Error('expected parsed source state to render as ready')
    }
    parseButton.click()
    await waitForFrames(dom.window as unknown as Window, 1)
    if (!prompts[0]?.includes('parser lifecycle') || prompts[0]?.startsWith('/')) {
      throw new Error(`expected pipeline stage action to publish its runtime-aware prompt, got ${JSON.stringify(prompts)}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export function testFloatingPanelChatQuickActionsUseInvocationRoutes() {
  const actions = createFloatingPanelChatQuickActions({
    activeWorkspaceLabel: 'brief.md',
    currentNode: null,
    sourceFiles: [createSource()],
    graphData: { context: '', type: 'Graph', nodes: [{ id: 'node-a', label: 'A', type: 'Node', properties: {} }], edges: [] },
    messageCount: 1,
  })
  const labels = actions.map(action => action.label)
  const expected = ['/workspace.review', '/pipeline.trace', '/canvas.render', '#memory.extract']
  if (JSON.stringify(labels) !== JSON.stringify(expected)) {
    throw new Error(`expected quick actions to auto-recommend contextual invocation routes, got ${JSON.stringify(labels)}`)
  }
  const memoryExtract = actions.find(action => action.id === 'memory-extract')
  if (!memoryExtract?.prompt.startsWith('#memory.extract Promote the completed harness run into reusable procedural memory.')) {
    throw new Error(`expected procedural memory action to route through the new extraction directive, got ${JSON.stringify(memoryExtract)}`)
  }
  const selectionActions = createFloatingPanelChatQuickActions({
    activeWorkspaceLabel: 'brief.md',
    currentNode: { label: 'Scene A', type: 'Scene' },
    sourceFiles: [createSource()],
    graphData: { context: '', type: 'Graph', nodes: [{ id: 'node-a', label: 'A', type: 'Node', properties: {} }], edges: [] },
    messageCount: 1,
  })
  const nonSlashSelectionActions = selectionActions.filter(action => !action.label.startsWith('/')).map(action => action.label)
  if (JSON.stringify(nonSlashSelectionActions) !== JSON.stringify(['#memory.extract'])) {
    throw new Error(`expected selected-node quick actions to expose only the procedural memory extraction directive outside slash routes, got ${JSON.stringify(selectionActions)}`)
  }
}

export async function testFloatingPanelChatQuickActionsReuseAppendFocusComposerPath() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  function Harness() {
    const [input, setInput] = React.useState('')
    const [appendFocusRequestKey, setAppendFocusRequestKey] = React.useState(0)
    React.useEffect(() => {
      const handler = (event: Event) => {
        const detail = resolveFloatingPanelChatInputAppend((event as CustomEvent<{ text?: string; mode?: 'append' | 'replace' } | undefined>).detail)
        if (!detail) return
        setInput(previous => applyFloatingPanelChatInputAppend(previous, detail))
        setAppendFocusRequestKey(previous => previous + 1)
      }
      dom.window.addEventListener(CHAT_INPUT_APPEND_EVENT, handler as EventListener)
      return () => {
        dom.window.removeEventListener(CHAT_INPUT_APPEND_EVENT, handler as EventListener)
      }
    }, [])

    const { appendPrompt, contextItems, quickActions } = useFloatingPanelChatSurfaceModel({
      chatContextScope: 'hybrid',
      markdownDocumentName: 'brief.md',
      markdownText: '# Brief',
      docLocationRevision: 1,
      sourceFiles: [createSource()],
      graphData: { context: '', type: 'Graph', nodes: [{ id: 'node-a', label: 'A', type: 'Node', properties: {} }], edges: [] },
      workspaceViewMode: 'canvas',
      chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
      chatHistoryWorkspacePath: null,
      currentNode: null,
      messageCount: 1,
      isLoading: false,
    })

    return (
      <>
        <FloatingPanelChatMessagesSection
          messages={[]}
          isLoading={false}
          historyKey="kg:quick-action-append-focus"
          contextItems={contextItems}
          quickActions={quickActions}
          onQuickAction={appendPrompt}
          uiPanelTextFontClass="text-sm"
          uiPanelKeyValueTextSizeClass="text-xs"
          uiPanelMicroLabelTextSizeClass="text-xs"
          setMessages={() => undefined}
        />
        <FloatingPanelChatFooter
          input={input}
          setInput={setInput}
          appendFocusRequestKey={appendFocusRequestKey}
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
          markdownText="# Brief"
        />
      </>
    )
  }

  try {
    await mountReactRoot(root, React.createElement(Harness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    const action = container.querySelector('[data-kg-chat-quick-action-id="pipeline-trace"]') as HTMLButtonElement | null
    if (!action) throw new Error('expected quick-action harness to render the pipeline trace action')

    await act(async () => {
      action.click()
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const input = container.querySelector('[data-kg-card-inline-viewer-edit-command-proxy="1"]') as HTMLTextAreaElement | null
    if (!input) throw new Error('expected quick-action harness to expose the chat command proxy')
    if (!input.value.startsWith('/pipeline.trace Trace the current document from ingestion to parsing to canvas rendering.')) {
      throw new Error(`expected quick action to append through the shared chat event path, got ${JSON.stringify(input.value)}`)
    }
    if (input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length) {
      throw new Error(`expected quick action append to place the composer caret at the end, got selection=${input.selectionStart}:${input.selectionEnd}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export async function testFloatingPanelChatSurfaceModelAppendPromptUsesSharedOpenSeedContract() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const seenOpen: Array<{ tab?: string; open?: boolean }> = []
  const seenAppend: Array<{ text?: string; mode?: string }> = []
  const cleanupBridge = installFloatingPanelBridge({
    openPropsPanel: () => undefined,
    openFloatingPanel: () => undefined,
    openRendererPanel: () => undefined,
  })

  function Harness() {
    const { appendPrompt } = useFloatingPanelChatSurfaceModel({
      chatContextScope: 'hybrid',
      markdownDocumentName: 'brief.md',
      markdownText: '# Brief',
      docLocationRevision: 1,
      sourceFiles: [createSource()],
      graphData: { context: '', type: 'Graph', nodes: [{ id: 'node-a', label: 'A', type: 'Node', properties: {} }], edges: [] },
      workspaceViewMode: 'canvas',
      chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
      chatHistoryWorkspacePath: null,
      currentNode: null,
      messageCount: 1,
      isLoading: false,
    })

    return (
      <button
        type="button"
        data-kg-chat-surface-model-append-prompt="true"
        onClick={() => appendPrompt('/pipeline.trace Trace the current document from ingestion to parsing to canvas rendering.')}
      >
        Append
      </button>
    )
  }

  const openListener = (event: Event) => {
    seenOpen.push((((event as CustomEvent<{ tab?: string; open?: boolean } | undefined>).detail) || {}) as { tab?: string; open?: boolean })
  }
  const appendListener = (event: Event) => {
    seenAppend.push((((event as CustomEvent<{ text?: string; mode?: string } | undefined>).detail) || {}) as { text?: string; mode?: string })
  }

  try {
    dom.window.addEventListener(FLOATING_PANEL_OPEN_EVENT, openListener as EventListener)
    dom.window.addEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    await mountReactRoot(root, React.createElement(Harness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    const action = container.querySelector('[data-kg-chat-surface-model-append-prompt="true"]') as HTMLButtonElement | null
    if (!action) throw new Error('expected append-prompt harness to expose a trigger button')

    await act(async () => {
      action.click()
      await waitForFrames(dom.window as unknown as Window, 1)
    })

    if (seenOpen.length !== 1 || seenOpen[0]?.tab !== 'chat' || seenOpen[0]?.open !== true) {
      throw new Error(`expected surface-model appendPrompt to emit one shared chat-open event, got ${JSON.stringify(seenOpen)}`)
    }
    if (
      seenAppend.length !== 1
      || seenAppend[0]?.text !== '/pipeline.trace Trace the current document from ingestion to parsing to canvas rendering.'
      || seenAppend[0]?.mode !== 'append'
    ) {
      throw new Error(`expected surface-model appendPrompt to emit one shared chat append event, got ${JSON.stringify(seenAppend)}`)
    }
  } finally {
    dom.window.removeEventListener(FLOATING_PANEL_OPEN_EVENT, openListener as EventListener)
    dom.window.removeEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    cleanupBridge()
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}
