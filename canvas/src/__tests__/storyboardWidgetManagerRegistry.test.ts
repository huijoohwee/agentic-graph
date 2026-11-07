import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
  normalizeWidgetRegistryEntries,
  ensureDefaultWidgetRegistryEntries,
  readValidatedWidgetRegistryMetadataEntries,
  readWidgetRegistryFromStorage,
  validateWidgetRegistryEntry,
  writeWidgetRegistryToStorage,
} from '@/hooks/store/storyboardWidgetManagerSlice'
import {
  buildTextGenerationRegistryDraft,
  getWidgetRegistryEntryLabel,
  isPropsPanelWidgetPaletteEntry,
  listVisibleWidgetRegistryPortsForPropsEditor,
  normalizeTextGenerationWidgetPropertiesForProviderFamily,
  resolveEffectiveTextGenerationWidgetProperties,
} from '@/features/storyboard-widget-manager/registryTemplates'
import { inferTextGenerationProviderFamily } from '@/features/storyboard-widget-manager/textGenerationProviderFamily'
import {
  FLOW_GRABMAPS_DISCOVERY_FORM_ID,
  FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID,
  FLOW_GRABMAPS_DISCOVERY_WIDGET_TYPE_ID,
} from '@/features/storyboard-widget-manager/grabMapsDiscoveryWidget'
import {
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_FORM_ID,
  FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_SCRIPT_FORM_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
} from '@/lib/config'
import {
  CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
  CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
  CHAT_OPENAI_ENDPOINT_URL,
  CHAT_PROVIDER_BYTEPLUS,
  CHAT_PROVIDER_OPENAI,
} from '@/lib/chatEndpoint'
export {
  testStoryboardWidgetManagerResolvesWidgetRegistryApiDocRefs,
  testStoryboardWidgetManagerResolvesWidgetRegistryMainPanelLinks,
} from './storyboardWidgetManagerRegistry.links'

export function testStoryboardWidgetManagerRegistryValidatesAndNormalizes() {
  const valid = validateWidgetRegistryEntry({
    id: 'e1',
    isEnabled: true,
    nodeTypeId: 'Schema',
    widgetTypeId: 'Widget',
    formId: 'default',
    fields: [{ fieldKey: 'label', fieldType: 'text', schemaPath: 'label' }],
    ports: [],
    updatedAt: new Date().toISOString(),
  })
  if (!valid) throw new Error('expected entry to validate')

  const invalidEmpty = validateWidgetRegistryEntry({
    id: 'e2',
    isEnabled: true,
    nodeTypeId: 'Schema',
    widgetTypeId: 'Widget',
    formId: 'default',
    fields: [],
    ports: [],
    updatedAt: new Date().toISOString(),
  })
  if (invalidEmpty) throw new Error('expected entry with no fields/ports to be rejected')

  const normalized = normalizeWidgetRegistryEntries([
    {
      id: 'e1',
      isEnabled: true,
      nodeTypeId: 'B',
      widgetTypeId: 'Widget',
      formId: 'default',
      fields: [{ fieldKey: 'label', fieldType: 'text' }],
      ports: [],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'e0',
      isEnabled: true,
      nodeTypeId: 'A',
      widgetTypeId: 'Widget',
      formId: 'default',
      fields: [{ fieldKey: 'label', fieldType: 'text' }],
      ports: [],
      updatedAt: new Date().toISOString(),
    },
  ])
  if (normalized.length !== 2) throw new Error('expected two entries after normalization')
  if (normalized[0].nodeTypeId !== 'A') throw new Error('expected normalization to sort by nodeTypeId')

  const validatedFromMetadata = readValidatedWidgetRegistryMetadataEntries({
    'flow:widgetRegistry': [
      {
        id: 'meta-valid',
        isEnabled: true,
        nodeTypeId: 'Schema',
        widgetTypeId: 'Widget',
        formId: 'metadata',
        fields: [{ fieldKey: 'label', fieldType: 'text', schemaPath: 'label' }],
        ports: [],
        updatedAt: new Date().toISOString(),
      },
      {
        id: '',
        isEnabled: true,
        nodeTypeId: 'Broken',
        widgetTypeId: 'Widget',
        formId: 'broken',
        fields: [],
        ports: [],
        updatedAt: new Date().toISOString(),
      },
    ],
  })
  if (validatedFromMetadata.length !== 1) throw new Error('expected validated metadata reader to keep only valid widget registry entries')
  if (validatedFromMetadata[0]?.id !== 'meta-valid') throw new Error('expected validated metadata reader to preserve the valid widget registry entry')
}

