import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { CrossDeviceIdentitySettingsRowsContent } from '@/features/panels/views/CrossDeviceIdentitySettingsRows'
import { CROSS_DEVICE_IDENTITY_SETTINGS_ROW_COUNT } from '@/features/panels/views/crossDeviceIdentitySettingsContract'
import type { AgenticGraphRuntimeIdentity } from '@/features/runtime-identity/agenticgraphRuntimeIdentity'
import type { AgenticGraphRuntimeIdentityGateSnapshot } from '@/features/runtime-identity/runtimeIdentityAttestationStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

export async function testMainPanelSettingsOwnsGlobalCrossDeviceIdentityGate() {
  if (CROSS_DEVICE_IDENTITY_SETTINGS_ROW_COUNT !== 20) {
    throw new Error('Expected the Settings area count to include all runtime identity and agent-proof KTV rows')
  }
  const settingsViewSource = readFileSync(resolve(process.cwd(), 'src/features/panels/views/SettingsView.tsx'), 'utf8')
  const skillsCommandsSource = readFileSync(resolve(process.cwd(), 'src/features/panels/views/SkillsCommandsView.tsx'), 'utf8')
  const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
  const identityRuntimeSource = readFileSync(resolve(process.cwd(), 'src/features/runtime-identity/AgenticGraphRuntimeIdentityRuntime.tsx'), 'utf8')
  const settingsRowsSource = readFileSync(resolve(process.cwd(), 'src/features/panels/views/CrossDeviceIdentitySettingsRows.tsx'), 'utf8')
  if (
    !settingsViewSource.includes("area: CROSS_DEVICE_IDENTITY_SETTINGS_AREA")
    || !settingsViewSource.includes("return <CrossDeviceIdentitySettingsRows />")
    || settingsViewSource.includes('<AgenticGraphRuntimeIdentityGate />')
  ) {
    throw new Error('Expected Cross-device Identity Gate to be a normal MainPanel Settings section')
  }
  if (
    !appSource.includes('<AgenticGraphRuntimeIdentityRuntime />')
    || !identityRuntimeSource.includes('useAgenticGraphRuntimeIdentityAttestationRuntime(identity)')
    || !settingsRowsSource.includes('useAgenticGraphRuntimeIdentity()')
    || settingsRowsSource.includes('useAgenticOsRemoteGrammarCatalog')
    || settingsRowsSource.includes('readAgenticGraphStorageCanvasRoomConfig')
    || settingsRowsSource.includes('createAgenticGraphRuntimeIdentityAttestation')
    || !settingsRowsSource.includes('<KeyTypeValueStaticRow')
  ) {
    throw new Error('Expected app-global canonical identity ownership with a KTV-only Settings projection')
  }
  if (skillsCommandsSource.includes('AgenticGraphRuntimeIdentityGate') || skillsCommandsSource.includes('RuntimeIdentityPanel')) {
    throw new Error('Expected Skills & Commands to contain no runtime identity surface')
  }

  const identity: AgenticGraphRuntimeIdentity = {
    schema: 'agenticgraph-runtime-identity/v1',
    device: 'test-device',
    branch: 'main',
    agenticgraphRevision: 'b'.repeat(40),
    agenticCanvasOsRevision: 'a'.repeat(40),
    catalogRevision: 'a'.repeat(40),
    catalogDigest: 'c'.repeat(64),
    catalogHydration: { status: 'fresh', attempts: 1 },
    catalogCounts: { slash: 78, hash: 94, at: 95 },
    agentLiveProviderProof: {
      schema: 'agent-live-provider-proof-summary/v1',
      status: 'verified-bounded-live',
      evidenceSchema: 'agent-live-provider-proof-contract/v1',
      sourceStatus: 'runtime-ready-dev',
      sourceRevision: 'a'.repeat(40),
      proofRevision: 'd'.repeat(40),
      sourcePath: 'docs/LIVE-AGENT-PROVIDER-PROOF.md',
      sourceUrl: `https://github.com/huijoohwee/agentic-canvas-os/blob/${'d'.repeat(40)}/docs/LIVE-AGENT-PROVIDER-PROOF.md`,
      model: 'gpt-5.6-sol',
      reasoningEffort: 'low',
      providerCalls: 3,
      inputTokens: 576,
      outputTokens: 53,
      cachedInputTokens: 0,
      estimatedCostUsd: 0.00447,
      finalAnswerOwners: { delegation: 'manager', handoff: 'specialist' },
      continuationContext: 'all_turns',
      defaultWorkerConfigured: false,
    },
    progressiveAgentsReadiness: {
      schema: 'progressive-agents-readiness-summary/v1',
      status: 'runtime-ready-dev',
      sourceRevision: 'a'.repeat(40),
      sourcePath: 'docs/PROGRESSIVE-AGENTS.md',
      sourceUrl: `https://github.com/huijoohwee/agentic-canvas-os/blob/${'a'.repeat(40)}/docs/PROGRESSIVE-AGENTS.md`,
      contractSchema: 'progressive-agents-runtime-contract/v1',
      runtimeScope: 'single-agent execution, tool-bearing agent execution, and explicit specialist workflow delegation',
      runtimeOwner: '../agent-api/src/progressive-agents.js',
      runtimeProof: '../__tests__/progressive-agents.test.mjs',
      contractReady: true,
      configured: false,
      progressionPolicy: 'single-agent-then-tools-then-specialists',
      growthStages: ['single-agent', 'tool-enabled-agent', 'specialist-workflow'],
      externalSdkDependency: false,
      providerExecutionStatus: 'unverified',
      defaultWorkerConfigured: false,
      deployPolicy: 'Dev-only until explicit operator approval',
    },
  }
  const gateSnapshot: AgenticGraphRuntimeIdentityGateSnapshot = {
    schema: 'agenticgraph-runtime-identity-gate/v1',
    status: 'pass',
    transportStatus: 'connected',
    requiredDeviceCount: 2,
    observedDeviceCount: 2,
    expiresAtMs: Date.now() + 60_000,
    verificationDigest: 'd'.repeat(64),
    message: 'Exact runtime identity parity passed across 2 devices.',
    differences: [],
  }
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  try {
    await mountReactRoot(root, React.createElement(CrossDeviceIdentitySettingsRowsContent, { identity, gate: gateSnapshot }), {
      window: dom.window as unknown as Window,
      frames: 2,
    })
    const gate = container.querySelector('[data-kg-main-panel-settings-runtime-identity="1"]')
    if (
      !gate
      || gate.getAttribute('data-kg-runtime-identity-surface') !== 'main-panel-settings'
      || gate.getAttribute('data-kg-runtime-catalog-digest') !== 'c'.repeat(64)
    ) {
      throw new Error('Expected MainPanel Settings to render the global cross-device identity gate contract')
    }
    const counts = container.querySelector('[data-kg-runtime-catalog-counts="78/94/95"]')
    const peerGate = container.querySelector('[data-kg-runtime-identity-peer-gate="pass"]')
    const agentProof = container.querySelector('[data-kg-agent-live-provider-proof="verified-bounded-live"]')
    const proofUsage = container.querySelector('[data-kg-agent-live-provider-proof-usage="576/53/0"]')
    const progressiveAgents = container.querySelector('[data-kg-progressive-agents-readiness="runtime-ready-dev"]')
    const progressiveBoundary = container.querySelector('[data-kg-progressive-agents-provider="unverified"][data-kg-progressive-agents-worker="false"]')
    const buttons = Array.from<HTMLButtonElement>(container.querySelectorAll('button')).map(button => button.textContent?.trim())
    if (!counts || !peerGate || !agentProof || !proofUsage || !progressiveAgents || !progressiveBoundary
      || !buttons.includes('Refresh identity catalog') || !buttons.includes('Copy diagnostic JSON')) {
      throw new Error('Expected Settings to expose source-backed agent proof and progressive readiness, automatic peer parity, bounded refresh, and diagnostic export')
    }
    if (buttons.includes('Copy identity JSON')) {
      throw new Error('Expected clipboard export to be diagnostic-only rather than the compliance path')
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}
