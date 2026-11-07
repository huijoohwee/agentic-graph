import { UI_FONT_SANS } from 'grph-shared/ui/typography'
import type {
  SwarmPredictionEvent,
  SwarmPredictionMetrics,
  SwarmPredictionResult,
  SwarmPredictionWorldState,
} from '@/features/swarm-prediction/swarmPredictionEngine'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

const round4 = (value: number): number => Math.round(value * 10000) / 10000

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

export const buildSwarmPredictionChartSvg = (states: SwarmPredictionWorldState[], title: string): string => {
  const points = states.length > 0 ? states : [{ tick: 0, predictionScore: 0.5, meanBelief: 0, consensus: 0, confidence: 0, volatility: 0, activeInterventions: [] }]
  const width = 720
  const height = 320
  const pad = 44
  const maxTick = Math.max(1, points[points.length - 1]?.tick || 1)
  const line = points.map(state => {
    const x = pad + ((width - (pad * 2)) * (state.tick / maxTick))
    const y = height - pad - ((height - (pad * 2)) * state.predictionScore)
    return `${round4(x)},${round4(y)}`
  }).join(' ')
  const consensus = points.map(state => {
    const x = pad + ((width - (pad * 2)) * (state.tick / maxTick))
    const y = height - pad - ((height - (pad * 2)) * state.consensus)
    return `${round4(x)},${round4(y)}`
  }).join(' ')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)} prediction chart">`,
    '<rect width="720" height="320" fill="#f8fafc"/>',
    '<path d="M44 44V276H676" fill="none" stroke="#334155" stroke-width="1.5"/>',
    `<text x="44" y="28" font-family="${UI_FONT_SANS}" font-size="18" font-weight="700" fill="#0f172a">`,
    `${escapeHtml(title)}`,
    '</text>',
    `<polyline points="${line}" fill="none" stroke="#0f766e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<polyline points="${consensus}" fill="none" stroke="#7c3aed" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.78"/>`,
    `<text x="52" y="300" font-family="${UI_FONT_SANS}" font-size="12" fill="#475569">Prediction score</text>`,
    '<circle cx="48" cy="296" r="4" fill="#0f766e"/>',
    `<text x="186" y="300" font-family="${UI_FONT_SANS}" font-size="12" fill="#475569">Consensus</text>`,
    '<circle cx="178" cy="296" r="4" fill="#7c3aed"/>',
    '</svg>',
  ].join('')
}

export const buildSwarmPredictionOutputMarkdown = (args: {
  title: string
  metrics: SwarmPredictionMetrics
  prediction: SwarmPredictionResult['prediction']
  states: SwarmPredictionWorldState[]
  events: SwarmPredictionEvent[]
}): string => {
  const finalState = args.states[args.states.length - 1]
  const metricTable = serializeMarkdownPipeTable({
    columns: ['Metric', 'Value'],
    alignments: [null, 'right'],
    rows: [
      ['Agents', args.metrics.agentCount],
      ['Ticks', args.metrics.tickCount],
      ['Events', args.metrics.eventCount],
      ['Final mean belief', finalState?.meanBelief.toFixed(3) || '0.000'],
      ['Final volatility', args.metrics.volatility.toFixed(3)],
    ],
  })
  return [
    `# ${args.title}`,
    '',
    `Prediction score: ${args.prediction.score.toFixed(3)}`,
    `Confidence: ${args.prediction.confidence.toFixed(3)}`,
    `Consensus: ${args.metrics.consensus.toFixed(3)}`,
    `Stop reason: ${args.metrics.stopReason}`,
    '',
    ...metricTable,
    '',
    '## Latest Events',
    ...args.events.slice(-6).map(event => `- T${event.tick} ${event.kind}: ${event.label}`),
  ].join('\n')
}