export function testStoryboardWidgetManagerRegistryStorageRoundTrip() {
  const storage = new MemoryStorage()
  const entries = [
    {
      id: 'e1',
      isEnabled: true,
      nodeTypeId: 'Schema',
      widgetTypeId: 'Widget',
      formId: 'default',
      fields: [{ fieldKey: 'label', fieldType: 'text', schemaPath: 'label' }],
      ports: [{ direction: 'input' as const, portKey: 'field:id' }],
      updatedAt: new Date().toISOString(),
    },
  ]

  writeWidgetRegistryToStorage(storage, entries)
  const reread = readWidgetRegistryFromStorage(storage)
  if (reread.length !== 1) throw new Error('expected one entry after read')
  if (reread[0].id !== 'e1') throw new Error('expected id to round trip')
  if (reread[0].ports.length !== 1) throw new Error('expected ports to round trip')
}

export function testStoryboardWidgetManagerSeedsDefaultRegistryEntriesAndConsolidatesPropsPanelMedia() {
  const empty = ensureDefaultWidgetRegistryEntries([], '2026-02-06T00:00:00.000Z')
  if (!empty.changed) throw new Error('expected seeding to report changed=true')
  const seeded = empty.entries
  const imageFound = seeded.find(
    e => e.nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID && e.widgetTypeId === 'default' && e.formId === 'imageGeneration',
  )
  const found = seeded.find(
    e => e.nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID && e.widgetTypeId === 'default' && e.formId === 'videoGeneration',
  )
  const textFound = seeded.find(
    e => e.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID && e.widgetTypeId === 'default' && e.formId === 'textGeneration',
  )
  const videoScriptFound = seeded.find(
    e => e.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID && e.widgetTypeId === 'default' && e.formId === FLOW_VIDEO_SCRIPT_FORM_ID,
  )
  const openAiVideoScriptFound = seeded.find(
    e => e.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID && e.widgetTypeId === 'default' && e.formId === FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID,
  )
  const richMediaPanelFound = seeded.find(
    e => e.nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID && e.widgetTypeId === 'default' && e.formId === 'richMediaPanel',
  )
  const storyboardElementFound = seeded.find(
    e => e.nodeTypeId === FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID && e.widgetTypeId === 'default' && e.formId === FLOW_STORYBOARD_ELEMENT_FORM_ID,
  )
  const discoveryFound = seeded.find(
    e => e.nodeTypeId === FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID && e.widgetTypeId === FLOW_GRABMAPS_DISCOVERY_WIDGET_TYPE_ID && e.formId === FLOW_GRABMAPS_DISCOVERY_FORM_ID,
  )
  if (seeded.length !== 4) throw new Error(`expected four neutral default registry entries, got ${seeded.length}`)
  if (!imageFound) throw new Error('expected Image Widget mapping')
  if (!textFound) throw new Error('expected Widget Card mapping')
  if (videoScriptFound) throw new Error('expected default registry seed to omit provider-specific Video Script Widget mapping')
  if (openAiVideoScriptFound) throw new Error('expected default registry seed to omit provider-specific OpenAI Video Script Widget mapping')
  if (!richMediaPanelFound) throw new Error('expected Rich Media Panel mapping')
  if (storyboardElementFound) throw new Error('expected default registry seed to omit Storyboard Element mapping')
  if (discoveryFound) throw new Error('expected default registry seed to omit GrabMaps Chat Discovery Widget mapping')
  if (!found) throw new Error('expected Generate Video mapping')
  if (getWidgetRegistryEntryLabel(textFound) !== 'Widget Card') throw new Error('expected default text palette label to stay neutral')
  if (getWidgetRegistryEntryLabel(imageFound) !== 'Image Widget') throw new Error('expected default image palette label to stay neutral')
  if (getWidgetRegistryEntryLabel(found) !== 'Video Widget') throw new Error('expected default video palette label to stay neutral')
  const propsPanelPaletteLabels = seeded
    .filter(entry => isPropsPanelWidgetPaletteEntry(entry))
    .map(entry => getWidgetRegistryEntryLabel(entry))
  if (propsPanelPaletteLabels.join('|') !== 'Rich Media Panel|Widget Card') {
    throw new Error(`expected Props Panel palette to consolidate Image/Video creation into Rich Media Panel, got ${propsPanelPaletteLabels.join(', ')}`)
  }

  const stable = ensureDefaultWidgetRegistryEntries(seeded, '2026-02-06T00:00:00.000Z')
  if (stable.changed) throw new Error('expected seeding to be idempotent')
}

