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
import { buildLiveCanvasHeroPresetDemo } from '@/features/agentic-os/liveCanvasHeroPresetDemo'
import {
  PROMPT_PRESET_ACTIVE_LLM_CHAT_ROUTE,
  PROMPT_PRESET_CATALOG_WORKSPACE_PATH,
  type PromptPreset,
} from '@/features/chat/promptPresetCatalog'
import { AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME } from '../../../mcp/agentic-canvas-os-docs-contract.mjs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'
import type { PromptPresetInvocationResult } from '@/features/chat/promptPresetInvocation'

export async function testLiveCanvasHeroProductEntryPreset(): Promise<void> {
  for (const scenario of ['ready', 'error', 'edited', 'switched'] as const) {
    const { dom, restore } = initJsdomHarness()
    dom.reconfigure({ url: 'http://localhost/81rv10/' })
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    const root = createRoot(container)
    const model = buildLiveCanvasHeroModel()
    const launchPrompt = '/launch-copilot outline reference Build a source-grounded proposal.'
    const presets: PromptPreset[] = ['launch-copilot', 'video-agent'].map(id => ({
      id, label: id === 'launch-copilot' ? 'Launch Copilot (81rv10)' : 'Video Agent',
      slashCommand: `/${id}-prompt-preset`, runtimeCommand: `/${id}`,
      description: 'Shared catalog preset.', activation: 'chat-agent',
      invocationModes: ['native-chat-response', 'mcp-invocation'],
      chatRoute: 'active native shared runtime', mcpTool: AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
      mcpToken: `/${id}`, prompt: id === 'launch-copilot' ? launchPrompt : model.defaultQuery,
    }))
    let resolvePrompt!: (result: PromptPresetInvocationResult) => void
    const pendingPrompt = new Promise<PromptPresetInvocationResult>(resolve => { resolvePrompt = resolve })
    const requested: string[] = []
    const submissions: string[] = []
    const runtime = {
      loadCatalog: async () => ({ ok: true as const, presets, sourcePath: PROMPT_PRESET_CATALOG_WORKSPACE_PATH }),
      loadPrompt: async (id: string) => {
        requested.push(id)
        return id === 'launch-copilot' ? pendingPrompt : { ok: true as const, prompt: model.defaultQuery }
      },
    }
    try {
      await mountReactRoot(root, <LiveCanvasHeroEditorial model={model} promptPresetsRuntime={runtime} activateDemo={async selection => { submissions.push(selection.prompt) }} />,
        { window: dom.window as unknown as Window, frames: 3 })
      const selector = container.querySelector('select') as HTMLSelectElement
      const proxy = container.querySelector('[data-kg-card-inline-viewer-edit-command-proxy="1"]') as HTMLTextAreaElement
      const run = container.querySelector('[data-kg-live-canvas-hero-enter="true"]') as HTMLButtonElement
      if (selector.value !== 'launch-copilot' || proxy.value || !run.disabled || requested.join(',') !== 'launch-copilot') {
        throw new Error('81rv10 must initially select Launch Copilot and wait for its shared prompt without a video fallback')
      }
      if (run.tagName !== 'BUTTON' || run.hasAttribute('href') || container.querySelector('[aria-label="Run all"]')) {
        throw new Error('81rv10 must have one in-place Chat action and no Run all')
      }
      await act(async () => {
        if (scenario === 'edited') {
          const editor = container.querySelector('[data-kg-live-canvas-hero-query="1"]') as HTMLElement
          editor.textContent = 'My revised requirement'
          Simulate.input(editor)
        }
        if (scenario === 'switched') {
          selector.value = 'video-agent'
          Simulate.change(selector)
        }
        await waitForFrames(dom.window as unknown as Window, 2)
        resolvePrompt(scenario === 'error' ? { ok: false, error: 'Preset source unavailable.' } : { ok: true, prompt: launchPrompt })
        await waitForFrames(dom.window as unknown as Window, 3)
      })
      const expected = scenario === 'error' ? '' : scenario === 'edited' ? 'My revised requirement'
        : scenario === 'switched' ? model.defaultQuery : launchPrompt
      if (String(proxy.value) !== expected || submissions.length) {
        throw new Error(`81rv10 ${scenario} must preserve exact prompt bytes without execution: ${proxy.value}`)
      }
      if (scenario === 'error' && (!run.disabled || !container.textContent?.includes('Preset source unavailable.'))) {
        throw new Error('81rv10 must expose failed preset loading and keep empty Run disabled')
      }
      if (scenario === 'ready') {
        await act(async () => { run.click(); await waitForFrames(dom.window as unknown as Window, 1) })
        if (Number(submissions.length) !== 1 || submissions[0] !== launchPrompt) throw new Error('Entry must seed the loaded Launch Copilot prompt once')
      }
    } finally {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
      container.remove()
      restore()
    }
  }
}

