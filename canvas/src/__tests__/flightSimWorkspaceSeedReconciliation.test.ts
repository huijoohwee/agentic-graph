import assert from 'node:assert/strict'
import test from 'node:test'

import {
  readCanonicalWorkspaceSeedBundleEntries,
} from '@/features/workspace-fs/workspaceCanonicalSeedBundle'
import {
  overlayCanonicalLocalWorkspaceSeedEntries,
  type WorkspaceDocsMirrorAuthority,
} from '@/features/workspace-fs/workspaceSeedInventoryAuthority'

const FLIGHT_SEED_REL_PATH =
  'workspace-seeds/knowgrph-game-flight-sim-demo.md'

type MirrorEntry = {
  relPath: string
  text: string
  updatedAtMs: number
  authority: WorkspaceDocsMirrorAuthority
}

test('Flight bundled Geo+XR source replaces a stale draft workspace seed', async () => {
  const bundled = await readCanonicalWorkspaceSeedBundleEntries()
  const bundledEntries: MirrorEntry[] = bundled.map(entry => ({
    ...entry,
    authority: 'knowgrph-workspace-seeds-bundled',
  }))
  const authoredFlight = bundledEntries.find(
    entry => entry.relPath === FLIGHT_SEED_REL_PATH,
  )
  assert.ok(authoredFlight)
  assert.match(authoredFlight.text, /^status:\s*"runtime-ready"\s*$/m)
  assert.match(authoredFlight.text, /^runtime_status:\s*"runtime-ready"\s*$/m)
  assert.match(authoredFlight.text, /^kgCanvasSurfaceMode:\s*"geo-xr"\s*$/m)
  assert.match(authoredFlight.text, /^kgCanvasRenderMode:\s*"3d"\s*$/m)
  assert.match(authoredFlight.text, /^kgCanvas3dMode:\s*"xr"\s*$/m)
  assert.match(authoredFlight.text, /^\s*id:\s*"flight-sim"\s*$/m)
  assert.match(authoredFlight.text, /^\s*render_policy:\s*"shared-xr-stage while composed in Geo\+XR; standalone Geo retains its selected provider"\s*$/m)
  assert.match(authoredFlight.text, /^\s*shared_environment_presentations:\s*\["2d-classic", "2d-modern", "3d-classic", "3d-modern"\]\s*$/m)
  assert.match(authoredFlight.text, /^\s*screen_space_basemap:\s*"suppressed"\s*$/m)
  assert.match(authoredFlight.text, /^\s*maplibre_runtime_started:\s*false\s*$/m)
  assert.doesNotMatch(authoredFlight.text, /\bplanned_run_ready_demo:/)

  const staleFlightText = [
    '---',
    'status: "draft"',
    'runtime_status: "draft"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas3dMode: "xr"',
    'planned_run_ready_demo:',
    '  id: "flight-sim"',
    '---',
  ].join('\n')
  const publishedEntries: MirrorEntry[] = [
    {
      relPath: FLIGHT_SEED_REL_PATH,
      text: staleFlightText,
      updatedAtMs: authoredFlight.updatedAtMs + 1,
      authority: 'huijoohwee-demo-docs-github',
    },
    {
      relPath: 'reference/private-note.md',
      text: '# Keep me',
      updatedAtMs: 1,
      authority: 'huijoohwee-demo-docs-github',
    },
  ]

  const reconciled = overlayCanonicalLocalWorkspaceSeedEntries(
    publishedEntries,
    bundledEntries,
  )
  const selectedFlight = reconciled.find(
    entry => entry.relPath === FLIGHT_SEED_REL_PATH,
  )
  assert.equal(selectedFlight?.text, authoredFlight.text)
  assert.equal(
    selectedFlight?.authority,
    'knowgrph-workspace-seeds-bundled',
  )
  assert.equal(
    reconciled.filter(entry => entry.relPath === FLIGHT_SEED_REL_PATH).length,
    1,
  )
  assert.equal(
    reconciled.find(entry => entry.relPath === 'reference/private-note.md')?.text,
    '# Keep me',
  )
})
