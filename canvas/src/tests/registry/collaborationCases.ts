import type { TestCaseTuple } from '../runner/testRunnerTypes'

export const COLLABORATION_TEST_CASES: TestCaseTuple[] = [
  [
    'collaboration.extension.protocol.failClosedUnsafeEnvelopes',
    '@/__tests__/p2pCollaborationExtensionRuntime.test',
    'testP2PCollaborationExtensionProtocolFailsClosedOnUnsafeEnvelopes',
  ],
  [
    'collaboration.extension.publish.registeredBoundedPeerOpaque',
    '@/__tests__/p2pCollaborationExtensionRuntime.test',
    'testP2PCollaborationExtensionPublishIsRegisteredBoundedAndPeerOpaque',
  ],
  [
    'collaboration.extension.receive.rateLimitSurvivesSourceChurn',
    '@/__tests__/p2pCollaborationExtensionRuntime.test',
    'testP2PCollaborationExtensionInboundRateSurvivesSourceChurn',
  ],
  [
    'collaboration.extension.publish.rateLimitSurvivesRegistrationChurn',
    '@/__tests__/p2pCollaborationExtensionRuntime.test',
    'testP2PCollaborationExtensionOutboundRateSurvivesRegistrationChurn',
  ],
  [
    'collaboration.extension.runtime.validatedRelayAndCleanup',
    '@/__tests__/p2pCollaborationExtensionRuntime.test',
    'testP2PCollaborationExtensionRelaysOnlyRegisteredPayloadsAndCleansUpSources',
  ],
]
