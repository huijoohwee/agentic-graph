import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  CHAT_AGNES_BASE,
  CHAT_AGNES_ENDPOINT_URL,
  CHAT_PROXY_AI_GATEWAY_CACHE_TTL_HEADER,
  CHAT_PROXY_AI_GATEWAY_METADATA_HEADER,
  CHAT_PROXY_AI_GATEWAY_ROUTE_HEADER,
  CHAT_BYTEPLUS_AP_SOUTHEAST_BASE,
  CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
  CHAT_GEMINI_BASE,
  CHAT_GEMINI_ENDPOINT_URL,
  CHAT_GEMINI_MODEL_OPTIONS,
  CHAT_GOOGLE_CLOUD_ENDPOINT_URL,
  CHAT_GOOGLE_CLOUD_MODEL_OPTIONS,
  CHAT_LOCAL_DEFAULT_MODEL,
  CHAT_MIROMIND_BASE,
  CHAT_MIROMIND_ENDPOINT_URL,
  CHAT_OPENAI_ENDPOINT_URL,
  CHAT_QWEN_BASE,
  CHAT_QWEN_ENDPOINT_URL,
  CHAT_QWEN_MODEL_OPTIONS,
  CHAT_SEALION_BASE,
  CHAT_SEALION_ENDPOINT_URL,
  CHAT_SEALION_MODEL_OPTIONS,
  CHAT_OPENAI_MODEL_OPTIONS,
  CHAT_PROVIDER_AGNES,
  CHAT_PROVIDER_BYTEPLUS,
  CHAT_PROVIDER_GEMINI,
  CHAT_PROVIDER_GOOGLE_CLOUD,
  CHAT_PROVIDER_LM_STUDIO,
  CHAT_PROVIDER_MIROMIND,
  CHAT_PROVIDER_OPENAI,
  CHAT_PROVIDER_QWEN,
  CHAT_PROVIDER_SEALION,
  buildChatProxyHeaders,
  getChatModelOptions,
  getChatProviderCredentialLabel,
  getChatProviderLabel,
  getChatProviderRegionLabel,
  getSharedChatModelCatalogOptions,
  normalizeChatModelIdForProvider,
  resolveChatModelIdForProvider,
  resolveChatEndpointForModels,
  resolveChatEndpointForRequest,
} from '@/lib/chatEndpoint'
import { inferChatProviderFromEndpointUrl, inferChatProviderFromModelId } from '@/lib/chatEndpointProviderInference'
import { resolveChatModelSelectionValues } from '@/lib/chatProviderSelection'

export function testBytePlusProviderBuildsOfficialProxyHeaders() {
  const headers = buildChatProxyHeaders({
    provider: CHAT_PROVIDER_BYTEPLUS,
    apiKey: 'byteplus-secret',
    endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
    clientRequestId: 'kg-byteplus-test-123',
  })
  if (headers['X-KG-Chat-Provider'] !== CHAT_PROVIDER_BYTEPLUS) {
    throw new Error(`expected BytePlus provider header, got ${JSON.stringify(headers)}`)
  }
  if (headers['X-KG-Chat-Upstream'] !== 'https://ark.ap-southeast.bytepluses.com') {
    throw new Error(`expected BytePlus upstream header, got ${JSON.stringify(headers)}`)
  }
  if (headers['X-KG-Chat-Api-Key'] !== 'byteplus-secret') {
    throw new Error(`expected BytePlus API key header, got ${JSON.stringify(headers)}`)
  }
  if (headers['X-Client-Request-Id'] !== 'kg-byteplus-test-123') {
    throw new Error(`expected client request id header, got ${JSON.stringify(headers)}`)
  }
}

export function testGeminiProviderRoutesAndCredentialsSeparatelyFromVertex() {
  const headers = buildChatProxyHeaders({
    provider: CHAT_PROVIDER_GEMINI,
    apiKey: 'gemini-secret',
    endpointUrl: CHAT_GEMINI_ENDPOINT_URL,
    clientRequestId: 'kg-gemini-test-123',
  })
  const requestPath = resolveChatEndpointForRequest(CHAT_GEMINI_ENDPOINT_URL)
  const providerLabel = getChatProviderLabel(CHAT_PROVIDER_GEMINI)
  const credentialLabel = getChatProviderCredentialLabel(CHAT_PROVIDER_GEMINI)
  const vertexCredentialLabel = getChatProviderCredentialLabel(CHAT_PROVIDER_GOOGLE_CLOUD)
  const modelOptions = getChatModelOptions(CHAT_PROVIDER_GEMINI)

  if (headers['X-KG-Chat-Provider'] !== CHAT_PROVIDER_GEMINI) {
    throw new Error(`expected Gemini provider header, got ${JSON.stringify(headers)}`)
  }
  if (headers['X-KG-Chat-Upstream'] !== CHAT_GEMINI_BASE) {
    throw new Error(`expected Gemini upstream header, got ${JSON.stringify(headers)}`)
  }
  if (headers['X-KG-Chat-Api-Key'] !== 'gemini-secret') {
    throw new Error(`expected Gemini API key header, got ${JSON.stringify(headers)}`)
  }
  if (requestPath !== '/__chat_proxy/v1beta/openai/chat/completions') {
    throw new Error(`unexpected Gemini request path: ${JSON.stringify(requestPath)}`)
  }
  if (providerLabel !== 'Google Gemini' || credentialLabel !== 'Google Gemini API key') {
    throw new Error(`expected direct Gemini provider and API key labels, got ${JSON.stringify({ providerLabel, credentialLabel })}`)
  }
  if (vertexCredentialLabel !== 'Google Cloud Vertex AI OAuth access token') {
    throw new Error(`expected a Vertex OAuth credential label, got ${JSON.stringify(vertexCredentialLabel)}`)
  }
  if (modelOptions[0] !== CHAT_GEMINI_MODEL_OPTIONS[0]) {
    throw new Error(`unexpected Gemini model options: ${JSON.stringify(modelOptions)}`)
  }
}

