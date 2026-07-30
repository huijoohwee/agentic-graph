import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  getAgenticOsBindingInvocations,
  getAgenticOsCommandInvocations,
} from '@/features/agentic-os/agenticOsDocInvocations'
import { getChatInvocationOptions } from '@/features/chat/chatInvocationRegistry'
import { FloatingPanelSkillsCommandsView } from '@/features/toolbar/FloatingPanelSkillsCommandsView'
import SkillsCommandsView from '@/features/panels/views/SkillsCommandsView'
import { resolveChatInvocationCatalogEntries } from '@/features/chat/chatInvocationRegistry'
import { buildImageToThreeJsPromptPreset } from '@/features/image-to-threejs/imageToThreeJsPromptPreset'
import {
  assertPinnedAgenticOsCatalogMetadataWinsForTest,
  registerPinnedAgenticOsDictionaryCatalogForTest,
} from '@/__tests__/helpers/pinnedAgenticOsDictionary'
import { setActiveCardInlineTextExternalCommandTarget } from '@/lib/cards/cardInlineTextExternalCommands'
import {
  registerAgenticOsRemoteGrammarCatalogEntries,
  resetAgenticOsRemoteGrammarCatalogForTests,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames, waitForNextFrame } from '@/tests/lib/reactRootHarness'

type InputHarnessWindow = Window & typeof globalThis

const setInputValue = (window: InputHarnessWindow, input: HTMLInputElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  const InputEventCtor = (window as unknown as { InputEvent?: typeof InputEvent }).InputEvent
  input.dispatchEvent(InputEventCtor
    ? new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: value })
    : new window.Event('input', { bubbles: true }))
  input.dispatchEvent(new window.Event('change', { bubbles: true }))
}

const registerAuthoritativeGrammar = () => {
  registerPinnedAgenticOsDictionaryCatalogForTest()
}

