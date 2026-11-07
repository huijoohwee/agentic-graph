import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  resolveMarkdownWorkspaceInitialPaneVisibility,
  resolveMarkdownWorkspacePaneAvailability,
  resolveMarkdownWorkspacePaneVisibility,
} from '../features/markdown-workspace/main/types'

test('Python program files admit four authoring views and place Block off by default', () => {
  const available = resolveMarkdownWorkspacePaneAvailability({ activeDocumentKey: 'exercise.py' })
  const initial = resolveMarkdownWorkspaceInitialPaneVisibility({ activeDocumentKey: 'exercise.py' })
  assert.deepEqual([available.python, available.block, available.json, available.markdown], [true, true, true, true])
  assert.equal(initial.python, true)
  assert.equal(initial.block, false)
  const visible = resolveMarkdownWorkspacePaneVisibility({ layoutMode: 'split', splitPaneVisibility: { ...initial, block: true, json: true, markdown: true }, paneAvailability: available })
  assert.deepEqual([visible.python, visible.block, visible.json, visible.markdown], [true, true, true, true])
})

test('ordinary JSON and Markdown retain their existing pane policy', () => {
  for (const document of ['data.json', 'notes.md']) {
    const available = resolveMarkdownWorkspacePaneAvailability({ activeDocumentKey: document })
    assert.equal(available.block, undefined)
    assert.equal(available.python, undefined)
  }
})