export function testOpenAiDraftRouteBuildsAiGatewayHeaders() {
  const headers = buildChatProxyHeaders({
    provider: CHAT_PROVIDER_OPENAI,
    endpointUrl: CHAT_OPENAI_ENDPOINT_URL,
    clientRequestId: 'kg-openai-aig-draft',
    aiGateway: {
      route: 'dynamic/draft',
      metadata: {
        intent: 'draft',
        request_surface: 'responses',
        storage_target: 'chatHistory',
        context_scope: 'workspace',
        request_id: 'kg-openai-aig-draft',
      },
      cacheTtlSeconds: 120,
    },
  })
  if (headers[CHAT_PROXY_AI_GATEWAY_ROUTE_HEADER] !== 'dynamic/draft') {
    throw new Error(`expected AI Gateway dynamic route header, got ${JSON.stringify(headers)}`)
  }
  if (headers[CHAT_PROXY_AI_GATEWAY_CACHE_TTL_HEADER] !== '120') {
    throw new Error(`expected AI Gateway cache TTL header, got ${JSON.stringify(headers)}`)
  }
  const metadata = JSON.parse(String(headers[CHAT_PROXY_AI_GATEWAY_METADATA_HEADER] || '{}')) as Record<string, unknown>
  if (metadata.intent !== 'draft' || metadata.request_surface !== 'responses') {
    throw new Error(`expected AI Gateway metadata header, got ${JSON.stringify(headers)}`)
  }
}

