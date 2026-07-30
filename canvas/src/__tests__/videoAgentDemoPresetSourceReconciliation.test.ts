import {
  reconcileVideoAgentDemoPresetWorkspaceSource,
  resolveVideoAgentDemoMirrorText,
} from '@/features/chat/videoAgentDemoPreset'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'

export async function testFloatingPanelChatVideoPresetRepairsDriftedRuntimeMirrorFromCanonicalSource() {
  const workspace = createMemoryWorkspaceFs()
  await workspace.ensureSeed()
  await workspace.createFolder({ parentPath: '/', name: 'docs' })
  const presetPath = '/docs/knowgrph-agentic-video-canvas-demo.md'
  const driftedRuntimeText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: generated_media_only',
    '      type: RichMediaPanel',
    '---',
  ].join('\n')
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: video_text_generation',
    '      type: TextGeneration',
    '    - id: video_image_generation',
    '      type: ImageGeneration',
    '    - id: video_clip_generation',
    '      type: VideoGeneration',
    '---',
  ].join('\n')
  const canonicalMirrorText = resolveVideoAgentDemoMirrorText([
    { relPath: 'AI视频-港岛实景写实风-异城算计与女主绝境求生-终极统一执行总表.md', text: canonicalText },
  ], 'docs/AI视频-港岛实景写实风-异城算计与女主绝境求生-终极统一执行总表.md')
  if (canonicalMirrorText !== canonicalText) {
    throw new Error('expected a configured docs root to resolve a workspace:/docs source reference')
  }
  await workspace.createFile({
    parentPath: '/docs',
    name: 'knowgrph-agentic-video-canvas-demo.md',
    text: driftedRuntimeText,
  })

  const selectedText = await reconcileVideoAgentDemoPresetWorkspaceSource({
    fs: workspace,
    presetPath,
    workspaceText: driftedRuntimeText,
    canonicalText,
    preferCanonicalSource: true,
  })

  if (selectedText !== canonicalText || await workspace.readFileText(presetPath) !== canonicalText) {
    throw new Error('expected Load preset to rematerialize the canonical source over a generated-media-only runtime mirror')
  }
}
