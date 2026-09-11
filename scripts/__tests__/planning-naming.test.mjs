import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

test('planning naming gate checks new files and formerly exempt fixture directories', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'planning-naming-'))
  try {
    mkdirSync(path.join(root, 'scripts'))
    mkdirSync(path.join(root, 'docs'))
    mkdirSync(path.join(root, 'data/test-data'), { recursive: true })
    copyFileSync(new URL('../check-agentic-naming.mjs', import.meta.url), path.join(root, 'scripts/check-agentic-naming.mjs'))
    execFileSync('git', ['init', '--quiet', root])
    const document = path.join(root, 'docs/example-prd-tad-adr-mvp-gtm.md')
    const run = () => spawnSync(process.execPath, ['scripts/check-agentic-naming.mjs'], { cwd: root, encoding: 'utf8' })
    writeFileSync(document, '---\ndoc_type: "Combined PRD/TAD/ADR"\n---\n')
    assert.match(run().stderr, /planning frontmatter must declare the canonical doc_type/)
    writeFileSync(document, '---\ndoc_type: "PRD-TAD-ADR-MVP-GTM"\n---\n')
    assert.equal(run().status, 0)
    const fixture = path.join(root, 'data/test-data/example.md')
    writeFileSync(fixture, 'schema: "kgc-computing-flow/v1"\n')
    assert.match(run().stderr, /retired canvas protocol token/)
    writeFileSync(fixture, 'schema: "agentic-os-computing-flow/v1"\nkgCanvasSurfaceMode: "2d"\n')
    assert.equal(run().status, 0)
  } finally {
    rmSync(root, { recursive: true })
  }
})
