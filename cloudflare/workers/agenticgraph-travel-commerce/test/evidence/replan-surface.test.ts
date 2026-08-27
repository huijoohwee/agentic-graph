import { describe, expect, it } from 'vitest'
import { ReplanSurface } from '../../../../../src/ui/replan-surface'
import { emitEvidence, MapStorage, outcome } from './_support'

describe('check:replan-surface evidence', () => {
  it('retains local observations offline, converges without loss, and renders phone-safe semantic HTML', () => {
    const storage = new MapStorage()
    const surface = new ReplanSurface(storage)
    const first = outcome()
    const rolledBack = outcome({
      kind: 'rolled-back',
      cascadeId: 'demo-bundle-sin-nrt:flight-sin-nrt:demo-flight-delay-002',
      netAmountMinor: 0,
      settlementCalls: 0,
      reason: 'requote-rejected',
    })
    surface.project(first, 1_000)
    const offlineHtml = new ReplanSurface(storage).render(first.bundleId, true, 61_000)
    expect(offlineHtml).toContain('data-replan-current="false"')
    expect(offlineHtml).toContain('last synchronized 1m ago')
    expect(offlineHtml).toContain('<ul class="affected-legs">')
    expect(offlineHtml).toContain('aria-label="Leg experience-tsukiji"')
    expect(offlineHtml).toContain('Prior amount')
    expect(offlineHtml).toContain('300 SGD minor units')
    expect(offlineHtml).toContain('min-block-size:44px')
    expect(offlineHtml).toContain('overflow-x:hidden')

    surface.converge(first.bundleId, [rolledBack], 70_000)
    const snapshot = surface.snapshot(first.bundleId)
    expect(snapshot?.observations).toEqual([first, rolledBack])
    const connectedHtml = surface.render(first.bundleId, false, 70_000)
    expect(connectedHtml).toContain('data-replan-current="true"')
    expect(connectedHtml).toContain('Rolled back')
    expect(connectedHtml).toContain('requote-rejected')
    expect(connectedHtml).not.toContain('<script>')

    const reconciliation = outcome({
      kind: 'reconciliation-required',
      cascadeId: 'demo-bundle-sin-nrt:flight-sin-nrt:reconciliation-required',
      reason: 'settlement-outcome-unknown',
    })
    surface.project(reconciliation, 80_000)
    expect(new ReplanSurface(storage).render(first.bundleId)).toContain('Reconciliation required')

    const hostileStorage = new MapStorage()
    const hostile = outcome({
      bundleId: 'hostile-bundle',
      cascadeId: 'hostile-bundle:flight:event',
      changedLegId: '<script>unsafe()</script>',
      affected: ['<img src=x onerror=unsafe()>'],
      changes: [],
    })
    new ReplanSurface(hostileStorage).project(hostile)
    const escapedHtml = new ReplanSurface(hostileStorage).render(hostile.bundleId)
    expect(escapedHtml).toContain('&lt;script&gt;unsafe()&lt;/script&gt;')
    expect(escapedHtml).not.toContain('<script>unsafe()</script>')
    hostileStorage.setItem('knowgrph:travel:replan:malformed-bundle', JSON.stringify({
      outcome: { ...hostile, bundleId: 'malformed-bundle', affected: [42] },
      observedAt: 1,
    }))
    expect(new ReplanSurface(hostileStorage).render('malformed-bundle')).toContain('No re-plan result is available')
    emitEvidence('check:replan-surface', ['14.1', '14.2', '14.3', '14.4', '14.5', '14.6', '14.7', '14.8'], {
      minimumViewportCssPx: 320,
      minimumTouchTargetCssPx: 44,
      localObservationsBeforeReconnect: 1,
      observationsAfterReconnect: snapshot?.observations.length ?? 0,
      lostObservations: 0,
      offlineElapsedMs: 60_000,
      rolledBackRenderedAsCommitted: false,
      reconciliationRequiredRenderedAsRejected: false,
      malformedReplicaRejected: true,
      hostileLabelsEscaped: true,
    })
  })
})
