import { resolvePinnedAgenticDocsRoot } from '@/tests/lib/repoTestData'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  AGENTIC_OS_CANVAS_INTERACTION_PANEL_KEYWORD,
  findAgenticOsInvocationByToken,
  getAgenticOsBindingInvocations,
  getAgenticOsCanvasInteractionPanelInvocations,
  getAgenticOsCommandInvocations,
  getAgenticOsSemanticInvocations,
} from '@/features/agentic-os/agenticOsDocInvocations'
import { registerAgenticOsRemoteGrammarCatalogEntries, resetAgenticOsRemoteGrammarCatalogForTests } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { parseChatInvocationDirectives } from '@/features/chat/chatInvocationRegistry'
import { resolveChatRuntimeInvocationQuery } from '@/features/chat/chatRuntimeInvocationQuery'

const CANVAS_FUNCTION_INVOCATIONS = [
  {
    capability: 'add',
    slash: ['/canvas.node.add', '/canvas.node.link'],
    hash: ['#canvas-node', '#canvas-selection'],
    at: ['@canvas-center', '@selected-node', '@edge-endpoint'],
  },
  {
    capability: 'node',
    slash: ['/canvas.selection.open', '/canvas.selection.chat', '/canvas.selection.delete', '/canvas.node.link'],
    hash: ['#canvas-node', '#canvas-selection'],
    at: ['@selected-node', '@markdown-provenance'],
  },
  {
    capability: 'media',
    slash: ['/canvas.media.attach'],
    hash: ['#canvas-media'],
    at: ['@selected-node', '@media-url'],
  },
  {
    capability: 'layout',
    slash: ['/canvas.layout.tune', '/canvas.physics.tune'],
    hash: ['#canvas-layout', '#canvas-physics'],
    at: ['@layout-forces', '@physics-2d'],
  },
  {
    capability: 'viewport',
    slash: ['/canvas.viewport.inspect', '/canvas.viewport.transform'],
    hash: ['#canvas-viewport', '#canvas-transform', '#canvas-zoom', '#canvas-wheel'],
    at: ['@viewport-readout', '@viewport-transform', '@zoom-mode', '@wheel-input', '@interaction-speed'],
  },
  {
    capability: 'interaction',
    slash: ['/canvas.interaction.tune'],
    hash: ['#canvas-interaction', '#canvas-flow'],
    at: ['@flow-run-mode', '@drag-alpha-target', '@interaction-speed'],
  },
  {
    capability: 'centering',
    slash: ['/canvas.center', '/canvas.distribute'],
    hash: ['#canvas-centroid', '#canvas-even-spread', '#canvas-selection'],
    at: ['@centroid-target', '@spread-axis', '@selected-node'],
  },
  {
    capability: 'performance',
    slash: ['/canvas.performance.audit'],
    hash: ['#canvas-performance', '#canvas-viewport'],
    at: ['@performance-overlay', '@runtime-proof'],
  },
  {
    capability: 'edge',
    slash: ['/canvas.edge.rewire', '/canvas.node.link', '/canvas.selection.open', '/canvas.selection.chat'],
    hash: ['#canvas-edge', '#canvas-selection'],
    at: ['@selected-edge', '@edge-endpoint', '@markdown-provenance'],
  },
] as const

const collectExpectedTokens = (prefix: '/' | '#' | '@'): readonly string[] => (
  Array.from(new Set(CANVAS_FUNCTION_INVOCATIONS.flatMap(invocation => (
    prefix === '/'
      ? invocation.slash
      : prefix === '#'
        ? invocation.hash
        : invocation.at
  ))))
)

