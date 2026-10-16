import { load as parseYaml } from 'js-yaml'
import { FLIGHT_SIM_DEMO_REPO_REL_PATH } from '@/features/workspace-fs/workspaceRunReadyDemos'

export const LIVE_CANVAS_HERO_DEMO_SOURCE = 'docs/workspace-seeds/demo.md'
export const FLIGHT_SIM_HERO_DEMO_SOURCE_PATH = `/${FLIGHT_SIM_DEMO_REPO_REL_PATH}` as const
export type LiveCanvasHeroDemo = {
  id: string
  title: string
  background?: 'xr-physics' | 'python-drone'
  repository?: string
  sourcePath?: typeof FLIGHT_SIM_HERO_DEMO_SOURCE_PATH
  demoOnlyPrompt?: string
  reply: string
  outputs: { title: string; text: string }[]
}

/** A bounded projection of the authored document, loaded only by the Home demo surface. */
export function parseLiveCanvasHeroDemos(text: string): LiveCanvasHeroDemo[] {
  if (text.length > 40_000) throw new Error('The demo document exceeds its size limit.')
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  const source = frontmatter ? parseYaml(frontmatter[1]) as Record<string, unknown> : null
  if (source?.schema !== 'agentic-graph-prompt-preset-demos/v1' || source.demo_only !== true
    || !Array.isArray(source.demos) || source.demos.length > 30) throw new Error('The demo document is invalid.')
  const ids = new Set<string>()
  const string = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 4_000
  return source.demos.map(raw => {
    const rawDemo = raw as (LiveCanvasHeroDemo & { source_path?: unknown; demo_only_prompt?: unknown }) | null
    const sourcePath = rawDemo?.source_path
    const demoOnlyPrompt = rawDemo?.demo_only_prompt
    const demo = rawDemo ? {
      ...rawDemo,
      ...(sourcePath !== undefined ? { sourcePath } : {}),
      ...(demoOnlyPrompt !== undefined ? { demoOnlyPrompt } : {}),
    } as LiveCanvasHeroDemo : null
    if (!demo || !string(demo.id) || !/^[a-z0-9-]+$/.test(demo.id) || ids.has(demo.id)
      || !string(demo.title) || !string(demo.reply)
      || (demoOnlyPrompt !== undefined && !string(demoOnlyPrompt))
      || (demo.id === 'flight-sim' && sourcePath !== FLIGHT_SIM_HERO_DEMO_SOURCE_PATH)
      || (sourcePath !== undefined && (demo.id !== 'flight-sim' || sourcePath !== FLIGHT_SIM_HERO_DEMO_SOURCE_PATH))
      || (demo.background !== undefined && !(
        (demo.background === 'xr-physics' && demo.id === 'xr-physics')
        || (demo.background === 'python-drone' && demo.id === 'programmatic-drone-flight')))
      || (demo.repository !== undefined && (demo.id !== 'launch-copilot'
        || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(demo.repository)))
      || !Array.isArray(demo.outputs) || demo.outputs.length < 1 || demo.outputs.length > 6
      || demo.outputs.some(output => !output || !string(output.title) || !string(output.text))) {
      throw new Error('The demo document contains an invalid or duplicate preset.')
    }
    ids.add(demo.id)
    return demo
  })
}

export async function loadLiveCanvasHeroDemos(): Promise<LiveCanvasHeroDemo[]> {
  // Vite's lazy raw projection preserves the single Graph-owned source in Dev and Production.
  const { default: text } = await import('../../../../docs/workspace-seeds/demo.md?raw')
  return parseLiveCanvasHeroDemos(text)
}

export async function loadLiveCanvasHeroDemo(id: string): Promise<LiveCanvasHeroDemo> {
  const demo = (await loadLiveCanvasHeroDemos()).find(entry => entry.id === id)
  if (!demo) throw new Error('This preset has no authored demo yet.')
  return demo
}

export function buildLiveCanvasHeroDemoReply(demo: LiveCanvasHeroDemo): string {
  return ['Demo · Example conversation. No model call or generated artifact.', '', demo.reply, '',
    ...demo.outputs.flatMap(output => [`### ${output.title}`, '', output.text, '']),
  ].join('\n').trim()
}
