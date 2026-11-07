import {
  resolveWidgetRegistryApiDocRef,
  resolveWidgetRegistryMainPanelLink,
} from '@/features/storyboard-widget-manager/registryTemplates'
import {
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
} from '@/lib/config'

export function testStoryboardWidgetManagerResolvesWidgetRegistryApiDocRefs() {
  const bytePlusPrompt = resolveWidgetRegistryApiDocRef({
    registryEntry: {
      nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'textGeneration',
    },
    properties: {},
    fieldKey: 'prompt',
    schemaPath: 'properties.prompt',
  })
  if (!bytePlusPrompt || bytePlusPrompt.rowKey !== 'byteplusApi.messages.content.text' || bytePlusPrompt.apiKey !== 'messages.content.text') {
    throw new Error(`expected BytePlus text widget prompt doc ref, got ${JSON.stringify(bytePlusPrompt)}`)
  }

  const openAiPrompt = resolveWidgetRegistryApiDocRef({
    registryEntry: {
      nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'textGeneration.openai',
    },
    properties: {
      chatProvider: 'openai',
    },
    fieldKey: 'prompt',
    schemaPath: 'properties.prompt',
  })
  if (!openAiPrompt || openAiPrompt.rowKey !== 'openaiApi.input' || openAiPrompt.apiKey !== 'input') {
    throw new Error(`expected OpenAI text widget prompt doc ref, got ${JSON.stringify(openAiPrompt)}`)
  }

  const videoOutput = resolveWidgetRegistryApiDocRef({
    registryEntry: {
      nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'videoGeneration',
    },
    properties: {},
    portKey: 'videoUrl',
  })
  if (!videoOutput || videoOutput.rowKey !== 'byteplusVideoApi.polling_endpoint' || videoOutput.apiKey !== 'polling_endpoint') {
    throw new Error(`expected BytePlus video widget output doc ref, got ${JSON.stringify(videoOutput)}`)
  }
}

export function testStoryboardWidgetManagerResolvesWidgetRegistryMainPanelLinks() {
  const openAiPromptLink = resolveWidgetRegistryMainPanelLink({
    registryEntry: {
      nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'textGeneration.openai',
    },
    properties: {
      chatProvider: 'openai',
    },
    portKey: 'prompt_in',
  })
  if (!openAiPromptLink || openAiPromptLink.tab !== 'integrations' || openAiPromptLink.searchQuery !== 'openaiApi.input' || openAiPromptLink.anchorId !== 'openai-chat-api-row-openaiapi-input') {
    throw new Error(`expected OpenAI text widget main-panel link, got ${JSON.stringify(openAiPromptLink)}`)
  }

  const bytePlusVideoLink = resolveWidgetRegistryMainPanelLink({
    registryEntry: {
      nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'videoGeneration',
    },
    properties: {},
    portKey: 'videoUrl',
  })
  if (!bytePlusVideoLink || bytePlusVideoLink.tab !== 'integrations' || bytePlusVideoLink.searchQuery !== 'byteplusVideoApi.polling_endpoint' || bytePlusVideoLink.anchorId !== 'byteplus-video-generation-api-row-byteplusvideoapi-polling-endpoint') {
    throw new Error(`expected BytePlus video widget main-panel link, got ${JSON.stringify(bytePlusVideoLink)}`)
  }
}