const assertRegistryHasTokens = (
  registry: readonly { token: string; sourcePath: string; dictionaryFileName: string }[],
  expectedTokens: readonly string[],
  dictionaryFileName: string,
) => {
  for (const token of expectedTokens) {
    const invocation = registry.find(entry => entry.token === token)
    if (!invocation) throw new Error(`Expected ${token} to be registered in the Agentic OS ${dictionaryFileName} runtime mirror`)
    if (invocation.dictionaryFileName !== dictionaryFileName || !invocation.sourcePath.includes(`/${dictionaryFileName}`)) {
      throw new Error(`Expected ${token} to resolve to ${dictionaryFileName}, got ${JSON.stringify(invocation)}`)
    }
    const resolved = findAgenticOsInvocationByToken(token)
    if (!resolved || resolved.kind === 'doc' || resolved.sourcePath !== invocation.sourcePath) {
      throw new Error(`Expected ${token} to resolve through the shared Agentic OS dictionary lookup, got ${JSON.stringify(resolved)}`)
    }
  }
}

const assertSourceDictionaryHasTokens = (
  docsRoot: string,
  dictionaryFileName: string,
  expectedTokens: readonly string[],
) => {
  const sourcePath = resolve(docsRoot, dictionaryFileName)
  const source = readFileSync(sourcePath, 'utf8')
  for (const token of expectedTokens) {
    if (!source.includes(`  - "${token}"`)) {
      throw new Error(`Expected ${dictionaryFileName} frontmatter dictionary_entries to include ${token}`)
    }
    if (!source.includes(`| \`${token}\` |`)) {
      throw new Error(`Expected ${dictionaryFileName} body table to define ${token}`)
    }
  }
}

const registerCanvasGrammar = () => {
  const entries = ([
    ['command', 'DICTIONARY-COMMAND.md', collectExpectedTokens('/')],
    ['semantic', 'DICTIONARY-SEMANTIC.md', collectExpectedTokens('#')],
    ['binding', 'DICTIONARY-BINDING.md', collectExpectedTokens('@')],
  ] as const).flatMap(([kind, fileName, tokens]) => tokens.map(token => ({
    token,
    kind,
    sourcePath: `${fileName}#${token}`,
    sourceUrl: `https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/${fileName}#${token}`,
    keywords: [AGENTIC_OS_CANVAS_INTERACTION_PANEL_KEYWORD],
  })))
  registerAgenticOsRemoteGrammarCatalogEntries(entries)
}