export function testOfficialEndpointsNormalizeToProxyPaths() {
  const bytePlusRequest = resolveChatEndpointForRequest(CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL)
  const bytePlusModels = resolveChatEndpointForModels(CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL)
  const bytePlusBaseRequest = resolveChatEndpointForRequest(`${CHAT_BYTEPLUS_AP_SOUTHEAST_BASE}/api/v3`)
  const bytePlusBaseModels = resolveChatEndpointForModels(`${CHAT_BYTEPLUS_AP_SOUTHEAST_BASE}/api/v3`)
  const bytePlusProxyBaseRequest = resolveChatEndpointForRequest('/__chat_proxy/api/v3')
  const bytePlusProxyBaseModels = resolveChatEndpointForModels('/__chat_proxy/api/v3')
  const miromindHeaders = buildChatProxyHeaders({
    provider: CHAT_PROVIDER_MIROMIND,
    apiKey: 'miromind-secret',
    endpointUrl: CHAT_MIROMIND_ENDPOINT_URL,
    clientRequestId: 'kg-miromind-test-123',
  })
  const miromindRequest = resolveChatEndpointForRequest(CHAT_MIROMIND_ENDPOINT_URL)
  const miromindBaseRequest = resolveChatEndpointForRequest(CHAT_MIROMIND_BASE)
  const miromindModels = resolveChatEndpointForModels(CHAT_MIROMIND_ENDPOINT_URL)
  const miromindRegion = getChatProviderRegionLabel(CHAT_PROVIDER_MIROMIND, CHAT_MIROMIND_ENDPOINT_URL)
  const miromindLabel = getChatProviderLabel(CHAT_PROVIDER_MIROMIND)
  const miromindModelOptions = getChatModelOptions(CHAT_PROVIDER_MIROMIND)
  const agnesHeaders = buildChatProxyHeaders({
    provider: CHAT_PROVIDER_AGNES,
    apiKey: 'agnes-secret',
    endpointUrl: CHAT_AGNES_ENDPOINT_URL,
    clientRequestId: 'kg-agnes-test-123',
  })
  const agnesRequest = resolveChatEndpointForRequest(CHAT_AGNES_ENDPOINT_URL)
  const agnesBaseRequest = resolveChatEndpointForRequest(CHAT_AGNES_BASE)
  const agnesModels = resolveChatEndpointForModels(CHAT_AGNES_ENDPOINT_URL)
  const agnesRegion = getChatProviderRegionLabel(CHAT_PROVIDER_AGNES, CHAT_AGNES_ENDPOINT_URL)
  const agnesLabel = getChatProviderLabel(CHAT_PROVIDER_AGNES)
  const agnesModelOptions = getChatModelOptions(CHAT_PROVIDER_AGNES)
  const sealionHeaders = buildChatProxyHeaders({
    provider: CHAT_PROVIDER_SEALION,
    apiKey: 'sealion-secret',
    endpointUrl: CHAT_SEALION_ENDPOINT_URL,
    clientRequestId: 'kg-sealion-test-123',
  })
  const sealionRequest = resolveChatEndpointForRequest(CHAT_SEALION_ENDPOINT_URL)
  const sealionBaseRequest = resolveChatEndpointForRequest(CHAT_SEALION_BASE)
  const sealionModels = resolveChatEndpointForModels(CHAT_SEALION_ENDPOINT_URL)
  const sealionRegion = getChatProviderRegionLabel(CHAT_PROVIDER_SEALION, CHAT_SEALION_ENDPOINT_URL)
  const sealionLabel = getChatProviderLabel(CHAT_PROVIDER_SEALION)
  const sealionModelOptions = getChatModelOptions(CHAT_PROVIDER_SEALION)
  const qwenHeaders = buildChatProxyHeaders({
    provider: CHAT_PROVIDER_QWEN,
    apiKey: 'qwen-secret',
    endpointUrl: CHAT_QWEN_ENDPOINT_URL,
    clientRequestId: 'kg-qwen-test-123',
  })
  const qwenRequest = resolveChatEndpointForRequest(CHAT_QWEN_ENDPOINT_URL)
  const qwenBaseRequest = resolveChatEndpointForRequest(`${CHAT_QWEN_BASE}/compatible-mode/v1`)
  const qwenProxyBaseRequest = resolveChatEndpointForRequest('/__chat_proxy/compatible-mode/v1')
  const qwenModels = resolveChatEndpointForModels(CHAT_QWEN_ENDPOINT_URL)
  const qwenBaseModels = resolveChatEndpointForModels(`${CHAT_QWEN_BASE}/compatible-mode/v1`)
  const qwenRegion = getChatProviderRegionLabel(CHAT_PROVIDER_QWEN, CHAT_QWEN_ENDPOINT_URL)
  const qwenLabel = getChatProviderLabel(CHAT_PROVIDER_QWEN)
  const qwenModelOptions = getChatModelOptions(CHAT_PROVIDER_QWEN)
  const googleCloudHeaders = buildChatProxyHeaders({
    provider: CHAT_PROVIDER_GOOGLE_CLOUD,
    apiKey: 'google-cloud-token',
    endpointUrl: CHAT_GOOGLE_CLOUD_ENDPOINT_URL,
    clientRequestId: 'kg-google-cloud-test-123',
  })
  const googleCloudRequest = resolveChatEndpointForRequest(CHAT_GOOGLE_CLOUD_ENDPOINT_URL)
  const googleCloudBaseRequest = resolveChatEndpointForRequest(CHAT_GOOGLE_CLOUD_ENDPOINT_URL.replace('/chat/completions', ''))
  const googleCloudModels = resolveChatEndpointForModels(CHAT_GOOGLE_CLOUD_ENDPOINT_URL)
  const googleCloudRegion = getChatProviderRegionLabel(CHAT_PROVIDER_GOOGLE_CLOUD, CHAT_GOOGLE_CLOUD_ENDPOINT_URL)
  const googleCloudLabel = getChatProviderLabel(CHAT_PROVIDER_GOOGLE_CLOUD)
  const googleCloudModelOptions = getChatModelOptions(CHAT_PROVIDER_GOOGLE_CLOUD)
  const openAiRequest = resolveChatEndpointForRequest(CHAT_OPENAI_ENDPOINT_URL)
  const bytePlusRegion = getChatProviderRegionLabel(CHAT_PROVIDER_BYTEPLUS, CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL)
  const openAiLabel = getChatProviderLabel(CHAT_PROVIDER_OPENAI)

  if (bytePlusRequest !== '/__chat_proxy/api/v3/chat/completions') {
    throw new Error(`unexpected BytePlus request path: ${JSON.stringify(bytePlusRequest)}`)
  }
  if (bytePlusModels !== '/__chat_proxy/api/v3/models') {
    throw new Error(`unexpected BytePlus models path: ${JSON.stringify(bytePlusModels)}`)
  }
  if (bytePlusBaseRequest !== '/__chat_proxy/api/v3/chat/completions') {
    throw new Error(`unexpected BytePlus base request path: ${JSON.stringify(bytePlusBaseRequest)}`)
  }
  if (bytePlusBaseModels !== '/__chat_proxy/api/v3/models') {
    throw new Error(`unexpected BytePlus base models path: ${JSON.stringify(bytePlusBaseModels)}`)
  }
  if (bytePlusProxyBaseRequest !== '/__chat_proxy/api/v3/chat/completions') {
    throw new Error(`unexpected BytePlus proxy base request path: ${JSON.stringify(bytePlusProxyBaseRequest)}`)
  }
  if (bytePlusProxyBaseModels !== '/__chat_proxy/api/v3/models') {
    throw new Error(`unexpected BytePlus proxy base models path: ${JSON.stringify(bytePlusProxyBaseModels)}`)
  }
  if (miromindHeaders['X-KG-Chat-Provider'] !== CHAT_PROVIDER_MIROMIND) {
    throw new Error(`expected MiroMind provider header, got ${JSON.stringify(miromindHeaders)}`)
  }
  if (miromindHeaders['X-KG-Chat-Upstream'] !== CHAT_MIROMIND_BASE) {
    throw new Error(`expected MiroMind upstream header, got ${JSON.stringify(miromindHeaders)}`)
  }
  if (miromindHeaders['X-KG-Chat-Api-Key'] !== 'miromind-secret') {
    throw new Error(`expected MiroMind API key header, got ${JSON.stringify(miromindHeaders)}`)
  }
  if (miromindHeaders['X-Client-Request-Id'] !== 'kg-miromind-test-123') {
    throw new Error(`expected MiroMind client request id header, got ${JSON.stringify(miromindHeaders)}`)
  }
  if (agnesHeaders['X-KG-Chat-Provider'] !== CHAT_PROVIDER_AGNES) {
    throw new Error(`expected Agnes provider header, got ${JSON.stringify(agnesHeaders)}`)
  }
  if (agnesHeaders['X-KG-Chat-Upstream'] !== CHAT_AGNES_BASE) {
    throw new Error(`expected Agnes upstream header, got ${JSON.stringify(agnesHeaders)}`)
  }
  if (agnesHeaders['X-KG-Chat-Api-Key'] !== 'agnes-secret') {
    throw new Error(`expected Agnes API key header, got ${JSON.stringify(agnesHeaders)}`)
  }
  if (agnesHeaders['X-Client-Request-Id'] !== 'kg-agnes-test-123') {
    throw new Error(`expected Agnes client request id header, got ${JSON.stringify(agnesHeaders)}`)
  }
  if (sealionHeaders['X-KG-Chat-Provider'] !== CHAT_PROVIDER_SEALION) {
    throw new Error(`expected SEA-LION provider header, got ${JSON.stringify(sealionHeaders)}`)
  }
  if (sealionHeaders['X-KG-Chat-Upstream'] !== CHAT_SEALION_BASE) {
    throw new Error(`expected SEA-LION upstream header, got ${JSON.stringify(sealionHeaders)}`)
  }
  if (sealionHeaders['X-KG-Chat-Api-Key'] !== 'sealion-secret') {
    throw new Error(`expected SEA-LION API key header, got ${JSON.stringify(sealionHeaders)}`)
  }
  if (sealionHeaders['X-Client-Request-Id'] !== 'kg-sealion-test-123') {
    throw new Error(`expected SEA-LION client request id header, got ${JSON.stringify(sealionHeaders)}`)
  }
  if (qwenHeaders['X-KG-Chat-Provider'] !== CHAT_PROVIDER_QWEN) {
    throw new Error(`expected Qwen provider header, got ${JSON.stringify(qwenHeaders)}`)
  }
  if (qwenHeaders['X-KG-Chat-Upstream'] !== CHAT_QWEN_BASE) {
    throw new Error(`expected Qwen upstream header, got ${JSON.stringify(qwenHeaders)}`)
  }
  if (qwenHeaders['X-KG-Chat-Api-Key'] !== 'qwen-secret') {
    throw new Error(`expected Qwen API key header, got ${JSON.stringify(qwenHeaders)}`)
  }
  if (qwenHeaders['X-Client-Request-Id'] !== 'kg-qwen-test-123') {
    throw new Error(`expected Qwen client request id header, got ${JSON.stringify(qwenHeaders)}`)
  }
  if (googleCloudHeaders['X-KG-Chat-Provider'] !== CHAT_PROVIDER_GOOGLE_CLOUD) {
    throw new Error(`expected Google Cloud provider header, got ${JSON.stringify(googleCloudHeaders)}`)
  }
  if (googleCloudHeaders['X-KG-Chat-Upstream'] !== 'https://us-central1-aiplatform.googleapis.com') {
    throw new Error(`expected Google Cloud upstream header, got ${JSON.stringify(googleCloudHeaders)}`)
  }
  if (googleCloudHeaders['X-KG-Chat-Api-Key'] !== 'google-cloud-token') {
    throw new Error(`expected Google Cloud access token header, got ${JSON.stringify(googleCloudHeaders)}`)
  }
  if (googleCloudHeaders['X-Client-Request-Id'] !== 'kg-google-cloud-test-123') {
    throw new Error(`expected Google Cloud client request id header, got ${JSON.stringify(googleCloudHeaders)}`)
  }
  if (miromindRequest !== '/__chat_proxy/v1/chat/completions') {
    throw new Error(`unexpected MiroMind request path: ${JSON.stringify(miromindRequest)}`)
  }
  if (miromindBaseRequest !== '/__chat_proxy/v1/chat/completions') {
    throw new Error(`unexpected MiroMind base request path: ${JSON.stringify(miromindBaseRequest)}`)
  }
  if (miromindModels !== '/__chat_proxy/v1/models') {
    throw new Error(`unexpected MiroMind models path: ${JSON.stringify(miromindModels)}`)
  }
  if (agnesRequest !== '/__chat_proxy/v1/chat/completions') {
    throw new Error(`unexpected Agnes request path: ${JSON.stringify(agnesRequest)}`)
  }
  if (agnesBaseRequest !== '/__chat_proxy/v1/chat/completions') {
    throw new Error(`unexpected Agnes base request path: ${JSON.stringify(agnesBaseRequest)}`)
  }
  if (agnesModels !== '/__chat_proxy/v1/models') {
    throw new Error(`unexpected Agnes models path: ${JSON.stringify(agnesModels)}`)
  }
  if (sealionRequest !== '/__chat_proxy/v1/chat/completions') {
    throw new Error(`unexpected SEA-LION request path: ${JSON.stringify(sealionRequest)}`)
  }
  if (sealionBaseRequest !== '/__chat_proxy/v1/chat/completions') {
    throw new Error(`unexpected SEA-LION base request path: ${JSON.stringify(sealionBaseRequest)}`)
  }
  if (sealionModels !== '/__chat_proxy/v1/models') {
    throw new Error(`unexpected SEA-LION models path: ${JSON.stringify(sealionModels)}`)
  }
  if (qwenRequest !== '/__chat_proxy/compatible-mode/v1/chat/completions') {
    throw new Error(`unexpected Qwen request path: ${JSON.stringify(qwenRequest)}`)
  }
  if (qwenBaseRequest !== '/__chat_proxy/compatible-mode/v1/chat/completions') {
    throw new Error(`unexpected Qwen base request path: ${JSON.stringify(qwenBaseRequest)}`)
  }
  if (qwenProxyBaseRequest !== '/__chat_proxy/compatible-mode/v1/chat/completions') {
    throw new Error(`unexpected Qwen proxy base request path: ${JSON.stringify(qwenProxyBaseRequest)}`)
  }
  if (qwenModels !== '/__chat_proxy/compatible-mode/v1/models') {
    throw new Error(`unexpected Qwen models path: ${JSON.stringify(qwenModels)}`)
  }
  if (qwenBaseModels !== '/__chat_proxy/compatible-mode/v1/models') {
    throw new Error(`unexpected Qwen base models path: ${JSON.stringify(qwenBaseModels)}`)
  }
  if (googleCloudRequest !== '/__chat_proxy/v1/projects/PROJECT_ID/locations/us-central1/endpoints/openapi/chat/completions') {
    throw new Error(`unexpected Google Cloud request path: ${JSON.stringify(googleCloudRequest)}`)
  }
  if (googleCloudBaseRequest !== '/__chat_proxy/v1/projects/PROJECT_ID/locations/us-central1/endpoints/openapi/chat/completions') {
    throw new Error(`unexpected Google Cloud base request path: ${JSON.stringify(googleCloudBaseRequest)}`)
  }
  if (googleCloudModels !== '/__chat_proxy/v1/projects/PROJECT_ID/locations/us-central1/endpoints/openapi/models') {
    throw new Error(`unexpected Google Cloud models path: ${JSON.stringify(googleCloudModels)}`)
  }
  if (openAiRequest !== '/__chat_proxy/v1/responses') {
    throw new Error(`unexpected OpenAI request path: ${JSON.stringify(openAiRequest)}`)
  }
  if (bytePlusRegion !== 'AP-Southeast-1') {
    throw new Error(`unexpected BytePlus region label: ${JSON.stringify(bytePlusRegion)}`)
  }
  if (miromindRegion !== 'Global') {
    throw new Error(`unexpected MiroMind region label: ${JSON.stringify(miromindRegion)}`)
  }
  if (agnesRegion !== 'Global') {
    throw new Error(`unexpected Agnes region label: ${JSON.stringify(agnesRegion)}`)
  }
  if (sealionRegion !== 'Singapore') {
    throw new Error(`unexpected SEA-LION region label: ${JSON.stringify(sealionRegion)}`)
  }
  if (qwenRegion !== 'Singapore') {
    throw new Error(`unexpected Qwen region label: ${JSON.stringify(qwenRegion)}`)
  }
  if (googleCloudRegion !== 'US-Central1') {
    throw new Error(`unexpected Google Cloud region label: ${JSON.stringify(googleCloudRegion)}`)
  }
  if (openAiLabel !== 'OpenAI') {
    throw new Error(`unexpected OpenAI label: ${JSON.stringify(openAiLabel)}`)
  }
  if (miromindLabel !== 'MiroMind API') {
    throw new Error(`unexpected MiroMind label: ${JSON.stringify(miromindLabel)}`)
  }
  if (agnesLabel !== 'Agnes AI API') {
    throw new Error(`unexpected Agnes label: ${JSON.stringify(agnesLabel)}`)
  }
  if (sealionLabel !== 'AI Singapore SEA-LION API') {
    throw new Error(`unexpected SEA-LION label: ${JSON.stringify(sealionLabel)}`)
  }
  if (qwenLabel !== 'Qwen API') {
    throw new Error(`unexpected Qwen label: ${JSON.stringify(qwenLabel)}`)
  }
  if (googleCloudLabel !== 'Google Cloud Vertex AI') {
    throw new Error(`unexpected Google Cloud label: ${JSON.stringify(googleCloudLabel)}`)
  }
  if (
    miromindModelOptions[0] !== 'mirothinker-1-7-deepresearch-mini'
    || !miromindModelOptions.includes('mirothinker-1-7-deepresearch')
  ) {
    throw new Error(`unexpected MiroMind model options: ${JSON.stringify(miromindModelOptions)}`)
  }
  if (agnesModelOptions[0] !== 'agnes-2.0-flash' || agnesModelOptions.length !== 1) {
    throw new Error(`unexpected Agnes model options: ${JSON.stringify(agnesModelOptions)}`)
  }
  if (
    sealionModelOptions[0] !== CHAT_SEALION_MODEL_OPTIONS[0]
    || !sealionModelOptions.includes('aisingapore/Gemma-SEA-LION-v4.5-E2B-IT')
    || !sealionModelOptions.includes('aisingapore/Llama-SEA-LION-v3.5-70B-R')
    || !sealionModelOptions.includes('aisingapore/SEA-Guard')
  ) {
    throw new Error(`unexpected SEA-LION model options: ${JSON.stringify(sealionModelOptions)}`)
  }
  if (
    qwenModelOptions[0] !== CHAT_QWEN_MODEL_OPTIONS[0]
    || !qwenModelOptions.includes('qwen3-max')
    || !qwenModelOptions.includes('qwen-flash')
  ) {
    throw new Error(`unexpected Qwen model options: ${JSON.stringify(qwenModelOptions)}`)
  }
  if (
    googleCloudModelOptions[0] !== CHAT_GOOGLE_CLOUD_MODEL_OPTIONS[0]
    || !googleCloudModelOptions.includes('google/gemini-1.5-flash-001')
  ) {
    throw new Error(`unexpected Google Cloud model options: ${JSON.stringify(googleCloudModelOptions)}`)
  }
}

