import { extractYamlFrontmatterHeaderBlock, readYamlFrontmatterValue } from '@/lib/markdown/frontmatter'
import { DEFAULT_URL_IMPORT_RENDERER } from '@/features/agent-ready/importUrlAgentReadyContract.mjs'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { importContentDigest, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { persistImportInventory } from '@/features/workspace-fs/importInventoryPersistence'
import { saveWorkspaceWebsiteLocalCopy } from '@/features/workspace-fs/workspaceRevealInFileManager'
import type { SavedUrlImport } from './incrementalImport'
import { videoUrlImportCanvasLines, type WorkspaceUrlImportCanvasRendererId, type WorkspaceUrlImportDocumentModeId } from './canvasPresets'

export function isSavedUrlVideoDocument(path: string, folder: string): boolean {
  return path.slice(0, path.lastIndexOf('/')) === folder && /\.(?:video-agent(?:\.source)?|video-sequence\.timeline)\.md$/.test(path)
}

/** Update just the generated view metadata, retaining the source, timeline, frames and local edits. */
export async function applySavedUrlVideoRenderer(
  fs: WorkspaceFs, saved: SavedUrlImport, renderer: WorkspaceUrlImportCanvasRendererId | null,
  mode?: WorkspaceUrlImportDocumentModeId | null, mirrorToHost?: boolean,
): Promise<string> {
  const header = extractYamlFrontmatterHeaderBlock(saved.text)
  if (!header) return saved.text
  const read = (key: string) => readYamlFrontmatterValue(header.rawBlock, key)
  const isAgent = read('kgVideoAgentImport') === 'true'
  if (!isAgent && !(read('kgVideoSequenceTimeline') === 'true' && read('kgVideoSequenceImportSourceCount'))) return saved.text
  const current = read('kgCanvas2dRenderer')
  if (!renderer && current && current !== (isAgent ? 'storyboard' : 'media')) return saved.text
  const newLines = videoUrlImportCanvasLines(renderer ?? DEFAULT_URL_IMPORT_RENDERER, mode)
  let nextHeader = header.rawBlock
  for (const line of newLines) {
    const field = new RegExp('^' + line.slice(0, line.indexOf(':')) + ':[^\\r\\n]*', 'm')
    nextHeader = field.test(nextHeader) ? nextHeader.replace(field, line) : nextHeader.replace(/\n---$/, '\n' + line + '\n---')
  }
  if (nextHeader === header.rawBlock) return saved.text
  if (!saved.state?.outputDigest || await importContentDigest(saved.text) !== saved.state.outputDigest) {
    if (renderer) throw new Error(`The saved video document has local edits. Choose its renderer in the Canvas toolbar: ${saved.path}`)
    return saved.text
  }
  const text = nextHeader + saved.text.slice(header.rawBlock.length)
  await fs.writeFileText(saved.path, text, { expectedText: saved.text, mirrorToHost })
  if (mirrorToHost !== false) {
    try { await saveWorkspaceWebsiteLocalCopy(saved.path, text) }
    catch (error) {
      await fs.writeFileText(saved.path, saved.text, { expectedText: text, mirrorToHost: false })
      throw error
    }
  }
  setWorkspaceEntrySource(saved.path, { ...saved.source, importState: { ...saved.state, outputDigest: await importContentDigest(text) } }, { persist: 'sync' })
  await persistImportInventory(fs)
  return text
}
