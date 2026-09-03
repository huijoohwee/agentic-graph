const wrapFence = (content: string, lang: string): string => {
  const safeLang = String(lang || '').trim() || 'text'
  const safe = String(content || '').replace(/\r\n/g, '\n')
  const ticks = safe.includes('```') ? '````' : '```'
  return [`${ticks}${safeLang}`, safe, ticks].join('\n')
}

const clipForPrompt = (raw: string, maxChars: number): string => {
  const text = String(raw || '')
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`
}

export const buildCorrectionPrompt = (args: { ruleId: string; message: string; invalidMarkdown: string }) => {
  const block = clipForPrompt(args.invalidMarkdown, 6000)
  return [
    '@flag:correction',
    `failed_rule: ${args.ruleId}`,
    `reason: ${args.message}`,
    '',
    'Return ONLY one corrected standalone AGENTIC_OS markdown document.',
    'Start immediately with the YAML frontmatter delimiter `---` and continue streaming the final document only.',
    'Do not add preamble, explanation, wrapper prose, or extra markdown outside the AGENTIC_OS document.',
    'Keep the response query-shaped and fully satisfy ALL rules plus the strict output format.',
    'Fix only what is necessary; preserve section order, schema, and request relevance.',
    '',
    'Invalid output (for reference; do not repeat verbatim):',
    wrapFence(block, 'markdown'),
  ].join('\n')
}
