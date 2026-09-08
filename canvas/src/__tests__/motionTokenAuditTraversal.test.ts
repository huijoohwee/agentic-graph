import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectRepoLevelHardcodedMotionRecipeOffenders } from './helpers/motionTokenAudit'

const withFixture = (run: (root: string) => void): void => {
  const root = mkdtempSync(join(tmpdir(), 'motion-audit-'))
  try { run(root) } finally { rmSync(root, { recursive: true }) }
}

export function testMotionAuditReadsFreshSourcesAndPreservesScope(): void {
  withFixture(root => {
    const source = join(root, 'feature')
    mkdirSync(source)
    const offender = join(source, 'motion.css')
    const allowed = join(root, 'viewer.ts')
    const recipe = 'transition: opacity 140ms ease;'
    writeFileSync(offender, recipe)
    writeFileSync(allowed, recipe)
    writeFileSync(join(source, 'notes.md'), recipe)
    for (const name of ['__tests__', 'node_modules', 'dist', '.git']) {
      mkdirSync(join(root, name))
      writeFileSync(join(root, name, 'ignored.css'), recipe)
    }
    const audit = () => collectRepoLevelHardcodedMotionRecipeOffenders({
      repoRoot: root, allowedHardcodedFallbacks: [allowed],
    })
    assert.deepEqual(audit(), [offender])
    writeFileSync(offender, 'transition: opacity var(--kg-motion-fast) var(--kg-motion-ease);')
    assert.deepEqual(audit(), [])
    writeFileSync(join(source, 'new.tsx'), recipe)
    assert.deepEqual(audit(), [join(source, 'new.tsx')])
  })
}

export function testMotionAuditRejectsSymbolicLinksAndMissingRoots(): void {
  withFixture(root => {
    assert.throws(() => collectRepoLevelHardcodedMotionRecipeOffenders({
      repoRoot: join(root, 'missing'),
    }), /ENOENT/)
    symlinkSync(root, join(root, 'cycle'), 'dir')
    assert.throws(() => collectRepoLevelHardcodedMotionRecipeOffenders({
      repoRoot: root,
    }), /cannot follow symbolic link/)
  })
}
