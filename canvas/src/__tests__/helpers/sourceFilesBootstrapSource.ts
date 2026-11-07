import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Read the existing runtime owners together for cross-owner architectural checks.
// Behavioral tests still mount the public bootstrap component.
export function readSourceFilesBootstrapSource(bootstrapPath: string): string {
  const directory = dirname(bootstrapPath)
  return [bootstrapPath, ...[
    'sourceFilesPersistenceContracts.ts', 'useSourceFilesWorkspaceRuntime.ts',
    'useSourceFilesSeedSync.ts', 'useSourceFilesCloudSync.ts',
  ].map(name => `${directory}/${name}`)].map(path => readFileSync(path, 'utf8')).join('\n')
}
