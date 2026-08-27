import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testRuntimeIdentityAttestationKeepsCanonicalOwnership(): void {
  const runtimeRoot = readFileSync(resolve(process.cwd(), 'src/features/runtime-identity/AgenticGraphRuntimeIdentityRuntime.tsx'), 'utf8')
  const reporter = readFileSync(resolve(process.cwd(), 'src/features/runtime-identity/useAgenticGraphRuntimeIdentityAttestationRuntime.ts'), 'utf8')
  const settings = readFileSync(resolve(process.cwd(), 'src/features/panels/views/CrossDeviceIdentitySettingsRows.tsx'), 'utf8')
  const room = readFileSync(resolve(process.cwd(), '..', 'cloudflare/workers/agenticgraph-storage/canvasSyncRoom.ts'), 'utf8')

  if (
    !runtimeRoot.includes('useAgenticGraphRuntimeIdentity()')
    || !runtimeRoot.includes('useAgenticGraphRuntimeIdentityAttestationRuntime(identity)')
    || reporter.includes('buildAgenticGraphRuntimeIdentity')
  ) {
    throw new Error('Expected the app-root reporter to consume, never rebuild, canonical runtime identity')
  }
  if (
    settings.includes('readAgenticGraphStorageCanvasRoomConfig')
    || settings.includes('buildAgenticGraphStorageCanvasRoomWebSocketUrl')
    || settings.includes('createAgenticGraphRuntimeIdentityAttestation')
  ) {
    throw new Error('Expected MainPanel Settings to remain a projection without attestation transport ownership')
  }
  const requiredRoomContracts = [
    'AGENTICGRAPH_RUNTIME_IDENTITY_ROOM_ID',
    'runtime.identity.challenge.request',
    'runtime.identity.challenge',
    'runtime.identity.attestation',
    'runtime.identity.attested',
    'authenticatedPeerId',
    'authenticatedSessionId',
    'authenticatedDevicePrincipalId',
  ]
  const missing = requiredRoomContracts.filter(contract => !room.includes(contract))
  if (missing.length) {
    throw new Error(`Expected authenticated challenge-bound identity room contracts, missing ${missing.join(', ')}`)
  }
}
