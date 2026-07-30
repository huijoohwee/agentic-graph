import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { NATIVE_IMPORT_URL_INVOCATION_TEMPLATE } from '@/features/chat/nativeImportUrlInvocation'
import { resetAgenticOsRemoteGrammarCatalogForTests } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import SkillsCommandsView from '@/features/panels/views/SkillsCommandsView'
import { setActiveCardInlineTextExternalCommandTarget } from '@/lib/cards/cardInlineTextExternalCommands'
import { registerPinnedAgenticOsDictionaryCatalogForTest } from '@/__tests__/helpers/pinnedAgenticOsDictionary'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForNextFrame } from '@/tests/lib/reactRootHarness'

export async function testImportUrlSkillsCommandsExposesAndInsertsCanonicalTuple(): Promise<void> {
  resetAgenticOsRemoteGrammarCatalogForTests()
  registerPinnedAgenticOsDictionaryCatalogForTest()
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const insertedText: string[] = []
  setActiveCardInlineTextExternalCommandTarget({
    id: 'import-url-invocation-test',
    insertMedia: () => false,
    insertText: value => {
      insertedText.push(value)
      return true
    },
  })

  try {
    await mountReactRoot(root, React.createElement(SkillsCommandsView, { searchQuery: '' }), {
      window: dom.window as unknown as Window,
      frames: 2,
    })
    const commandRow = container.querySelector('[data-kg-skill-command-token="/ingest-url"]') as HTMLElement | null
    const bindingRow = container.querySelector('[data-kg-skill-command-token="@url:"]') as HTMLElement | null
    const semanticRow = container.querySelector('[data-kg-skill-command-token="#canvas"]') as HTMLElement | null
    if (
      commandRow?.getAttribute('data-kg-skill-command-kind') !== 'command'
      || bindingRow?.getAttribute('data-kg-skill-command-kind') !== 'binding'
      || semanticRow?.getAttribute('data-kg-skill-command-kind') !== 'semantic'
    ) {
      throw new Error('expected Skills & Commands to expose canonical /ingest-url, @url:, and #canvas rows')
    }
    await act(async () => {
      commandRow.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForNextFrame(dom.window)
    })
    if (insertedText.length !== 1 || insertedText[0] !== NATIVE_IMPORT_URL_INVOCATION_TEMPLATE) {
      throw new Error(`expected Import URL row to insert the runnable tuple, got ${JSON.stringify(insertedText)}`)
    }
  } finally {
    setActiveCardInlineTextExternalCommandTarget(null)
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
}
