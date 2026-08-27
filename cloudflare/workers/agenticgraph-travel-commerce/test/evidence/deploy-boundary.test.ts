import { describe, expect, it } from 'vitest'
import { deployBoundaryReport } from '../../../../../src/runtime/deploy-boundary.ts'
import { emitEvidence } from './_support'

describe('check:deploy-boundary evidence', () => {
  it('derives all three boundaries closed in the local Dev lane', () => {
    const report = deployBoundaryReport({ DEPLOY_LANE: 'Dev_Lane' })
    expect(report.lane).toBe('Dev_Lane')
    expect(report.boundaries).toHaveLength(3)
    expect(report.boundaries.every((boundary) => boundary.state === 'closed')).toBe(true)
    expect(report.boundaries.every((boundary) => boundary.evidenceReference === null)).toBe(true)
    expect(report.boundaries.every((boundary) => boundary.rollback.length > 0)).toBe(true)
    emitEvidence('check:deploy-boundary', ['13.1', '13.2', '13.5', '13.6'], {
      lane: report.lane,
      closedBoundaryCount: report.boundaries.length,
      boundaryNames: report.boundaries.map((boundary) => boundary.name),
      externalMutationsIssued: 0,
    })
  })
})
