export type PromptPresetInvocationResult =
  | { ok: true; prompt: string }
  | { ok: false; error: string }

export async function loadPromptPresetInvocation(id: string): Promise<PromptPresetInvocationResult> {
  const { selectGatewayPreset } = await import('./gatewayPresetCatalog')
  return selectGatewayPreset(id)
}

/** A deliberately submitted source projection can run entirely on the device. */
export function isCanvasSourceProjection(input: string): boolean {
  return /^\/canvas\.project\s+@source\.frontmatter\s+@source\.body\s+@canvas(?:\s|$)/.test(input.trimStart().split('\n', 1)[0] ?? '')
}

const drawingIntent = /^(?:please\s+)?(?:sketch|draw|diagram)\b(?!\s+(?:on|from|up|attention|a conclusion|conclusions|a comparison|parallels)\b)/i
const canvasTokens = new Set(['@canvas', '#canvas', '@source.frontmatter', '@source.body', '#frontmatter', '#runtime-ready'])

/** Draw directly or through the existing Canvas command, binding and meaning. */
export function readCanvasDrawingRequest(input: string): string | null {
  const text = input.trim()
  if (drawingIntent.test(text)) return text
  const command = /^\/canvas\.project\b((?:\s+[@#][\w.-]+)+)(?:\s+([\s\S]*))?$/i.exec(text)
  if (!command) return null
  const tokens = command[1].trim().toLowerCase().split(/\s+/)
  if (!tokens.includes('@canvas') || !tokens.includes('#canvas') || tokens.some(t => !canvasTokens.has(t))) return null
  const body = (command[2] || '').trim()
  return !body || drawingIntent.test(body) ? body : null
}

export function isCanvasDrawingRequest(input: string): boolean {
  return readCanvasDrawingRequest(input) !== null
}
