import {
  buildLarkAppRemoteMutationPreviewResultExample,
  buildLarkAppRemoteMutationRequest,
  buildLarkAppRemoteMutationRequestExample,
  createLarkAppRemoteMutationAcceptedResult,
  createLarkAppRemoteMutationPreviewResult,
} from '@/features/canvas/larkAppRemoteMutationBridge'

export function testLarkAppRemoteMutationBridgeBuildsTypedRequest() {
  const request = buildLarkAppRemoteMutationRequest({
    action: 'import-source-document',
    idempotencyKey: 'phase3-001',
    authContext: {
      actorId: 'open_id:phase3',
      actorType: 'user',
      sessionMode: 'backend-signed',
      auditReason: 'Import approved source document after Canvas review',
    },
    artifact: {
      kind: 'source-document',
      sourceDocumentId: 'kg-doc-phase3',
      sourceFileId: 'kg-source-phase3',
      targetResource: 'lark:base:table:review-imports',
      checksum: 'sha256:phase3',
    },
    importRequest: {
      fileId: 'kg-source-phase3',
      snapshot: {
        selection: {
          baseToken: 'bascn_phase3',
          tableId: 'tbl_phase3',
          viewId: 'vew_phase3',
          baseTitle: 'Phase 3 Base',
          tableName: 'Imports',
          viewName: 'Default',
        },
      },
    },
    dryRun: true,
    conflictPolicy: 'reject-on-conflict',
    surface: 'webpage',
  })

  if (request.action !== 'import-source-document' || request.authContext.sessionMode !== 'backend-signed' || !request.importRequest?.snapshot) {
    throw new Error(`expected normalized Phase 3 request, got ${JSON.stringify(request)}`)
  }

  const result = createLarkAppRemoteMutationAcceptedResult(request)
  if (!result.ok || result.status !== 'accepted' || result.auditRequired !== true || result.dryRun !== true) {
    throw new Error(`expected accepted result contract, got ${JSON.stringify(result)}`)
  }
}

export function testLarkAppRemoteMutationBridgeBuildsDryRunPublishRequest() {
  const request = buildLarkAppRemoteMutationRequest({
    action: 'publish-approved-artifact',
    idempotencyKey: 'phase3-publish-preview-001',
    authContext: {
      actorId: 'open_id:phase3',
      actorType: 'user',
      sessionMode: 'backend-signed',
      auditReason: 'Preview approved artifact publish before remote endpoint rollout',
    },
    artifact: {
      kind: 'approved-artifact',
      sourceDocumentId: 'kg-doc-phase3',
      sourceFileId: 'kg-source-phase3',
      targetResource: 'lark:base:table:approved-artifacts',
      checksum: 'sha256:phase3-publish',
    },
    dryRun: true,
    conflictPolicy: 'reject-on-conflict',
    surface: 'webpage',
  })

  if (request.action !== 'publish-approved-artifact' || request.artifact.kind !== 'approved-artifact' || request.dryRun !== true) {
    throw new Error(`expected normalized dry-run publish request, got ${JSON.stringify(request)}`)
  }

  const result = createLarkAppRemoteMutationPreviewResult(request)
  if (
    !result.ok ||
    result.status !== 'previewed' ||
    result.action !== 'publish-approved-artifact' ||
    result.dryRun !== true ||
    result.conflictPolicy !== 'reject-on-conflict' ||
    result.sessionMode !== 'backend-signed' ||
    result.surface !== 'webpage' ||
    result.auditReason !== 'Preview approved artifact publish before remote endpoint rollout' ||
    result.publishReadiness !== 'blocked' ||
    result.blockingReason !== 'remote-endpoint-deferred' ||
    result.previewSeverity !== 'warning' ||
    result.remediationHint !== 'wait-for-host-managed-remote-endpoint' ||
    result.retryDisposition !== 'defer-until-host-managed-remote-endpoint' ||
    result.requiredHostCapability !== 'host-managed-remote-publish-endpoint' ||
    result.requiredHostCapabilityStatus !== 'unavailable' ||
    result.requiredHostCapabilityVerificationMethod !== 'host-managed-capability-check' ||
    result.requiredHostCapabilityVerificationTarget !== 'remote-publish-endpoint-readiness' ||
    result.requiredHostCapabilityVerificationEvidence !==
      'host-reported-endpoint-availability' ||
    result.requiredHostCapabilityOwner !== 'host-runtime' ||
    !result.previewSummary.includes('Previewed publish-approved-artifact for lark:base:table:approved-artifacts') ||
    result.hostHandoffChecklist.length !== 3 ||
    result.hostHandoffChecklist[0] !== 'Verify host-managed remote publish endpoint availability.' ||
    result.hostHandoffManifest.kind !== 'lark-app-publish-preview' ||
    result.hostHandoffManifest.version !== '1' ||
    result.hostHandoffManifest.idempotencyKey !== 'phase3-publish-preview-001' ||
    result.hostHandoffManifest.targetResource !== 'lark:base:table:approved-artifacts' ||
    result.hostHandoffManifest.severity !== 'warning' ||
    result.hostHandoffManifest.remediationHint !== 'wait-for-host-managed-remote-endpoint' ||
    result.hostHandoffManifest.retryDisposition !== 'defer-until-host-managed-remote-endpoint' ||
    result.hostHandoffManifest.requiredHostCapability !== 'host-managed-remote-publish-endpoint' ||
    result.hostHandoffManifest.requiredHostCapabilityStatus !== 'unavailable' ||
    result.hostHandoffManifest.requiredHostCapabilityVerificationMethod !== 'host-managed-capability-check' ||
    result.hostHandoffManifest.requiredHostCapabilityVerificationTarget !== 'remote-publish-endpoint-readiness' ||
    result.hostHandoffManifest.requiredHostCapabilityVerificationEvidence !==
      'host-reported-endpoint-availability' ||
    result.hostHandoffManifest.requiredHostCapabilityOwner !== 'host-runtime' ||
    result.hostHandoffManifest.summary !== result.previewSummary ||
    result.hostHandoffManifest.checklist !== result.hostHandoffChecklist ||
    result.hostHandoffManifest.nextStep !== 'await-host-managed-remote-publish' ||
    result.applyMode !== 'preview-only' ||
    result.remoteEndpoint !== 'deferred' ||
    result.nextStep !== 'await-host-managed-remote-publish'
  ) {
    throw new Error(`expected previewed dry-run publish result, got ${JSON.stringify(result)}`)
  }
}

