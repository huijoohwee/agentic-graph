export type TravelAgencyCostLog = {
  model: string
  prompt_tokens: number | 'unknown'
  completion_tokens: number | 'unknown'
  cache_hits: number
  estimated_cost_usd: number
  incomplete: boolean
}

const toIntegerOrUnknown = (value: unknown): number | 'unknown' => {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : 'unknown'
}

export const zeroModelCostLog = (model: string): TravelAgencyCostLog => ({
  model,
  prompt_tokens: 0,
  completion_tokens: 0,
  cache_hits: 0,
  estimated_cost_usd: 0,
  incomplete: false,
})

export const openAiUsageCostLog = (model: string, usage: unknown): TravelAgencyCostLog => {
  const record = usage && typeof usage === 'object' && !Array.isArray(usage) ? usage as Record<string, unknown> : {}
  const promptTokens = toIntegerOrUnknown(record.input_tokens ?? record.prompt_tokens)
  const completionTokens = toIntegerOrUnknown(record.output_tokens ?? record.completion_tokens)
  return {
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cache_hits: 0,
    estimated_cost_usd: 0,
    incomplete: promptTokens === 'unknown' || completionTokens === 'unknown',
  }
}