export function testSharedChatModelCatalogReusesMainPanelIntegrationsOptions() {
  const sharedOptions = getSharedChatModelCatalogOptions(CHAT_PROVIDER_OPENAI)
  const expectedOptions = [
    CHAT_OPENAI_MODEL_OPTIONS[0],
    CHAT_OPENAI_MODEL_OPTIONS[1],
    CHAT_OPENAI_MODEL_OPTIONS[2],
    CHAT_OPENAI_MODEL_OPTIONS[4],
    'qwen-plus',
    CHAT_SEALION_MODEL_OPTIONS[0],
    'qwen3-max',
    'qwen-flash',
    'google/gemini-2.0-flash-001',
    'dreamina-seedance-2-0-fast-260128',
    'dreamina-seedance-2-0-260128',
    'qwen/qwen3.5-9b@q4_k_m',
  ]
  expectedOptions.forEach(value => {
    if (!sharedOptions.includes(value)) {
      throw new Error(`expected shared chat model catalog to include ${value}, got ${JSON.stringify(sharedOptions)}`)
    }
  })
  if (sharedOptions[0] !== CHAT_OPENAI_MODEL_OPTIONS[0]) {
    throw new Error(`expected provider-preferred catalog ordering, got ${JSON.stringify(sharedOptions.slice(0, 4))}`)
  }
}

