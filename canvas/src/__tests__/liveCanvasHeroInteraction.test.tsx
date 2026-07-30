import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { LiveCanvasHeroEditorial } from '@/components/LiveCanvasHero'
import { readLiveCanvasHeroContent } from '@/features/agentic-os/liveCanvasHeroContent'
import { buildLiveCanvasHeroModel } from '@/features/agentic-os/liveCanvasHeroModel'
import { encodePublishedDocShareToken } from '@/features/canvas/canvasDocShareToken.mjs'
import {
  LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT,
  readLiveCanvasHeroSourceSelection,
} from '@/features/canvas/liveCanvasHeroSourceSelection'
import { installEmbeddedCanvasChatCommandBridge } from '@/features/canvas/embeddedCanvasChatCommand'
import {
  PROMPT_PRESET_ACTIVE_LLM_CHAT_ROUTE,
  PROMPT_PRESET_CATALOG_WORKSPACE_PATH,
  type PromptPreset,
} from '@/features/chat/promptPresetCatalog'
import { AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME } from '../../../mcp/agentic-canvas-os-docs-contract.mjs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

export async function testLiveCanvasHeroInteractionSubmitsToEmbeddedChat(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const submittedQueries: string[] = []
  const cleanupChatBridge = installEmbeddedCanvasChatCommandBridge({
    submit: query => {
      submittedQueries.push(query)
      return true
    },
  })
  let importedSelection: ReturnType<typeof readLiveCanvasHeroSourceSelection> = null
  const importListener = (event: Event) => { importedSelection = readLiveCanvasHeroSourceSelection(event) }
  dom.window.addEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, importListener as EventListener)
  let completedCount = 0
  const model = buildLiveCanvasHeroModel()
  const expectedDefaultQuery = model.defaultQuery
  const investmentPrompt = '/investment-research-agent @source.body #runtime-ready Assess the active workspace sources.'
  const promptPresets: PromptPreset[] = [
    {
      id: 'video-agent',
      label: 'Video Agent',
      slashCommand: '/video-prompt-preset',
      runtimeCommand: '/video-agent',
      description: 'Source-backed video prompt.',
      activation: 'source-backed-canvas',
      invocationModes: ['llm-chat-response', 'mcp-invocation'],
      chatRoute: PROMPT_PRESET_ACTIVE_LLM_CHAT_ROUTE,
      mcpTool: AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
      mcpToken: '/video-agent',
      prompt: expectedDefaultQuery,
    },
    {
      id: 'investment-research-agent',
      label: 'Investment Research Agent',
      slashCommand: '/investment-research-prompt-preset',
      runtimeCommand: '/investment-research-agent',
      description: 'Source-grounded investment research prompt.',
      activation: 'chat-agent',
      invocationModes: ['llm-chat-response', 'mcp-invocation'],
      chatRoute: PROMPT_PRESET_ACTIVE_LLM_CHAT_ROUTE,
      mcpTool: AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
      mcpToken: '/investment-research-agent',
      prompt: investmentPrompt,
    },
  ]
  const promptPresetsRuntime = {
    loadCatalog: async () => ({ ok: true as const, presets: promptPresets, sourcePath: PROMPT_PRESET_CATALOG_WORKSPACE_PATH }),
    loadPrompt: async (id: string) => {
      const preset = promptPresets.find(candidate => candidate.id === id)
      return preset ? { ok: true as const, prompt: preset.prompt } : { ok: false as const, error: `Unknown prompt preset: ${id}` }
    },
  }

  try {
    const content = readLiveCanvasHeroContent()
    await mountReactRoot(root, (
      <LiveCanvasHeroEditorial
        model={model}
        onEnter={() => { completedCount += 1 }}
        promptPresetsRuntime={promptPresetsRuntime}
      />
    ), { window: dom.window as unknown as Window, frames: 4 })

    const editor = container.querySelector('[data-kg-live-canvas-hero-query="1"][data-kg-card-inline-viewer-edit-surface="1"][data-kg-markdown-contenteditable-core="1"]') as HTMLElement | null
    const commandProxy = container.querySelector('[data-kg-card-inline-viewer-edit-command-proxy="1"]') as HTMLTextAreaElement | null
    if (!editor || !commandProxy || commandProxy.value !== expectedDefaultQuery) {
      throw new Error(`expected Hero to reuse the Card/Widget/Chat view-edit surface with raw source fidelity, got ${JSON.stringify(commandProxy?.value)}`)
    }
    const editorViewport = container.querySelector('[data-kg-live-canvas-hero-query-scroll="inline"]') as HTMLElement | null
    if (!editorViewport?.classList.contains('h-44') || !editorViewport.classList.contains('shrink-0') || !editorViewport.classList.contains('overflow-hidden')) {
      throw new Error('expected the Home prompt editor viewport height to remain fixed as preset content changes')
    }
    for (const className of ['h-full', 'overflow-y-auto', 'overscroll-contain']) {
      if (!editor.classList.contains(className)) throw new Error(`expected inline prompt scrolling class ${className}`)
    }
    if (container.querySelector('textarea:not(.sr-only)')) {
      throw new Error('expected Hero to remove the legacy visible textarea projection')
    }
    const commandDeck = container.querySelector('[data-kg-live-canvas-hero-command-deck="true"]') as HTMLElement | null
    const promptControlsViewport = container.querySelector('[data-kg-live-canvas-hero-prompt-controls-scroll="fixed"]') as HTMLElement | null
    if (!commandDeck?.classList.contains('h-[29rem]') || !commandDeck.classList.contains('shrink-0') || !commandDeck.classList.contains('overflow-hidden')) {
      throw new Error('expected the Home prompt panel height to remain fixed across presets')
    }
    for (const className of ['h-24', 'overflow-y-auto', 'overscroll-contain']) {
      if (!promptControlsViewport?.classList.contains(className)) throw new Error(`expected fixed prompt controls viewport class ${className}`)
    }
    const projectedTokens = Array.from(editor.querySelectorAll('[data-kg-inline-invocation-edit-token="1"]')).map(node => node.textContent)
    for (const token of ['/video-agent', '@provider.byteplus', '@text', '@image', '@audio', '@video', '#spec.low']) {
      if (!projectedTokens.includes(token)) throw new Error(`expected shared Card/Widget/Chat invocation chip ${token}, got ${JSON.stringify(projectedTokens)}`)
    }
    const routeChip = editor.querySelector('[data-kg-inline-invocation-edit-token="1"][data-kg-inline-invocation-markdown="/video-agent"]')
    if (!(routeChip instanceof dom.window.HTMLElement)) throw new Error('expected structured Hero /video-agent chip')
    const editorHtmlBeforeDoubleClick = editor.innerHTML
    const secondMouseDown = new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 })
    if (routeChip.dispatchEvent(secondMouseDown) || !secondMouseDown.defaultPrevented) {
      throw new Error('expected the canonical contenteditable core to suppress native double-click text selection on Hero chips')
    }
    routeChip.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }))
    if (editor.innerHTML !== editorHtmlBeforeDoubleClick || commandProxy.value !== expectedDefaultQuery || !editor.contains(routeChip)) {
      throw new Error('expected Hero double-click to preserve the structured chip node and exact raw source')
    }
    const heroText = String(container.textContent || '')
    for (const requiredText of [content.eyebrow, ...content.headline, ...content.posture]) {
      if (!heroText.includes(requiredText)) throw new Error(`expected hero UI to render markdown-backed copy ${JSON.stringify(requiredText)}`)
    }
    const brandMark = container.querySelector('[data-kg-live-canvas-hero-brand-mark="airvio-favicon"]') as HTMLElement | null
    if (!brandMark?.getAttribute('style')?.includes('/favicon.svg?v=airvio')) {
      throw new Error('expected the shared Airvio favicon to replace the legacy blue Home Apex eyebrow dot')
    }
    const promptPresetsLabel = container.querySelector('label[for="knowgrph-live-canvas-hero-query"]')
    if (promptPresetsLabel?.textContent?.trim() !== 'Prompt Presets' || heroText.includes('Agentic Video Canvas')) {
      throw new Error(`expected Prompt Presets to replace the video-only Home label, got ${JSON.stringify(promptPresetsLabel?.textContent)}`)
    }
    const presetSelect = container.querySelector('[data-kg-live-canvas-hero-prompt-preset-select="true"]') as HTMLSelectElement | null
    const presetCatalog = container.querySelector('[data-kg-live-canvas-hero-prompt-presets="true"]')
    const presetOptions = [...(presetSelect?.options || [])]
    if (!presetSelect || presetOptions.map(option => option.value).join(',') !== promptPresets.map(preset => preset.id).join(',')) {
      throw new Error(`expected Home to render the shared Prompt Presets catalog as a dropdown, got ${presetOptions.map(option => option.value).join(',')}`)
    }
    if (!presetCatalog || !promptPresetsLabel || !(presetCatalog.compareDocumentPosition(promptPresetsLabel) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)) {
      throw new Error('expected the Catalog selector to precede Prompt Presets in semantic and visual order')
    }
    if (submittedQueries.length !== 0 || completedCount !== 0) throw new Error('expected zero embedded Chat submissions on mount')
    await act(async () => {
      presetSelect.value = 'investment-research-agent'
      Simulate.change(presetSelect)
      await waitForFrames(dom.window as unknown as Window, 3)
    })
    if (commandProxy.value !== investmentPrompt || submittedQueries.length !== 0) {
      throw new Error(`expected preset selection to load without submitting, got ${JSON.stringify({ value: commandProxy.value, submittedQueries })}`)
    }
    if (container.querySelector('[data-kg-live-canvas-hero-invocation-group]')) {
      throw new Error('expected video-only invocation controls to stay hidden for a non-video prompt preset')
    }
    const parameterChips = [...container.querySelectorAll<HTMLButtonElement>('[data-kg-live-canvas-hero-prompt-parameter]')]
    if (parameterChips.map(button => button.dataset.kgLiveCanvasHeroPromptParameter).join(',') !== '@source.body,#runtime-ready') {
      throw new Error(`expected source-derived non-video parameter chips, got ${parameterChips.map(button => button.dataset.kgLiveCanvasHeroPromptParameter).join(',')}`)
    }
    const parameterFieldset = container.querySelector('[data-kg-live-canvas-hero-prompt-parameters="true"]') as HTMLElement | null
    const parameterNavigation = parameterFieldset?.querySelector('nav') as HTMLElement | null
    if (!parameterFieldset?.classList.contains('h-16') || !parameterFieldset.classList.contains('overflow-hidden')) {
      throw new Error('expected the Parameters selector height to remain fixed across presets')
    }
    for (const className of ['max-h-11', 'overflow-y-auto', 'overscroll-contain']) {
      if (!parameterNavigation?.classList.contains(className)) throw new Error(`expected internally scrolling Parameters class ${className}`)
    }
    await act(async () => {
      parameterChips[1]?.click()
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    if (commandProxy.value.includes('#runtime-ready') || submittedQueries.length !== 0) {
      throw new Error('expected parameter chips to edit locally without submitting')
    }
    await act(async () => {
      presetSelect.value = 'video-agent'
      Simulate.change(presetSelect)
      await waitForFrames(dom.window as unknown as Window, 3)
    })
    if (commandProxy.value !== expectedDefaultQuery || !container.querySelector('[data-kg-live-canvas-hero-invocation-group="provider"]')) {
      throw new Error('expected the Video Agent preset to restore its source-backed prompt and video controls')
    }
    const openAiToken = container.querySelector('[data-kg-live-canvas-hero-invocation-token="@provider.openai"]') as HTMLButtonElement | null
    if (!openAiToken) throw new Error('expected source-backed @provider.openai provider token')
    await act(async () => {
      openAiToken.click()
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    const expectedOpenAiQuery = expectedDefaultQuery.replace('@provider.byteplus', '@provider.openai')
    if (commandProxy.value !== expectedOpenAiQuery) {
      throw new Error(`expected raw provider replacement, got ${JSON.stringify(commandProxy.value)}`)
    }
    const startButton = container.querySelector('[data-kg-live-canvas-hero-start="true"]') as HTMLButtonElement | null
    if (!startButton) throw new Error('expected explicit Run action')
    if (container.querySelector('[data-kg-live-canvas-hero-share-embed="true"]') || container.textContent?.includes('Share canvas embed')) {
      throw new Error('expected Home to omit the Share canvas embed action entirely')
    }
    const actionIcons = Array.from(container.querySelectorAll('[data-kg-live-canvas-hero-action-icon]')) as HTMLElement[],
      iconNames = actionIcons.map(icon => icon.getAttribute('data-kg-live-canvas-hero-action-icon')).join(',')
    if (iconNames !== 'enter,run,import' || actionIcons.some(icon => icon.getAttribute('aria-hidden') === 'true')) {
      throw new Error(`expected visible, queryable Home action icons, got ${iconNames}`)
    }
    const importButton = container.querySelector('[data-kg-live-canvas-hero-import-embed="true"]') as HTMLButtonElement | null
    if (!importButton) throw new Error('expected an explicit Import canvas embed action')
    if (importButton.tagName !== 'BUTTON' || importButton.hasAttribute('href')) {
      throw new Error('expected Import canvas embed to open in place without a workspace navigation link')
    }
    await act(async () => {
      importButton.click()
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    const importPanel = container.querySelector('[aria-label="Import canvas embed panel"]')
    const importValue = importPanel?.querySelector('#canvas-embed-import-value') as HTMLTextAreaElement | null
    const useBackgroundButton = importPanel?.querySelector('button[type="submit"]') as HTMLButtonElement | null
    if (!importValue || !useBackgroundButton || !importPanel) {
      throw new Error('expected Import canvas embed to open its iframe/postMessage input panel')
    }
    const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')?.set
    if (!valueSetter) throw new Error('expected textarea value setter')
    const importedToken = encodePublishedDocShareToken({ canonicalPath: 'docs/imported-canvas.md' })
    await act(async () => {
      valueSetter.call(importValue, `<iframe src="https://airvio.co/knowgrph/share/${importedToken}"></iframe>`)
      Simulate.change(importValue)
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    await act(async () => {
      useBackgroundButton.click()
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    if (!importedSelection?.embedUrl.includes(`/share/${importedToken}?kgPreview=1&kgLiveHero=1`)) {
      throw new Error(`expected imported iframe to dispatch the canonical Hero source selection, got ${JSON.stringify({ importedSelection, value: importValue.value, panelText: importPanel.textContent })}`)
    }
    if (container.querySelector('[aria-label="Import canvas embed panel"]')) {
      throw new Error('expected a successful import to return to the Live Canvas Hero')
    }
    await act(async () => {
      startButton.click()
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    if (Number(submittedQueries.length) !== 1 || submittedQueries[0] !== commandProxy.value || Number(completedCount) !== 0) {
      throw new Error(`expected the Hero action to submit the exact query to embedded Chat once, got ${JSON.stringify({ submittedQueries, completedCount })}`)
    }
  } finally {
    cleanupChatBridge()
    dom.window.removeEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, importListener as EventListener)
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}