export async function testLiveCanvasHeroInteractionOpensPresetChat(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const submittedQueries: string[] = []
  let demoSelection = { id: '', prompt: '' }
  let importedSelection: ReturnType<typeof readLiveCanvasHeroSourceSelection> = null
  const importListener = (event: Event) => { importedSelection = readLiveCanvasHeroSourceSelection(event) }
  dom.window.addEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, importListener as EventListener)
  let completedCount = 0
  const model = buildLiveCanvasHeroModel()
  const expectedDefaultQuery = model.defaultQuery
  const investmentPrompt = '/investment-research-agent @source.body #runtime-ready Assess the active workspace sources.'
  const launchPrompt = '/launch-copilot outline reference Assess a solopreneur checkout pain point.'
  const physicsPrompt = '/xr.physics @canvas #controller operation=develop-run mode=ball'
  const promptPresets: PromptPreset[] = [
    {
      id: 'xr-physics', label: 'Physics Playground', slashCommand: '/xr-physics-prompt-preset',
      runtimeCommand: '/xr.physics', description: 'Shared physics controller.', activation: 'source-backed-canvas',
      invocationModes: ['native-chat-response', 'mcp-invocation'], chatRoute: 'active native shared runtime',
      mcpTool: AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME, mcpToken: '/xr.physics', prompt: physicsPrompt,
    },
    {
      id: 'launch-copilot', label: 'Launch Copilot (81rv10)', slashCommand: '/launch-copilot-prompt-preset',
      runtimeCommand: '/launch-copilot', description: 'Ground an MVP and GTM proposal in the selected source.',
      activation: 'chat-agent', invocationModes: ['native-chat-response', 'mcp-invocation'],
      chatRoute: 'active native shared runtime', mcpTool: AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
      mcpToken: '/launch-copilot', prompt: launchPrompt,
    },
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
        onPresetChange={selection => { demoSelection = selection }}
        promptPresetsRuntime={promptPresetsRuntime}
        activateDemo={async selection => { submittedQueries.push(selection.prompt) }}
      />
    ), { window: dom.window as unknown as Window, frames: 4 })

    const initialSelect = container.querySelector('select') as HTMLSelectElement
    const initialProxy = container.querySelector('textarea') as HTMLTextAreaElement
    if (initialSelect.value !== 'xr-physics' || initialProxy.value !== physicsPrompt) throw new Error('Apex must load the shared Physics Playground prompt')
    await act(async () => {
      initialSelect.value = 'video-agent'
      Simulate.change(initialSelect)
      await waitForFrames(dom.window as unknown as Window, 3)
    })

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
    const promptPresetsLabel = container.querySelector('label[for="agentic-graph-live-canvas-hero-query"]')
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
      presetSelect.value = 'launch-copilot'
      Simulate.change(presetSelect)
      await waitForFrames(dom.window as unknown as Window, 3)
    })
    if (String(commandProxy.value) !== launchPrompt || submittedQueries.length !== 0) {
      throw new Error('Launch Copilot selection must seed the shared prompt without execution')
    }
    await act(async () => {
      presetSelect.value = 'investment-research-agent'
      Simulate.change(presetSelect)
      await waitForFrames(dom.window as unknown as Window, 3)
    })
    const demo = buildLiveCanvasHeroPresetDemo(demoSelection)
    if (demo.metadata?.presetId !== 'investment-research-agent' || demo.nodes[0]?.properties?.output !== investmentPrompt
      || demo.nodes.some(node => String(node.properties?.output).includes('/video-agent'))) throw new Error('The preview must follow the selected catalog prompt')
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
    const startButton = container.querySelector('[data-kg-live-canvas-hero-enter="true"]') as HTMLButtonElement | null
    if (!startButton || startButton.textContent?.trim() !== 'Demo' || container.querySelector('[aria-label="Run all"]')) throw new Error('expected one Chat entry action')
    if (container.querySelector('[data-kg-live-canvas-hero-share-embed="true"]') || container.textContent?.includes('Share canvas embed')) {
      throw new Error('expected Home to omit the Share canvas embed action entirely')
    }
    const actionIcons = Array.from(container.querySelectorAll('[data-kg-live-canvas-hero-action-icon]')) as HTMLElement[],
      iconNames = actionIcons.map(icon => icon.getAttribute('data-kg-live-canvas-hero-action-icon')).join(',')
    if (iconNames !== 'enter,import' || actionIcons.some(icon => icon.getAttribute('aria-hidden') === 'true')) {
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
      valueSetter.call(importValue, `<iframe src="https://airvio.co/agentic-graph/share/${importedToken}"></iframe>`)
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
    if (Number(submittedQueries.length) !== 1 || submittedQueries[0] !== commandProxy.value || Number(completedCount) !== 1) {
      throw new Error(`expected the Hero action to seed Chat once and dismiss Home, got ${JSON.stringify({ submittedQueries, completedCount })}`)
    }
  } finally {
    dom.window.removeEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, importListener as EventListener)
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export function testLiveCanvasHeroPresetDemoReflectsDraft(): void {
  for (const selection of [
    { id: 'launch-copilot', prompt: '/launch-copilot outline reference\nInvestigate the selected checkout.' },
    { id: 'video-agent', prompt: '/video-agent @script @video #spec.low Create a film.' },
    { id: 'edited', prompt: 'My edited requirement without invocation tokens.' },
    { id: 'empty', prompt: '' },
  ]) {
    const before = JSON.stringify(selection)
    const graph = buildLiveCanvasHeroPresetDemo(selection)
    if (JSON.stringify(selection) !== before || graph.metadata?.presetId !== selection.id || graph.metadata?.transient !== true) throw new Error('Demo must preserve its source and be transient')
    if (selection.prompt && graph.nodes[0]?.properties.output !== selection.prompt) throw new Error('Demo must show the exact current draft')
    if (!selection.prompt && graph.nodes.length) throw new Error('An empty draft must not fall back to another preset')
    const ids = new Set(graph.nodes.map(node => node.id))
    if (graph.edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target))) throw new Error('Demo edges must stay within the selected prompt')
    if (graph.nodes.some(node => node.properties.command || !node.properties.freezeConnectedOutput)) throw new Error('Preview nodes must not expose executable commands')
  }
}
