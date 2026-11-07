import { parseLearningPython } from '../python-learning/pythonParser'
import { PYTHON_LIMITS, sourceBytes } from '../python-learning/pythonModel'
import { programTree } from './blockLibrary'
import { applyProgramJson, applyProgramMarkdown, PROGRAM_PROFILE, renderProgramJson, renderProgramMarkdown } from './programCodec'

export const WORKSPACE_PACK_SCHEMA = 'agentic-graph.workspace-program-pack/v1'
export const WORKSPACE_PACK_LIMITS = Object.freeze({ sourceBytes: PYTHON_LIMITS.sourceBytes, canvasNodes: 256, resultBytes: 225280 })
export async function textDigest(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}

/** Conversion only. The native parser, codecs and Block tree remain the sole program owners. */
export async function createWorkspaceProgramPack(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('workspace_pack_input_invalid')
  const input = raw as Record<string, unknown>
  if (Object.keys(input).sort().join(',') !== 'schema,source,sourceDigest,title'
    || input.schema !== WORKSPACE_PACK_SCHEMA || typeof input.source !== 'string'
    || sourceBytes(input.source) > WORKSPACE_PACK_LIMITS.sourceBytes || !input.source.trim()
    || typeof input.title !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(input.title)
    || typeof input.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(input.sourceDigest)) {
    throw Error('workspace_pack_input_invalid')
  }
  const sourceDigest = await textDigest(input.source)
  if (input.sourceDigest !== sourceDigest) throw Error('workspace_pack_source_changed')
  const program = parseLearningPython(input.source)
  const rows = programTree(program)
  if (rows.length > WORKSPACE_PACK_LIMITS.canvasNodes) throw Error('workspace_pack_canvas_limit')
  const json = renderProgramJson(input.source), markdown = renderProgramMarkdown(input.source)
  if (applyProgramJson(input.source, json) !== input.source || applyProgramMarkdown(input.source, markdown) !== input.source) {
    throw Error('workspace_pack_roundtrip_failed')
  }
  // Labels use numeric character entities. Source text cannot introduce Mermaid directives or markup.
  const label = (value: string) => [...value.slice(0,80)].map(char => /[a-zA-Z0-9 ._-]/.test(char)
    ? char : `#${char.codePointAt(0)};`).join('')
  const ids = new Map(rows.map((row, index) => [row.id, `n${index}`]))
  const mermaid = ['flowchart TD', ...rows.map(row => `  ${ids.get(row.id)}["${label(row.title)}"]`),
    ...rows.filter(row => row.parentId).map(row => `  ${ids.get(row.parentId!)} --> ${ids.get(row.id)}`)].join('\n')
  const canvas = `---\ntitle: ${JSON.stringify(input.title)}\nagenticOsCanvasRenderMode: 2d\nagenticOsCanvas2dRenderer: d3\n---\n\n# ${input.title}\n\nProgram structure from Graph's native Block tree. Conversion does not execute Python.\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`
  const files = await Promise.all([
    { name: 'program.py', mediaType: 'text/x-python', content: input.source },
    { name: 'program.json', mediaType: 'application/json', content: json },
    { name: 'program.md', mediaType: 'text/markdown', content: markdown },
    { name: 'canvas.md', mediaType: 'text/markdown', content: canvas },
  ].map(async file => ({ ...file, bytes: sourceBytes(file.content), digest: await textDigest(file.content) })))
  const unsigned = { schema: WORKSPACE_PACK_SCHEMA, owner: 'agentic-graph', languageProfile: PROGRAM_PROFILE,
    title: input.title, sourceDigest, execution: 'not-executed', roundTrip: 'exact',
    canvas: { format: 'mermaid', nodes: rows.length, edges: rows.length - 1 }, files }
  const result = { ...unsigned, artifactDigest: await textDigest(JSON.stringify(unsigned)) }
  if (sourceBytes(JSON.stringify(result)) > WORKSPACE_PACK_LIMITS.resultBytes) throw Error('workspace_pack_result_limit')
  return result
}
