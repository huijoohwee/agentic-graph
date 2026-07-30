import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildSettingsFlowArtifacts,
  findStaleSettingsFlowArtifacts,
  writeSettingsFlowArtifacts,
} from './settings-responsibility-flow'

function parseCheckMode(arguments_: string[]): boolean {
  const unknownArguments = arguments_.filter(argument => argument !== '--check')
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArguments.join(', ')}. Usage: build:settings [--check]`)
  }
  return arguments_.includes('--check')
}

function main(): void {
  const check = parseCheckMode(process.argv.slice(2))
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
  const repoRoot = path.resolve(currentDirectory, '../../..')
  const build = buildSettingsFlowArtifacts(repoRoot)

  if (check) {
    const staleArtifacts = findStaleSettingsFlowArtifacts(build.artifacts, repoRoot)
    if (staleArtifacts.length > 0) {
      process.stderr.write(
        `Responsibility flow artifacts are stale:\n${staleArtifacts.map(value => `- ${value}`).join('\n')}\n`,
      )
      process.exitCode = 1
      return
    }
    process.stdout.write(
      `Responsibility flow artifacts are current (${Object.keys(build.schema).length} settings)\n`,
    )
    return
  }

  writeSettingsFlowArtifacts(build.artifacts, repoRoot)
  process.stdout.write(
    `Wrote ${build.artifacts.map(artifact => artifact.relativePath).join(', ')} `
      + `with ${Object.keys(build.schema).length} settings\n`,
  )
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Responsibility flow generation failed: ${message}\n`)
  process.exitCode = 1
}
