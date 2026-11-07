import test from 'node:test'
import assert from 'node:assert/strict'
import { isProgrammaticDronePrompt, PROGRAMMATIC_DRONE_PROMPT, DRONE_LESSON_MARKER, sourceLearningLesson, inspectProgrammaticDrone } from '../features/python-learning/programmaticDronePreset'
import { buildMarkdownFileTreeContextMenuItems } from '../features/markdown-workspace/markdownFileTreeContextMenuItems'

test('drone preset only permits native inspection and an exact inert lesson marker', async () => {
  assert.equal(isProgrammaticDronePrompt(PROGRAMMATIC_DRONE_PROMPT), true)
  assert.equal(isProgrammaticDronePrompt(PROGRAMMATIC_DRONE_PROMPT.replaceAll(' ', '\n')), true)
  for (const prompt of [PROGRAMMATIC_DRONE_PROMPT.replace('inspect', 'run'), PROGRAMMATIC_DRONE_PROMPT + ' operation=run', '/python.learning', PROGRAMMATIC_DRONE_PROMPT.replace('@canvas', '@receiver')]) {
    assert.equal(isProgrammaticDronePrompt(prompt), false)
    await assert.rejects(inspectProgrammaticDrone(prompt), /Start flight with Run/)
  }
  assert.equal(sourceLearningLesson(DRONE_LESSON_MARKER + '\nland()'), 'drone')
  assert.equal(sourceLearningLesson('print(1)\n' + DRONE_LESSON_MARKER), 'travel')
})

test('read-only source menus share only when a replay builder is supplied and cannot mutate files', async () => {
  const entry = { kind: 'file' as const, path: '/flight.py', parentPath: '/', name: 'flight.py', updatedAtMs: 0 }
  let shared = '', mutated = false
  const base = { entry, readOnly: true, copyToClipboard: async () => true, closeContextMenu: () => {}, onDeleteEntry: () => { mutated = true } }
  assert.equal(buildMarkdownFileTreeContextMenuItems(base).find(item => item.key === 'shareCanvasEmbed')?.disabled, true)
  const menu = buildMarkdownFileTreeContextMenuItems({ ...base, buildCanvasEmbedUrl: async () => 'https://canvas.example/?kgLearningCanvas=drone#flight=recording', onCanvasEmbedReady: (_, url) => { shared = url } })
  await menu.find(item => item.key === 'shareCanvasEmbed')!.onSelect()
  assert.match(shared, /kgLearningCanvas=drone/)
  for (const key of ['rename', 'delete', 'clear', 'newFile', 'shareUrl']) {
    const item = menu.find(item => item.key === key)!
    assert.equal(item.disabled, true); await item.onSelect()
  }
  assert.equal(mutated, false)
})