export async function testCanvasPanelFunctionsAreAgenticOsInvokable() {
  const docsRoot = await resolvePinnedAgenticDocsRoot()
  resetAgenticOsRemoteGrammarCatalogForTests()
  registerCanvasGrammar()
  const slashTokens = collectExpectedTokens('/')
  const hashTokens = collectExpectedTokens('#')
  const atTokens = collectExpectedTokens('@')

  assertRegistryHasTokens(getAgenticOsCommandInvocations(), slashTokens, 'DICTIONARY-COMMAND.md')
  assertRegistryHasTokens(getAgenticOsSemanticInvocations(), hashTokens, 'DICTIONARY-SEMANTIC.md')
  assertRegistryHasTokens(getAgenticOsBindingInvocations(), atTokens, 'DICTIONARY-BINDING.md')

  assertSourceDictionaryHasTokens(docsRoot, 'DICTIONARY-COMMAND.md', slashTokens)
  assertSourceDictionaryHasTokens(docsRoot, 'DICTIONARY-SEMANTIC.md', hashTokens)
  assertSourceDictionaryHasTokens(docsRoot, 'DICTIONARY-BINDING.md', atTokens)

  for (const invocation of CANVAS_FUNCTION_INVOCATIONS) {
    for (const token of [...invocation.slash, ...invocation.hash, ...invocation.at]) {
      const runtimeQuery = resolveChatRuntimeInvocationQuery(`${token} ${invocation.capability} from active canvas context`)
      if (runtimeQuery.leadingRoute?.kind !== 'agentic-os' || runtimeQuery.leadingRoute.token !== token) {
        throw new Error(`Expected ${token} to be invokable as an Agentic OS runtime route, got ${JSON.stringify(runtimeQuery)}`)
      }
    }
    const directives = parseChatInvocationDirectives(invocation.hash.join(' '))
    const directiveTokens = new Set(directives.map(directive => directive.token))
    for (const hashToken of invocation.hash) {
      if (!directiveTokens.has(hashToken)) {
        throw new Error(`Expected ${hashToken} to parse as a chat semantic directive for ${invocation.capability}`)
      }
    }
  }

  const skillsCommandsView = readFileSync(resolve(process.cwd(), 'src/features/panels/views/SkillsCommandsView.tsx'), 'utf8')
  const chatInvocationRegistry = readFileSync(resolve(process.cwd(), 'src/features/chat/chatInvocationRegistry.ts'), 'utf8')
  const composer = readFileSync(resolve(process.cwd(), 'src/features/chat/floatingPanelChat/FloatingPanelChatComposer.tsx'), 'utf8')
  if (!composer.includes('resolveChatInvocationCatalogEntries')) {
    throw new Error('Expected FloatingPanel Chat composer to consume the shared chat invocation catalog')
  }
  if (!skillsCommandsView.includes('resolveChatInvocationCatalogEntries') || !chatInvocationRegistry.includes('buildChatInvocationCatalog') || !chatInvocationRegistry.includes('getAgenticOsCommandInvocations') || !chatInvocationRegistry.includes('getAgenticOsBindingInvocations')) {
    throw new Error('Expected Skills & Commands to consume the existing chat invocation registry as the shared /, #, and @ catalog')
  }
  if (existsSync(resolve(process.cwd(), 'src/features/panels/views/skillsCommandsCatalog.ts'))) {
    throw new Error('Expected the stale panel-owned Skills & Commands catalog duplicate to be removed')
  }
  const sharedChipSurfacePaths = [
    'src/features/panels/views/SkillsCommandsView.tsx',
    'src/lib/ui/MarkdownSigilText.tsx',
    'src/components/StoryboardWidgetCanvas/StoryboardCardInvocationChips.tsx',
    'src/lib/markdown-core/ui/markdownBlockContainerCore.inlineMediaEditHtml.ts',
    'src/lib/ui/textareaInvocationProjectionInvocation.ts',
    'src/features/chat/floatingPanelChat/FloatingPanelChatMessageContent.tsx',
  ]
  sharedChipSurfacePaths.forEach(filePath => {
    if (!readFileSync(resolve(process.cwd(), filePath), 'utf8').includes('resolveInlineInvocationChipClassName')) {
      throw new Error(`Expected ${filePath} to reuse the shared invocation chip tone resolver`)
    }
  })

  const floatingPropsPanel = readFileSync(resolve(process.cwd(), 'src/features/toolbar/FloatingPropsPanel.tsx'), 'utf8')
  for (const staleSnippet of ['useFloatingPropsPanelModel', 'PanelRangeInput', 'Add Media Node', 'Strong spread preset']) {
    if (floatingPropsPanel.includes(staleSnippet)) {
      throw new Error(`Expected canvas function invocations to stay in shared dictionaries instead of reintroducing local panel controls: ${staleSnippet}`)
    }
  }
  resetAgenticOsRemoteGrammarCatalogForTests()
}

