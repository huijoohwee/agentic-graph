import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { importWorkspaceLocalFiles } from '@/features/markdown-workspace/workspaceImport'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const createBinaryFile = (name: string, bytes: Uint8Array, type = 'application/octet-stream') => {
  const blob = new Blob([bytes], { type })
  return new File([blob], name, { type })
}

export async function testWorkspaceImportLocalMultipleVideosCreatesStackedVideoAudioSequenceDocument() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const files = [
      createBinaryFile('base-clip.mp4', new Uint8Array([0, 1, 2, 3]), 'video/mp4'),
      createBinaryFile('overlay-clip.webm', new Uint8Array([4, 5, 6, 7]), 'video/webm'),
    ]
    const res = await importWorkspaceLocalFiles({ fs, files, parentPath: '/' })
    if (res.createdPaths.length !== 1) {
      throw new Error(`expected multi-video import to leave one visible sequence document, got ${res.createdPaths.join(', ')}`)
    }
    const text = String((await fs.readFileText(res.createdPaths[0] || '')) || '')
    for (const token of [
      'kgVideoSequenceImportSourceCount: 2',
      'base-clip.mp4',
      'overlay-clip.webm',
      'section Video',
      'section Audio',
      'kgsrc_0_300, 00:00, 5m',
      'kgsrc_0_300, 00:02, 5m',
      'audio : clip_',
    ]) {
      if (!text.includes(token)) throw new Error(`expected multi-video sequence token ${token}, got ${text}`)
    }
    for (const forbidden of ['section Mask', 'section Grade']) {
      if (text.includes(forbidden)) throw new Error(`expected imported videos to avoid default operation lane ${forbidden}`)
    }
  } finally {
    restore()
  }
}
