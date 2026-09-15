import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { resolveRepoSourcePath } from './repoTestData'

// Read only the selected document's adjacent authored continuations. Missing
// primary files fail; an unrelated sibling can never substitute for the owner.
export function readRepoDocumentFamily(relativePath: string): string {
  const primary = resolveRepoSourcePath(relativePath)
  const directory = path.dirname(primary)
  const basename = path.basename(primary, '.md')
  const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const continuation = new RegExp(`^${escaped}\\.(?:part-[0-9]{2}|companion|runtime)\\.md$`)
  const paths = [primary, ...(primary.endsWith('.md')
    ? readdirSync(directory).filter(name => continuation.test(name)).sort().map(name => path.join(directory, name)) : [])]
  if (paths.length > 32) throw new Error('Document family exceeds its file bound')
  return paths.map(file => {
    const info = statSync(file)
    if (!info.isFile() || info.size > 500_000) throw new Error('Document source exceeds its file bound')
    const text = readFileSync(file, 'utf8')
    if (file.endsWith('.md') && /-prd-tad-adr-mvp-gtm(?:\.|$)/.test(file)
      && !/^version:\s*["']?[0-9]+\.[0-9]+\.[0-9]+["']?\s*$/m.test(text.split('\n---')[0]!)) {
      throw new Error(`Document needs a version in its opening frontmatter: ${file}`)
    }
    return text
  }).join('\n')
}
