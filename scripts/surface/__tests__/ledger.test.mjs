import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  appendFixtureInstruction,
  appendInstruction,
  appendOverrideRecord,
  appendPromotionRecord,
  readInstruction,
  validateOperatorInstruction,
  validateOverrideRecord,
  validatePromotionRecord,
} from '../ledger.mjs'

const timestamp = '2026-07-27T00:00:00.000Z'
const attemptedAt = '2026-07-27T00:00:01.000Z'

const instruction = {
  instructionId: 'instruction-001',
  artifactIds: ['artifact-a', 'artifact-b'],
  destination: 'prod',
  timestamp,
}

test('operator instructions have an exact shape, unique artifact set, destination, and earlier timestamp', () => {
  assert.equal(validateOperatorInstruction(instruction, { attemptedAt }).ok, true)
  for (const invalid of [
    { ...instruction, extra: true },
    { ...instruction, artifactIds: [] },
    { ...instruction, artifactIds: ['artifact-a', 'artifact-a'] },
    { ...instruction, destination: 'prod-and-edge' },
    { ...instruction, timestamp: attemptedAt },
  ]) {
    assert.equal(validateOperatorInstruction(invalid, { attemptedAt }).ok, false)
  }
  assert.equal(
    validateOperatorInstruction(instruction, { attemptedAt: timestamp }).violations
      .some(violation => violation.code === 'INSTRUCTION_NOT_EARLIER'),
    true,
  )
})

test('override and promotion records reject missing and unknown fields', () => {
  const override = {
    conflictId: 'conflict-1',
    author: 'operator',
    scope: 'artifact-a',
    justification: 'Reviewed narrow exception.',
  }
  const promotion = {
    artifactId: 'artifact-a',
    sourcePath: 'robots.txt',
    destinationPath: 'robots.txt',
    instructionId: instruction.instructionId,
    timestamp: attemptedAt,
  }
  assert.equal(validateOverrideRecord(override).ok, true)
  assert.equal(validateOverrideRecord({ ...override, justification: '' }).ok, false)
  assert.equal(validatePromotionRecord(promotion).ok, true)
  assert.equal(validatePromotionRecord({ ...promotion, unexpected: true }).ok, false)
})

test('ledger records are append-only JSON and an instruction can be read back', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'surface-ledger-'))
  try {
    const first = await appendInstruction(root, instruction)
    assert.equal(first.written, true)
    assert.deepEqual(await readInstruction(root, instruction.instructionId), instruction)

    const duplicate = await appendInstruction(root, instruction)
    assert.equal(duplicate.written, false)
    assert.equal(duplicate.code, 'RECORD_EXISTS')
    assert.deepEqual(await readInstruction(root, instruction.instructionId), instruction)

    const overrideResult = await appendOverrideRecord(root, {
      conflictId: 'conflict-1',
      author: 'operator',
      scope: 'artifact-a',
      justification: 'Reviewed narrow exception.',
    })
    assert.equal(overrideResult.written, true)

    const promotionResult = await appendPromotionRecord(root, {
      artifactId: 'artifact-a',
      sourcePath: 'robots.txt',
      destinationPath: 'robots.txt',
      instructionId: instruction.instructionId,
      timestamp: attemptedAt,
    })
    assert.equal(promotionResult.written, true)

    const files = (await fs.readdir(root)).sort()
    assert.equal(files.length, 3)
    for (const fileName of files) {
      const parsed = JSON.parse(await fs.readFile(path.join(root, fileName), 'utf8'))
      assert.equal(typeof parsed, 'object')
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('ledger write failures return typed outcomes instead of throwing', async () => {
  const result = await appendInstruction('/unused', instruction, {
    mkdir: async () => {},
    writeExclusive: async () => {
      throw Object.assign(new Error('synthetic failure'), { code: 'EACCES' })
    },
  })
  assert.deepEqual(
    { written: result.written, code: result.code },
    { written: false, code: 'LEDGER_WRITE_FAILED' },
  )
})

test('instruction reads reject symlinks and structurally invalid ledger content', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'surface-ledger-read-'))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'surface-ledger-outside-'))
  try {
    const outsidePath = path.join(outside, 'instruction.json')
    await fs.writeFile(outsidePath, `${JSON.stringify(instruction)}\n`)
    await fs.symlink(
      outsidePath,
      path.join(root, `instruction-${instruction.instructionId}.json`),
    )
    assert.equal(await readInstruction(root, instruction.instructionId), null)

    await fs.rm(path.join(root, `instruction-${instruction.instructionId}.json`))
    await fs.writeFile(
      path.join(root, `instruction-${instruction.instructionId}.json`),
      `${JSON.stringify(instruction)}\n`,
    )
    await fs.chmod(path.join(root, `instruction-${instruction.instructionId}.json`), 0o644)
    assert.equal(await readInstruction(root, instruction.instructionId), null)

    await fs.chmod(path.join(root, `instruction-${instruction.instructionId}.json`), 0o600)
    await fs.writeFile(
      path.join(root, `instruction-${instruction.instructionId}.json`),
      `${JSON.stringify({ ...instruction, callerApproved: true })}\n`,
    )
    assert.equal(await readInstruction(root, instruction.instructionId), null)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(outside, { recursive: true, force: true })
  }
})

test('fixture instruction CLI boundary records only beneath a real OS-temp fixture root', async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'surface-instruction-fixture-'))
  const ledgerRoot = path.join(fixtureRoot, 'ledger')
  try {
    const result = await appendFixtureInstruction({
      permittedTempRoot: fixtureRoot,
      ledgerRoot,
      instruction,
    })
    assert.equal(result.written, true)
    assert.deepEqual(await readInstruction(ledgerRoot, instruction.instructionId), instruction)

    const outside = await appendFixtureInstruction({
      permittedTempRoot: path.resolve(import.meta.dirname, '../../..'),
      ledgerRoot: path.join(import.meta.dirname, 'ledger'),
      instruction,
    })
    assert.equal(outside.written, false)
    assert.equal(outside.code, 'OUTSIDE_FIXTURE_ROOT')
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('fixture instruction boundary rejects a ledger symlink escaping the fixture root', async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'surface-instruction-link-'))
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'surface-instruction-outside-'))
  try {
    await fs.symlink(outsideRoot, path.join(fixtureRoot, 'ledger'), 'dir')
    const result = await appendFixtureInstruction({
      permittedTempRoot: fixtureRoot,
      ledgerRoot: path.join(fixtureRoot, 'ledger'),
      instruction,
    })
    assert.equal(result.written, false)
    assert.equal(result.code, 'REAL_ROOT_REJECTED')
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true })
    await fs.rm(outsideRoot, { recursive: true, force: true })
  }
})