export function testChatModelSelectionDerivesProviderAndEndpoint() {
  const qwenSelection = resolveChatModelSelectionValues({
    currentEndpointUrl: CHAT_OPENAI_ENDPOINT_URL,
    currentProvider: CHAT_PROVIDER_OPENAI,
    model: CHAT_QWEN_MODEL_OPTIONS[0],
  })
  if (qwenSelection.chatProvider !== CHAT_PROVIDER_QWEN) {
    throw new Error(`expected Qwen model selection to derive provider ${CHAT_PROVIDER_QWEN}, got ${JSON.stringify(qwenSelection)}`)
  }
  if (qwenSelection.chatEndpointUrl !== CHAT_QWEN_ENDPOINT_URL) {
    throw new Error(`expected Qwen model selection to reset endpoint to ${CHAT_QWEN_ENDPOINT_URL}, got ${JSON.stringify(qwenSelection)}`)
  }
  const endpointProvider = inferChatProviderFromEndpointUrl(CHAT_QWEN_ENDPOINT_URL, CHAT_PROVIDER_OPENAI)
  if (endpointProvider !== CHAT_PROVIDER_QWEN) {
    throw new Error(`expected Qwen endpoint selection to derive provider ${CHAT_PROVIDER_QWEN}, got ${JSON.stringify(endpointProvider)}`)
  }
  const sealionSelection = resolveChatModelSelectionValues({
    currentEndpointUrl: CHAT_OPENAI_ENDPOINT_URL,
    currentProvider: CHAT_PROVIDER_OPENAI,
    model: CHAT_SEALION_MODEL_OPTIONS[0],
  })
  if (sealionSelection.chatProvider !== CHAT_PROVIDER_SEALION) {
    throw new Error(`expected SEA-LION model selection to derive provider ${CHAT_PROVIDER_SEALION}, got ${JSON.stringify(sealionSelection)}`)
  }
  if (sealionSelection.chatEndpointUrl !== CHAT_SEALION_ENDPOINT_URL) {
    throw new Error(`expected SEA-LION model selection to reset endpoint to ${CHAT_SEALION_ENDPOINT_URL}, got ${JSON.stringify(sealionSelection)}`)
  }

  const localProvider = inferChatProviderFromModelId(CHAT_LOCAL_DEFAULT_MODEL, CHAT_PROVIDER_OPENAI)
  if (localProvider !== CHAT_PROVIDER_LM_STUDIO) {
    throw new Error(`expected local model selection to derive provider ${CHAT_PROVIDER_LM_STUDIO}, got ${JSON.stringify(localProvider)}`)
  }

  const customProvider = inferChatProviderFromModelId('custom/provider-model', CHAT_PROVIDER_MIROMIND)
  if (customProvider !== CHAT_PROVIDER_MIROMIND) {
    throw new Error(`expected custom model ids to preserve the current provider, got ${JSON.stringify(customProvider)}`)
  }
}

