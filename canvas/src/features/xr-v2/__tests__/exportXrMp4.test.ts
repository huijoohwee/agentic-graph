import assert from 'node:assert/strict'
import test from 'node:test'
import { WORKSPACE_EXPORT_MENU_ITEMS } from '@/lib/toolbar/exportMenuSsot'
import { resolveLaunchDropdownVisibleExportItems } from '@/lib/toolbar/LaunchDropdownExportMenu'
import { publishXrMp4Export } from '@/features/markdown-workspace/main/exports/exportXrMp4'

const result = { status: 'captured' as const, blob: new Blob(['verified fixture']),
  evidence: { durationSeconds: 2, decodedFrames: 3, renderedFrames: 60, width: 320, height: 180, sampleHashes: ['a', 'b', 'c'] } }

test('verified export preserves bytes and uses the existing download plus companion flow', async () => {
  const calls: string[] = []
  assert.equal(await publishXrMp4Export({ result, filename: 'scene.mp4', current: () => true,
    save: async () => null,
    download: (blob, filename) => { assert.equal(blob, result.blob); calls.push(filename) },
    companion: async blob => { assert.equal(blob, result.blob); calls.push('companion') },
  }), 'saved')
  assert.deepEqual(calls, ['scene.mp4', 'companion'])
})

test('source change while save is pending prevents late download or companion writes', async () => {
  let current = true; let writes = 0
  await assert.rejects(publishXrMp4Export({ result, filename: 'scene.mp4', current: () => current,
    save: async () => { current = false; return null }, download: () => { writes++ }, companion: async () => { writes++ },
  }), { name: 'AbortError' })
  assert.equal(writes, 0)
})

test('save picker cancellation does not fall back to a download', async () => {
  let writes = 0
  assert.equal(await publishXrMp4Export({ result, filename: 'scene.mp4', current: () => true,
    save: async () => '', download: () => { writes++ }, companion: async () => { writes++ },
  }), 'cancelled')
  assert.equal(writes, 0)
})


test('existing Export menu exposes MP4 and cancellation only through registered actions while keeping GLB', () => {
  assert.ok(WORKSPACE_EXPORT_MENU_ITEMS.find(item => item.id === 'mp4')?.menuLabel.includes('.mp4'))
  assert.deepEqual(resolveLaunchDropdownVisibleExportItems({ glb: () => {} }).map(item => item.id), ['glb'])
  const ids = resolveLaunchDropdownVisibleExportItems({ glb: () => {}, mp4: () => {}, cancelMediaExport: () => {} }).map(item => item.id)
  assert.ok(ids.includes('glb') && ids.includes('mp4') && ids.includes('cancelMediaExport'))
})
