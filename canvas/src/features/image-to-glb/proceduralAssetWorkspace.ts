import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { parseGlbAssetDocument } from '@/lib/assets/glbAssetDocument'
import { blobToDataUrl } from './imageToGlbArtifactPipeline'
import { exportProceduralAsset } from './proceduralAssetRuntimeExport'
import { ProceduralAssetSession } from './proceduralAssetSession'

const SCHEMA = 'agentic-graph-procedural-workspace/v1'
const FILES = { document: 'document.json', recipe: 'recipe.json', source: 'source.procedural.ts', model: 'model.glb.md' } as const
type Companion = keyof typeof FILES
type Entry = { fileName: string; sha256: string; bytes: number }
type Manifest = { schema: typeof SCHEMA; documentId: string; revision: number; files: Record<Companion, Entry> }
export type ProceduralAssetWorkspacePaths = {
  manifestPath: string; documentPath: string; recipePath: string; sourcePath: string; modelPath: string
  documentId: string; revision: number
}
const utf8 = new TextEncoder()
const LIMITS = { manifest: 4096, document: 196_608, recipe: 65_536, source: 262_144, model: 11_000_000 }

function safePath(raw: string): string {
  if (!raw.trim() || /[\\\u0000-\u001f]/.test(raw) || raw.split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid procedural workspace path')
  return normalizeWorkspacePath(raw)
}
function withinFolder(path: string, parent: string, name: string): string {
  const expected = `${parent === '/' ? '' : parent}/${name}`
  if (safePath(path) !== expected) throw new Error('Workspace returned a different procedural companion path')
  return expected
}
async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', utf8.encode(text))
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('')
}
function bounded(text: string | null, limit: number, label: string): string {
  if (text === null || utf8.encode(text).byteLength > limit) throw new Error(`Missing or oversized procedural ${label}`)
  return text
}

/** Writes a fresh generation; the manifest is the final commit marker, never a mutable current pointer. */
export async function saveProceduralAssetWorkspace(args: {
  session: ProceduralAssetSession; fs: WorkspaceFs; parentPath: string
  signal?: AbortSignal; isCurrent?: () => boolean
}): Promise<ProceduralAssetWorkspacePaths> {
  const parent = safePath(args.parentPath)
  const ticket = args.session.begin()
  const assertCurrent = () => {
    if (args.signal?.aborted || args.isCurrent?.() === false || !args.session.isCurrent(ticket)) throw new Error('Procedural workspace save cancelled or document changed')
  }
  assertCurrent()
  const snapshot = args.session.snapshot
  const document = bounded(args.session.serialize(), LIMITS.document, 'document')
  const artifacts = await exportProceduralAsset({ recipe: snapshot.lastValid, signal: args.signal, isCurrent: () => {
    assertCurrent(); return true
  } })
  assertCurrent()
  const dataUrl = await blobToDataUrl(artifacts.glb.blob)
  assertCurrent()
  const contents: Record<Companion, string> = {
    document,
    recipe: bounded(artifacts.recipe.text, LIMITS.recipe, 'recipe'),
    source: bounded(artifacts.source.text, LIMITS.source, 'source'),
    model: bounded([
      '---', 'kgAssetType: model', 'kgAssetFormat: glb', 'kgAssetName: procedural-asset.glb',
      `kgAssetBytes: ${artifacts.glb.bytes.byteLength}`, '---', '',
      '```kg-glb-base64', dataUrl.slice(dataUrl.indexOf(',') + 1), '```', '',
    ].join('\n'), LIMITS.model, 'model'),
  }
  const files = {} as Record<Companion, Entry>
  for (const key of Object.keys(FILES) as Companion[]) {
    files[key] = { fileName: FILES[key], sha256: await digest(contents[key]), bytes: utf8.encode(contents[key]).byteLength }
    assertCurrent()
  }
  const name = `procedural-r${snapshot.revision}-${crypto.randomUUID()}`
  const folder = withinFolder(await args.fs.createFolder({ parentPath: parent, name, mirrorToHost: false }), parent, name)
  assertCurrent()
  const paths = {} as Record<Companion, string>
  for (const key of Object.keys(FILES) as Companion[]) {
    assertCurrent()
    const path = await args.fs.createFile({ parentPath: folder, name: FILES[key], text: contents[key], mirrorToHost: false })
    paths[key] = withinFolder(path, folder, FILES[key])
    assertCurrent()
    if (await args.fs.readFileText(path) !== contents[key]) throw new Error(`Procedural ${key} readback failed`)
    assertCurrent()
  }
  const manifest: Manifest = { schema: SCHEMA, documentId: snapshot.documentId, revision: snapshot.revision, files }
  const text = `${JSON.stringify(manifest, null, 2)}\n`
  assertCurrent()
  const manifestPath = withinFolder(await args.fs.createFile({ parentPath: folder, name: 'manifest.json', text, mirrorToHost: false }), folder, 'manifest.json')
  assertCurrent()
  if (await args.fs.readFileText(manifestPath) !== text) throw new Error('Procedural manifest readback failed')
  assertCurrent()
  return { manifestPath, documentPath: paths.document, recipePath: paths.recipe, sourcePath: paths.source, modelPath: paths.model, documentId: snapshot.documentId, revision: snapshot.revision }
}

/** Integrity checks detect incomplete/corrupt companions, not external provenance or authority. */
export async function restoreProceduralAssetWorkspace(args: { manifestPath: string; fs: WorkspaceFs }): Promise<ProceduralAssetSession> {
  const path = safePath(args.manifestPath)
  if (!path.endsWith('/manifest.json')) throw new Error('Invalid procedural manifest path')
  const manifest = JSON.parse(bounded(await args.fs.readFileText(path), LIMITS.manifest, 'manifest')) as Manifest
  if (!manifest || manifest.schema !== SCHEMA || typeof manifest.documentId !== 'string' || !Number.isSafeInteger(manifest.revision) || manifest.revision < 0 || !manifest.files || Object.keys(manifest.files).length !== 4) throw new Error('Invalid procedural workspace manifest')
  const folder = path.slice(0, path.lastIndexOf('/'))
  const contents = {} as Record<Companion, string>
  for (const key of Object.keys(FILES) as Companion[]) {
    const entry = manifest.files[key]
    if (!entry || entry.fileName !== FILES[key] || !/^[0-9a-f]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > LIMITS[key]) throw new Error('Invalid procedural companion binding')
    const text = bounded(await args.fs.readFileText(`${folder}/${FILES[key]}`), LIMITS[key], key)
    if (utf8.encode(text).byteLength !== entry.bytes || await digest(text) !== entry.sha256) throw new Error(`Procedural ${key} integrity check failed`)
    contents[key] = text
  }
  const session = ProceduralAssetSession.restore(contents.document)
  try {
    const snapshot = session.snapshot
    if (snapshot.documentId !== manifest.documentId || snapshot.revision !== manifest.revision || JSON.stringify(snapshot.lastValid) !== JSON.stringify(JSON.parse(contents.recipe))) throw new Error('Procedural workspace identity or recipe mismatch')
    if (session.current.source !== contents.source || !parseGlbAssetDocument(contents.model)?.dataUrl) throw new Error('Procedural workspace source or model mismatch')
    return session
  } catch (error) { session.dispose(); throw error }
}
