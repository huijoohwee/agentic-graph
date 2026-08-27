import {
  createLarkAppRemoteMutationBridgeCommand,
  installLarkAppRemoteMutationBridgeCommand,
} from '@/features/canvas/larkAppRemoteMutationBridgeRuntime'
import type { LarkAppRemoteMutationRequest } from '@/features/canvas/larkAppRemoteMutationBridge'
import type { FeishuBaseSourceImportRequest, FeishuBaseSourceImportResult } from '@/features/source-files/feishuBaseSourceImportContract'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { CanvasQueryBootstrapRuntime } from '@/features/canvas/CanvasQueryBootstrapRuntime'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForTasks } from '@/tests/lib/reactRootHarness'

const IMPORT_REQUEST: FeishuBaseSourceImportRequest = {
  fileId: 'kg-source-runtime',
  snapshot: {
    selection: {
      baseToken: 'bascn_runtime',
      tableId: 'tbl_runtime',
      viewId: 'vew_runtime',
      baseTitle: 'Runtime Base',
      tableName: 'Imports',
      viewName: 'Default',
    },
  },
}

const IMPORT_MUTATION_REQUEST: LarkAppRemoteMutationRequest = {
  action: 'import-source-document',
  idempotencyKey: 'phase3-runtime-001',
  authContext: {
    actorId: 'open_id:runtime',
    actorType: 'user',
    sessionMode: 'backend-signed',
    auditReason: 'Import reviewed source document from Lark runtime bridge',
  },
  artifact: {
    kind: 'source-document',
    sourceDocumentId: 'kg-doc-runtime',
    sourceFileId: 'kg-source-runtime',
    targetResource: 'lark:base:table:review-imports',
    checksum: 'sha256:runtime',
  },
  importRequest: IMPORT_REQUEST,
  dryRun: false,
  conflictPolicy: 'reject-on-conflict',
  surface: 'webpage',
}

const withBridgeWindow = async (
  assertions: (activeWindow: Window & {
    agenticgraphFeishuBaseSourceImportCommand?: {
      importSnapshot: (args: FeishuBaseSourceImportRequest) => Promise<FeishuBaseSourceImportResult>
    }
  }) => Promise<void> | void,
): Promise<void> => {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  try {
    await assertions(window as Window & {
      agenticgraphFeishuBaseSourceImportCommand?: {
        importSnapshot: (args: FeishuBaseSourceImportRequest) => Promise<FeishuBaseSourceImportResult>
      }
    })
  } finally {
    restoreDom()
    restoreWindow()
  }
}

export async function testLarkAppRemoteMutationBridgeRuntimeInstallsStableWindowCommand() {
  await withBridgeWindow(async activeWindow => {
    const cleanup = installLarkAppRemoteMutationBridgeCommand()
    try {
      if (!activeWindow.agenticgraphLarkAppRemoteMutationBridge?.execute) {
        throw new Error('expected live Lark remote mutation bridge command on window')
      }
      const dataset = document.documentElement.dataset.kgLarkAppRemoteMutationBridge
      if (dataset !== 'ready') {
        throw new Error(`expected runtime bridge dataset to be ready, got ${JSON.stringify(dataset)}`)
      }
    } finally {
      cleanup()
    }
  })
}

export async function testLarkAppRemoteMutationBridgeRuntimeImportsSourceDocumentThroughExistingSeam() {
  await withBridgeWindow(async activeWindow => {
    let capturedRequest: FeishuBaseSourceImportRequest | null = null
    activeWindow.agenticgraphFeishuBaseSourceImportCommand = {
      importSnapshot: async (args: FeishuBaseSourceImportRequest) => {
        capturedRequest = args
        return {
          ok: true,
          fileId: 'kg-imported-runtime',
          name: 'Runtime Imported Source',
          warnings: ['warn'],
        }
      },
    }

    const command = createLarkAppRemoteMutationBridgeCommand()
    const result = await command.execute(IMPORT_MUTATION_REQUEST)
    if (!capturedRequest || capturedRequest.snapshot.selection.baseToken !== IMPORT_REQUEST.snapshot.selection.baseToken) {
      throw new Error(`expected runtime bridge to delegate to existing import seam, got ${JSON.stringify(capturedRequest)}`)
    }
    if (!result.ok || result.status !== 'applied' || result.warningCount !== 1 || result.fileId !== 'kg-imported-runtime') {
      throw new Error(`expected applied runtime bridge result, got ${JSON.stringify(result)}`)
    }
  })
}

