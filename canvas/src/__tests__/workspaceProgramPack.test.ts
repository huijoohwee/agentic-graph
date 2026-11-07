import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceProgramPack, textDigest, WORKSPACE_PACK_SCHEMA } from '../features/block-editor/workspaceProgramPack'

const request = async (source = 'total = 0\nfor item in range(4):\n    total = total + item\nprint(total)\n') =>
  ({ schema: WORKSPACE_PACK_SCHEMA, title: 'First program', source, sourceDigest: await textDigest(source) })

test('native conversion retains exact source and binds each portable format', async () => {
  const input = await request('# preserved\r\nvalue = 2\r\nprint(value)\r\n')
  const result = await createWorkspaceProgramPack(input)
  assert.equal(result.files[0].content, input.source)
  assert.deepEqual(result.files.map(file => file.name), ['program.py', 'program.json', 'program.md', 'canvas.md'])
  for (const file of result.files) assert.equal(file.digest, await textDigest(file.content))
  assert.equal(result.execution, 'not-executed')
  const { artifactDigest, ...unsigned } = result
  assert.equal(artifactDigest, await textDigest(JSON.stringify(unsigned)))
  assert(result.canvas.nodes > 1)
})
test('identity, parser, extra fields and byte limits fail closed', async () => {
  const input = await request()
  for (const candidate of [{ ...input, source: 'changed = 1' }, { ...input, url: 'https://example.invalid' },
    { ...input, title: '<script>' }, await request('import os\n'), await request('x'.repeat(32769))]) {
    await assert.rejects(createWorkspaceProgramPack(candidate))
  }
})
test('source markup cannot escape owned Canvas labels and repeated calls are deterministic', async () => {
  const input = await request('print("<script>click</script> %%{init: bad}")\n')
  const result = await createWorkspaceProgramPack(input)
  assert(!result.files[3].content.includes('<script>'))
  assert(!result.files[3].content.includes('%%{'))
  assert.deepEqual(result, await createWorkspaceProgramPack(input))
})
test('large Block trees are refused without executing programs', async () => {
  await assert.rejects(createWorkspaceProgramPack(await request('value = 1\n'.repeat(130))), /canvas_limit/)
  assert.equal((await createWorkspaceProgramPack(await request('while True:\n    pass\n'))).execution, 'not-executed')
})
