import assert from 'node:assert/strict'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import { parseGlbAssetDocument } from '@/lib/assets/glbAssetDocument'
import { withGlbExporterFileReader } from '@/tests/lib/glbExporterFileReaderHarness'
import { buildProceduralAsset, disposeProceduralAsset } from './proceduralAssetBuilder'
import { createProceduralAssetFromText } from './proceduralAssetTextRecipe'
import { ProceduralAssetSession } from './proceduralAssetSession'
import { restoreProceduralAssetWorkspace, saveProceduralAssetWorkspace } from './proceduralAssetWorkspace'

type Write = { path: string; text: string }
type ManifestBinding = { documentId: string; revision: number; files: Record<string, { fileName: string }> }

function createWorkspaceFixture() {
  const entries = new Map<string, WorkspaceEntry>([
    ['/', { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 0 }],
    ['/assets', { path: '/assets', parentPath: '/', kind: 'folder', name: 'assets', updatedAtMs: 0 }],
  ])
  const writes: Write[] = []
  const reads: string[] = []
  const fixture = {
    entries, writes, reads,
    failName: '',
    afterWrite: undefined as ((write: Write) => void) | undefined,
    fs: null as unknown as WorkspaceFs,
  }
  const join = (parent: string, name: string) => `${parent === '/' ? '' : parent}/${name}`
  const write = async (path: string, text: string) => {
    if (fixture.failName && path.endsWith(`/${fixture.failName}`)) throw new Error(`Injected write failure: ${fixture.failName}`)
    const entry = entries.get(path)
    assert.equal(entry?.kind, 'file', `write requires existing file: ${path}`)
    entries.set(path, { ...entry!, text, updatedAtMs: writes.length + 1 })
    const operation = { path, text }
    writes.push(operation)
    fixture.afterWrite?.(operation)
  }
  fixture.fs = {
    ensureSeed: async () => false,
    listEntries: async () => [...entries.values()].map(entry => ({ ...entry })),
    readFileText: async path => { reads.push(path); return entries.get(path)?.text ?? null },
    writeFileText: write,
    createFile: async ({ parentPath, name, text }) => {
      assert.equal(entries.get(parentPath)?.kind, 'folder', 'file parent must exist')
      const path = join(parentPath, name)
      assert.equal(entries.has(path), false, `create must not overwrite ${path}`)
      if (fixture.failName === name) throw new Error(`Injected write failure: ${name}`)
      entries.set(path, { path, parentPath, name, kind: 'file', text: '', updatedAtMs: 0 })
      await write(path, text)
      return path
    },
    createFolder: async ({ parentPath, name }) => {
      assert.equal(entries.get(parentPath)?.kind, 'folder', 'folder parent must exist')
      let path = join(parentPath, name)
      let suffix = 1
      while (entries.has(path)) path = join(parentPath, `${name}-${suffix++}`)
      entries.set(path, { path, parentPath, name: path.slice(path.lastIndexOf('/') + 1), kind: 'folder', updatedAtMs: 0 })
      return path
    },
    deleteEntry: async path => {
      for (const key of entries.keys()) if (key === path || key.startsWith(`${path}/`)) entries.delete(key)
    },
  }
  return fixture
}

function manifestPaths(fixture: ReturnType<typeof createWorkspaceFixture>): string[] {
  return [...fixture.entries.values()].filter(entry => entry.kind === 'file' && entry.name === 'manifest.json').map(entry => entry.path)
}

function savedFiles(fixture: ReturnType<typeof createWorkspaceFixture>): Map<string, string> {
  return new Map([...fixture.entries.values()].filter(entry => entry.kind === 'file').map(entry => [entry.path, entry.text!]))
}

function assertFilesRetained(fixture: ReturnType<typeof createWorkspaceFixture>, expected: Map<string, string>): void {
  for (const [path, text] of expected) assert.equal(fixture.entries.get(path)?.text, text, `committed companion changed: ${path}`)
}

function readRequired(fixture: ReturnType<typeof createWorkspaceFixture>, path: string): string {
  const text = fixture.entries.get(path)?.text
  assert.equal(typeof text, 'string', `missing companion: ${path}`)
  return text!
}

