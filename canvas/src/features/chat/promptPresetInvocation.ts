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
  if (isCanvasSourceProjection(input) && (body.startsWith('---') || !body)) return null
  return body
}

export function isCanvasDrawingRequest(input: string): boolean {
  return readCanvasDrawingRequest(input) !== null
}

export async function resolveEditedCanvasPresetBody(prompt: string): Promise<string> {
  // Typing into the command line can leave its original catalog example below the edit.
  // Strip only a complete, unmodified example that follows the user's own paragraph.
  if (/\n\s*\n/.test(prompt)) {
    const preset = await loadPromptPresetInvocation('canvas-sketch')
    const example = preset.ok ? readCanvasDrawingRequest(preset.prompt) : null
    if (example && prompt.endsWith(example)) {
      const prefix = prompt.slice(0, -example.length)
      if (/\n\s*\n\s*$/.test(prefix) && prefix.trim()) return prefix.trimEnd()
    }
  }
  return prompt
}