export function testLarkAppRemoteMutationBridgeRejectsSecretMaterial() {
  let errorMessage = ''
  try {
    buildLarkAppRemoteMutationRequest({
      action: 'import-source-document',
      idempotencyKey: 'phase3-secret',
      authContext: {
        actorId: 'open_id:phase3',
        actorType: 'user',
        sessionMode: 'backend-signed',
        auditReason: 'Import approved source document after Canvas review',
        tenant_access_token: 'secret',
      } as unknown as never,
      artifact: {
        kind: 'source-document',
        sourceDocumentId: 'kg-doc-phase3',
        sourceFileId: 'kg-source-phase3',
        targetResource: 'lark:base:table:review-imports',
        checksum: 'sha256:phase3',
      },
      importRequest: {
        fileId: 'kg-source-phase3',
        snapshot: {
          selection: {
            baseToken: 'bascn_phase3',
            tableId: 'tbl_phase3',
            viewId: 'vew_phase3',
          },
        },
      },
      dryRun: true,
      conflictPolicy: 'reject-on-conflict',
      surface: 'webpage',
    } as unknown as never)
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error)
  }
  if (errorMessage !== 'Lark App remote mutation contract must not contain secret material.') {
    throw new Error(`expected secret material rejection, got ${JSON.stringify(errorMessage)}`)
  }
}

export function testLarkAppRemoteMutationBridgeRejectsEndpointOverride() {
  let errorMessage = ''
  try {
    buildLarkAppRemoteMutationRequest({
      action: 'import-source-document',
      idempotencyKey: 'phase3-endpoint',
      authContext: {
        actorId: 'open_id:phase3',
        actorType: 'user',
        sessionMode: 'backend-signed',
        auditReason: 'Import approved source document after Canvas review',
      },
      artifact: {
        kind: 'source-document',
        sourceDocumentId: 'kg-doc-phase3',
        sourceFileId: 'kg-source-phase3',
        targetResource: 'lark:base:table:review-imports',
        checksum: 'sha256:phase3',
      },
      importRequest: {
        fileId: 'kg-source-phase3',
        snapshot: {
          selection: {
            baseToken: 'bascn_phase3',
            tableId: 'tbl_phase3',
            viewId: 'vew_phase3',
          },
        },
      },
      dryRun: true,
      conflictPolicy: 'reject-on-conflict',
      surface: 'webpage',
      endpointUrl: 'https://example.com/write',
    } as unknown as never)
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error)
  }
  if (errorMessage !== 'Lark App remote mutation contract must not override endpoint ownership.') {
    throw new Error(`expected endpoint override rejection, got ${JSON.stringify(errorMessage)}`)
  }
}

export function testLarkAppRemoteMutationBridgeExampleStaysContractOnly() {
  const example = buildLarkAppRemoteMutationRequestExample()
  const previewExample = buildLarkAppRemoteMutationPreviewResultExample()
  ;[
    '"import-source-document"',
    '"importRequest"',
    '"idempotencyKey"',
    '"backend-signed"',
    '"reject-on-conflict"',
    '"webpage"',
  ].forEach(token => {
    if (!example.includes(token)) {
      throw new Error(`expected remote mutation example to include ${JSON.stringify(token)}, got ${JSON.stringify(example)}`)
    }
  })
  ;[
    'tenant_access_token',
    'app_secret',
    'https://airvio.co/agenticgraph/mcp',
  ].forEach(token => {
    if (example.includes(token)) {
      throw new Error(`expected remote mutation example to avoid ${JSON.stringify(token)}, got ${JSON.stringify(example)}`)
    }
  })
  ;[
    '"previewed"',
    '"preview-only"',
    '"deferred"',
    '"publish-approved-artifact"',
    '"targetResource"',
    '"reject-on-conflict"',
    '"backend-signed"',
    '"blocked"',
    '"remote-endpoint-deferred"',
    '"warning"',
    '"wait-for-host-managed-remote-endpoint"',
    '"defer-until-host-managed-remote-endpoint"',
    '"host-managed-remote-publish-endpoint"',
    '"unavailable"',
    '"host-managed-capability-check"',
    '"remote-publish-endpoint-readiness"',
    '"host-reported-endpoint-availability"',
    '"host-runtime"',
    '"lark-app-publish-preview"',
    '"version": "1"',
    '"summary"',
    '"checklist"',
    '"await-host-managed-remote-publish"',
  ].forEach(token => {
    if (!previewExample.includes(token)) {
      throw new Error(`expected remote mutation preview example to include ${JSON.stringify(token)}, got ${JSON.stringify(previewExample)}`)
    }
  })
}