export async function testFloatingPanelSkillsCommandsViewRendersSlashInvokableSkills() {
  resetAgenticOsRemoteGrammarCatalogForTests()
  registerAuthoritativeGrammar()
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await mountReactRoot(root, React.createElement(SkillsCommandsView, { searchQuery: '' }), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    const surface = container.querySelector('[data-kg-floating-panel-skills-commands="true"]')
    const storybuildingRow = container.querySelector('[data-kg-skill-command-row="storybuilding"]')
    const storybuildingIcon = storybuildingRow?.querySelector('[data-kg-skill-command-icon="1"]') as HTMLElement | null
    const storybuildingIconSvg = storybuildingIcon?.querySelector('svg')
    const storybuildingSlash = container.querySelector('[data-kg-skill-command-slash="storybuilding"]')
    if (!surface || !storybuildingRow || storybuildingSlash?.textContent?.trim() !== '/storybuilding') {
      throw new Error('Expected FloatingPanel Skills & Commands to render Storybuilding as a slash-invokable skill')
    }
    if (container.querySelector('[data-kg-runtime-identity="knowgrph-runtime-identity/v1"]')) {
      throw new Error('Expected FloatingPanel Skills & Commands to leave the global runtime identity gate in MainPanel Settings')
    }
    if (
      storybuildingRow.getAttribute('data-kg-skill-command-icon-key') !== 'invocation.subject.story' ||
      !storybuildingIcon ||
      storybuildingIcon.getAttribute('data-kg-skill-command-icon-key') !== 'invocation.subject.story' ||
      storybuildingIcon.getAttribute('data-kg-skill-command-icon-row') !== 'storybuilding' ||
      storybuildingIcon.getAttribute('data-kg-skill-command-icon-token') !== '/storybuilding' ||
      storybuildingIcon.getAttribute('data-kg-skill-command-icon-fidelity') !== 'toolbar' ||
      storybuildingIcon.getAttribute('role') !== 'img' ||
      storybuildingIcon.getAttribute('aria-label') !== 'Storybuilding icon' ||
      storybuildingIcon.hasAttribute('aria-hidden') ||
      !storybuildingIcon.className.includes('kg-skill-command-icon') ||
      !storybuildingIcon.className.includes('h-7') ||
      storybuildingIcon.className.includes('rounded') ||
      storybuildingIcon.className.includes('border') ||
      !storybuildingIconSvg?.getAttribute('class')?.includes('kg-skill-command-icon-glyph') ||
      !storybuildingIconSvg?.getAttribute('class')?.includes('kg-default-glyph')
    ) {
      throw new Error('Expected Storybuilding to expose a CSS-selectable toolbar-fidelity subject icon')
    }
    const personalityRow = container.querySelector('[data-kg-skill-command-token="/personality.overlay"]')
    const personalityIcon = personalityRow?.querySelector('.kg-skill-command-icon') as HTMLElement | null
    const personalityIconGlyph = personalityIcon?.querySelector('.kg-skill-command-icon-glyph')
    if (
      !personalityRow ||
      personalityRow.getAttribute('data-kg-skill-command-icon-key') !== 'invocation.subject.profile' ||
      !personalityIcon ||
      personalityIcon.getAttribute('data-kg-skill-command-icon-key') !== 'invocation.subject.profile' ||
      personalityIcon.getAttribute('data-kg-skill-command-icon-token') !== '/personality.overlay' ||
      personalityIcon.getAttribute('data-kg-skill-command-icon-fidelity') !== 'toolbar' ||
      personalityIcon.getAttribute('role') !== 'img' ||
      personalityIcon.hasAttribute('aria-hidden') ||
      !personalityIconGlyph
    ) {
      throw new Error('Expected Personality overlay to expose a CSS-selectable toolbar-fidelity subject icon')
    }
    const slashEntries = container.querySelectorAll('[data-kg-skill-command-slash]')
    const hashEntries = container.querySelectorAll('[data-kg-skill-command-hash]')
    const atEntries = container.querySelectorAll('[data-kg-skill-command-at]')
    const expectedSlashCount = resolveChatInvocationCatalogEntries('slash', '').length
    const expectedHashCount = resolveChatInvocationCatalogEntries('hash', '').length
    const expectedAtCount = resolveChatInvocationCatalogEntries('at', '').length
    if (slashEntries.length !== expectedSlashCount || hashEntries.length !== expectedHashCount || atEntries.length !== expectedAtCount) {
      throw new Error(`Expected Skills & Commands to render all / # @ entries, got slash=${slashEntries.length}/${expectedSlashCount} hash=${hashEntries.length}/${expectedHashCount} at=${atEntries.length}/${expectedAtCount}`)
    }
    assertPinnedAgenticOsCatalogMetadataWinsForTest()
    if (!container.querySelector('[data-kg-floating-panel-catalog-list="skills-commands"]') || !container.querySelector('[data-kg-floating-panel-catalog-row-layout="compact-list"]')) {
      throw new Error('Expected Skills & Commands catalog rows to reuse the shared FloatingPanel catalog compact-list layout')
    }
    const superagentRun = getAgenticOsCommandInvocations().find(invocation => invocation.token === '/superagent.run')
    const longHorizonHarness = getChatInvocationOptions().find(invocation => invocation.token === '#long-horizon-harness')
    const messageGateway = getAgenticOsBindingInvocations().find(invocation => invocation.token === '@message-gateway')
    if (!superagentRun || !longHorizonHarness || !messageGateway) {
      throw new Error('Expected Agentic OS invocation source registries to expose SuperAgent harness tokens')
    }
    const superagentSlash = container.querySelector(`[data-kg-skill-command-slash="${superagentRun.id}"]`)
    const harnessHash = container.querySelector(`[data-kg-skill-command-hash="hash:${longHorizonHarness.id}"]`)
    const gatewayAt = container.querySelector(`[data-kg-skill-command-at="${messageGateway.id}"]`)
    if (
      superagentSlash?.textContent?.trim() !== '/superagent.run' ||
      harnessHash?.textContent?.trim() !== '#long-horizon-harness' ||
      gatewayAt?.textContent?.trim() !== '@message-gateway'
    ) {
      throw new Error('Expected FloatingPanel Skills & Commands to render dictionary and doc / # @ invocation tokens')
    }
    if (
      superagentSlash?.getAttribute('data-kg-agentic-os-invocation-chip') !== '1' ||
      !superagentSlash?.className.includes('kg-responsive-element-row') ||
      !superagentSlash.className.includes('inline-flex')
    ) {
      throw new Error('Expected Skills & Commands Agentic OS command tokens to reuse the shared responsive invocation chip')
    }

    await mountReactRoot(root, React.createElement(SkillsCommandsView, { searchQuery: 'message gateway' }), {
      window: dom.window as unknown as Window,
      frames: 2,
    })
    if (container.querySelector('[data-kg-skill-command-row="storybuilding"]')) {
      throw new Error('Expected Skills & Commands search to filter non-matching skills')
    }
    if (!container.querySelector(`[data-kg-skill-command-at="${messageGateway.id}"]`)) {
      throw new Error('Expected Skills & Commands search to keep matching @ invocation bindings')
    }

    await mountReactRoot(root, React.createElement(SkillsCommandsView, { searchQuery: 'missing-skill' }), {
      window: dom.window as unknown as Window,
      frames: 2,
    })
    if (container.querySelector('[data-kg-skill-command-row]')) {
      throw new Error('Expected Skills & Commands search to filter non-matching invocation rows')
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
}

export async function testSkillsCommandsViewHydratesRemoteGrammarCatalogEntries() {
  resetAgenticOsRemoteGrammarCatalogForTests()
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  try {
    await mountReactRoot(root, React.createElement(SkillsCommandsView, { searchQuery: 'remote display' }), {
      window: dom.window as unknown as Window,
      frames: 2,
    })
    if (container.querySelector('[data-kg-skill-command-token="#remote-display"]')) {
      throw new Error('Expected the remote-only grammar row to be absent before catalog hydration')
    }
    await act(async () => {
      registerAgenticOsRemoteGrammarCatalogEntries([
        {
          token: '#remote-display',
          kind: 'semantic',
          label: 'Remote display',
          summary: 'Remote-only semantic entry surfaced in Skills & Commands',
          sourcePath: 'DICTIONARY-SEMANTIC.md#remote-display',
          sourceUrl: 'https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/DICTIONARY-SEMANTIC.md#remote-display',
          keywords: ['remote', 'display'],
        },
        {
          token: '@remote-display',
          kind: 'binding',
          label: 'Remote display binding',
          summary: 'Remote-only binding entry surfaced in Skills & Commands',
          sourcePath: 'DICTIONARY-BINDING.md#remote-display',
          sourceUrl: 'https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/DICTIONARY-BINDING.md#remote-display',
          keywords: ['remote', 'display'],
        },
      ])
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await waitForFrames(dom.window as unknown as Window, 2)
    const remoteHash = Array.from<HTMLElement>(container.querySelectorAll<HTMLElement>('[data-kg-skill-command-hash]'))
      .find(node => node.textContent?.trim() === '#remote-display')
    const remoteAt = Array.from<HTMLElement>(container.querySelectorAll<HTMLElement>('[data-kg-skill-command-at]'))
      .find(node => node.textContent?.trim() === '@remote-display')
    if (!remoteHash || !remoteAt) {
      throw new Error(`Expected Skills & Commands view to surface remote-only grammar entries, html=${container.innerHTML}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
}

export async function testFloatingPanelSkillsCommandsViewReusesMediaPanelLayout() {
  resetAgenticOsRemoteGrammarCatalogForTests()
  registerAuthoritativeGrammar()
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await mountReactRoot(root, React.createElement(FloatingPanelSkillsCommandsView), {
      window: dom.window as unknown as Window,
      frames: 2,
    })
    const messageGateway = getAgenticOsBindingInvocations().find(invocation => invocation.token === '@message-gateway')
    if (!messageGateway) throw new Error('Expected Agentic OS binding registry to expose @message-gateway')

    const panel = container.querySelector('[data-kg-floating-panel-skills-commands-view="true"]')
    const sharedHeader = container.querySelector('[data-kg-floating-panel-catalog-header="1"]')
    const sharedBody = container.querySelector('[data-kg-floating-panel-catalog-body="skills-commands"]') as HTMLElement | null
    const catalogSurface = container.querySelector('[data-kg-floating-panel-skills-commands="true"]') as HTMLElement | null
    const prefixFilter = container.querySelector('[data-kg-floating-panel-skills-commands-prefix-filter="1"]')
    const grammarGroup = container.querySelector('[data-kg-floating-panel-skills-commands-grammar-group="1"]')
    const sharedSearchToggle = container.querySelector('[data-kg-floating-panel-catalog-search-toggle="1"]') as HTMLButtonElement | null
    const skillsSearchToggle = container.querySelector('[data-kg-skills-commands-search-toggle="1"]') as HTMLButtonElement | null
    const subjectGroupToggle = container.querySelector('[data-kg-skills-commands-grammar-toggle="subject"]') as HTMLButtonElement | null
    const objectGroupToggle = container.querySelector('[data-kg-skills-commands-grammar-toggle="object"]') as HTMLButtonElement | null
    const motionCaptureProjection = container.querySelector('[data-kg-motion-capture-projection="skills"]')
    const motionCaptureInvocation = motionCaptureProjection?.querySelector('[data-kg-motion-capture-invocation="canonical"]')
    const motionCaptureWebMcp = motionCaptureProjection?.querySelector('[data-kg-motion-capture-web-mcp="1"]')
    if (
      !panel ||
      panel.getAttribute('data-kg-floating-panel-catalog-layout') !== 'media-reuse' ||
      !sharedHeader ||
      sharedHeader.getAttribute('data-kg-floating-panel-catalog-header-fixed') !== '1' ||
      !sharedHeader.className.includes('shrink-0') ||
      sharedHeader.className.includes('sticky') ||
      !sharedBody ||
      !sharedBody.className.includes('overflow-auto') ||
      !catalogSurface ||
      catalogSurface.className.includes('overflow-auto') ||
      !prefixFilter ||
      prefixFilter.nextElementSibling !== grammarGroup ||
      !grammarGroup ||
      container.querySelectorAll('[data-kg-skills-commands-prefix-toggle]').length !== 3 ||
      container.querySelectorAll('[data-kg-skills-commands-grammar-toggle]').length !== 3 ||
      !(subjectGroupToggle instanceof dom.window.HTMLButtonElement) ||
      !(objectGroupToggle instanceof dom.window.HTMLButtonElement) ||
      subjectGroupToggle.getAttribute('aria-label') !== 'Group by Subject' ||
      subjectGroupToggle.getAttribute('aria-pressed') !== 'true' ||
      objectGroupToggle.getAttribute('aria-pressed') !== 'false' ||
      !(sharedSearchToggle instanceof dom.window.HTMLButtonElement) ||
      skillsSearchToggle !== sharedSearchToggle ||
      !motionCaptureProjection ||
      motionCaptureProjection.getAttribute('data-kg-motion-capture-runtime-ready') === null ||
      !motionCaptureInvocation?.textContent?.includes('/motion.control') ||
      !motionCaptureInvocation.textContent.includes('@canvas') ||
      !motionCaptureInvocation.textContent.includes('#pose') ||
      !motionCaptureWebMcp?.textContent?.includes('knowgrph.control_local_motion_control')
    ) {
      throw new Error('Expected Skills & Commands to reuse the shared Media layout and canonical Motion Capture invocation projection')
    }
    const groupDisclosureActions = container.querySelector('[data-kg-skills-commands-disclosure-actions="header"]') as HTMLElement | null
    const groupDisclosureButton = groupDisclosureActions?.querySelector('button') as HTMLButtonElement | null
    const storySubjectGroup = container.querySelector('[data-kg-skills-commands-grammar-group="subject:story"]') as HTMLElement | null
    const agentSubjectGroup = container.querySelector('[data-kg-skills-commands-grammar-group="subject:agent"]') as HTMLElement | null
    const storySubjectGroupToggle = storySubjectGroup?.querySelector('[role="button"][aria-controls]') as HTMLElement | null
    const searchBeforeDisclosure = sharedSearchToggle && groupDisclosureActions
      ? Boolean(sharedSearchToggle.compareDocumentPosition(groupDisclosureActions) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)
      : false
    if (
      !groupDisclosureActions ||
      !sharedHeader.contains(groupDisclosureActions) ||
      sharedBody.contains(groupDisclosureActions) ||
      !(groupDisclosureButton instanceof dom.window.HTMLButtonElement) ||
      groupDisclosureButton.getAttribute('aria-label') !== 'Collapse All' ||
      !searchBeforeDisclosure ||
      !storySubjectGroup ||
      storySubjectGroup.getAttribute('data-kg-skills-commands-grammar-group-collapsed') !== 'false' ||
      !(storySubjectGroupToggle instanceof dom.window.HTMLElement) ||
      storySubjectGroupToggle.getAttribute('aria-expanded') !== 'true' ||
      !storySubjectGroupToggle.className.includes('px-0') ||
      !storySubjectGroupToggle.className.includes('sticky') ||
      !storySubjectGroupToggle.className.includes('top-0') ||
      !agentSubjectGroup ||
      agentSubjectGroup.getAttribute('data-kg-skills-commands-grammar-group-collapsed') !== 'false'
    ) {
      throw new Error('Expected Skills & Commands groups to default expanded, place search before the right-edge shared header collapse-all control, and keep group disclosure sticky/aligned with rows')
    }
    await act(async () => {
      storySubjectGroupToggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })
    if (
      storySubjectGroup.getAttribute('data-kg-skills-commands-grammar-group-collapsed') !== 'true' ||
      storySubjectGroupToggle.getAttribute('aria-expanded') !== 'false'
    ) {
      throw new Error('Expected Skills & Commands grammar groups to reuse the shared section collapse behavior')
    }
    await act(async () => {
      groupDisclosureButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })
    if (
      storySubjectGroup.getAttribute('data-kg-skills-commands-grammar-group-collapsed') !== 'true' ||
      agentSubjectGroup.getAttribute('data-kg-skills-commands-grammar-group-collapsed') !== 'true' ||
      groupDisclosureButton.getAttribute('aria-label') !== 'Expand All'
    ) {
      throw new Error('Expected Skills & Commands bulk disclosure to reuse the shared Collapse All action')
    }
    await act(async () => {
      groupDisclosureButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })
    if (
      storySubjectGroup.getAttribute('data-kg-skills-commands-grammar-group-collapsed') !== 'false' ||
      agentSubjectGroup.getAttribute('data-kg-skills-commands-grammar-group-collapsed') !== 'false' ||
      groupDisclosureButton.getAttribute('aria-label') !== 'Collapse All'
    ) {
      throw new Error('Expected Skills & Commands bulk disclosure to reuse the shared Expand All action')
    }
    const storybuildingRow = container.querySelector('[data-kg-skill-command-row="storybuilding"]') as HTMLElement | null
    const memoryWriteRow = container.querySelector('[data-kg-skill-command-token="/memory.write"]') as HTMLElement | null
    const storybuildingIcon = storybuildingRow?.querySelector('[data-kg-skill-command-icon="1"]') as HTMLElement | null
    const storybuildingTitle = storybuildingRow?.querySelector('h3') as HTMLElement | null
    const storybuildingMeta = storybuildingRow?.querySelector('p') as HTMLElement | null
    const storybuildingToken = storybuildingRow?.querySelector('[data-kg-skill-command-slash="storybuilding"]') as HTMLElement | null
    if (
      catalogSurface.getAttribute('data-kg-floating-panel-skills-commands-grammar-group-by') !== 'subject' ||
      !container.querySelector('[data-kg-skills-commands-grammar-group="subject:story"]') ||
      !storybuildingRow ||
      storybuildingRow.getAttribute('data-kg-floating-panel-catalog-row-layout') !== 'compact-list' ||
      storybuildingRow.getAttribute('data-kg-skill-command-grammar-subject') !== 'story' ||
      storybuildingRow.getAttribute('data-kg-skill-command-grammar-verb') !== 'invoke' ||
      !storybuildingIcon ||
      storybuildingIcon.getAttribute('data-kg-skill-command-icon-fidelity') !== 'toolbar' ||
      storybuildingIcon.getAttribute('role') !== 'img' ||
      storybuildingIcon.hasAttribute('aria-hidden') ||
      !storybuildingIcon.className.includes('kg-skill-command-icon') ||
      storybuildingIcon.className.includes('rounded') ||
      storybuildingIcon.className.includes('border') ||
      !storybuildingTitle?.className.includes('text-xs') ||
      !storybuildingMeta?.className.includes('text-[11px]') ||
      storybuildingToken?.getAttribute('data-kg-card-inline-keyword-pill') !== '1' ||
      storybuildingToken.getAttribute('data-kg-skill-command-token-chip') !== '1' ||
      !storybuildingToken.className.includes('kg-responsive-element-row') ||
      !storybuildingToken.className.includes('inline-flex') ||
      storybuildingToken.tagName.toLowerCase() === 'code' ||
      storybuildingToken.className.includes('font-mono')
    ) {
      throw new Error('Expected Skills & Commands compact rows to reuse the existing responsive invocation chip')
    }
    if (
      !memoryWriteRow ||
      memoryWriteRow.getAttribute('data-kg-skill-command-grammar-subject') !== 'memory' ||
      memoryWriteRow.getAttribute('data-kg-skill-command-grammar-verb') !== 'write' ||
      memoryWriteRow.getAttribute('data-kg-skill-command-grammar-object') !== 'memory'
    ) {
      throw new Error('Expected Skills & Commands rows to expose reusable SVO grammar metadata')
    }

    await act(async () => {
      objectGroupToggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })
    if (
      catalogSurface.getAttribute('data-kg-floating-panel-skills-commands-grammar-group-by') !== 'object' ||
      objectGroupToggle.getAttribute('aria-pressed') !== 'true' ||
      subjectGroupToggle.getAttribute('aria-pressed') !== 'false' ||
      !container.querySelector('[data-kg-skills-commands-grammar-group="object:memory"]')
    ) {
      throw new Error('Expected Skills & Commands SVO segmented control to switch catalog grouping to Object')
    }

    const slashToggle = container.querySelector('[data-kg-skills-commands-prefix-toggle="slash"]') as HTMLButtonElement | null
    if (!(slashToggle instanceof dom.window.HTMLButtonElement)) {
      throw new Error('Expected FloatingPanel Skills & Commands to expose a Media-style prefix segmented control')
    }
    await act(async () => {
      slashToggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })
    if (container.querySelector('[data-kg-skill-command-at]') || !container.querySelector('[data-kg-skill-command-slash]')) {
      throw new Error('Expected Skills & Commands prefix segmented control to filter to slash commands')
    }
    await act(async () => {
      slashToggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })

    await act(async () => {
      sharedSearchToggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })
    const searchInput = container.querySelector('[data-kg-skills-commands-search-input="1"]') as HTMLInputElement | null
    if (!(searchInput instanceof dom.window.HTMLInputElement) || searchInput.getAttribute('placeholder') !== 'Search commands') {
      throw new Error('Expected Skills & Commands search button to expand the shared catalog search input')
    }

    await act(async () => {
      setInputValue(dom.window, searchInput, 'message gateway')
      await waitForFrames(dom.window, 3)
    })
    if (container.querySelector('[data-kg-skill-command-row="storybuilding"]')) {
      throw new Error('Expected shared Skills & Commands search to filter non-matching skills')
    }
    if (!container.querySelector(`[data-kg-skill-command-at="${messageGateway.id}"]`)) {
      throw new Error('Expected shared Skills & Commands search to keep matching @ invocation bindings')
    }

  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
}

export async function testFloatingPanelSkillsCommandsRowsInsertActiveCardInvocationTokens() {
  resetAgenticOsRemoteGrammarCatalogForTests()
  registerAuthoritativeGrammar()
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const insertedTokens: string[] = []

  setActiveCardInlineTextExternalCommandTarget({
    id: 'selected-strybldr-summary',
    insertMedia: () => false,
    insertText: replacement => {
      insertedTokens.push(replacement)
      return true
    },
  })

  try {
    await mountReactRoot(root, React.createElement(SkillsCommandsView, { searchQuery: '' }), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    const imageToThreeJsCommandRow = container.querySelector('[data-kg-skill-command-token="/image.to-threejs"]') as HTMLElement | null
    const imageToThreeJsSemanticRow = container.querySelector('[data-kg-skill-command-token="#image-to-threejs"]') as HTMLElement | null
    const imageToThreeJsBindingRow = container.querySelector('[data-kg-skill-command-token="@image-to-threejs"]') as HTMLElement | null
    const imageToThreeJsBindingChip = imageToThreeJsBindingRow?.querySelector('[data-kg-skill-command-token-chip="1"]') as HTMLElement | null
    if (!imageToThreeJsCommandRow || !imageToThreeJsSemanticRow || !imageToThreeJsBindingRow || !imageToThreeJsBindingChip) {
      throw new Error('Expected Skills & Commands to expose the source-backed image-to-threejs /, #, and @ insertion rows')
    }
    if (
      imageToThreeJsCommandRow.getAttribute('role') !== 'button' ||
      imageToThreeJsCommandRow.getAttribute('tabindex') !== '0' ||
      imageToThreeJsCommandRow.getAttribute('aria-label') !== 'Insert /image.to-threejs' ||
      imageToThreeJsCommandRow.getAttribute('data-kg-skill-command-insert') !== 'card-inline-text'
    ) {
      throw new Error('Expected Skills & Commands rows to act as accessible card inline-text insertion controls')
    }

    await act(async () => {
      imageToThreeJsCommandRow.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      imageToThreeJsCommandRow.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForNextFrame(dom.window)
    })
    await act(async () => {
      imageToThreeJsSemanticRow.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }))
      await waitForNextFrame(dom.window)
    })
    await act(async () => {
      imageToThreeJsBindingChip.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForNextFrame(dom.window)
    })

    const expectedTokens = [buildImageToThreeJsPromptPreset(), '#image-to-threejs', '@image-to-threejs']
    if (insertedTokens.join('|') !== expectedTokens.join('|')) {
      throw new Error(`Expected Skills & Commands catalog clicks to insert ${expectedTokens.join(', ')}, got ${insertedTokens.join(', ') || 'nothing'}`)
    }
  } finally {
    setActiveCardInlineTextExternalCommandTarget(null)
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
}

export function testSkillsCommandsMovedFromMainPanelIntoFloatingPanelTab() {
  const repoRoot = process.cwd()
  const mainPanelTabs = readFileSync(resolve(repoRoot, 'src/features/panels/mainPanelTabs.ts'), 'utf8')
  const mainPanel = readFileSync(resolve(repoRoot, 'src/features/panels/MainPanel.tsx'), 'utf8')
  const iconLibrary = readFileSync(resolve(repoRoot, 'src/features/panels/ui/mainPanelHelpIconLibrary.tsx'), 'utf8')
  const floatingPropsPanel = readFileSync(resolve(repoRoot, 'src/features/toolbar/FloatingPropsPanel.tsx'), 'utf8')
  const floatingSkillsPanel = readFileSync(resolve(repoRoot, 'src/features/toolbar/FloatingPanelSkillsCommandsView.tsx'), 'utf8')
  const skillsCommandsView = readFileSync(resolve(repoRoot, 'src/features/panels/views/SkillsCommandsView.tsx'), 'utf8')
  const mediaCatalogPanelView = readFileSync(resolve(repoRoot, 'src/features/command-menu/MediaCatalogPanelView.tsx'), 'utf8')
  const mediaCatalogListItems = readFileSync(resolve(repoRoot, 'src/features/command-menu/mediaCatalogListItems.tsx'), 'utf8')
  const toolbar = readFileSync(resolve(repoRoot, 'src/lib/toolbar/ToolbarToolMenu.impl.tsx'), 'utf8')
  const storeTypes = readFileSync(resolve(repoRoot, 'src/hooks/store/store-types/graph-state-chat-import.ts'), 'utf8')
  const storeSlice = readFileSync(resolve(repoRoot, 'src/hooks/store/uiSliceInitialState.ts'), 'utf8')

  if (mainPanelTabs.includes("key: 'skillsCommands'") || mainPanelTabs.includes("label: 'Skills & Commands'")) {
    throw new Error('Expected Skills & Commands to be removed from MainPanel tab metadata')
  }
  if (mainPanel.includes('SkillsCommandsViewLazy') || mainPanel.includes('main-panel-skillsCommands-panel')) {
    throw new Error('Expected MainPanel to stop rendering the Skills & Commands surface')
  }
  if (iconLibrary.includes("'mainPanel.skillsCommands'") || iconLibrary.includes("skillsCommands: 'mainPanel.skillsCommands'")) {
    throw new Error('Expected Skills & Commands to be removed from the MainPanel icon registry')
  }
  if (
    floatingPropsPanel.includes("import SkillsCommandsView from '@/features/panels/views/SkillsCommandsView'") ||
    floatingPropsPanel.includes('data-kg-floating-props-panel-skills-pane="true"') ||
    floatingPropsPanel.includes('data-kg-floating-props-panel-layout="skills-right"')
  ) {
    throw new Error('Expected Props Panel to stop embedding Skills & Commands as a right-side pane')
  }
  if (
    !floatingSkillsPanel.includes("import SkillsCommandsView from '@/features/panels/views/SkillsCommandsView'") ||
    !floatingSkillsPanel.includes("from '@/lib/ui/floatingPanelCatalogLayout'") ||
    !floatingSkillsPanel.includes('data-kg-floating-panel-skills-commands-view="true"') ||
    !floatingSkillsPanel.includes('data-kg-floating-panel-catalog-layout="media-reuse"') ||
    !mediaCatalogPanelView.includes("from '@/lib/ui/floatingPanelCatalogLayout'") ||
    !mediaCatalogPanelView.includes('<FloatingPanelCatalogHeader') ||
    !mediaCatalogPanelView.includes('<FloatingPanelCatalogSearchControl') ||
    !mediaCatalogPanelView.includes('FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT') ||
    !mediaCatalogPanelView.includes('data-kg-floating-panel-catalog-list="media"') ||
    !mediaCatalogPanelView.includes('data-kg-floating-panel-catalog-list-rows={FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT}') ||
    !floatingSkillsPanel.includes('trailingActions=') ||
    !skillsCommandsView.includes('floatingPanelCatalogCompactRowClassName()') ||
    !skillsCommandsView.includes('floatingPanelCatalogCompactRowTitleClassName()') ||
    !skillsCommandsView.includes('floatingPanelCatalogCompactRowMetaClassName()') ||
    !skillsCommandsView.includes('renderAgenticOsInvocationKeywordChip') ||
    !skillsCommandsView.includes('resolveInlineInvocationChipClassName') ||
    !skillsCommandsView.includes('data-kg-skill-command-token-chip') ||
    !skillsCommandsView.includes("from '@/features/panels/ui/CollapsibleSection'") ||
    !floatingSkillsPanel.includes("from '@/features/panels/ui/ExpandCollapseAllButton'") ||
    !floatingSkillsPanel.includes("from '@/features/panels/ui/useCollapsibleSectionGroup'") ||
    !floatingSkillsPanel.includes('data-kg-skills-commands-disclosure-actions="header"') ||
    !skillsCommandsView.includes('headerClassName="px-0"') ||
    skillsCommandsView.includes('stickyHeader={false}') ||
    !skillsCommandsView.includes('data-kg-floating-panel-catalog-row-layout={FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT}') ||
    !mediaCatalogListItems.includes('floatingPanelCatalogCompactRowTitleClassName()') ||
    !mediaCatalogListItems.includes('floatingPanelCatalogCompactRowMetaClassName()') ||
    !mediaCatalogListItems.includes('floatingPanelCatalogCompactRowTokenClassName()')
  ) {
    throw new Error('Expected FloatingPanel Skills & Commands to own the catalog surface while reusing the Media FloatingPanel catalog layout and list row height')
  }
  const propsPanelButtonIndex = toolbar.indexOf("{ view: 'propsPanel', title: UI_LABELS.propsPanel")
  const skillsButtonIndex = toolbar.indexOf("{ view: 'skillsCommands', title: UI_LABELS.skillsCommands")
  const propsPanelButtonLineEnd = propsPanelButtonIndex >= 0 ? toolbar.indexOf('\n', propsPanelButtonIndex) : -1
  const buttonSpecsBetween = propsPanelButtonLineEnd >= 0 && skillsButtonIndex > propsPanelButtonLineEnd
    ? toolbar.slice(propsPanelButtonLineEnd, skillsButtonIndex).includes("{ view: '")
    : true
  if (propsPanelButtonIndex < 0 || skillsButtonIndex < 0 || skillsButtonIndex < propsPanelButtonIndex || buttonSpecsBetween) {
    throw new Error('Expected Skills & Commands to be a FloatingPanel button immediately after Props Panel')
  }
  if (!toolbar.includes("floatingPanelView === 'skillsCommands' && <FloatingPanelSkillsCommandsView />")) {
    throw new Error('Expected ToolbarToolMenu to render the first-class Skills & Commands floating view')
  }
  if (
    toolbar.includes("view: 'interaction'") ||
    toolbar.includes("floatingPanelView === 'interaction'") ||
    toolbar.includes('InfiniteCanvasInteractionPanel')
  ) {
    throw new Error('Expected ToolbarToolMenu to remove the stale Interaction floating view after Skills & Commands centralization')
  }
  if (!storeTypes.includes("| 'skillsCommands'") || !storeSlice.includes("view === 'skillsCommands'")) {
    throw new Error('Expected FloatingPanel store types and setter whitelist to include skillsCommands')
  }
  if (!iconLibrary.includes("'floatingPanel.skillsCommands'") || !iconLibrary.includes("skillsCommands: 'floatingPanel.skillsCommands'")) {
    throw new Error('Expected Skills & Commands to use the FloatingPanel icon registry')
  }
}