export function testChatModelInputVariantsUseCanonicalMapTerminology() {
  const modelsPath = resolve(process.cwd(), 'src', 'lib', 'chatEndpointModels.ts')
  const endpointPath = resolve(process.cwd(), 'src', 'lib', 'chatEndpoint.ts')
  const modelsText = readFileSync(modelsPath, 'utf8')
  const endpointText = readFileSync(endpointPath, 'utf8')
  if (!modelsText.includes('CHAT_MODEL_ID_BY_INPUT_VARIANT')) {
    throw new Error('expected chat model input normalization to use canonical input-variant terminology')
  }
  if (modelsText.includes('CHAT_MODEL_ALIASES') || endpointText.includes('CHAT_MODEL_ALIASES')) {
    throw new Error('expected chat model normalization to avoid alias terminology')
  }
  const normalized = normalizeChatModelIdForProvider('gpt-5 nano', CHAT_PROVIDER_OPENAI)
  if (normalized !== CHAT_OPENAI_MODEL_OPTIONS[0]) {
    throw new Error(`expected gpt-5 nano input variant to normalize to ${CHAT_OPENAI_MODEL_OPTIONS[0]}, got ${JSON.stringify(normalized)}`)
  }
}

export function testOpenAiResolverDropsUnknownNativeModelIds() {
  const staleNativeModel = ['gpt', '5.4', 'nano'].join('-')
  const resolved = resolveChatModelIdForProvider(staleNativeModel, CHAT_PROVIDER_OPENAI, { preserveUnknownCustomModel: true })
  if (resolved !== CHAT_OPENAI_MODEL_OPTIONS[0]) {
    throw new Error(`expected stale native OpenAI model to normalize to ${CHAT_OPENAI_MODEL_OPTIONS[0]}, got ${JSON.stringify(resolved)}`)
  }
  const qwenResolved = resolveChatModelIdForProvider(staleNativeModel, CHAT_PROVIDER_QWEN, { preserveUnknownCustomModel: true })
  if (qwenResolved !== CHAT_QWEN_MODEL_OPTIONS[0]) {
    throw new Error(`expected stale native OpenAI model to normalize to ${CHAT_QWEN_MODEL_OPTIONS[0]} under Qwen, got ${JSON.stringify(qwenResolved)}`)
  }
  const customModel = 'ft:custom-model'
  const customResolved = resolveChatModelIdForProvider(customModel, CHAT_PROVIDER_OPENAI, { preserveUnknownCustomModel: true })
  if (customResolved !== customModel) {
    throw new Error(`expected custom OpenAI model to stay configurable, got ${JSON.stringify(customResolved)}`)
  }
}

