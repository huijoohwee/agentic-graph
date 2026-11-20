import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { workspaceBasename } from '@/features/workspace-fs/path'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { runWorkspaceFsChangedBatch } from '@/features/workspace-fs/workspaceFsEvents'
import { saveWorkspaceWebsiteLocalCopy } from '@/features/workspace-fs/workspaceRevealInFileManager'
import { ensureWorkspaceDocsMirrorFolder, upsertWorkspaceDocsMirrorText } from '@/features/workspace-fs/workspaceSeedProvider'

const pendingByStore = new WeakMap<WorkspaceFs, Promise<void>>()
type SourceFile = { path: string; text: string }

export async function persistVideoSourceBundle(fs: WorkspaceFs, folder: string, files: SourceFile[], mirror?: boolean) {
  const save = async () => {
    await runWorkspaceFsChangedBatch(async () => {
      const entries = await fs.listEntries()
      const expected = new Map(files.map(file => [file.path, file.text]))
      const present = new Set<string>()
      for (const entry of entries.filter(entry => entry.parentPath === folder)) {
        if (!expected.has(entry.path)) {
          if (/\.video-agent(?:\.source)?\.md$/.test(entry.name)) throw new Error(`Another video document already owns ${folder}`)
          continue
        }
        if (entry.kind !== 'file' || (entry.text ?? await fs.readFileText(entry.path)) !== expected.get(entry.path)) {
          throw new Error(`Import conflict at ${entry.path}. The existing file was preserved.`)
        }
        present.add(entry.path)
      }
      await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: folder })
      const created: SourceFile[] = []
      try {
        for (const file of files) {
          if (present.has(file.path)) continue
          await fs.createFile({ parentPath: folder, name: workspaceBasename(file.path), text: file.text, requireExactPath: true, mirrorToHost: false })
          created.push(file)
        }
      } catch (error) {
        for (const file of created.reverse()) {
          if (await fs.readFileText(file.path) === file.text) await fs.deleteEntry(file.path, { mirrorToHost: false, expectedText: file.text })
        }
        throw error
      }
    })
    if (mirror === false) return
    if (folder.startsWith('/websites/')) {
      for (const file of files) await saveWorkspaceWebsiteLocalCopy(file.path, file.text)
    } else {
      await ensureWorkspaceDocsMirrorFolder({ workspacePath: folder })
      for (const file of files) await upsertWorkspaceDocsMirrorText({ workspacePath: file.path, text: file.text })
    }
  }
  if (globalThis.navigator?.locks) await navigator.locks.request('workspace-video-import', save)
  else {
    const pending = (pendingByStore.get(fs) || Promise.resolve()).catch(() => undefined).then(save)
    pendingByStore.set(fs, pending)
    try { await pending } finally { if (pendingByStore.get(fs) === pending) pendingByStore.delete(fs) }
  }
}

/** Read the importer's ordered parts only. Missing or unrecognised files require a fresh conversion. */
export async function readLegacyVideoSource(fs: WorkspaceFs, folder: string, sourceUrl: string) {
  const read = (name: string) => fs.readFileText(folder + '/' + name)
  const manifestText = await read('source.json')
  if (!manifestText) return null
  const readParts = async (name: string): Promise<string | null> => {
    const text = await read(name)
    if (text === null) return null
    let names: string[]
    if (name.endsWith('.md')) {
      if (!text.startsWith('1. [transcript.md.part-1.md](./transcript.md.part-1.md)\n')) return text
      names = text.trimEnd().split('\n').map((line, i) =>
        line === `${i + 1}. [${name}.part-${i + 1}.md](./${name}.part-${i + 1}.md)` ? `${name}.part-${i + 1}.md` : '')
    } else {
      const value = JSON.parse(text)
      if (value.schemaVersion !== 'workspace-text-parts/v1') return text
      names = value.parts
    }
    if (!Array.isArray(names) || !names.length || !names.every((part, i) =>
      part === `${name}.part-${i + 1}.${name.endsWith('.md') ? 'md' : 'txt'}`)) return null
    const parts = await Promise.all(names.map(read))
    return parts.every(part => part !== null) ? parts.join('') : null
  }
  try {
    const manifest = JSON.parse(manifestText)
    if (!String(manifest.schemaVersion).endsWith(':source-manifest') || manifest.sourceUrl !== sourceUrl || typeof manifest.sourceName !== 'string' || !manifest.sourceName) return null
    const text = manifest.sourceTextPath === 'transcript.md' ? await readParts('transcript.md') : manifest.sourceText
    const transcript = manifest.sourceTranscriptJsonPath === 'transcript.json' ? await readParts('transcript.json') : manifest.sourceTranscriptJsonText
    if (typeof text !== 'string' || (transcript !== undefined && typeof transcript !== 'string')) return null
    return { normalizedUrl: sourceUrl, name: manifest.sourceName as string, text, transcriptJsonText: transcript as string | undefined,
      sourceMediaKind: 'video' as const, sourceMimeHint: 'text/markdown' }
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}