export async function testProceduralAssetWorkspaceRoundTripAndFidelity() {
  await withGlbExporterFileReader(async () => {
    const fixture = createWorkspaceFixture()
    const session = new ProceduralAssetSession('workspace:editable-robot', createProceduralAssetFromText('blue robot', 47))
    let restored: ProceduralAssetSession | undefined
    try {
      assert.equal(session.setControl('width', 1.75), true)
      assert.equal(session.setControl('color', '#112233'), true)
      const invalidDraft = '{ incomplete authored recipe'
      assert.equal(session.apply(invalidDraft), false)
      const snapshot = session.snapshot
      const saved = await saveProceduralAssetWorkspace({ session, fs: fixture.fs, parentPath: '/assets' })
      assert.equal(saved.documentId, snapshot.documentId)
      assert.equal(saved.revision, snapshot.revision)
      assert.equal(fixture.writes.at(-1)?.path, saved.manifestPath, 'manifest is the final publication write')
      const companionPaths = [saved.documentPath, saved.recipePath, saved.sourcePath, saved.modelPath]
      assert.equal(new Set(companionPaths).size, 4)
      for (const path of companionPaths) {
        assert.ok(path.startsWith(saved.manifestPath.slice(0, saved.manifestPath.lastIndexOf('/') + 1)))
        assert.ok(fixture.reads.includes(path), 'saved companions must be read back before successful publication')
      }
      assert.deepEqual(JSON.parse(readRequired(fixture, saved.documentPath)), snapshot)
      const recipe = JSON.parse(readRequired(fixture, saved.recipePath))
      assert.deepEqual(recipe, snapshot.lastValid)
      restored = await restoreProceduralAssetWorkspace({ manifestPath: saved.manifestPath, fs: fixture.fs })
      assert.deepEqual(restored.snapshot, snapshot)
      assert.equal(restored.snapshot.draft, invalidDraft)
      const expected = buildProceduralAsset(recipe)
      const asset = parseGlbAssetDocument(readRequired(fixture, saved.modelPath))
      assert.equal(asset?.format, 'glb')
      assert.equal(asset?.mimeType, 'model/gltf-binary')
      assert.ok(asset?.dataUrl)
      const bytes = Uint8Array.from(atob(asset!.dataUrl!.split(',')[1]), character => character.charCodeAt(0))
      const imported = await new GLTFLoader().parseAsync(bytes.buffer, '')
      try {
        assert.equal(readRequired(fixture, saved.sourcePath), expected.source, 'saved source describes the exact edited recipe')
        assert.ok(readRequired(fixture, saved.sourcePath).includes('export function createScene()'))
        assert.equal(expected.evidence.providerCalls, 0)
        assert.equal(expected.evidence.kind, 'text-construction')
        const body = imported.scene.getObjectByName('Part-body') as THREE.Mesh
        assert.ok(body?.isMesh)
        assert.ok(Math.abs(new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).x - 1.75) < 1e-6)
        assert.equal((body.material as THREE.MeshStandardMaterial).color.getHexString(), '112233')
        assert.equal(imported.scene.getObjectByName('Pivot-head')?.parent?.name, 'Socket-body')
        assert.equal(imported.animations[0]?.duration, 2)
        const mixer = new THREE.AnimationMixer(imported.scene)
        mixer.clipAction(imported.animations[0]).play()
        mixer.setTime(0.5)
        assert.ok(Math.abs(imported.scene.getObjectByName('Pivot-arm-left')!.quaternion.x) > 0.1)
        mixer.stopAllAction(); mixer.uncacheRoot(imported.scene)
      } finally { disposeProceduralAsset(expected.scene); disposeProceduralAsset(imported.scene) }
      const previous = savedFiles(fixture)
      const repeated = await saveProceduralAssetWorkspace({ session, fs: fixture.fs, parentPath: '/assets' })
      assert.notEqual(repeated.manifestPath, saved.manifestPath, 'each save commits a distinct generation even at the same document revision')
      assertFilesRetained(fixture, previous)
      assert.equal(readRequired(fixture, repeated.recipePath), readRequired(fixture, saved.recipePath))
      assert.equal(readRequired(fixture, repeated.sourcePath), readRequired(fixture, saved.sourcePath))
      assert.equal(parseGlbAssetDocument(readRequired(fixture, repeated.modelPath))?.dataUrl, asset!.dataUrl)
    } finally { restored?.dispose(); session.dispose() }
  })
}