export function testStoryboardWidgetManagerReconcilesStaleBuiltInTextRegistryEntry() {
  const stale = ensureDefaultWidgetRegistryEntries([
    {
      id: 'legacy-text',
      isEnabled: true,
      nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'textGeneration',
      fields: [
        { fieldKey: 'chatProvider', fieldType: 'text', schemaPath: 'properties.chatProvider' },
        { fieldKey: 'chatApiKey', fieldType: 'text', schemaPath: 'properties.chatApiKey' },
        { fieldKey: 'aspect_ratio', fieldType: 'select', schemaPath: 'properties.aspect_ratio' },
      ],
      ports: [{ portKey: 'prompt_in', direction: 'input', schemaPath: 'properties.prompt' }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ] as any, '2026-02-06T00:00:00.000Z')
  if (!stale.changed) throw new Error('expected stale built-in text entry to be reconciled')
  const reconciled = stale.entries.find(
    e => e.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID && e.widgetTypeId === 'default' && e.formId === 'textGeneration',
  )
  if (!reconciled) throw new Error('expected reconciled built-in text entry')
  const fieldKeys = new Set(reconciled.fields.map(field => field.fieldKey))
  ;['chatResponseFormatJson', 'chatThinkingJson', 'chatTopP', 'chatMessagesJson'].forEach(key => {
    if (!fieldKeys.has(key)) throw new Error(`expected reconciled built-in text entry to add ${key}`)
  })
  ;['chatApiKey', 'aspect_ratio'].forEach(key => {
    if (fieldKeys.has(key)) throw new Error(`expected reconciled built-in text entry to remove stale key ${key}`)
  })
  const stable = ensureDefaultWidgetRegistryEntries(stale.entries, '2026-02-06T00:00:00.000Z')
  if (stable.changed) throw new Error('expected stale built-in text entry reconciliation to become idempotent after repair')
}

export function testStoryboardWidgetManagerBuildsReusableTextRegistryDrafts() {
  const openAiDraft = buildTextGenerationRegistryDraft({ providerFamily: 'openai' })
  if (openAiDraft.nodeTypeId !== FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
    throw new Error(`expected openai text draft to reuse TextGeneration node type, got ${String(openAiDraft.nodeTypeId)}`)
  }
  if (openAiDraft.formId !== 'textGeneration.openai') {
    throw new Error(`expected openai text draft to keep a provider-specific form id, got ${String(openAiDraft.formId)}`)
  }
  if (!openAiDraft.fields.some(field => field.fieldKey === 'chatModel')) {
    throw new Error('expected reusable text draft to keep the shared chatModel field')
  }
  const openAiFieldKeys = new Set(openAiDraft.fields.map(field => field.fieldKey))
  ;['chatMessagesJson', 'chatResponseFormatJson', 'chatToolsJson', 'chatToolChoiceJson', 'chatTopP'].forEach(key => {
    if (!openAiFieldKeys.has(key)) {
      throw new Error(`expected openai text draft to expose ${key}`)
    }
  })
  ;['chatThinkingJson', 'chatThinkingType', 'chatServiceTier'].forEach(key => {
    if (openAiFieldKeys.has(key)) {
      throw new Error(`expected openai text draft to avoid BytePlus-only field ${key}`)
    }
  })

  const bytePlusDraft = buildTextGenerationRegistryDraft({ providerFamily: 'byteplus' })
  const bytePlusFieldKeys = new Set(bytePlusDraft.fields.map(field => field.fieldKey))
  ;['chatResponseFormatJson', 'chatThinkingJson', 'chatTopP', 'chatMessagesJson', 'chatToolsJson'].forEach(key => {
    if (!bytePlusFieldKeys.has(key)) {
      throw new Error(`expected byteplus text draft to expose ${key}`)
    }
  })
  ;['chatApiKey', 'aspect_ratio', 'duration', 'resolution', 'generate_audio', 'reference_image', 'fast'].forEach(key => {
    if (bytePlusFieldKeys.has(key)) {
      throw new Error(`expected byteplus text draft to exclude stale or non-chat field ${key}`)
    }
  })
  ;(['byteplus', 'lmstudio-local', 'openai', 'miromind', 'agnes', 'sealion', 'qwen', 'google-cloud'] as const).forEach(providerFamily => {
    const draft = buildTextGenerationRegistryDraft({ providerFamily })
    const label = getWidgetRegistryEntryLabel({ nodeTypeId: draft.nodeTypeId, formId: draft.formId })
    if (label !== 'Widget Card') {
      throw new Error(`expected ${providerFamily} compatibility form to use the canonical Widget Card label, got ${String(label)}`)
    }
  })
}

export function testStoryboardWidgetManagerDoesNotSeedOpenAiTextRegistryEntry() {
  const seeded = ensureDefaultWidgetRegistryEntries([], '2026-02-06T00:00:00.000Z')
  const openAiEntry = seeded.entries.find(entry => entry.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID && entry.formId === 'textGeneration.openai')
  if (openAiEntry) throw new Error('expected default widget registry seed to omit OpenAI text widget entry')
  const openAiDraft = buildTextGenerationRegistryDraft({ providerFamily: 'openai' })
  const fieldKeys = new Set((openAiDraft.fields || []).map(field => field.fieldKey))
  ;['chatMessagesJson', 'chatResponseFormatJson', 'chatToolsJson'].forEach(key => {
    if (!fieldKeys.has(key)) throw new Error(`expected OpenAI text widget draft to expose ${key}`)
  })
}

export function testStoryboardWidgetManagerDoesNotSeedGrabMapsDiscoveryRegistryEntry() {
  const seeded = ensureDefaultWidgetRegistryEntries([], '2026-02-06T00:00:00.000Z')
  const discoveryEntry = seeded.entries.find(
    entry => entry.nodeTypeId === FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID && entry.formId === FLOW_GRABMAPS_DISCOVERY_FORM_ID,
  )
  if (discoveryEntry) throw new Error('expected default widget registry seed to omit GrabMaps Chat Discovery Widget entry')
  const normalized = normalizeWidgetRegistryEntries([
    {
      id: 'grabmaps-discovery',
      isEnabled: true,
      nodeTypeId: FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID,
      widgetTypeId: FLOW_GRABMAPS_DISCOVERY_WIDGET_TYPE_ID,
      formId: FLOW_GRABMAPS_DISCOVERY_FORM_ID,
      fields: [{ fieldKey: 'searchQuery', fieldType: 'text', schemaPath: 'properties.searchQuery' }],
      ports: [{ direction: 'input' as const, portKey: 'query_in', schemaPath: 'properties.searchQuery' }],
      updatedAt: '2026-04-24T00:00:00.000Z',
    },
  ] as any)
  const normalizedDiscovery = normalized.find(entry => entry.nodeTypeId === FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID)
  if (!normalizedDiscovery) throw new Error('expected document-provided GrabMaps Chat Discovery Widget entry to stay normalizable')
  const label = getWidgetRegistryEntryLabel(normalizedDiscovery)
  if (label !== 'GrabMaps Chat Discovery Widget') throw new Error(`expected explicit discovery widget label to stay specific, got ${String(label)}`)
}

export function testStoryboardWidgetManagerCanonicalizesConflictingGrabMapsDiscoveryRegistryEntry() {
  const normalized = normalizeWidgetRegistryEntries([
    {
      id: 'legacy-grabmaps-video-collision',
      isEnabled: true,
      nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: FLOW_GRABMAPS_DISCOVERY_FORM_ID,
      fields: [
        { fieldKey: 'model', fieldType: 'text', schemaPath: 'properties.model' },
        { fieldKey: 'aspect_ratio', fieldType: 'select', schemaPath: 'properties.aspect_ratio' },
        { fieldKey: 'duration', fieldType: 'number', schemaPath: 'properties.duration' },
        { fieldKey: 'resolution', fieldType: 'select', schemaPath: 'properties.resolution' },
        { fieldKey: 'generate_audio', fieldType: 'boolean', schemaPath: 'properties.generate_audio' },
      ],
      ports: [],
      updatedAt: '2026-04-24T00:00:00.000Z',
    },
  ] as any)
  const discoveryEntries = normalized.filter(
    entry =>
      entry.nodeTypeId === FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID
      || entry.formId === FLOW_GRABMAPS_DISCOVERY_FORM_ID,
  )
  if (discoveryEntries.length !== 1) {
    throw new Error(`expected exactly one canonical GrabMaps Chat Discovery Widget entry after normalization, got ${discoveryEntries.length}`)
  }
  const discoveryEntry = discoveryEntries[0]!
  if (discoveryEntry.nodeTypeId !== FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID) {
    throw new Error(`expected conflicting discovery entry to normalize to ${FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID}, got ${String(discoveryEntry.nodeTypeId)}`)
  }
  if (discoveryEntry.widgetTypeId !== FLOW_GRABMAPS_DISCOVERY_WIDGET_TYPE_ID) {
    throw new Error(`expected conflicting discovery entry to normalize widgetTypeId to ${FLOW_GRABMAPS_DISCOVERY_WIDGET_TYPE_ID}, got ${String(discoveryEntry.widgetTypeId)}`)
  }
  const fieldKeys = new Set((discoveryEntry.fields || []).map(field => field.fieldKey))
  ;['chatModel', 'searchQuery', 'searchCountry', 'nearbyRadiusKm', 'nearbyRankBy'].forEach(key => {
    if (!fieldKeys.has(key)) throw new Error(`expected canonicalized GrabMaps Chat Discovery Widget entry to expose ${key}`)
  })
  ;['model', 'aspect_ratio', 'duration', 'resolution', 'generate_audio'].forEach(key => {
    if (fieldKeys.has(key)) throw new Error(`expected canonicalized GrabMaps Chat Discovery Widget entry to remove conflicting stale field ${key}`)
  })
}

export function testStoryboardWidgetManagerCanonicalizesConflictingBuiltInWidgetForms() {
  const normalized = normalizeWidgetRegistryEntries([
    {
      id: 'legacy-image-collision',
      isEnabled: true,
      nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'imageGeneration',
      fields: [
        { fieldKey: 'aspect_ratio', fieldType: 'select', schemaPath: 'properties.aspect_ratio' },
        { fieldKey: 'duration', fieldType: 'select', schemaPath: 'properties.duration' },
      ],
      ports: [],
      updatedAt: '2026-04-24T00:00:00.000Z',
    },
    {
      id: 'legacy-video-collision',
      isEnabled: true,
      nodeTypeId: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'videoGeneration',
      fields: [
        { fieldKey: 'size', fieldType: 'select', schemaPath: 'properties.size' },
        { fieldKey: 'output_format', fieldType: 'select', schemaPath: 'properties.output_format' },
      ],
      ports: [],
      updatedAt: '2026-04-24T00:00:00.000Z',
    },
    {
      id: 'legacy-text-collision',
      isEnabled: true,
      nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'textGeneration',
      fields: [
        { fieldKey: 'resolution', fieldType: 'select', schemaPath: 'properties.resolution' },
        { fieldKey: 'generate_audio', fieldType: 'boolean', schemaPath: 'properties.generate_audio' },
      ],
      ports: [],
      updatedAt: '2026-04-24T00:00:00.000Z',
    },
    {
      id: 'legacy-openai-collision',
      isEnabled: true,
      nodeTypeId: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'textGeneration.openai',
      fields: [
        { fieldKey: 'size', fieldType: 'select', schemaPath: 'properties.size' },
        { fieldKey: 'watermark', fieldType: 'boolean', schemaPath: 'properties.watermark' },
      ],
      ports: [],
      updatedAt: '2026-04-24T00:00:00.000Z',
    },
  ] as any)

  const imageEntry = normalized.find(entry => entry.formId === 'imageGeneration')
  if (!imageEntry) throw new Error('expected canonical imageGeneration entry after normalization')
  if (imageEntry.nodeTypeId !== FLOW_IMAGE_GENERATION_NODE_TYPE_ID) {
    throw new Error(`expected imageGeneration to normalize to ${FLOW_IMAGE_GENERATION_NODE_TYPE_ID}, got ${String(imageEntry.nodeTypeId)}`)
  }
  const imageFieldKeys = new Set((imageEntry.fields || []).map(field => field.fieldKey))
  ;['model', 'size', 'output_format', 'aspect_ratio', 'reference_image'].forEach(key => {
    if (!imageFieldKeys.has(key)) throw new Error(`expected canonical imageGeneration entry to expose ${key}`)
  })
  ;['duration', 'generate_audio'].forEach(key => {
    if (imageFieldKeys.has(key)) throw new Error(`expected canonical imageGeneration entry to remove stale key ${key}`)
  })

  const videoEntry = normalized.find(entry => entry.formId === 'videoGeneration')
  if (!videoEntry) throw new Error('expected canonical videoGeneration entry after normalization')
  if (videoEntry.nodeTypeId !== FLOW_VIDEO_GENERATION_NODE_TYPE_ID) {
    throw new Error(`expected videoGeneration to normalize to ${FLOW_VIDEO_GENERATION_NODE_TYPE_ID}, got ${String(videoEntry.nodeTypeId)}`)
  }
  const videoFieldKeys = new Set((videoEntry.fields || []).map(field => field.fieldKey))
  ;['model', 'ratio', 'resolution', 'duration', 'generate_audio'].forEach(key => {
    if (!videoFieldKeys.has(key)) throw new Error(`expected canonical videoGeneration entry to expose ${key}`)
  })
  ;['size', 'output_format', 'aspect_ratio'].forEach(key => {
    if (videoFieldKeys.has(key)) throw new Error(`expected canonical videoGeneration entry to remove stale key ${key}`)
  })

  const byteplusTextEntry = normalized.find(entry => entry.formId === 'textGeneration')
  if (!byteplusTextEntry) throw new Error('expected canonical textGeneration entry after normalization')
  if (byteplusTextEntry.nodeTypeId !== FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
    throw new Error(`expected textGeneration to normalize to ${FLOW_TEXT_GENERATION_NODE_TYPE_ID}, got ${String(byteplusTextEntry.nodeTypeId)}`)
  }
  const byteplusTextFieldKeys = new Set((byteplusTextEntry.fields || []).map(field => field.fieldKey))
  ;['chatMessagesJson', 'chatResponseFormatJson', 'chatThinkingJson', 'chatTopP'].forEach(key => {
    if (!byteplusTextFieldKeys.has(key)) throw new Error(`expected canonical textGeneration entry to expose ${key}`)
  })
  ;['resolution', 'generate_audio', 'aspect_ratio', 'duration'].forEach(key => {
    if (byteplusTextFieldKeys.has(key)) throw new Error(`expected canonical textGeneration entry to remove stale key ${key}`)
  })

  const openAiTextEntry = normalized.find(entry => entry.formId === 'textGeneration.openai')
  if (!openAiTextEntry) throw new Error('expected canonical textGeneration.openai entry after normalization')
  if (openAiTextEntry.nodeTypeId !== FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
    throw new Error(`expected textGeneration.openai to normalize to ${FLOW_TEXT_GENERATION_NODE_TYPE_ID}, got ${String(openAiTextEntry.nodeTypeId)}`)
  }
  const openAiTextFieldKeys = new Set((openAiTextEntry.fields || []).map(field => field.fieldKey))
  ;['chatMessagesJson', 'chatResponseFormatJson', 'chatTopP', 'chatParallelToolCalls'].forEach(key => {
    if (!openAiTextFieldKeys.has(key)) throw new Error(`expected canonical textGeneration.openai entry to expose ${key}`)
  })
  ;['size', 'watermark', 'resolution', 'generate_audio'].forEach(key => {
    if (openAiTextFieldKeys.has(key)) throw new Error(`expected canonical textGeneration.openai entry to remove stale key ${key}`)
  })
}

export function testStoryboardWidgetManagerReconcilesTextWidgetProviderFromSelectedModel() {
  const family = inferTextGenerationProviderFamily({
    provider: { key: 'chatProvider', type: 'string', value: CHAT_PROVIDER_BYTEPLUS },
    endpointUrl: { key: 'chatEndpointUrl', type: 'string', value: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL },
    model: { key: 'chatModel', type: 'string', value: 'gpt-5-nano' },
    widgetTypeId: 'default',
    formId: 'textGeneration',
  })
  if (family !== 'openai') {
    throw new Error(`expected the selected GPT model to repair a stale BytePlus Widget tuple, got ${String(family)}`)
  }

  const normalized = normalizeTextGenerationWidgetPropertiesForProviderFamily({
    providerFamily: family,
    properties: {
      chatProvider: CHAT_PROVIDER_BYTEPLUS,
      chatEndpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
      chatModel: 'gpt-5-nano',
      prompt: 'hello',
    },
  })
  if (String(normalized.chatProvider || '') !== CHAT_PROVIDER_OPENAI) {
    throw new Error(`expected model-derived provider ${CHAT_PROVIDER_OPENAI}`)
  }
  if (String(normalized.chatEndpointUrl || '') !== CHAT_OPENAI_ENDPOINT_URL) {
    throw new Error(`expected model-derived endpoint ${CHAT_OPENAI_ENDPOINT_URL}`)
  }
  if (String(normalized.chatModel || '') !== 'gpt-5-nano') {
    throw new Error(`expected selected model gpt-5-nano, got ${String(normalized.chatModel)}`)
  }

  const effective = resolveEffectiveTextGenerationWidgetProperties({
    providerFamily: 'byteplus',
    localProperties: {
      prompt: 'hello',
    },
    globalProperties: {
      chatProvider: 'byteplus-modelark',
      chatEndpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
      chatModel: CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
    },
  })
  if (String(effective.chatProvider || '') !== CHAT_PROVIDER_BYTEPLUS) {
    throw new Error(`expected effective BytePlus widget properties to fall back to global provider ${CHAT_PROVIDER_BYTEPLUS}`)
  }
  if (String(effective.chatEndpointUrl || '') !== CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL) {
    throw new Error(`expected effective BytePlus widget properties to fall back to global endpoint ${CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL}`)
  }
  if (String(effective.chatModel || '') !== CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT) {
    throw new Error(`expected effective BytePlus widget properties to fall back to global model ${CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT}`)
  }
}

export function testStoryboardWidgetManagerFiltersBytePlusTextInputRegistryPortsInPropsEditor() {
  const bytePlusVisiblePorts = listVisibleWidgetRegistryPortsForPropsEditor({
    registryEntry: {
      nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'textGeneration',
      ports: [
        { portKey: 'prompt_in', direction: 'input', schemaPath: 'properties.prompt' },
        { portKey: 'text_out', direction: 'output', schemaPath: 'properties.output' },
      ],
    },
    properties: {},
  })
  if (bytePlusVisiblePorts.some(port => port.portKey === 'prompt_in')) {
    throw new Error('expected BytePlus text widget props editor to hide input registry port rows')
  }
  if (!bytePlusVisiblePorts.some(port => port.portKey === 'text_out')) {
    throw new Error('expected BytePlus text widget props editor to keep output registry port rows')
  }

  const openAiVisiblePorts = listVisibleWidgetRegistryPortsForPropsEditor({
    registryEntry: {
      nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'textGeneration.openai',
      ports: [
        { portKey: 'prompt_in', direction: 'input', schemaPath: 'properties.prompt' },
      ],
    },
    properties: {
      chatProvider: 'openai',
    },
  })
  if (!openAiVisiblePorts.some(port => port.portKey === 'prompt_in')) {
    throw new Error('expected OpenAI text widget props editor to keep input registry port rows')
  }
}
