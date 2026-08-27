import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const args = new Set(process.argv.slice(2))
const previewOnly = args.has('--preview-only')
const referencesOnly = args.has('--references-only')

if (previewOnly && referencesOnly) {
  console.error('[docs:update] choose at most one of --preview-only or --references-only')
  process.exit(1)
}

const referenceScripts = [
  'docs:byteplus-chat-reference',
  'docs:byteplus-chat-codebase-index',
  'docs:byteplus-image-reference',
  'docs:byteplus-image-codebase-index',
  'docs:byteplus-video-reference',
  'docs:byteplus-video-codebase-index',
  'docs:grabmaps-reference',
  'docs:grabmaps-sgp-admin-areas',
  'docs:grabmaps-codebase-index',
  'docs:openai-reference',
]

const workflowPreviewDocuments = [
  'docs/documents/agenticgraph-pipeline-document.md',
  'docs/documents/agenticgraph-pipeline-deep-dive-document.md',
  'docs/documents/agenticgraph-parser-document.md',
  'docs/documents/agenticgraph-orchestrator-document.md',
  'docs/documents/agenticgraph-ontology-document.md',
  'docs/documents/agenticgraph-schema-document.md',
  'docs/documents/agenticgraph-renderer-document.md',
  'docs/documents/agenticgraph-semantic-document.md',
  'docs/documents/agenticgraph-ui-ux-design-document.md',
  'docs/documents/agenticgraph-codebase-semantics-document.md',
  'docs/documents/agenticgraph-fields-document.md',
  'docs/documents/agenticgraph-metadata-document.md',
  'docs/documents/agenticgraph-ingestor-document.md',
  'docs/documents/agenticgraph-codebase-index-document.md',
  'docs/documents/agenticgraph-demo-document.md',
  'docs/documents/agenticgraph-design-document.md',
  'docs/documents/agenticgraph-llm-prompt-contract.md',
  'docs/documents/agenticgraph-local-storage-document.md',
  'docs/documents/agenticgraph-mermaid-frontmatter-document.md',
  'docs/documents/agenticgraph-settings-document.md',
  'docs/documents/agenticgraph-testing-document.md',
]

const workflowPreviewOutputDir = 'data/outputs/agenticgraph-workflow-preview'

const run = (command, commandArgs, label) => {
  console.log(`[docs:update] ${label}`)
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (!previewOnly) {
  for (const scriptName of referenceScripts) {
    run('npm', ['run', scriptName], `run ${scriptName}`)
  }
}

if (!referencesOnly) {
  for (const markdownPath of workflowPreviewDocuments) {
    run(
      'python3',
      ['-m', 'agenticgraph_parser', 'markdown', '--input', markdownPath, '--output-dir', workflowPreviewOutputDir],
      `render ${markdownPath} -> ${workflowPreviewOutputDir}`,
    )
  }
}