export async function testLarkAppRemoteMutationBridgeRuntimeRejectsLivePublishUntilEndpointExists() {
  await withBridgeWindow(async () => {
    const command = createLarkAppRemoteMutationBridgeCommand()
    const dryRunResult = await command.execute({
      action: 'publish-approved-artifact',
      idempotencyKey: 'phase3-runtime-publish-preview',
      authContext: {
        actorId: 'open_id:runtime',
        actorType: 'user',
        sessionMode: 'backend-signed',
        auditReason: 'Preview approved artifact publish from runtime bridge',
      },
      artifact: {
        kind: 'approved-artifact',
        sourceDocumentId: 'kg-doc-runtime',
        sourceFileId: 'kg-source-runtime',
        targetResource: 'lark:base:table:approved-artifacts',
        checksum: 'sha256:runtime',
      },
      dryRun: true,
      conflictPolicy: 'reject-on-conflict',
      surface: 'webpage',
    })
    if (
      !dryRunResult.ok ||
      dryRunResult.status !== 'previewed' ||
      dryRunResult.action !== 'publish-approved-artifact' ||
      dryRunResult.dryRun !== true ||
      dryRunResult.conflictPolicy !== 'reject-on-conflict' ||
      dryRunResult.sessionMode !== 'backend-signed' ||
      dryRunResult.surface !== 'webpage' ||
      dryRunResult.auditReason !== 'Preview approved artifact publish from runtime bridge' ||
      dryRunResult.publishReadiness !== 'blocked' ||
      dryRunResult.blockingReason !== 'remote-endpoint-deferred' ||
      dryRunResult.previewSeverity !== 'warning' ||
      dryRunResult.remediationHint !== 'wait-for-host-managed-remote-endpoint' ||
      dryRunResult.retryDisposition !== 'defer-until-host-managed-remote-endpoint' ||
      dryRunResult.requiredHostCapability !== 'host-managed-remote-publish-endpoint' ||
      dryRunResult.requiredHostCapabilityStatus !== 'unavailable' ||
      dryRunResult.requiredHostCapabilityVerificationMethod !== 'host-managed-capability-check' ||
      dryRunResult.requiredHostCapabilityVerificationTarget !== 'remote-publish-endpoint-readiness' ||
      dryRunResult.requiredHostCapabilityVerificationEvidence !==
        'host-reported-endpoint-availability' ||
      dryRunResult.requiredHostCapabilityOwner !== 'host-runtime' ||
      !dryRunResult.previewSummary.includes('Previewed publish-approved-artifact for lark:base:table:approved-artifacts') ||
      dryRunResult.hostHandoffChecklist.length !== 3 ||
      dryRunResult.hostHandoffChecklist[1] !== 'Reuse the preview idempotency key for the remote publish attempt.' ||
      dryRunResult.hostHandoffManifest.kind !== 'lark-app-publish-preview' ||
      dryRunResult.hostHandoffManifest.version !== '1' ||
      dryRunResult.hostHandoffManifest.idempotencyKey !== 'phase3-runtime-publish-preview' ||
      dryRunResult.hostHandoffManifest.targetResource !== 'lark:base:table:approved-artifacts' ||
      dryRunResult.hostHandoffManifest.severity !== 'warning' ||
      dryRunResult.hostHandoffManifest.remediationHint !== 'wait-for-host-managed-remote-endpoint' ||
      dryRunResult.hostHandoffManifest.retryDisposition !== 'defer-until-host-managed-remote-endpoint' ||
      dryRunResult.hostHandoffManifest.requiredHostCapability !== 'host-managed-remote-publish-endpoint' ||
      dryRunResult.hostHandoffManifest.requiredHostCapabilityStatus !== 'unavailable' ||
      dryRunResult.hostHandoffManifest.requiredHostCapabilityVerificationMethod !== 'host-managed-capability-check' ||
      dryRunResult.hostHandoffManifest.requiredHostCapabilityVerificationTarget !== 'remote-publish-endpoint-readiness' ||
      dryRunResult.hostHandoffManifest.requiredHostCapabilityVerificationEvidence !==
        'host-reported-endpoint-availability' ||
      dryRunResult.hostHandoffManifest.requiredHostCapabilityOwner !== 'host-runtime' ||
      dryRunResult.hostHandoffManifest.summary !== dryRunResult.previewSummary ||
      dryRunResult.hostHandoffManifest.checklist !== dryRunResult.hostHandoffChecklist ||
      dryRunResult.hostHandoffManifest.nextStep !== 'await-host-managed-remote-publish' ||
      dryRunResult.applyMode !== 'preview-only' ||
      dryRunResult.remoteEndpoint !== 'deferred' ||
      dryRunResult.targetResource !== 'lark:base:table:approved-artifacts' ||
      dryRunResult.nextStep !== 'await-host-managed-remote-publish'
    ) {
      throw new Error(`expected runtime publish dry-run to return preview metadata, got ${JSON.stringify(dryRunResult)}`)
    }

    const result = await command.execute({
      action: 'publish-approved-artifact',
      idempotencyKey: 'phase3-runtime-publish',
      authContext: {
        actorId: 'open_id:runtime',
        actorType: 'user',
        sessionMode: 'backend-signed',
        auditReason: 'Publish reviewed artifact from runtime bridge',
      },
      artifact: {
        kind: 'approved-artifact',
        sourceDocumentId: 'kg-doc-runtime',
        sourceFileId: 'kg-source-runtime',
        targetResource: 'lark:base:table:approved-artifacts',
        checksum: 'sha256:runtime',
      },
      dryRun: false,
      conflictPolicy: 'reject-on-conflict',
      surface: 'webpage',
    })
    if (result.ok) {
      throw new Error(`expected runtime publish action to stay deferred, got ${JSON.stringify(result)}`)
    }
    const errorResult = result as { ok: false; error: string; retryable: boolean }
    if (!errorResult.error.includes('Use dry-run preview locally')) {
      throw new Error(`expected runtime publish action to stay deferred, got ${JSON.stringify(result)}`)
    }
  })
}

export async function testCanvasQueryBootstrapRuntimeInstallsLarkRemoteMutationBridge() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    root = createRoot(container)
    await mountReactRoot(root, React.createElement(CanvasQueryBootstrapRuntime, { search: '' }), {
      window: dom.window,
      frames: 2,
      tasks: 2,
    })
    await waitForTasks(2)
    if (!(dom.window as Window).agenticgraphLarkAppRemoteMutationBridge?.execute) {
      throw new Error('expected CanvasQueryBootstrapRuntime to install the Lark remote mutation bridge command')
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window, tasks: 1 })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}