export function testCanvasInteractionInvocationsUseSkillsCommandsCatalog() {
  resetAgenticOsRemoteGrammarCatalogForTests()
  registerCanvasGrammar()
  const invocations = getAgenticOsCanvasInteractionPanelInvocations()
  const tokenSet = new Set<string>(invocations.map(invocation => invocation.token))
  const expectedTokens = new Set([
    '/canvas.layout.tune',
    '/canvas.viewport.inspect',
    '/canvas.viewport.transform',
    '/canvas.interaction.tune',
    '/canvas.physics.tune',
    '/canvas.center',
    '/canvas.distribute',
    '/canvas.performance.audit',
    '#canvas-viewport',
    '#canvas-transform',
    '#canvas-zoom',
    '#canvas-wheel',
    '#canvas-interaction',
    '#canvas-flow',
    '#canvas-physics',
    '#canvas-centroid',
    '#canvas-even-spread',
    '#canvas-performance',
    '@viewport-readout',
    '@viewport-transform',
    '@zoom-mode',
    '@wheel-input',
    '@interaction-speed',
    '@flow-run-mode',
    '@drag-alpha-target',
    '@physics-2d',
    '@centroid-target',
    '@spread-axis',
    '@performance-overlay',
  ])

  for (const token of expectedTokens) {
    if (!tokenSet.has(token)) {
      throw new Error(`Expected canvas interaction panel invocation metadata to include ${token}`)
    }
  }
  for (const kind of ['command', 'semantic', 'binding'] as const) {
    if (!invocations.some(invocation => invocation.kind === kind)) {
      throw new Error(`Expected canvas interaction panel invocation metadata to include ${kind} entries`)
    }
  }
  for (const invocation of invocations) {
    if (!invocation.keywords.includes(AGENTIC_OS_CANVAS_INTERACTION_PANEL_KEYWORD)) {
      throw new Error(`Expected ${invocation.token} to be selected by the shared panel keyword`)
    }
  }

  const toolbar = readFileSync(resolve(process.cwd(), 'src/lib/toolbar/ToolbarToolMenu.impl.tsx'), 'utf8')
  const floatingSkillsCommands = readFileSync(resolve(process.cwd(), 'src/features/toolbar/FloatingPanelSkillsCommandsView.tsx'), 'utf8')
  const catalogSearchLayout = readFileSync(resolve(process.cwd(), 'src/lib/ui/floatingPanelCatalogLayout.tsx'), 'utf8')
  if (
    !floatingSkillsCommands.includes("import SkillsCommandsView from '@/features/panels/views/SkillsCommandsView'") ||
    !floatingSkillsCommands.includes('<SkillsCommandsView') ||
    !floatingSkillsCommands.includes('prefixFilter={prefixFilter}') ||
    !floatingSkillsCommands.includes('searchQuery={search.searchQuery}') ||
    !catalogSearchLayout.includes('export function useFloatingPanelCatalogSearch(): FloatingPanelCatalogSearchState') ||
    !toolbar.includes("<FloatingPanelSkillsCommandsView />")
  ) {
    throw new Error('Expected canvas interaction invocations to resolve through the central Skills & Commands catalog')
  }
  for (const staleSnippet of [
    'InfiniteCanvasInteractionPanel',
    "view: 'interaction'",
    "floatingPanelView === 'interaction'",
    'handleOpenInteractionSkillsCommands',
    'CANVAS_INTERACTION_SKILLS_COMMANDS_QUERY',
  ]) {
    if (toolbar.includes(staleSnippet) || floatingSkillsCommands.includes(staleSnippet) || catalogSearchLayout.includes(staleSnippet)) {
      throw new Error(`Expected stale Interaction floating view handoff code to be removed: ${staleSnippet}`)
    }
  }
  for (const staleSnippet of [
    'InfiniteCanvasInteractionPanel',
    'renderAgenticOsInvocationKeywordChip',
    'data-kg-canvas-interaction-invocation-panel',
    'PanelLabeledRangeCard',
    'TwoColumnEditorGrid',
    'CanvasPerformancePanel',
    'Viewport size',
    'Zoom percent',
    'Velocity decay bias',
    'Drag alphaTarget',
    'Physics 2D',
    'Centering / Centroid',
    'Even Spread',
    'Distribute Horizontally',
    'Show Perf Overlay',
  ]) {
    if (toolbar.includes(staleSnippet) || floatingSkillsCommands.includes(staleSnippet)) {
      throw new Error(`Expected Skills & Commands centralization to avoid stale Interaction panel code: ${staleSnippet}`)
    }
  }
  resetAgenticOsRemoteGrammarCatalogForTests()
}
