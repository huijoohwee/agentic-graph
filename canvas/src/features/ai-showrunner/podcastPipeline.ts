import type { CreativeStateEntry, NarratorVoiceMapEntry, Script, ShowrunnerError, ShowrunnerSourceFileStore } from './showrunnerTypes'
import { deriveShowrunnerContentHash, showrunnerRunRootPath } from './showrunnerShared'

export type NarrationManifestSegment = {
  index: number
  speaker: string
  voice_endpoint_env_key?: string
  duration_estimate_s?: number
  status: 'resolved' | 'gap'
}

export type NarrationManifest = {
  run_id: string
  segments: NarrationManifestSegment[]
  gap_reports: ShowrunnerError[]
}

export const buildNarrationManifest = (script: Script, voiceMap: NarratorVoiceMapEntry[] = []): NarrationManifest => {
  const voiceBySpeaker = new Map(voiceMap.map(entry => [entry.speaker, entry.voice_endpoint_env_key]))
  const gapReports: ShowrunnerError[] = []
  const segments = script.segments.map((segment, index) => {
    const envKey = voiceBySpeaker.get(segment.speaker)
    if (!envKey) {
      gapReports.push({
        code: 'VOICE_MAP_GAP',
        message: `No narrator_voice_map entry for speaker ${segment.speaker}.`,
        field: `segments.${index}.speaker`,
      })
    }
    return {
      index,
      speaker: segment.speaker,
      ...(envKey ? { voice_endpoint_env_key: envKey } : {}),
      ...(typeof segment.duration_estimate_s === 'number' ? { duration_estimate_s: segment.duration_estimate_s } : {}),
      status: envKey ? 'resolved' as const : 'gap' as const,
    }
  })
  return { run_id: script.run_id, segments, gap_reports: gapReports }
}

export const writeNarrationManifest = async (
  sourceFileStore: ShowrunnerSourceFileStore,
  manifest: NarrationManifest,
) => sourceFileStore.writeSourceFile(
  `${showrunnerRunRootPath(manifest.run_id)}/narration-manifest.md`,
  [
    '---',
    'schema: "agentic-graph-showrunner-narration-manifest/v1"',
    `run_id: ${JSON.stringify(manifest.run_id)}`,
    `content_hash: ${JSON.stringify(deriveShowrunnerContentHash(JSON.stringify(manifest)))}`,
    '---',
    '',
    '# Narration Manifest',
    '',
    ...manifest.segments.map(segment => `- ${segment.index}: ${segment.speaker} ${segment.status}${segment.voice_endpoint_env_key ? ` env=${segment.voice_endpoint_env_key}` : ''}`),
    ...manifest.gap_reports.map(error => `- gap: ${error.message}`),
    '',
  ].join('\n'),
)

export const findLatestScriptEntry = (entries: CreativeStateEntry[]): CreativeStateEntry | null => {
  const scripts = entries.filter(entry => entry.entry_type === 'script_draft')
  return scripts.length ? scripts[scripts.length - 1] : null
}
