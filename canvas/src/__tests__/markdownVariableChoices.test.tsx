import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildMarkdownVariablePreviewByKey, renderMarkdownVariableReferenceChip, useMarkdownVariablePreviewSource } from '@/lib/markdown-core/ui/markdownInlineVariableMediaPreview'
import { buildMarkdownVariableChoicePatch, readMarkdownVariableChoices, resolveMarkdownVariableText } from '@/features/markdown/ui/markdownVariableChoices'
import { parseMarkdownFrontmatter } from '@/lib/markdown'
import { resolveXrMotionReferencePersistedValue } from '@/features/three/xrMotionReferencePersistedValue'
import { readXrMotionReferencePlan } from '@/features/three/xrMotionReferenceModel'
import { XrSceneLibraryAssetGeometry } from '@/features/three/XrSceneLibrarySubject'
import { useGraphStore } from '@/hooks/useGraphStore'
import { registerWorkspaceSceneMetadataEditor } from '@/features/workspace-table/workspaceSceneMetadataAuthoring'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { settleWorkspaceSourceTextWrites } from '@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

export async function testMarkdownViewerFrontmatterChoices() {
  let source = readFileSync(new URL('../../../docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md', import.meta.url), 'utf8')
  const previous = useGraphStore.getState()
  completeSourceFilesBootstrap()
  useGraphStore.setState({ markdownDocumentName: 'choices.md', markdownDocumentText: source, workspaceViewMode: 'editor', markdownWorkspaceIndexingInFlight: false, workspaceGraphMutationBlockUntilMs: 0, workspaceGraphMutationLayoutLockActive: false, sourceFiles: [], graphData: { type: 'Graph', context: 'frontmatter-flow', nodes: [{ id: 'scene', label: 'Scene', type: 'default' }], edges: [], metadata: parseMarkdownFrontmatter(source.split('\n')).meta } } as never)
  let settled = true
  const unregister = registerWorkspaceSceneMetadataEditor(() => ({ path: 'choices.md', text: source, settled }))
  const initial = source
  const body = source.slice(source.indexOf('\n---', 4) + 4)
  const before = readXrMotionReferencePlan(parseMarkdownFrontmatter(source.split('\n')).meta.kgXrMotionReference)
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  resetWorkspaceFsForTests()
  const fs = await getWorkspaceFs()
  await fs.createFile({ parentPath: '/', name: 'choices.md', text: source, mirrorToHost: false })
  const container = env.dom.window.document.getElementById('root')!, root = createRoot(container)
  function Viewer() {
    const [text, setText] = React.useState(source)
    const saved = useGraphStore(state => state.markdownDocumentText)
    React.useEffect(() => { if (saved) { source = saved; setText(saved) } }, [saved])
    const { previewByKey: previews } = useMarkdownVariablePreviewSource(text, patch => {
      const lines = source.split('\n')
      lines.splice(patch.startLine - 1, patch.endLine - patch.startLine + 1, ...patch.replacementLines)
      source = lines.join('\n'); setText(source)
    }, 100000, 'choices.md')
    return <>{['kgXrMotionReference.stageId', 'kgXrMotionReference.camera.1.caption'].map(key => renderMarkdownVariableReferenceChip({ baseKey: key, key, raw: `{{${key}}}`, opts: { activeDocumentPath: '', uiPanelTextFontClass: '', uiPanelMonospaceTextClass: '', markdownPresentationMode: false, markdownVariablePreviewByKey: previews } }))}</>
  }
  try {
    await mountReactRoot(root, <Viewer />)
    const change = async (label: string, value: string) => act(async () => {
      const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
      assert.ok(select, label); select.value = value
      select.dispatchEvent(new env.dom.window.Event('change', { bubbles: true }))
    })
    await change('Visitor', 'character-monkey')
    await change('First house', 'prop-house-brick')
    await change('Scene', 'neutral-volume')
    const plan = readXrMotionReferencePlan(parseMarkdownFrontmatter(source.split('\n')).meta.kgXrMotionReference)
    assert.equal(plan.subjects[0]?.assetId, 'character-monkey')
    assert.equal(plan.subjects[0]?.label, 'The Monkey')
    assert.equal(plan.subjects[4]?.assetId, 'prop-house-brick')
    assert.equal(plan.stageId, 'neutral-volume')
    await settleWorkspaceSourceTextWrites()
    assert.equal(await fs.readFileText('/choices.md'), source, 'the existing workspace writer saves choices for reopening')
    settled = false
    const savedSource = source
    await change('Visitor', 'character-wolf')
    assert.equal(source, savedSource, 'pending source edits cannot be overwritten by a choice')
    settled = true
    assert.equal(readXrMotionReferencePlan(resolveXrMotionReferencePersistedValue(useGraphStore.getState().graphData?.metadata)).subjects[0]?.assetId, 'character-monkey', 'the shared scene metadata owner applies the changed asset')
    assert.deepEqual(plan.cast.map(track => track.marks), before.cast.map(track => track.marks))
    assert.deepEqual(plan.camera, before.camera, 'templates and camera anchors remain authored once')
    assert.equal(source.slice(source.indexOf('\n---', 4) + 4), body)
    const variables = buildMarkdownVariablePreviewByKey(source)
    assert.match(resolveMarkdownVariableText(plan.camera[1]!.caption!, variables), /house of brick.*hungry monkey/)
    assert.equal(buildMarkdownVariableChoicePatch(source, 'kgXrMotionReference.stageId', 'unlisted'), null)
    assert.equal(buildMarkdownVariableChoicePatch(source, '__proto__.polluted', 'yes'), null)
    const plain = renderToStaticMarkup(renderMarkdownVariableReferenceChip({ baseKey: 'read-only', key: 'kgXrMotionReference.camera.1.caption', raw: '{{kgXrMotionReference.camera.1.caption}}', opts: { activeDocumentPath: '', uiPanelTextFontClass: '', uiPanelMonospaceTextClass: '', markdownPresentationMode: false, markdownVariablePreviewByKey: variables } }))
    assert.ok(!plain.includes('<select'), 'read-only references cannot edit source')
    assert.match(plain, /monkey/)
    const definitions = readMarkdownVariableChoices(initial)
    assert.equal(definitions['kgXrMotionReference.subjects.0.assetId']?.options.length, 3)
    assert.match(resolveMarkdownVariableText('{{a}}', { a: { value: '{{b}}' }, b: { value: '{{a}}' } }), /\{\{a\}\}/)
    assert.equal(XrSceneLibraryAssetGeometry({ assetId: 'character-monkey' }).props.kind, 'monkey')
  } finally { await unmountReactRoot(root); await settleWorkspaceSourceTextWrites(); resetWorkspaceFsForTests(); unregister(); useGraphStore.setState(previous, true); env.restore() }
}
