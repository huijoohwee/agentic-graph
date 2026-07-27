import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  catalogApprovalArtifactId,
  resolveCatalogApprovals,
} from '../catalog-approval.mjs'
import { appendInstruction } from '../ledger.mjs'

const attemptedAt = '2026-07-27T00:00:01.000Z'

test('catalog approval resolves only from an earlier matching prod instruction', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-approval-'))
  try {
    const instruction = {
      instructionId: 'approve-action-catalog',
      artifactIds: [catalogApprovalArtifactId('action')],
      destination: 'prod',
      timestamp: '2026-07-27T00:00:00.000Z',
    }
    assert.equal((await appendInstruction(root, instruction)).written, true)

    const result = await resolveCatalogApprovals([{
      catalogId: 'action',
      repository: 'worker',
      path: 'docs/DICTIONARY-COMMAND.md',
      approvalInstructionId: instruction.instructionId,
    }], root, { now: () => attemptedAt })

    assert.deepEqual(result, {
      approvedCatalogIds: ['action'],
      failures: [],
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('missing, future, or wrong-scope catalog instructions fail closed', async () => {
  const sources = [{
    catalogId: 'action',
    repository: 'worker',
    path: 'docs/DICTIONARY-COMMAND.md',
    approvalInstructionId: 'approval',
  }]
  const cases = [
    {
      expected: 'CATALOG_APPROVAL_NOT_RECORDED',
      readRecordedInstruction: async () => null,
    },
    {
      expected: 'CATALOG_APPROVAL_INVALID',
      readRecordedInstruction: async () => ({
        instructionId: 'approval',
        artifactIds: [catalogApprovalArtifactId('action')],
        destination: 'prod',
        timestamp: attemptedAt,
      }),
    },
    {
      expected: 'CATALOG_APPROVAL_SCOPE_MISMATCH',
      readRecordedInstruction: async () => ({
        instructionId: 'approval',
        artifactIds: ['unrelated-artifact'],
        destination: 'prod',
        timestamp: '2026-07-27T00:00:00.000Z',
      }),
    },
  ]

  for (const scenario of cases) {
    const result = await resolveCatalogApprovals(sources, '/unused-ledger', {
      now: () => attemptedAt,
      readRecordedInstruction: scenario.readRecordedInstruction,
    })
    assert.deepEqual(result.approvedCatalogIds, [])
    assert.equal(result.failures[0].code, scenario.expected)
  }
})
