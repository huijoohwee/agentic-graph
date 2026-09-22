import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildChatInvocationCatalog } from '@/features/chat/chatInvocationRegistry'
import { buildAgenticOsInvocationChipTitle, renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import { buildAgenticOsInvocationSourceTitle } from '@/features/agentic-os/agenticOsDocInvocations'
import { readComposerInvocationSourceTitle } from '@/lib/ui/textareaInvocationProjectionInvocation'
import { readInvocationTokenKind } from '@/lib/markdown/invocationTokens'
import { buildMarkdownInlineTextEditHtml } from '@/lib/markdown-core/ui/markdownInlineTextEditModel'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { NATIVE_XR_MEDIA_INVOCATIONS } from '@/lib/command-menu/inlineNativeMediaCandidates'
import { normalizeXrSceneControl } from '@/features/three/xrSceneMcpRuntime'

export async function testInvocationHoverSourceParity() {
  const { dom, restore } = initJsdomHarness()
  try {
    for (const entry of buildChatInvocationCatalog()) {
      const title = buildAgenticOsInvocationSourceTitle(entry)
      assert.ok(entry.sourcePath, `${entry.token} must declare Source`)
      assert.equal(buildAgenticOsInvocationChipTitle(entry.token), title)
      assert.equal(readComposerInvocationSourceTitle({ text: entry.token, tokenKind: readInvocationTokenKind(entry.token)! }), title)
      const read = dom.window.document.createElement('section')
      read.innerHTML = renderToStaticMarkup(<>{renderAgenticOsInvocationKeywordChip({ value: entry.token, className: '', sourceLink: false, fallbackTitle: 'Legacy label' })}</>)
      assert.equal(read.firstElementChild?.getAttribute('title'), title)
      const edit = dom.window.document.createElement('section')
      edit.innerHTML = buildMarkdownInlineTextEditHtml({ value: entry.token })
      assert.equal(edit.querySelector('[data-kg-inline-invocation-edit-token]')?.getAttribute('title'), title)
      if (entry.mcpTool) assert.ok(title.includes(`MCP / WebMCP: ${entry.mcpTool}`))
    }
    for (const entry of NATIVE_XR_MEDIA_INVOCATIONS) {
      const control = normalizeXrSceneControl({ invocation: entry.insertionText })
      assert.ok(control, `${entry.token} must reuse the native MCP invocation`)
      assert.equal(control.assetId || control.stageId, entry.token.slice(1))
    }
    assert.ok(buildAgenticOsInvocationChipTitle('@unknown-local-reference').includes('no catalog definition available'))
  } finally { restore() }
}