export async function testProceduralAssetWorkspaceCancellation() {
  await withGlbExporterFileReader(async () => {
    for (const scenario of ['pre-abort', 'mid-abort', 'stale-context', 'changed-session'] as const) {
      const fixture = createWorkspaceFixture()
      const session = new ProceduralAssetSession(`workspace:${scenario}`, createProceduralAssetFromText('green box'))
      const controller = new AbortController()
      let current = true
      if (scenario === 'pre-abort') controller.abort()
      else fixture.afterWrite = () => {
        fixture.afterWrite = undefined
        if (scenario === 'mid-abort') controller.abort()
        if (scenario === 'stale-context') current = false
        if (scenario === 'changed-session') session.setControl('width', 2)
      }
      try {
        await assert.rejects(saveProceduralAssetWorkspace({ session, fs: fixture.fs, parentPath: '/assets', signal: controller.signal, isCurrent: () => current }))
        assert.deepEqual(manifestPaths(fixture), [], `${scenario} must not leave a publishable manifest`)
        if (scenario === 'pre-abort') assert.equal(fixture.writes.length, 0)
        else assert.ok(fixture.writes.length > 0, 'exercise cancellation after a companion write')
      } finally { session.dispose() }
    }
  })
}

export async function testProceduralAssetWorkspaceFailurePreservesCommittedGeneration() {
  await withGlbExporterFileReader(async () => {
    const fixture = createWorkspaceFixture()
    const session = new ProceduralAssetSession('workspace:retained-generation', createProceduralAssetFromText('purple chair'))
    try {
      const committed = await saveProceduralAssetWorkspace({ session, fs: fixture.fs, parentPath: '/assets' })
      const previous = savedFiles(fixture)
      for (const failName of ['source.procedural.ts', 'model.glb.md', 'manifest.json']) {
        fixture.failName = failName
        session.setControl('width', 1.5)
        await assert.rejects(saveProceduralAssetWorkspace({ session, fs: fixture.fs, parentPath: '/assets' }), /Injected write failure/)
        assertFilesRetained(fixture, previous)
        assert.deepEqual(manifestPaths(fixture), [committed.manifestPath], `failure writing ${failName} cannot publish a partial generation`)
        const reopened = await restoreProceduralAssetWorkspace({ manifestPath: committed.manifestPath, fs: fixture.fs })
        assert.equal(reopened.snapshot.revision, committed.revision)
        reopened.dispose()
      }
    } finally { session.dispose() }
  })
}

export async function testProceduralAssetWorkspaceRejectsCompanionTampering() {
  await withGlbExporterFileReader(async () => {
    const fixture = createWorkspaceFixture()
    const session = new ProceduralAssetSession('workspace:verified-companions', createProceduralAssetFromText('orange robot'))
    try {
      const saved = await saveProceduralAssetWorkspace({ session, fs: fixture.fs, parentPath: '/assets' })
      for (const path of [saved.documentPath, saved.recipePath, saved.sourcePath, saved.modelPath]) {
        const original = fixture.entries.get(path)!
        fixture.entries.set(path, { ...original, text: `${original.text}\n/* corrupted companion */` })
        await assert.rejects(restoreProceduralAssetWorkspace({ manifestPath: saved.manifestPath, fs: fixture.fs }), undefined, `changed companion must fail verification: ${path}`)
        fixture.entries.set(path, original)
      }
      const missing = fixture.entries.get(saved.recipePath)!
      fixture.entries.delete(saved.recipePath)
      await assert.rejects(restoreProceduralAssetWorkspace({ manifestPath: saved.manifestPath, fs: fixture.fs }))
      fixture.entries.set(saved.recipePath, missing)
      const originalManifest = fixture.entries.get(saved.manifestPath)!
      for (const alter of [
        (manifest: ManifestBinding) => { manifest.documentId = 'workspace:different-document' },
        (manifest: ManifestBinding) => { manifest.revision += 1 },
        (manifest: ManifestBinding) => { manifest.files.recipe.fileName = '../recipe.json' },
        (manifest: ManifestBinding) => { manifest.files.model.fileName = '/outside/model.glb.md' },
      ]) {
        const manifest = JSON.parse(originalManifest.text!)
        alter(manifest)
        fixture.entries.set(saved.manifestPath, { ...originalManifest, text: JSON.stringify(manifest) })
        await assert.rejects(restoreProceduralAssetWorkspace({ manifestPath: saved.manifestPath, fs: fixture.fs }))
      }
      fixture.entries.set(saved.manifestPath, originalManifest)
      assert.equal(fixture.reads.some(path => path.includes('..') || path.startsWith('/outside/')), false, 'manifest cannot read outside its generation')
      const restored = await restoreProceduralAssetWorkspace({ manifestPath: saved.manifestPath, fs: fixture.fs })
      assert.deepEqual(restored.snapshot, session.snapshot)
      restored.dispose()
    } finally { session.dispose() }
  })
}
