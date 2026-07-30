import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(process.cwd(), '..')

test('Flight Source Files cloud status remains offline when storage sync is unavailable', () => {
  const indicator = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/markdown-workspace/SourceFileCloudSyncIndicator.tsx',
    ),
    'utf8',
  )

  assert.match(indicator, /readKnowgrphStorageRuntimeSyncEnabled/)
  assert.match(indicator, /subscribeWorkspaceStoreSyncSettingsChanged/)
  assert.match(
    indicator,
    /if \(!cloudSyncEnabled \|\| !pathSignature\) \{[\s\S]*?setSnapshotStatus\('unavailable'\)[\s\S]*?return/,
  )
  assert.match(
    indicator,
    /typeof window === 'undefined'[\s\S]*?\|\| !cloudSyncEnabled[\s\S]*?\|\| !pathSignature/,
  )
})
