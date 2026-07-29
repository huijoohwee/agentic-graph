import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  buildAgenticOsDictionaryInvocationMarkdown,
  getAgenticOsCommandInvocations,
  getAgenticOsDictionaryInvocations,
} from '@/features/agentic-os/agenticOsDocInvocations'
import { registerAgenticOsRemoteGrammarCatalogEntries, resetAgenticOsRemoteGrammarCatalogForTests } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { resolveChatInvocationCatalogEntries } from '@/features/chat/chatInvocationRegistry'
import { toStableSlashMenuState } from '@/lib/markdown-core/ui/markdownBlockContainerCore.menuState'

const readUtf8 = (filePath: string) => readFileSync(filePath, 'utf8')

export function testMarkdownSlashMenuActionsReuseTriggerRangeAfterMenuFocus() {
  resetAgenticOsRemoteGrammarCatalogForTests()
  registerAgenticOsRemoteGrammarCatalogEntries([{
    token: '/prd-tad.create',
    kind: 'command',
    sourcePath: 'DICTIONARY-COMMAND.md#/prd-tad.create',
  }])
  try {
    runMarkdownSlashMenuActionsReuseTriggerRangeAfterMenuFocus()
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
  if (getAgenticOsDictionaryInvocations().length !== 0) {
    throw new Error('expected merged Agentic OS dictionary catalog to be empty after remote reset')
  }
  const remainingRemoteCommands = resolveChatInvocationCatalogEntries('slash', '')
    .filter(entry => entry.kind === 'command')
  if (remainingRemoteCommands.length !== 0) {
    throw new Error(`expected merged chat consumer catalog to drop remote commands after reset, got ${JSON.stringify(remainingRemoteCommands)}`)
  }
}

function runMarkdownSlashMenuActionsReuseTriggerRangeAfterMenuFocus() {
  const root = process.cwd()
  const menuState = toStableSlashMenuState(
    { show: false, leftPx: 0, topPx: 0 },
    {
      show: true,
      leftPx: 10,
      topPx: 20,
      kind: 'slash',
      query: '',
      triggerRange: { startOffset: 12, endOffset: 13 },
    },
  )
  if (menuState.triggerRange?.startOffset !== 12 || menuState.triggerRange.endOffset !== 13) {
    throw new Error(`expected slash menu state to preserve trigger range, got ${JSON.stringify(menuState.triggerRange)}`)
  }

  const overlayText = readUtf8(path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.inlineMenusOverlay.tsx'))
  if (!overlayText.includes('applyTurnInto(actionId, props.slashMenu.triggerRange || null)')) {
    throw new Error('expected Agentic OS slash menu actions to pass the captured trigger range into applyTurnInto')
  }

  const formattingText = readUtf8(path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.markdownFormatting.ts'))
  if (!formattingText.includes('triggerSelection || args.readSelectionOffsetsForFormatting() || args.getSelectionOffsets()')) {
    throw new Error('expected Agentic OS insertion to prefer captured slash trigger selection before live menu-focus selection')
  }

  const prdTadInvocation = getAgenticOsCommandInvocations().find(invocation => invocation.token === '/prd-tad.create')
  if (!prdTadInvocation) throw new Error('expected Agentic OS command dictionary to expose /prd-tad.create')
  if (buildAgenticOsDictionaryInvocationMarkdown(prdTadInvocation) !== '/prd-tad.create') {
    throw new Error('expected dictionary command insertion to persist the canonical slash token only')
  }
  const catalogEntry = resolveChatInvocationCatalogEntries('slash', '').find(entry => entry.token === '/prd-tad.create')
  if (!catalogEntry) throw new Error('expected the shared invocation catalog to expose /prd-tad.create')
  if (catalogEntry.token !== '/prd-tad.create' || /https?:\/\//.test(catalogEntry.token)) {
    throw new Error(`expected shared invocation catalog insertion to persist only /prd-tad.create, got ${JSON.stringify(catalogEntry.token)}`)
  }
}
