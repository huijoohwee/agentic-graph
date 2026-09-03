export type OpenAiImagesApiDocRow = {
  key: string
  typeLabel: string
  value: string
  responsibility: string
  options?: readonly string[]
  valueKey?: string
  notes?: string
  searchHints?: string[]
  tooltipDefaultValue?: string | number | boolean | null
  tooltipMin?: string | number
  tooltipMax?: string | number
  tooltipInterval?: string | number
  tooltipExpansionNote?: string
  tooltipContractionNote?: string
  tooltipImpact?: string
  modules?: string[]
  classes?: string[]
  functions?: string[]
}

const OPENAI_IMAGES_MODEL_DEFAULT = 'gpt-image-2'
const OPENAI_IMAGES_MODEL_OPTIONS = [OPENAI_IMAGES_MODEL_DEFAULT, 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini', 'dall-e-3', 'dall-e-2'] as const
const OPENAI_IMAGES_SIZE_OPTIONS = ['auto', '1024x1024', '1536x1024', '1024x1536', '256x256', '512x512', '1792x1024', '1024x1792'] as const
const OPENAI_IMAGES_QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high', 'standard', 'hd'] as const
const OPENAI_IMAGES_BACKGROUND_OPTIONS = ['auto', 'transparent', 'opaque'] as const
const OPENAI_IMAGES_OUTPUT_FORMAT_OPTIONS = ['png', 'jpeg', 'webp'] as const
const OPENAI_IMAGES_RESPONSE_FORMAT_OPTIONS = ['url', 'b64_json'] as const
const OPENAI_IMAGES_MODERATION_OPTIONS = ['auto', 'low'] as const
const OPENAI_IMAGES_STYLE_OPTIONS = ['vivid', 'natural'] as const

export const OPENAI_IMAGES_API_DOC_ROWS: ReadonlyArray<OpenAiImagesApiDocRow> = [
  {
    key: 'provider',
    typeLabel: 'string',
    value: 'openai',
    responsibility: 'Provider pin -> keep OpenAI Images API rows bound to the OpenAI provider family.',
    tooltipDefaultValue: 'openai',
    modules: ['canvas/src/features/panels/views/useSettingsView.ts'],
    classes: ['VirtualSettingsEntry'],
    functions: ['resolveIntegrationEntryMeta'],
  },
  {
    key: 'auth_mode',
    typeLabel: 'string',
    value: 'serverManaged',
    valueKey: 'chatAuthMode',
    responsibility: 'Auth mode selector -> default image requests to server-managed Cloudflare/dev proxy secrets and allow memory-only BYOK only as explicit fallback.',
    tooltipDefaultValue: 'serverManaged',
    searchHints: ['openai image auth mode byok server-managed Cloudflare secret'],
    modules: ['canvas/src/hooks/store/uiSlice.ts', 'canvas/src/features/settings/registry-ui.ui.ts'],
    classes: ['GraphState'],
    functions: ['setChatAuthMode'],
  },
  {
    key: 'api_key',
    typeLabel: 'string',
    value: '',
    valueKey: 'chatApiKey',
    responsibility: 'Credential input -> reuse the shared memory-only OpenAI BYOK secret for image generation when explicit fallback auth is selected.',
    tooltipDefaultValue: '',
    searchHints: ['openai image api key credential'],
    modules: ['canvas/src/hooks/store/uiSlice.ts', 'canvas/src/features/settings/registry-ui.ui.ts'],
    classes: ['GraphState'],
    functions: ['setChatApiKey'],
  },
  {
    key: 'endpoint',
    typeLabel: 'string',
    value: 'POST /images/generations',
    responsibility: 'Endpoint reference -> send image creation requests to OpenAI images generations route.',
    searchHints: ['openai images generations endpoint'],
    modules: ['docs/documents/agentic-graph-api-reference/api-reference-index_202604261230/openai-images-api-reference-index.md'],
    classes: ['Request body'],
    functions: ['POST /images/generations'],
  },
  {
    key: 'model',
    typeLabel: 'enum',
    value: 'gpt-image-2 | gpt-image-1.5 | gpt-image-1 | gpt-image-1-mini | dall-e-3 | dall-e-2',
    options: OPENAI_IMAGES_MODEL_OPTIONS,
    responsibility: 'Model selector -> choose the OpenAI image model for generation.',
    tooltipDefaultValue: OPENAI_IMAGES_MODEL_DEFAULT,
    searchHints: ['gpt-image-2 gpt-image-1.5 gpt-image-1 gpt-image-1-mini dall-e-3 dall-e-2 model'],
    modules: ['docs/documents/agentic-graph-api-reference/api-reference-index_202604261230/openai-images-api-reference-index.md'],
    classes: ['ImageModel'],
    functions: ['Create image'],
  },
  {
    key: 'prompt',
    typeLabel: 'string',
    value: '',
    responsibility: 'Prompt input -> describe the target image content.',
    tooltipDefaultValue: '',
    searchHints: ['prompt image description'],
    modules: ['docs/documents/agentic-graph-api-reference/api-reference-index_202604261230/openai-images-api-reference-index.md'],
    classes: ['Request body'],
    functions: ['Create image'],
  },
  {
    key: 'size',
    typeLabel: 'enum',
    value: 'auto | 1024x1024 | 1536x1024 | 1024x1536 | 256x256 | 512x512 | 1792x1024 | 1024x1792',
    options: OPENAI_IMAGES_SIZE_OPTIONS,
    responsibility: 'Size selector -> control output dimensions for generated image.',
    tooltipDefaultValue: 'auto',
    searchHints: ['size 1024x1024 1536x1024 1024x1536 auto 256x256 512x512 1792x1024 1024x1792'],
  },
  {
    key: 'quality',
    typeLabel: 'enum',
    value: 'auto | low | medium | high | standard | hd',
    options: OPENAI_IMAGES_QUALITY_OPTIONS,
    responsibility: 'Quality selector -> tune image fidelity against cost/latency.',
    tooltipDefaultValue: 'auto',
    searchHints: ['quality auto low medium high standard hd'],
  },
  {
    key: 'background',
    typeLabel: 'enum',
    value: 'auto | transparent | opaque',
    options: OPENAI_IMAGES_BACKGROUND_OPTIONS,
    responsibility: 'Background mode -> choose transparent/opaque/auto background behavior.',
    tooltipDefaultValue: 'auto',
    searchHints: ['background transparent opaque auto'],
  },
  {
    key: 'output_format',
    typeLabel: 'enum',
    value: 'png | jpeg | webp',
    options: OPENAI_IMAGES_OUTPUT_FORMAT_OPTIONS,
    responsibility: 'Output encoder -> choose generated image format.',
    tooltipDefaultValue: 'png',
    searchHints: ['output format png jpeg webp'],
  },
  {
    key: 'response_format',
    typeLabel: 'enum',
    value: 'url | b64_json',
    options: OPENAI_IMAGES_RESPONSE_FORMAT_OPTIONS,
    responsibility: 'Response transport -> choose url or base64 JSON return mode for dall-e.',
    tooltipDefaultValue: 'url',
    searchHints: ['response format url b64_json'],
  },
  {
    key: 'n',
    typeLabel: 'integer',
    value: '1',
    responsibility: 'Count control -> set number of images to generate per request.',
    tooltipDefaultValue: 1,
    tooltipMin: 1,
    tooltipMax: 10,
    tooltipInterval: 1,
    searchHints: ['n count image outputs'],
  },
  {
    key: 'moderation',
    typeLabel: 'enum',
    value: 'auto | low',
    options: OPENAI_IMAGES_MODERATION_OPTIONS,
    responsibility: 'Moderation mode -> choose low or auto moderation policy for GPT image models.',
    tooltipDefaultValue: 'auto',
    searchHints: ['moderation low auto'],
  },
  {
    key: 'stream',
    typeLabel: 'boolean',
    value: 'false',
    responsibility: 'Streaming toggle -> enable partial image events for GPT image models.',
    tooltipDefaultValue: false,
    searchHints: ['stream partial images'],
  },
  {
    key: 'partial_images',
    typeLabel: 'integer',
    value: '0',
    responsibility: 'Partial frame count -> configure number of partial images in streaming mode.',
    tooltipDefaultValue: 0,
    tooltipMin: 0,
    tooltipMax: 3,
    tooltipInterval: 1,
    searchHints: ['partial images streaming'],
  },
  {
    key: 'output_compression',
    typeLabel: 'integer',
    value: '100',
    responsibility: 'Compression level -> tune JPEG/WebP compression percentage for GPT image output.',
    tooltipDefaultValue: 100,
    tooltipMin: 0,
    tooltipMax: 100,
    tooltipInterval: 1,
    searchHints: ['output compression jpeg webp'],
  },
  {
    key: 'style',
    typeLabel: 'enum',
    value: 'vivid | natural',
    options: OPENAI_IMAGES_STYLE_OPTIONS,
    responsibility: 'Style selector -> pick vivid or natural style for dall-e-3 generation.',
    tooltipDefaultValue: 'vivid',
    searchHints: ['style vivid natural dalle-3'],
  },
  {
    key: 'user',
    typeLabel: 'string',
    value: '',
    responsibility: 'End-user identifier -> pass caller user id for safety telemetry.',
    tooltipDefaultValue: '',
    searchHints: ['end-user id abuse monitoring'],
  },
]

export const OPENAI_IMAGES_KEY_ACTIONS_BY_VALUE_KEY: Readonly<Record<string, string[]>> = {
  chatAuthMode: ['select auth mode', 'choose image credential flow'],
  chatApiKey: ['hold memory-only BYOK secret', 'authorize proxied image requests'],
}

export const OPENAI_IMAGES_VALUE_TOOLTIP_BY_ROW_KEY: Readonly<Record<string, {
  defaultValue?: string | number | boolean | null
  min?: string | number
  max?: string | number
  interval?: string | number
  expansionNote?: string
  contractionNote?: string
  impact?: string
}>> = {
  provider: { defaultValue: 'openai' },
  auth_mode: { defaultValue: 'serverManaged' },
  api_key: { defaultValue: '' },
  model: { defaultValue: OPENAI_IMAGES_MODEL_DEFAULT },
  prompt: { defaultValue: '' },
  size: { defaultValue: '1024x1024' },
  quality: { defaultValue: 'auto' },
  background: { defaultValue: 'auto' },
  output_format: { defaultValue: 'png' },
  response_format: { defaultValue: 'url' },
  n: { defaultValue: 1, min: 1, max: 10, interval: 1 },
  moderation: { defaultValue: 'auto' },
  stream: { defaultValue: false },
  partial_images: { defaultValue: 0, min: 0, max: 3, interval: 1 },
  output_compression: { defaultValue: 100, min: 0, max: 100, interval: 1 },
  style: { defaultValue: 'vivid' },
  user: { defaultValue: '' },
}
