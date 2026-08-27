import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import fc from 'fast-check'
import { flightSimPropertyParameters } from './helpers/flightSimPropertyHarness'
import {
  diagnoseWorkspaceRunReadyDemoActivation,
  FLIGHT_SIM_DEMO_REPO_REL_PATH,
  FLIGHT_SIM_RUN_READY_DEMO_ID,
  XR_PHYSICS_DEMO_REPO_REL_PATH,
} from '@/features/workspace-fs/workspaceRunReadyDemos'

const flightSeedSource = readFileSync(
  resolve(process.cwd(), '..', FLIGHT_SIM_DEMO_REPO_REL_PATH),
  'utf8',
)

// Feature: agenticgraph-game-flight-sim, Property 40 - Source-authored activation identity with fail-closed conflicts
test('Feature: agenticgraph-game-flight-sim, Property 40 - Source-authored activation identity with fail-closed conflicts', () => {
  fc.assert(
    fc.property(
      fc.stringMatching(/^[a-z][a-z0-9-]{0,23}$/)
        .filter(value => !['flight-sim', 'city-sim', 'xr-physics', 'care-agent', 'risk-copilot'].includes(value)),
      fc.stringMatching(/^[a-z][a-z0-9-]{0,23}\.md$/),
      (unregisteredId, importedBasename) => {
        const importedPath = `/imports/${importedBasename}`
        const admitted = diagnoseWorkspaceRunReadyDemoActivation(
          importedPath,
          flightSeedSource,
        )
        assert.equal(admitted.ok, true)
        if (admitted.ok) {
          assert.equal(admitted.id, FLIGHT_SIM_RUN_READY_DEMO_ID)
          assert.equal(admitted.pathId, '')
          assert.equal(admitted.sourceId, FLIGHT_SIM_RUN_READY_DEMO_ID)
        }

        const conflict = diagnoseWorkspaceRunReadyDemoActivation(
          XR_PHYSICS_DEMO_REPO_REL_PATH,
          flightSeedSource,
        )
        assert.equal(conflict.ok, false)
        if (conflict.ok === false) {
          assert.equal(conflict.errorCode, 'RUN_READY_IDENTITY_CONFLICT')
          assert.match(conflict.message, /xr-physics/)
          assert.match(conflict.message, /flight-sim/)
        }

        const unregistered = diagnoseWorkspaceRunReadyDemoActivation(
          importedPath,
          flightSeedSource.replace(
            'id: "flight-sim"',
            `id: "${unregisteredId}"`,
          ),
        )
        assert.equal(unregistered.ok, false)
        if (unregistered.ok === false) {
          assert.equal(
            unregistered.errorCode,
            'RUN_READY_IDENTITY_UNREGISTERED',
          )
          assert.match(unregistered.message, new RegExp(unregisteredId))
        }
      },
    ),
    flightSimPropertyParameters(40),
  )
})
