import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildVideoAgentValidationUrlOptions,
  mergeVideoAgentValidationConfigs,
  normalizeVideoAgentValidationConfig,
  readVideoAgentValidationConfigFromRuntimeInput,
  readVideoAgentValidationConfigFromStorage,
  serializeVideoAgentValidationUrls,
  splitVideoAgentValidationUrls,
  writeVideoAgentValidationConfigToStorage,
} from '@/features/video-agent'
import { VISUAL_ANNOTATION_E2E_CANVAS_2D_RENDERERS, isVisualAnnotationE2eCanvas2dRenderer } from '@/lib/config.render'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number {
    return this.values.size
  }
  clear(): void {
    this.values.clear()
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.values.delete(key)
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

export function testVideoAgentValidationConfigSupportsUserConfiguredImportUrls() {
  const operatorDocPath = '/operator/configured/video-agent-validation.md'
  const operatorUrls = [
    'https://video.example.test/source-a',
    'https://video.example.test/source-b',
  ]
  const normalizedUrls = splitVideoAgentValidationUrls(`${operatorUrls[0]}\n${operatorUrls[1]},${operatorUrls[0]}`)
  if (normalizedUrls.length !== 2 || normalizedUrls[0] !== operatorUrls[0] || normalizedUrls[1] !== operatorUrls[1]) {
    throw new Error(`expected validation URL normalization to dedupe operator input, got ${JSON.stringify(normalizedUrls)}`)
  }
  const storage = new MemoryStorage()
  writeVideoAgentValidationConfigToStorage({ validationDocPath: operatorDocPath, importUrls: normalizedUrls }, storage)
  const storedConfig = readVideoAgentValidationConfigFromStorage(storage)
  if (!storedConfig || storedConfig.validationDocPath !== operatorDocPath || storedConfig.importUrls.join('|') !== operatorUrls.join('|')) {
    throw new Error(`expected storage-backed video-agent validation config, got ${JSON.stringify(storedConfig)}`)
  }
  const normalizedConfig = normalizeVideoAgentValidationConfig({
    validationDocPath: `  ${operatorDocPath}  `,
    importUrls: [operatorUrls[0], operatorUrls[1], operatorUrls[0]],
  })
  if (
    normalizedConfig.validationDocPath !== operatorDocPath
    || serializeVideoAgentValidationUrls(normalizedConfig.importUrls) !== operatorUrls.join('\n')
  ) {
    throw new Error(`expected normalized operator validation config, got ${JSON.stringify(normalizedConfig)}`)
  }
  const runtimeConfig = readVideoAgentValidationConfigFromRuntimeInput({
    metadata: {
      frontmatterMeta: {
        videoAgentRuntimeContract: {
          testUrls: operatorUrls,
        },
      },
    },
    nodes: [
      {
        properties: {
          data_json: JSON.stringify({
            sourceVideo: {
              url: operatorUrls[0],
              testUrls: operatorUrls,
              externalDependency: false,
            },
          }),
        },
      },
    ],
  })
  if (runtimeConfig.importUrls.join('|') !== operatorUrls.join('|')) {
    throw new Error(`expected runtime validation config to derive the full active document URL set, got ${JSON.stringify(runtimeConfig)}`)
  }
  const mergedRuntimeConfig = mergeVideoAgentValidationConfigs({ importUrls: [] }, runtimeConfig)
  const optionLabels = buildVideoAgentValidationUrlOptions(mergedRuntimeConfig.importUrls).map(option => option.label)
  if (optionLabels.join('|') !== 'URL 1|URL 2') {
    throw new Error(`expected validation URL options for each configured test URL, got ${JSON.stringify(optionLabels)}`)
  }
  const visualAnnotationRendererIds = VISUAL_ANNOTATION_E2E_CANVAS_2D_RENDERERS.join('|')
  if (
    visualAnnotationRendererIds !== 'media|storyboard'
    || !isVisualAnnotationE2eCanvas2dRenderer('media')
    || !isVisualAnnotationE2eCanvas2dRenderer('storyboard')
    || isVisualAnnotationE2eCanvas2dRenderer('d3')
  ) {
    throw new Error(`expected Media and Storyboard to share the visual annotation E2E runtime, got ${visualAnnotationRendererIds}`)
  }

  const configSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'video-agent', 'videoAgentValidationConfig.ts'), 'utf8')
  const validationControlsSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'video-agent', 'VideoAgentValidationImportControls.tsx'), 'utf8')
  const launchImportSource = readFileSync(resolve(process.cwd(), 'src', 'lib', 'toolbar', 'LaunchDropdownImportUrlItem.tsx'), 'utf8')
  const importUrlPromptSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'toolbar', 'ImportUrlPrompt.tsx'), 'utf8')
  if (
    !configSource.includes('VIDEO_AGENT_VALIDATION_CONFIG_STORAGE_KEY')
    || !configSource.includes('VITE_AGENTIC_OS_VIDEO_AGENT_VALIDATION_DOC_PATH')
    || !configSource.includes('VITE_AGENTIC_OS_VIDEO_AGENT_VALIDATION_URLS')
  ) {
    throw new Error('expected video-agent validation config to expose one storage and env owner')
  }
  for (const requiredUiToken of [
    'VideoAgentValidationImportControls',
    'Video-agent validation import controls',
    'Video-agent validation document path',
    'Video-agent validation import URLs',
    'optionMode="select"',
    'onBeforeImport={beforeValidationImport}',
    'onSelectUrl={url =>',
    'optionButtonLabel={option => `Use ${option.label}`}',
    'readVideoAgentValidationConfigFromRuntimeInput',
    'mergeVideoAgentValidationConfigs',
    'buildVideoAgentValidationUrlOptions',
    'presetOptions={importUrlPresetOptions}',
  ]) {
    if (!launchImportSource.includes(requiredUiToken)) {
      throw new Error(`expected Launch Import URL UI to expose ${requiredUiToken}`)
    }
  }
  for (const requiredPromptToken of [
    'presetOptions?: ReadonlyArray<ImportUrlPromptPreset>',
    'const presetOptions = React.useMemo(() => {',
    'return provided.filter(option => {',
  ]) {
    if (!importUrlPromptSource.includes(requiredPromptToken)) {
      throw new Error(`expected Import URL prompt to expose ${requiredPromptToken}`)
    }
  }
  for (const requiredSharedToken of [
    'readVideoAgentValidationConfigFromRuntimeInput',
    'writeVideoAgentValidationConfig',
    'getMarkdownWorkspaceActionBridge',
    "optionMode === 'select'",
    'data-kg-video-agent-validation-url-option',
    'Import set',
    'aria-busy={importRunning}',
    'for (const url of validationImportUrls) await importValidationUrl(url)',
    'data-kg-video-agent-validation-import-state',
  ]) {
    if (!validationControlsSource.includes(requiredSharedToken)) {
      throw new Error(`expected shared video-agent validation controls to expose ${requiredSharedToken}`)
    }
  }
  if (
    launchImportSource.includes('readVideoAgentValidationConfig(')
    || launchImportSource.includes('writeVideoAgentValidationConfig(')
    || launchImportSource.includes('readVideoAgentValidationConfigFromEnv')
    || launchImportSource.includes('readVideoAgentValidationConfigFromStorage')
    || launchImportSource.includes('writeVideoAgentValidationConfigToStorage')
  ) {
    throw new Error('expected Launch Import URL to delegate video-agent validation config state to the shared owner')
  }
  if (launchImportSource.includes('Use first')) {
    throw new Error('expected Launch Import URL validation UI to preserve the full URL set instead of collapsing to the first URL')
  }
  for (const forbidden of ['video-db', 'VideoDB', '@video-db', 'Director(', 'VIDEODB_API_KEY', 'youtu.be/']) {
    if (configSource.includes(forbidden) || launchImportSource.includes(forbidden) || validationControlsSource.includes(forbidden)) {
      throw new Error(`expected user-configurable validation owners to avoid hardcoded external dependency or URL token ${forbidden}`)
    }
  }
}
