import assert from 'node:assert/strict'
import yaml from 'js-yaml'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { withDurableBrowserStorage } from '@/__tests__/helpers/durable-browser-storage'
import { createFakeAgenticGraphStorageBrowserSession } from '@/__tests__/helpers/fake-agentic-graph-storage-browser-session'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { __resetAgenticGraphStorageDbForTests } from '@/lib/storage/agentic-graph-storage-db'
import { readCanonicalCloudDocumentSnapshot, syncWorkspaceEntryToCloudWorkspaceSnapshot } from '@/features/source-files/sourceFileCanonicalCloudSync'
import { importSourceFileCloudSnapshot } from '@/features/source-files/sourceFileCloudTransfer'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan } from '@/features/three/xrMotionReferenceModel'
import { XR_SCENE_APPEARANCE_PRESETS } from '@/features/three/xrSceneAppearance'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'

export async function testXrSceneAppearanceAuthenticatedDeviceRoundTrip() {
  const harness = initJsdomHarness()
  try {
    await withDurableBrowserStorage(async () => {
      resetWorkspaceFsForTests()
      const workspaceId = 'kgws:appearance-devices'
      const session = await createFakeAgenticGraphStorageBrowserSession(workspaceId, { origin: window.location.origin })
      const plan = readXrMotionReferencePlan({ stageId: 'tropical-playground', appearance: XR_SCENE_APPEARANCE_PRESETS[1], subjects: [{ id: 'asset', assetId: 'vehicle-helicopter', color: '#1188aa', position: [2, 4, 1], scale: 0.75 }] })
      const text = `---\n${yaml.dump({ title: 'Authored playground', kgXrMotionReference: serializeXrMotionReferencePlan(plan) })}---\n\n# Device-authored scene\n`
      const firstDevice = await getWorkspaceFs()
      const path = await firstDevice.createFile({ parentPath: '/', name: 'my-playground.md', text, mirrorToHost: false })
      const entry = (await firstDevice.listEntries()).find(item => item.path === path)!
      const upload = await syncWorkspaceEntryToCloudWorkspaceSnapshot({ entry, workspaceId, fetchImpl: session.fetch })
      assert.equal(upload.readBackVerified, true)
      const cloud = await readCanonicalCloudDocumentSnapshot({ workspaceId, fetchImpl: session.fetch })
      assert.equal(cloud.get(upload.canonicalPath), text)
      // A fresh local workspace receives the authenticated snapshot through the existing transfer owner.
      resetWorkspaceFsForTests()
      await __resetAgenticGraphStorageDbForTests()
      const secondDevice = createMemoryWorkspaceFs()
      const result = await importSourceFileCloudSnapshot({ fs: secondDevice, snapshot: cloud, prefix: '/' })
      assert.equal(result.transferred, 1)
      assert.equal(result.conflicts.length, 0)
      const receivedEntry = (await secondDevice.listEntries()).find(item => item.kind === 'file' && item.path.endsWith('/my-playground.md'))!
      const received = await secondDevice.readFileText(receivedEntry.path)
      assert.equal(received, text)
      const frontmatter = yaml.load(extractYamlFrontmatterBlock(received!)!.yamlText) as Record<string, unknown>
      assert.deepEqual(readXrMotionReferencePlan(frontmatter.kgXrMotionReference), plan)
      await secondDevice.writeFileText(receivedEntry.path, '# Local edit to preserve', { mirrorToHost: false })
      const conflict = await importSourceFileCloudSnapshot({ fs: secondDevice, snapshot: cloud, prefix: '/' })
      assert.equal(conflict.conflicts.length, 1)
      assert.equal(await secondDevice.readFileText(receivedEntry.path), '# Local edit to preserve')
      assert.equal(await secondDevice.readFileText(conflict.conflicts[0]!), text)
      resetWorkspaceFsForTests()
    })
  } finally { resetWorkspaceFsForTests(); harness.restore() }
}
