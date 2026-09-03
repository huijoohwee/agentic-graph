import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function getRepoRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(currentDir, '../../..')
}

function runCliTable(canvasRoot: string, cliRelPath: string, missingMessage: string): string | null {
  const repoRoot = path.dirname(canvasRoot)
  const cliPath = path.join(repoRoot, cliRelPath)
  if (!existsSync(cliPath)) {
    process.stdout.write(`${missingMessage}\n`)
    return null
  }
  const result = spawnSync('npx', ['tsx', cliPath], { cwd: canvasRoot, encoding: 'utf8' })
  if (result.error) {
    process.stdout.write(`Doc lint: failed to run ${cliRelPath}: ${String(result.error)}\n`)
    return null
  }
  if (result.status !== 0) {
    process.stdout.write(`Doc lint: ${cliRelPath} exited with code ${String(result.status)}\n`)
    return null
  }
  return String(result.stdout ?? '').trim()
}

function replaceBetweenMarkers(docPath: string, startMarker: string, endMarker: string, table: string, label: string): void {
  if (!existsSync(docPath)) {
    process.stdout.write(`Doc lint: ${label} missing, skipping\n`)
    return
  }
  const src = readFileSync(docPath, 'utf8')
  const startIndex = src.indexOf(startMarker)
  const endIndex = src.indexOf(endMarker)
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    process.stdout.write(`Doc lint: ${label} markers missing, skipping\n`)
    return
  }
  const before = src.slice(0, startIndex + startMarker.length)
  const after = src.slice(endIndex)
  const next = `${before}\n\n${table}\n\n${after}`
  if (next !== src) {
    writeFileSync(docPath, next, 'utf8')
    process.stdout.write(`Doc lint applied: ${label} updated\n`)
  } else {
    process.stdout.write(`Doc lint: ${label} already up to date\n`)
  }
}

function splitMarkdownTable(table: string, primaryRowLimit: number): { primary: string; continuation: string } {
  const lines = table.split('\n')
  if (lines.length < 2) {
    return { primary: table, continuation: table }
  }
  const header = lines.slice(0, 2)
  const rows = lines.slice(2)
  return {
    primary: [...header, ...rows.slice(0, primaryRowLimit)].join('\n'),
    continuation: [...header, ...rows.slice(primaryRowLimit)].join('\n'),
  }
}

function main(): void {
  const repoRoot = getRepoRoot()
  const canvasRoot = path.join(repoRoot, 'canvas')

  const designDocPath = path.join(repoRoot, 'docs', 'agentic-graph-design-document.md')
  const workflowDocPath = path.join(repoRoot, 'docs', 'agentic-graph-workflow-document.md')
  const techArchDocPath = path.join(repoRoot, 'docs', 'agentic-graph-technical-architecture.md')
  const techArchContinuationDocPath = path.join(repoRoot, 'docs', 'agentic-graph-technical-architecture.settings.md')

  const orchestratorTable = runCliTable(
    canvasRoot,
    'canvas/src/cli/orchestrator-doc.ts',
    'Doc lint: orchestrator CLI missing, skipping orchestrator table generation',
  )
  if (orchestratorTable) {
    replaceBetweenMarkers(
      designDocPath,
      '<!-- ORCHESTRATOR_SECTIONS_TABLE_START -->',
      '<!-- ORCHESTRATOR_SECTIONS_TABLE_END -->',
      orchestratorTable,
      'orchestrator sections table',
    )
  }

  const renderTable = runCliTable(
    canvasRoot,
    'canvas/src/cli/render-doc.ts',
    'Doc lint: render CLI missing, skipping render table generation',
  )
  if (renderTable) {
    replaceBetweenMarkers(
      designDocPath,
      '<!-- RENDER_SECTIONS_TABLE_START -->',
      '<!-- RENDER_SECTIONS_TABLE_END -->',
      renderTable,
      'render sections table',
    )
  }

  const workflowPresetsTable = runCliTable(
    canvasRoot,
    'canvas/src/cli/workflow-presets-doc.ts',
    'Doc lint: workflow presets CLI missing, skipping workflow presets table generation',
  )
  if (workflowPresetsTable) {
    replaceBetweenMarkers(
      workflowDocPath,
      '<!-- WORKFLOW_PRESETS_TABLE_START -->',
      '<!-- WORKFLOW_PRESETS_TABLE_END -->',
      workflowPresetsTable,
      'workflow presets table',
    )
  }

  const settingsTable = runCliTable(
    canvasRoot,
    'canvas/src/cli/settings-doc.ts',
    'Doc lint: settings CLI missing, skipping settings table generation',
  )
  if (settingsTable) {
    const splitSettingsTable = splitMarkdownTable(settingsTable, 400)
    replaceBetweenMarkers(
      techArchDocPath,
      '<!-- SETTINGS_REGISTRY_TABLE_START -->',
      '<!-- SETTINGS_REGISTRY_TABLE_END -->',
      splitSettingsTable.primary,
      'settings registry table part 1',
    )
    replaceBetweenMarkers(
      techArchContinuationDocPath,
      '<!-- SETTINGS_REGISTRY_CONTINUATION_TABLE_START -->',
      '<!-- SETTINGS_REGISTRY_CONTINUATION_TABLE_END -->',
      splitSettingsTable.continuation,
      'settings registry table part 2',
    )
  }
}

main()
