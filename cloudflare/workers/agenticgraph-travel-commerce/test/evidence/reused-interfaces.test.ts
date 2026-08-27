import { createExecutionContext, reset, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { OfferCache } from '../../../../../src/cache/offer-cache'
import { emitEvidence } from './_support'
import sharedCanvasNodeStore from '../../../agenticgraph-storage/sharedCanvasNode/nodeStorage.ts?raw'
import guardrailGate from '../../../agenticgraph-payment/travelAgency/guardrailGate.ts?raw'
import issuanceService from '../../../agenticgraph-payment/travelAgency/issuanceService.ts?raw'
import settlementVerifier from '../../../agenticgraph-payment/travelAgency/settlementVerifier.ts?raw'
import agentRegistry from '../../../../../src/registry/agent-registry.mjs?raw'
import mcpSurface from '../../../../../src/registry/mcp-surface.mjs?raw'
import registryCanvas from '../../../../../src/registry/registry-canvas.mjs?raw'
import inheritedCommerceDocument from '../../../../../docs/documents/agenticgraph-agentic-commerce-platform-prd-tad-adr.md?raw'
import inheritedTravelDocument from '../../../../../docs/documents/agenticgraph-agentic-travel-agencies-prd-tad-adr.md?raw'

afterEach(() => reset())

describe('check:reused-interfaces evidence', () => {
  it('snapshots every inherited interface and captures routeIntent without adding mutation fields', async () => {
    const capture: {
      body: Readonly<Record<string, unknown>> | null
      component: string
    } = { body: null, component: '' }
    const registry: Fetcher = {
      async fetch(request: Request) {
        capture.component = request.headers.get('x-agenticgraph-component') ?? ''
        const value: unknown = await request.json()
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('route-intent-body-malformed')
        capture.body = value as Readonly<Record<string, unknown>>
        return Response.json({
          kind: 'offer', legId: 'experience', offerId: 'replacement', amountMinor: 200,
          currency: 'SGD',
          priceVerification: 'deterministic-demo',
          agentId: 'existing-router-double', promptTokens: 0, completionTokens: 0, dollarCost: 0,
          provenance: { mode: 'contract-capture', currency: 'SGD' },
        })
      },
      connect() { throw new Error('not-supported-by-contract-capture') },
    }
    const context = createExecutionContext()
    const result = await new OfferCache('reused-interface-evidence').requote({
      event: { bundleId: 'bundle', legId: 'flight', eventId: 'event' },
      legId: 'experience',
      category: 'experience',
      priorOfferId: 'prior',
      priorAmountMinor: 150,
    }, registry, context)
    await waitOnExecutionContext(context)
    expect(result).toMatchObject({ kind: 'offer', legId: 'experience' })
    const observed = capture.body
    expect(observed).toMatchObject({ operation: 'routeIntent' })
    expect(capture.component).toBe('Reopt_Worker')
    if (!observed || typeof observed.intent !== 'object' || observed.intent == null) throw new Error('missing route intent')
    expect(Object.keys(observed.intent).sort()).toEqual(['category', 'constraints', 'intentId'])
    const snapshots = await Promise.all(REUSED_INTERFACE_BASELINES.map(async (baseline) => ({
      ...baseline,
      actualDigest: await sha256(baseline.source),
    })))
    for (const snapshot of snapshots) {
      if (snapshot.actualDigest !== snapshot.expectedDigest) {
        throw new Error(JSON.stringify({
          type: 'reused-interface-changed',
          interface: snapshot.interfaceName,
          element: 'public-surface-source-digest',
          expected: snapshot.expectedDigest,
          actual: snapshot.actualDigest,
        }))
      }
    }
    const inventory = componentInventory(inheritedCommerceDocument)
    for (const component of INHERITED_COMPONENTS) {
      const row = inventory.get(component)
      expect(row, `missing Component Inventory row for ${component}`).toBeDefined()
      expect(row?.localRung.length).toBeGreaterThan(0)
      expect(row?.deliveredRung.length).toBeGreaterThan(0)
      expect(row?.source).toMatch(/(?:this document|inherited, travel doc v0\.6\.0|reused, unmodified)/)
    }
    expect(inheritedCommerceDocument).toContain('re-derives no new Evidence References for them')
    emitEvidence('check:reused-interfaces', ['12.1', '12.2', '12.3', '12.4', '12.5', '12.6'], {
      capturedConsumerContracts: snapshots.length,
      unchangedInterfaceDigests: snapshots.length,
      typedInterfaceChangeFindings: 0,
      registryOperation: 'routeIntent',
      componentIdentity: capture.component,
      mutationEventFields: ['bundleId', 'eventId', 'legId'],
      inheritedInventoryRowsChecked: INHERITED_COMPONENTS.length,
      inheritedRungsReclaimed: 0,
    })
  })
})

const REUSED_INTERFACE_BASELINES = Object.freeze([
  baseline('Shared Canvas Node Store', sharedCanvasNodeStore, 'c1b72b0706e19b716d47fd07ccc0eace435431d9c23f0d59ca36f6f8043770ab'),
  baseline('Agent Registry/Router', `${agentRegistry}\n${mcpSurface}`, 'f03156f18f01ef656156d5d2c0dccd7393ffa3079028fe1112ac9f8464669fd8'),
  baseline('Discovery Harnesses', inheritedTravelDocument, '93111b6ed0f3f57dedbd1420902f8b22c03b5b88d0deccbaf1e02683a6b04a17'),
  baseline('Issuance Service', issuanceService, '2bf501e3f8cb39b2f21d9671deb49c3777a7e4cb0c6119a36f3a2abecd3891af'),
  baseline('Settlement Verifier', settlementVerifier, '3ea799c2c95523709618a3c1a53ac160c211e251c9dbc91417075d4ddfd09a71'),
  baseline('Notification Dispatcher', inheritedTravelDocument, '93111b6ed0f3f57dedbd1420902f8b22c03b5b88d0deccbaf1e02683a6b04a17'),
  baseline('Marketplace Registry Canvas', registryCanvas, '0c3c6454b1cef06daa0cbf5f80ae5e4cdb515bf9f8b526a90dc570bc3eaaf84e'),
  baseline('Guardrail Gate', guardrailGate, '1f431a285735039e8e0e83d4f5e0d62b60a383f21df47174487aeead653cd329'),
  baseline('Inherited Component Inventory', inheritedCommerceDocument, '21459e1fef4f5b791d3433e94ba63872187647d2447bc4ff9846821f4b7022a9'),
])

const INHERITED_COMPONENTS = Object.freeze([
  'Agent Registry/Router',
  'Marketplace Registry Canvas',
  'Shared Canvas Node Store',
  'Guardrail Gate',
  'Flight Discovery Harness',
  'Shopping Discovery Harness',
  'Issuance Service',
  'Settlement Verifier',
  'Notification Dispatcher',
])

function baseline(interfaceName: string, source: string, expectedDigest: string) {
  return Object.freeze({ interfaceName, source, expectedDigest })
}

function componentInventory(document: string) {
  const rows = new Map<string, Readonly<{ localRung: string; deliveredRung: string; source: string }>>()
  for (const line of document.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim().replaceAll('`', ''))
    if (cells.length !== 5 || cells[0] === 'Layer' || cells[0].startsWith('---')) continue
    rows.set(cells[1], Object.freeze({ localRung: cells[2], deliveredRung: cells[3], source: cells[4] }))
  }
  return rows
}

async function sha256(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
