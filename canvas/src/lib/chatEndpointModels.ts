export const CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT = 'seed-2-0-lite-260228'
export const CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT = 'seedream-4-0-250828'
export const CHAT_BYTEPLUS_IMAGE_MODEL_OPTIONS = [
  CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT,
  'seedream-4-5-251128',
  'seedream-5-0-260128',
] as const
export const CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT = 'seedance-1-0-pro-fast-251015'
export const CHAT_BYTEPLUS_VIDEO_MODEL_OPTIONS = [
  CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
  'seedance-1-5-pro-251215',
  'dreamina-seedance-2-0-fast-260128',
  'dreamina-seedance-2-0-260128',
] as const
export const CHAT_BYTEPLUS_TEXT_MODEL_OPTIONS = [
  CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
  'seed-2-0-pro-260328',
  'seed-1-8-251228',
] as const
export const CHAT_BYTEPLUS_MODEL_OPTIONS = [
  ...CHAT_BYTEPLUS_TEXT_MODEL_OPTIONS,
  ...CHAT_BYTEPLUS_IMAGE_MODEL_OPTIONS,
  ...CHAT_BYTEPLUS_VIDEO_MODEL_OPTIONS,
] as const
export const CHAT_OPENAI_MODEL_OPTIONS = [
  'gpt-5-nano',
  'gpt-5-mini',
  'gpt-5',
  'gpt-5.1',
  'gpt-5.2',
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-nano',
  'gpt-4.1-mini',
  'gpt-4.1',
] as const
export const CHAT_MIROMIND_MODEL_OPTIONS = ['mirothinker-1-7-deepresearch-mini', 'mirothinker-1-7-deepresearch'] as const
export const CHAT_AGNES_MODEL_OPTIONS = ['agnes-2.0-flash'] as const
export const CHAT_SEALION_MODEL_OPTIONS = [
  'aisingapore/Qwen-SEA-LION-v4.5-27B-IT',
  'aisingapore/Gemma-SEA-LION-v4.5-E2B-IT',
  'aisingapore/Llama-SEA-LION-v3.5-70B-R',
  'aisingapore/SEA-Guard',
] as const
export const CHAT_QWEN_MODEL_OPTIONS = [
  'qwen-plus',
  'qwen-plus-latest',
  'qwen3-max',
  'qwen3-max-preview',
  'qwen-flash',
  'qwen3-next-80b-a3b-instruct',
  'qwen3-next-80b-a3b-thinking',
  'qwen3-235b-a22b-instruct-2507',
  'qwen3-235b-a22b-thinking-2507',
  'qwen3-32b',
  'qwen3-14b',
  'qwen3-8b',
] as const
export const CHAT_GOOGLE_CLOUD_MODEL_OPTIONS = [
  'google/gemini-2.0-flash-001',
  'google/gemini-1.5-flash-001',
  'google/gemini-1.5-pro-001',
  'google/gemini-2.5-flash-preview-09-2025',
  'google/gemini-2.5-flash-lite-preview-09-2025',
] as const
export const CHAT_LOCAL_MODEL_OPTIONS = ['qwen/qwen3.5-9b@q4_k_m'] as const
export const CHAT_GEMINI_VIDEO_MODEL_DEFAULT = 'veo-3.1-generate-preview'
export const CHAT_GEMINI_VIDEO_MODEL_OPTIONS = [
  CHAT_GEMINI_VIDEO_MODEL_DEFAULT,
  'veo-3.1-fast-generate-preview',
  'veo-3.1-lite-generate-preview',
  'veo-3.0-generate-001',
  'veo-2.0-generate-001',
] as const
export const CHAT_GEMINI_TEXT_MODEL_DEFAULT = 'gemini-3-flash-preview'
export const CHAT_GEMINI_TEXT_MODEL_OPTIONS = [
  CHAT_GEMINI_TEXT_MODEL_DEFAULT,
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash',
] as const
export const CHAT_GEMINI_MODEL_OPTIONS = [
  ...CHAT_GEMINI_TEXT_MODEL_OPTIONS,
  ...CHAT_GEMINI_VIDEO_MODEL_OPTIONS,
] as const
export const CHAT_DEFAULT_MODEL = CHAT_OPENAI_MODEL_OPTIONS[0]
export const CHAT_LOCAL_DEFAULT_MODEL = CHAT_LOCAL_MODEL_OPTIONS[0]
export const CHAT_SHARED_MODEL_CATALOG_OPTIONS = [
  ...CHAT_OPENAI_MODEL_OPTIONS,
  ...CHAT_MIROMIND_MODEL_OPTIONS,
  ...CHAT_AGNES_MODEL_OPTIONS,
  ...CHAT_SEALION_MODEL_OPTIONS,
  ...CHAT_QWEN_MODEL_OPTIONS,
  ...CHAT_GOOGLE_CLOUD_MODEL_OPTIONS,
  ...CHAT_BYTEPLUS_MODEL_OPTIONS,
  ...CHAT_LOCAL_MODEL_OPTIONS,
] as const
export const CHAT_MODEL_ID_BY_INPUT_VARIANT: Record<string, string> = {
  'gpt-5 nano': 'gpt-5-nano',
  'gpt-5 mini': 'gpt-5-mini',
  'gpt-4.1 nano': 'gpt-4.1-nano',
  'gpt-4.1 mini': 'gpt-4.1-mini',
  'sealion qwen v4.5': 'aisingapore/Qwen-SEA-LION-v4.5-27B-IT',
  'sea-lion qwen v4.5': 'aisingapore/Qwen-SEA-LION-v4.5-27B-IT',
  'sealion gemma v4.5 e2b': 'aisingapore/Gemma-SEA-LION-v4.5-E2B-IT',
  'sea-lion gemma v4.5 e2b': 'aisingapore/Gemma-SEA-LION-v4.5-E2B-IT',
  'sealion guard': 'aisingapore/SEA-Guard',
  'sea-guard': 'aisingapore/SEA-Guard',
  'seedream-4.0': 'seedream-4-0-250828',
  'seedream-4.5': 'seedream-4-5-251128',
  'seedream-5.0': 'seedream-5-0-260128',
}
