import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const readUtf8 = (filePath: string): string => readFileSync(filePath, 'utf8')

export function collectRepoLevelHardcodedMotionRecipeOffenders(args?: { repoRoot?: string; allowedHardcodedFallbacks?: string[] }): string[] {
  const repoRoot = resolve(args?.repoRoot || resolve(process.cwd(), '..'))
  const allowedHardcodedFallbacks = new Set(
    (args?.allowedHardcodedFallbacks || [resolve(process.cwd(), 'src/lib/graph/htmlViewer/buildGraphHtmlViewerMarkup.ts')]).map(filePath => resolve(filePath)),
  )
  const offenders: string[] = []

  const pending = [repoRoot]
  let visitedEntries = 0
  while (pending.length > 0) {
    const directory = pending.pop()!
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (++visitedEntries > 100_000) throw new Error('Motion audit exceeds 100000 filesystem entries')
      const nextPath = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue
        pending.push(nextPath)
        continue
      }
      if (entry.isSymbolicLink()) throw new Error(`Motion audit cannot follow symbolic link: ${nextPath}`)
      if (!entry.isFile() || !/\.(ts|tsx|css|html)$/.test(entry.name)) continue
      const text = readUtf8(nextPath)
      if (text.includes('140ms ease') && !allowedHardcodedFallbacks.has(nextPath)) offenders.push(nextPath)
    }
  }

  return offenders.sort()
}