export function testBytePlusProxyRewritesLegacyRunAllPaths() {
  const candidates = [
    resolve(process.cwd(), 'vite.config.ts'),
    resolve(process.cwd(), 'canvas/vite.config.ts'),
  ]
  const viteConfigPath = candidates.find(candidate => existsSync(candidate))
  if (!viteConfigPath) {
    throw new Error(`could not find vite.config.ts from ${process.cwd()}`)
  }
  const source = readFileSync(viteConfigPath, 'utf8')
  const expectedSnippets = [
    'suffix = bytePlusUpstreamSelected',
    "? '/api/v3/chat/completions'",
    ': qwenUpstreamSelected',
    "? '/compatible-mode/v1/chat/completions'",
    ": '/v1/chat/completions'",
    "if (suffix === '/api/v3' || suffix === '/api/v3/') suffix = '/api/v3/chat/completions'",
    "if (suffix === '/v1/models' || suffix === '/v1/models/' || suffix === '/models' || suffix === '/models/') suffix = '/api/v3/models'",
    "if (suffix === '/images/generations' || suffix === '/images/generations/') suffix = '/api/v3/images/generations'",
    "if (suffix.startsWith('/contents/generations/tasks')) suffix = `/api/v3${suffix}`",
    "const qwenProviderSelected = providerHeader === 'qwen'",
    "const googleCloudProviderSelected = providerHeader === 'google-cloud'",
    'process.env.DASHSCOPE_API_KEY',
    'process.env.GOOGLE_CLOUD_ACCESS_TOKEN',
    'requiresGoogleCloudKey',
    "if (suffix === '/compatible-mode/v1' || suffix === '/compatible-mode/v1/') suffix = '/compatible-mode/v1/chat/completions'",
    "if (suffix === '/v1/models' || suffix === '/v1/models/' || suffix === '/models' || suffix === '/models/') suffix = '/compatible-mode/v1/models'",
    'endpoints/openapi/chat/completions',
  ]
  const missing = expectedSnippets.filter(snippet => !source.includes(snippet))
  if (missing.length) {
    throw new Error(`expected BytePlus proxy compatibility rewrites in vite.config.ts, missing ${JSON.stringify(missing)}`)
  }
}

export function testMiroMindServerManagedProxyEnvNamesStayAligned() {
  const viteConfigCandidates = [
    resolve(process.cwd(), 'vite.config.ts'),
    resolve(process.cwd(), 'canvas/vite.config.ts'),
  ]
  const viteConfigPath = viteConfigCandidates.find(candidate => existsSync(candidate))
  if (!viteConfigPath) {
    throw new Error(`could not find vite.config.ts from ${process.cwd()}`)
  }
  const source = readFileSync(viteConfigPath, 'utf8')
  const expectedSourceSnippets = [
    "const miromindProviderSelected = providerHeader === 'miromind'",
    'requiresMiroMindKey',
    'process.env.KNOWGRPH_CHAT_PROXY_MIROMIND_API_KEY || process.env.MIROMIND_API_KEY',
    'Missing MiroMind API key for chat proxy upstream',
  ]
  const missingSourceSnippets = expectedSourceSnippets.filter(snippet => !source.includes(snippet))
  if (missingSourceSnippets.length) {
    throw new Error(`expected Dev chat proxy to keep MiroMind server-managed env names aligned, missing ${JSON.stringify(missingSourceSnippets)}`)
  }

  const readinessScriptCandidates = [
    resolve(process.cwd(), '..', 'scripts', 'check-miromind-readiness.mjs'),
    resolve(process.cwd(), 'scripts', 'check-miromind-readiness.mjs'),
  ]
  const readinessScriptPath = readinessScriptCandidates.find(candidate => existsSync(candidate))
  if (!readinessScriptPath) {
    throw new Error(`could not find check-miromind-readiness.mjs from ${process.cwd()}`)
  }
  const readinessSource = readFileSync(readinessScriptPath, 'utf8')
  const expectedReadinessSnippets = [
    'MIROMIND_API_KEY',
    'wrangler',
    'joohwee.pages.dev',
    'proxyMissingKey',
    'context.env',
  ]
  const missingReadinessSnippets = expectedReadinessSnippets.filter(snippet => !readinessSource.includes(snippet))
  if (missingReadinessSnippets.length) {
    throw new Error(`expected MiroMind readiness script to prove Pages secret and live proxy state, missing ${JSON.stringify(missingReadinessSnippets)}`)
  }
}

