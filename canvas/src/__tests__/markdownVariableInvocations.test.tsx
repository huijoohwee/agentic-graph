import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildMarkdownVariablePreviewByKey, renderMarkdownVariableReferenceChip, useMarkdownVariablePreviewSource } from '@/lib/markdown-core/ui/markdownInlineVariableMediaPreview'
import { resolveMarkdownVariableText } from '@/features/markdown/ui/markdownVariableText'
import { getMarkdownXrVariableInvocations, getMarkdownXrVariableTarget } from '@/features/markdown/ui/markdownXrVariableInvocations'
import { normalizeXrSceneControl } from '@/features/three/xrSceneControlNormalization'
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

export async function testMarkdownViewerSharedInvocations() {
  let source = readFileSync(new URL('../../../docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md', import.meta.url), 'utf8')
  const previous = useGraphStore.getState()
  completeSourceFilesBootstrap()
  useGraphStore.setState({ markdownDocumentName: 'choices.md', markdownDocumentText: source, workspaceViewMode: 'editor', markdownWorkspaceIndexingInFlight: false, workspaceGraphMutationBlockUntilMs: 0, workspaceGraphMutationLayoutLockActive: false, sourceFiles: [], graphData: { type: 'Graph', context: 'frontmatter-flow', nodes: [{ id: 'scene', label: 'Scene', type: 'default' }], edges: [], metadata: parseMarkdownFrontmatter(source.split('\n')).meta } } as never)
  let settled = true
  const unregister = registerWorkspaceSceneMetadataEditor(() => ({ path: 'choices.md', text: source, settled }))
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
    const { previewByKey: previews } = useMarkdownVariablePreviewSource(text, true, 100000, 'choices.md')
    return <>{['kgXrMotionReference.stageId', 'kgXrMotionReference.camera.1.caption'].map(key => renderMarkdownVariableReferenceChip({ baseKey: key, key, raw: `{{${key}}}`, opts: { activeDocumentPath: '', uiPanelTextFontClass: '', uiPanelMonospaceTextClass: '', markdownPresentationMode: false, markdownVariablePreviewByKey: previews } }))}</>
  }
  try {
    await import('@/features/three/xrSceneMcpRuntime')
    await mountReactRoot(root, <Viewer />)
    const change = async (label: string, value: string) => {
      await act(async () => {
        const chip = container.querySelector<HTMLButtonElement>(`button[aria-label="Change ${label}"]`)!
        assert.ok(chip, label); chip.click()
      })
      await act(async () => {
        const option = [...env.dom.window.document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(option => option.textContent?.includes(value))!
        assert.ok(option, value)
        assert.match(option.textContent!, /\/xr\.(stage|transform) @/, 'options show the canonical invocation')
        if (value !== 'Monkey performer') option.click()
        await settleWorkspaceSourceTextWrites()
      })
    }
    assert.equal(container.querySelector('select'), null, 'references reuse the command menu instead of a parallel select')
    await change('wolf', 'Monkey performer')
    const search = env.dom.window.document.querySelector<HTMLInputElement>('[role=combobox]')!
    for (const key of ['ArrowDown', 'ArrowDown', 'Enter']) await act(async () => {
      search.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key, bubbles: true }))
      await settleWorkspaceSourceTextWrites()
    })
    await change('straw', 'Brick house')
    await change('Tropical Playground', 'Neutral Volume')
    const plan = readXrMotionReferencePlan(parseMarkdownFrontmatter(source.split('\n')).meta.kgXrMotionReference)
    assert.equal(plan.subjects[0]?.assetId, 'character-monkey')
    assert.equal(plan.subjects[0]?.label, before.subjects[0]?.label, 'authored role names are preserved')
    assert.equal(plan.subjects[4]?.assetId, 'prop-house-brick')
    assert.equal(plan.stageId, 'neutral-volume')
    await settleWorkspaceSourceTextWrites()
    assert.equal(await fs.readFileText('/choices.md'), source, 'the existing workspace writer saves choices for reopening')
    settled = false
    const savedSource = source
    await change('monkey', 'Wolf performer')
    assert.equal(source, savedSource, 'pending source edits cannot be overwritten by a choice')
    settled = true
    assert.equal(readXrMotionReferencePlan(resolveXrMotionReferencePersistedValue(useGraphStore.getState().graphData?.metadata)).subjects[0]?.assetId, 'character-monkey', 'the shared scene metadata owner applies the changed asset')
    assert.deepEqual(plan.cast.map(track => track.marks), before.cast.map(track => track.marks))
    assert.deepEqual(plan.camera, before.camera, 'templates and camera anchors remain authored once')
    assert.equal(source.slice(source.indexOf('\n---', 4) + 4), body)
    const variables = buildMarkdownVariablePreviewByKey(source)
    assert.match(resolveMarkdownVariableText(plan.camera[1]!.caption!, variables), /house of brick.*hungry monkey/)
    const target = variables['kgxrmotionreference.subjects.0.assetid']!.invocationTarget!
    const invocations = getMarkdownXrVariableInvocations(target)
    assert.ok(invocations.length > 3, 'the existing catalog supplies options without a second allowlist')
    const monkey = invocations.find(item => item.id === 'character-monkey')!
    const normalized = normalizeXrSceneControl({ invocation: monkey.invocation })!
    assert.deepEqual({ ...normalized, invocation: '' }, normalizeXrSceneControl({ action: 'transform', subjectId: before.subjects[0]!.id, assetId: 'character-monkey' }))
    assert.equal(getMarkdownXrVariableTarget(variables, '__proto__.polluted'), null)
    assert.equal(getMarkdownXrVariableTarget({ 'kgxrmotionreference.stageid': { value: 'neutral-volume', source: 'inline' } }, 'kgxrmotionreference.stageid'), null)
    const plain = renderToStaticMarkup(renderMarkdownVariableReferenceChip({ baseKey: 'read-only', key: 'kgXrMotionReference.camera.1.caption', raw: '{{kgXrMotionReference.camera.1.caption}}', opts: { activeDocumentPath: '', uiPanelTextFontClass: '', uiPanelMonospaceTextClass: '', markdownPresentationMode: false, markdownVariablePreviewByKey: variables } }))
    assert.ok(!plain.includes('<button') && !plain.includes('<select'), 'read-only references cannot invoke mutations')
    assert.match(plain, /monkey/)
    assert.match(resolveMarkdownVariableText('{{a}}', { a: { value: '{{b}}' }, b: { value: '{{a}}' } }), /\{\{a\}\}/)
    assert.equal(XrSceneLibraryAssetGeometry({ assetId: 'character-monkey' }).props.kind, 'monkey')
  } finally { await unmountReactRoot(root); await settleWorkspaceSourceTextWrites(); resetWorkspaceFsForTests(); unregister(); useGraphStore.setState(previous, true); env.restore() }
}
