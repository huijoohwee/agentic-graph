import { createWorkspaceProgramPack } from '../canvas/src/features/block-editor/workspaceProgramPack'

// One bounded JSON input and one JSON result. No shell, file access, network or Python execution.
let bytes = 0
const chunks: Buffer[] = []
const timer = setTimeout(() => { process.stderr.write('workspace_pack_deadline\n'); process.exit(1) }, 4500)
try {
  for await (const chunk of process.stdin) {
    bytes += chunk.length
    if (bytes > 98304) throw Error('workspace_pack_request_limit')
    chunks.push(chunk)
  }
  const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
  const result = await createWorkspaceProgramPack(input)
  process.stdout.write(JSON.stringify(result) + '\n')
} catch (error) {
  process.stderr.write(error instanceof Error && /^workspace_pack_[a-z_]+$/.test(error.message)
    ? error.message + '\n' : 'workspace_pack_conversion_refused\n')
  process.exitCode = 1
} finally { clearTimeout(timer) }