export function testGeminiServerManagedProxyEnvNamesStayAligned() {
  const viteConfigCandidates = [
    resolve(process.cwd(), 'vite.config.ts'),
    resolve(process.cwd(), 'canvas/vite.config.ts'),
  ]
  const viteConfigPath = viteConfigCandidates.find(candidate => existsSync(candidate))
  if (!viteConfigPath) throw new Error(`could not find vite.config.ts from ${process.cwd()}`)
  const envCandidates = [
    resolve(process.cwd(), 'viteChatProxyEnv.ts'),
    resolve(process.cwd(), 'canvas/viteChatProxyEnv.ts'),
  ]
  const envPath = envCandidates.find(candidate => existsSync(candidate))
  if (!envPath) throw new Error(`could not find viteChatProxyEnv.ts from ${process.cwd()}`)
  const source = readFileSync(viteConfigPath, 'utf8')
  const envSource = readFileSync(envPath, 'utf8')
  const requiredViteSnippets = [
    "const CHAT_PROXY_GEMINI_HOST = 'generativelanguage.googleapis.com'",
    "const geminiProviderSelected = providerHeader === 'gemini'",
    'const requiresGeminiKey = !localGatewayOnly && geminiUpstreamSelected',
    'process.env.KNOWGRPH_CHAT_PROXY_GEMINI_API_KEY',
    "writeJson(res, 401, { ok: false, error: 'Missing Google Gemini API key",
    "headers.set('x-goog-api-key', providerApiKey)",
  ]
  const missingViteSnippets = requiredViteSnippets.filter(snippet => !source.includes(snippet))
  if (missingViteSnippets.length) {
    throw new Error(`expected direct Gemini chat proxy routing and auth snippets, missing ${JSON.stringify(missingViteSnippets)}`)
  }
  if (!envSource.includes("'KNOWGRPH_CHAT_PROXY_GEMINI_API_KEY'")) {
    throw new Error('expected the server-managed environment loader to whitelist KNOWGRPH_CHAT_PROXY_GEMINI_API_KEY')
  }
  const settingsCandidates = [
    resolve(process.cwd(), 'src/features/panels/views/useSettingsView.ts'),
    resolve(process.cwd(), 'canvas/src/features/panels/views/useSettingsView.ts'),
  ]
  const settingsPath = settingsCandidates.find(candidate => existsSync(candidate))
  if (!settingsPath) throw new Error(`could not find useSettingsView.ts from ${process.cwd()}`)
  const settingsSource = readFileSync(settingsPath, 'utf8')
  const requiredSettingsSnippets = [
    "from './geminiApiDocs'",
    '...GEMINI_API_DOC_ENTRIES',
    'title: GEMINI_API_DOC_AREA',
    'getGeminiApiRowAnchorId',
  ]
  const missingSettingsSnippets = requiredSettingsSnippets.filter(snippet => !settingsSource.includes(snippet))
  if (missingSettingsSnippets.length) {
    throw new Error(`expected Google Gemini API to appear as a MainPanel Integrations section, missing ${JSON.stringify(missingSettingsSnippets)}`)
  }
}

export function testOpenAiServerManagedProxyLoadsLocalEnvFiles() {
  const viteConfigCandidates = [
    resolve(process.cwd(), 'vite.config.ts'),
    resolve(process.cwd(), 'canvas/vite.config.ts'),
  ]
  const viteConfigPath = viteConfigCandidates.find(candidate => existsSync(candidate))
  if (!viteConfigPath) {
    throw new Error(`could not find vite.config.ts from ${process.cwd()}`)
  }
  const source = readFileSync(viteConfigPath, 'utf8')
  const helperCandidates = [
    resolve(process.cwd(), 'viteChatProxyEnv.ts'),
    resolve(process.cwd(), 'canvas/viteChatProxyEnv.ts'),
  ]
  const helperPath = helperCandidates.find(candidate => existsSync(candidate))
  if (!helperPath) {
    throw new Error(`could not find viteChatProxyEnv.ts from ${process.cwd()}`)
  }
  const helperSource = readFileSync(helperPath, 'utf8')
  const expectedViteSnippets = [
    "import { loadChatProxyServerManagedEnv } from './viteChatProxyEnv'",
    'loadChatProxyServerManagedEnv({ repoRoot, canvasRoot: __dirname })',
    'process.env.KNOWGRPH_CHAT_PROXY_OPENAI_API_KEY || process.env.OPENAI_API_KEY',
    'process.env.KNOWGRPH_CHAT_PROXY_AI_GATEWAY_BASE_URL',
    'process.env.KNOWGRPH_CHAT_PROXY_AI_GATEWAY_TOKEN || process.env.AI_GATEWAY_TOKEN || process.env.CLOUDFLARE_API_TOKEN',
    'cf-aig-cache-ttl',
    'cf-aig-metadata',
    "parsed.model = aiGatewayRoute",
  ]
  const missingViteSnippets = expectedViteSnippets.filter(snippet => !source.includes(snippet))
  if (missingViteSnippets.length) {
    throw new Error(`expected Dev chat proxy to load OpenAI server-managed env before routing, missing ${JSON.stringify(missingViteSnippets)}`)
  }
  const expectedHelperSnippets = [
    'CHAT_PROXY_SERVER_ENV_KEYS',
    "'KNOWGRPH_CHAT_PROXY_OPENAI_API_KEY'",
    "'OPENAI_API_KEY'",
    "path.resolve(args.repoRoot, '.env.local')",
    "path.resolve(args.canvasRoot, '.env.local')",
    'if (String(process.env[key] ||',
  ]
  const missingHelperSnippets = expectedHelperSnippets.filter(snippet => !helperSource.includes(snippet))
  if (missingHelperSnippets.length) {
    throw new Error(`expected server-managed chat proxy env helper to whitelist local OpenAI env files, missing ${JSON.stringify(missingHelperSnippets)}`)
  }
}

export function testChatProxyErrorResponsesGuardHeadersSent() {
  const candidates = [
    resolve(process.cwd(), 'vite.config.ts'),
    resolve(process.cwd(), 'canvas/vite.config.ts'),
  ]
  const viteConfigPath = candidates.find(candidate => existsSync(candidate))
  if (!viteConfigPath) {
    throw new Error(`could not find vite.config.ts from ${process.cwd()}`)
  }
  const source = readFileSync(viteConfigPath, 'utf8')
  const expectedSnippets = [
    'const canWriteChatProxyResponse = (res: import',
    '!res.destroyed && !res.writableEnded',
    'if (!canWriteChatProxyResponse(res)) return false',
    'if (res.headersSent) {',
    'return false',
    'if (!canWriteChatProxyResponse(res)) return',
    'res.end()',
    'toActionableChatProxyError',
  ]
  const missing = expectedSnippets.filter(snippet => !source.includes(snippet))
  if (missing.length) {
    throw new Error(`expected chat proxy errors to avoid writing headers after response start, missing ${JSON.stringify(missing)}`)
  }
}
