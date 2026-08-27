import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CANONICAL_STARTUP_DOCUMENT_PATH } from '@/features/canvas/canvasEmbedPresets'
import { XR_PHYSICS_DEMO_PUBLISHED_CANONICAL_PATH } from '@/features/workspace-fs/workspaceRunReadyDemos'

export function testCanvasEmbedStartupPresetUsesPhysicsPlaygroundSource(): void {
  const viewport = readFileSync(resolve(process.cwd(), 'src/components/CanvasViewport.tsx'), 'utf8')
  const heroRuntime = readFileSync(resolve(process.cwd(), 'src/features/canvas/useAgenticGraphLiveCanvasHero.ts'), 'utf8')
  const presets = readFileSync(resolve(process.cwd(), 'src/features/canvas/canvasEmbedPresets.ts'), 'utf8')
  for (const contract of [
    "get('kgCanvas2dRenderer')",
    'isCanvas2dRendererId(renderer)',
    "liveCanvasHeroEmbedPreviewSurface === 'storyboard'",
    '<StoryboardWidgetCanvasLazy active storyboardWidgetSurfaceId="storyboard" storyboardCardsMode />',
    'data-kg-live-canvas-hero-embed-surface={liveCanvasHeroEmbedPreviewSurface || \'flow\'}',
  ]) {
    if (!viewport.includes(contract)) throw new Error(`expected shared Canvas Embed renderer contract ${contract}`)
  }
  if (CANONICAL_STARTUP_DOCUMENT_PATH !== XR_PHYSICS_DEMO_PUBLISHED_CANONICAL_PATH) {
    throw new Error(`expected the canonical startup identity to resolve the Physics Playground, got ${CANONICAL_STARTUP_DOCUMENT_PATH}`)
  }
  if (!heroRuntime.includes('isRootAlias ? resolveCanonicalStartupCanvasEmbedRuntimeUrl()')) {
    throw new Error('expected every apex Dev origin to initialize the canonical same-runtime Physics Playground')
  }
  if (!presets.includes("url.searchParams.set('kgPreview', '1')")) {
    throw new Error('expected the canonical Home background to isolate its shell without overriding source-owned XR startup')
  }
  if (!heroRuntime.includes('isRootAlias ? CANONICAL_STARTUP_DOCUMENT_PATH : source?.sourcePath')) {
    throw new Error('expected the apex source identity and embedded document to share one canonical owner')
  }
}
