import React from 'react'
import { refreshAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import {
  isAgenticGraphRuntimeIdentityFresh,
  isProgressiveAgentsReadinessVerified,
  useAgenticGraphRuntimeIdentity,
  type AgenticGraphRuntimeIdentity,
} from '@/features/runtime-identity/agentic-graph-runtime-identity'
import {
  useAgenticGraphRuntimeIdentityGate,
  type AgenticGraphRuntimeIdentityGateSnapshot,
} from '@/features/runtime-identity/runtimeIdentityAttestationStore'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { getUiSectionActionClassName } from '@/lib/ui/sectionChipChrome'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'

const revisionText = (value: string): string => value || 'unavailable'

export function CrossDeviceIdentitySettingsRowsContent({
  identity,
  gate,
}: {
  identity: AgenticGraphRuntimeIdentity
  gate: AgenticGraphRuntimeIdentityGateSnapshot
}) {
  const [copyStatus, setCopyStatus] = React.useState('')
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps('default')
  const fresh = isAgenticGraphRuntimeIdentityFresh(identity)
  const gatePassed = gate.status === 'pass'
  const agentProof = identity.agentLiveProviderProof
  const agentProofVerified = agentProof.status === 'verified-bounded-live'
  const progressiveAgents = identity.progressiveAgentsReadiness
  const progressiveAgentsVerified = isProgressiveAgentsReadinessVerified(
    progressiveAgents,
    identity.agenticCanvasOsRevision,
  )
  const serializedDiagnostic = React.useMemo(() => `${JSON.stringify({ identity, gate }, null, 2)}\n`, [gate, identity])
  const copyIdentity = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(serializedDiagnostic)
      setCopyStatus('Copied')
    } catch {
      setCopyStatus('Copy unavailable')
    }
  }, [serializedDiagnostic])
  const revisionValue = (value: string) => <code className="min-w-0 break-all">{revisionText(value)}</code>

  return (
    <>
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode={<span className="font-semibold">Status</span>}
        typeNode={<code>identity/v1</code>}
        valueNode={(
          <span
            className={fresh ? 'text-emerald-400' : 'text-amber-400'}
            data-kg-main-panel-settings-runtime-identity="1"
            data-kg-runtime-identity="agentic-graph-runtime-identity/v1"
            data-kg-runtime-identity-surface="main-panel-settings"
            data-kg-runtime-identity-status={fresh ? 'fresh' : identity.catalogHydration.status}
            data-kg-runtime-agentic-graph-revision={identity.agenticGraphRevision}
            data-kg-runtime-agentic-canvas-os-revision={identity.agenticCanvasOsRevision}
            data-kg-runtime-catalog-revision={identity.catalogRevision}
            data-kg-runtime-catalog-digest={identity.catalogDigest}
          >
            {identity.catalogHydration.status} · attempt {identity.catalogHydration.attempts}/2
          </span>
        )}
      />
      <KeyTypeValueStaticRow {...staticRowProps} keyNode="Device" typeNode="runtime" valueNode={<code>{identity.device}</code>} />
      <KeyTypeValueStaticRow {...staticRowProps} keyNode="Branch" typeNode="git" valueNode={revisionValue(identity.branch)} />
      <KeyTypeValueStaticRow {...staticRowProps} keyNode="agentic-graph SHA" typeNode="git SHA" valueNode={revisionValue(identity.agenticGraphRevision)} />
      <KeyTypeValueStaticRow {...staticRowProps} keyNode="Docs SHA" typeNode="git SHA" valueNode={revisionValue(identity.agenticCanvasOsRevision)} />
      <KeyTypeValueStaticRow {...staticRowProps} keyNode="Catalog SHA" typeNode="git SHA" valueNode={revisionValue(identity.catalogRevision)} />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode="Catalog digest"
        typeNode="SHA-256"
        valueNode={<code className="min-w-0 break-all">{revisionText(identity.catalogDigest)}</code>}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode={<span className="font-semibold">Agent proof</span>}
        typeNode={<code>provider-proof/v1</code>}
        valueNode={(
          <span
            className={agentProofVerified ? 'text-emerald-400' : 'text-amber-400'}
            data-kg-agent-live-provider-proof={agentProof.status}
            data-kg-agent-live-provider-proof-revision={agentProof.proofRevision}
            data-kg-agent-live-provider-proof-calls={agentProof.providerCalls}
          >
            {agentProof.status} · {agentProofVerified
              ? `${agentProof.providerCalls} bounded calls · Worker ${agentProof.defaultWorkerConfigured ? 'configured' : 'unchanged'}`
              : 'source evidence unavailable'}
          </span>
        )}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode="Agent proof SHA"
        typeNode="git SHA"
        valueNode={agentProof.sourceUrl ? (
          <a className="min-w-0 break-all underline" href={agentProof.sourceUrl} target="_blank" rel="noreferrer">
            <code>{revisionText(agentProof.proofRevision)}</code>
          </a>
        ) : revisionValue(agentProof.proofRevision)}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode="Provider usage"
        typeNode={agentProof.model || 'provider'}
        valueNode={(
          <code data-kg-agent-live-provider-proof-usage={`${agentProof.inputTokens}/${agentProof.outputTokens}/${agentProof.cachedInputTokens}`}>
            {agentProof.inputTokens} in · {agentProof.outputTokens} out · {agentProof.cachedInputTokens} cached · USD {agentProof.estimatedCostUsd.toFixed(5)}
          </code>
        )}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode="Agent ownership"
        typeNode={agentProof.continuationContext || 'continuation'}
        valueNode={(
          <span className="min-w-0 break-words">
            delegation: {agentProof.finalAnswerOwners.delegation || 'unavailable'} · handoff: {agentProof.finalAnswerOwners.handoff || 'unavailable'}
          </span>
        )}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode={<span className="font-semibold">Progressive agents</span>}
        typeNode={<code>readiness/v1</code>}
        valueNode={(
          <span
            className={progressiveAgentsVerified ? 'text-emerald-400' : 'text-amber-400'}
            data-kg-progressive-agents-readiness={progressiveAgents.status}
            data-kg-progressive-agents-stages={progressiveAgents.growthStages.join('/')}
          >
            {progressiveAgents.status} · {progressiveAgentsVerified
              ? 'single agent → tools → specialists'
              : 'source evidence unavailable'}
          </span>
        )}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode="Agents contract"
        typeNode={progressiveAgents.contractSchema || 'contract'}
        valueNode={progressiveAgents.sourceUrl ? (
          <a className="min-w-0 break-all underline" href={progressiveAgents.sourceUrl} target="_blank" rel="noreferrer">
            <code>{progressiveAgents.runtimeOwner || progressiveAgents.sourcePath}</code>
          </a>
        ) : <code>{progressiveAgents.sourcePath}</code>}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode="Agents boundary"
        typeNode="provider / Worker / SDK"
        valueNode={(
          <span
            className="min-w-0 break-words"
            data-kg-progressive-agents-provider={progressiveAgents.providerExecutionStatus}
            data-kg-progressive-agents-worker={String(progressiveAgents.defaultWorkerConfigured)}
          >
            provider {progressiveAgents.providerExecutionStatus} · Worker {progressiveAgents.defaultWorkerConfigured === false ? 'unconfigured' : 'unavailable'} · external SDK {progressiveAgents.externalSdkDependency === false ? 'none' : 'unavailable'}
          </span>
        )}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode="Catalog"
        typeNode="/ · # · @"
        valueNode={(
          <code data-kg-runtime-catalog-counts={`${identity.catalogCounts.slash}/${identity.catalogCounts.hash}/${identity.catalogCounts.at}`}>
            / {identity.catalogCounts.slash} · # {identity.catalogCounts.hash} · @ {identity.catalogCounts.at}
          </code>
        )}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode={<span className="font-semibold">Peer gate</span>}
        typeNode={<code>attestation/v1</code>}
        valueNode={(
          <span
            className={gatePassed ? 'text-emerald-400' : 'text-amber-400'}
            data-kg-runtime-identity-peer-gate={gate.status}
            data-kg-runtime-identity-peer-count={`${gate.observedDeviceCount}/${gate.requiredDeviceCount}`}
          >
            {gate.status} · {gate.observedDeviceCount}/{gate.requiredDeviceCount} devices
          </span>
        )}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode="Attestation"
        typeNode="authenticated room"
        valueNode={<code>{gate.transportStatus}</code>}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode="Parity"
        typeNode="exact SHA/counts"
        valueNode={<span className="min-w-0 break-words">{gate.message}</span>}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode="Proof"
        typeNode="SHA-256"
        valueNode={(
          <code className="min-w-0 break-all" data-kg-runtime-identity-verification-digest={gate.verificationDigest || ''}>
            {gate.verificationDigest || 'unavailable'}
          </code>
        )}
      />
      <KeyTypeValueStaticRow
        {...staticRowProps}
        keyNode="Actions"
        typeNode="control"
        valueNode={(
          <section className="flex min-w-0 flex-wrap items-center gap-1">
            <button
              type="button"
              className={getUiSectionActionClassName('primary')}
              disabled={identity.catalogHydration.status === 'loading'}
              onClick={() => void refreshAgenticOsRemoteGrammarCatalog()}
            >
              Refresh identity catalog
            </button>
            <button type="button" className={getUiSectionActionClassName('primary')} onClick={() => void copyIdentity()}>
              Copy diagnostic JSON
            </button>
            {copyStatus ? <output className={UI_THEME_TOKENS.text.tertiary}>{copyStatus}</output> : null}
          </section>
        )}
      />
    </>
  )
}

export function CrossDeviceIdentitySettingsRows() {
  const identity = useAgenticGraphRuntimeIdentity()
  const gate = useAgenticGraphRuntimeIdentityGate()
  return <CrossDeviceIdentitySettingsRowsContent identity={identity} gate={gate} />
}
