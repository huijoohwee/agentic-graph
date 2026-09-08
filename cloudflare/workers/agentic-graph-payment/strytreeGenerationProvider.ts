import { GenerationClaimError, type GenerationClaim } from './strytreeGenerationDispatch'
import type { StrytreeWorkerEnv, FetchLike, ExternalVideoProviderRequest, StrytreeGenerationJobRow, ExternalVideoProviderResult } from './strytreeTypes'
import { asRecord, stableJson, readEnvString, StrytreeProviderError, EXTERNAL_VIDEO_PROVIDER_DEFAULT_BASE_URL, makeTraceId, readEnvNumber, EXTERNAL_VIDEO_PROVIDER_SUCCESS_STATUS, EXTERNAL_VIDEO_PROVIDER_FAILED_STATUSES, EXTERNAL_VIDEO_PROVIDER_GENERATING_STATUS } from './strytreeSupport'
import { normalizeString, normalizeNumber } from '../shared/d1'

const readNumberField = (value: unknown): number | null => {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const readExternalVideoProviderFetch = (env: StrytreeWorkerEnv): FetchLike => {
  const fetchOverride = env.STRYTREE_EXTERNAL_VIDEO_PROVIDER_FETCH
  return typeof fetchOverride === 'function' ? fetchOverride as FetchLike : fetch
}

const buildExternalVideoProviderImageReferences = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const record = asRecord(item)
    if (!record) return []
    const imgId = readNumberField(record.img_id)
    const refName = normalizeString(record.ref_name)
    if (imgId == null || !refName) return []
    return [{
      type: normalizeString(record.type) || 'subject',
      img_id: imgId,
      ref_name: refName,
    }]
  })
}

const buildExternalVideoProviderGenerationRequest = (
  requestPayload: Record<string, unknown>,
): ExternalVideoProviderRequest | null => {
  const options = asRecord(requestPayload.options) || {}
  const prompt = normalizeString(requestPayload.prompt)
  if (!prompt) return null
  const model = normalizeString(requestPayload.model || options.model) || 'v4.5'
  const duration = readNumberField(requestPayload.duration || options.duration || options.duration_seconds) || 5
  const quality = normalizeString(requestPayload.quality || options.quality) || '540p'
  const seed = readNumberField(requestPayload.seed || options.seed) || 123456789
  const imageReferences = buildExternalVideoProviderImageReferences(requestPayload.image_references || options.image_references)
  if (imageReferences.length > 0) {
    return {
      endpoint: '/openapi/v2/video/fusion/generate',
      body: {
        image_references: imageReferences,
        prompt,
        model,
        duration,
        quality,
        aspect_ratio: normalizeString(requestPayload.aspect_ratio || options.aspect_ratio) || '16:9',
        seed,
      },
    }
  }
  const imgId = readNumberField(requestPayload.img_id || options.img_id)
  if (imgId == null) return null
  return {
    endpoint: '/openapi/v2/video/img/generate',
    body: {
      img_id: imgId,
      prompt,
      model,
      duration,
      quality,
      motion_mode: normalizeString(requestPayload.motion_mode || options.motion_mode) || 'normal',
      negative_prompt: normalizeString(requestPayload.negative_prompt || options.negative_prompt) || undefined,
      seed,
      water_mark: false,
    },
  }
}

const readJsonResponse = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    return asRecord(await response.json()) || {}
  } catch {
    return {}
  }
}

const readExternalVideoProviderVideoId = (body: Record<string, unknown>): string => {
  const response = asRecord(body.Resp) || body
  return normalizeString(response.video_id || response.id)
}

const readExternalVideoProviderStatus = (body: Record<string, unknown>): number => {
  const response = asRecord(body.Resp) || body
  return normalizeNumber(response.status)
}

const readExternalVideoProviderVideoUrl = (body: Record<string, unknown>): string | null => {
  const response = asRecord(body.Resp) || body
  return normalizeString(response.url) || null
}

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms))

export const runExternalVideoProviderIfConfigured = async (
  env: StrytreeWorkerEnv,
  job: StrytreeGenerationJobRow,
  requestPayload: Record<string, unknown>,
  claim: GenerationClaim,
): Promise<ExternalVideoProviderResult | null> => {
  const providerMode = normalizeString(env.STRYTREE_PROVIDER_MODE).toLowerCase()
  const forceLive = providerMode === 'live' || providerMode === 'external_video_provider'
  const apiKey = readEnvString(env, 'STRYTREE_EXTERNAL_VIDEO_PROVIDER_API_KEY', 'EXTERNAL_VIDEO_PROVIDER_API_KEY')
  if (!apiKey) {
    if (job.provider_job_id) return claim.requireReconciliation('Recorded provider work requires its server-side credentials to resume.')
    if (forceLive) throw new StrytreeProviderError('missing_external_video_provider_api_key', 'External video provider mode requires a server-side API key.')
    return null
  }
  const providerRequest = buildExternalVideoProviderGenerationRequest(requestPayload)
  if (!providerRequest && !job.provider_job_id) {
    if (forceLive) throw new StrytreeProviderError('missing_external_video_provider_media_reference', 'External video provider live mode requires image_references or img_id in the generation payload.')
    return null
  }
  const fetcher = readExternalVideoProviderFetch(env)
  const baseUrl = (readEnvString(env, 'STRYTREE_EXTERNAL_VIDEO_PROVIDER_BASE_URL') || EXTERNAL_VIDEO_PROVIDER_DEFAULT_BASE_URL).replace(/\/+$/g, '')
  const submittedAtMs = Date.now()
  let videoId = job.provider_job_id
  if (!videoId) {
    await claim.assertOwned()
    let submitResponse: Response
    let submitJson: Record<string, unknown>
    try {
      submitResponse = await fetcher(`${baseUrl}${providerRequest!.endpoint}`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'API-KEY': apiKey, 'Ai-trace-id': makeTraceId() },
        body: stableJson(providerRequest!.body),
      })
      submitJson = await readJsonResponse(submitResponse)
    } catch {
      return claim.requireReconciliation('Provider submission outcome is unknown; do not resubmit or refund automatically.')
    }
    videoId = readExternalVideoProviderVideoId(submitJson)
    if (!submitResponse.ok || normalizeNumber(submitJson.ErrCode) > 0 || !videoId) {
      return claim.requireReconciliation('Provider submission did not establish a durable job identity.')
    }
    try { await claim.submitted(videoId) } catch (error) {
      if (error instanceof GenerationClaimError) throw error
      return claim.requireReconciliation('Provider job identity could not be checkpointed.')
    }
  }
  const maxPolls = Math.min(60, Math.max(1, Math.floor(readEnvNumber(env, 'STRYTREE_EXTERNAL_VIDEO_PROVIDER_MAX_POLLS', 60))))
  const intervalMs = Math.floor(readEnvNumber(env, 'STRYTREE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS', 1500))
  let lastJson: Record<string, unknown> = {}
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) await sleep(intervalMs)
    await claim.assertOwned()
    const pollResponse = await fetcher(`${baseUrl}/openapi/v2/video/result/${encodeURIComponent(videoId)}`, {
      method: 'GET',
      headers: {
        'API-KEY': apiKey,
        'Ai-trace-id': makeTraceId(),
      },
    })
    const pollJson = await readJsonResponse(pollResponse)
    await claim.assertOwned()
    lastJson = pollJson
    if (!pollResponse.ok || normalizeNumber(pollJson.ErrCode) > 0) {
      throw new StrytreeProviderError(
        'external_video_provider_poll_failed',
        normalizeString(pollJson.ErrMsg) || `External video provider poll failed with HTTP ${pollResponse.status}.`,
      )
    }
    const status = readExternalVideoProviderStatus(pollJson)
    if (status === EXTERNAL_VIDEO_PROVIDER_SUCCESS_STATUS) {
      return {
        videoId,
        status,
        videoUrl: readExternalVideoProviderVideoUrl(pollJson),
        responseJson: pollJson,
        submittedAtMs,
        completedAtMs: Date.now(),
      }
    }
    if (EXTERNAL_VIDEO_PROVIDER_FAILED_STATUSES.has(status)) {
      throw new StrytreeProviderError('external_video_provider_generation_failed', `External video provider generation ended with status ${status}.`)
    }
    if (status !== EXTERNAL_VIDEO_PROVIDER_GENERATING_STATUS && attempt === maxPolls - 1) {
      throw new StrytreeProviderError('external_video_provider_unknown_status', `External video provider generation ended with unknown status ${status}.`)
    }
  }
  throw new StrytreeProviderError('external_video_provider_poll_timeout', `External video provider generation did not finish after ${maxPolls} poll attempts. Last response: ${stableJson(lastJson)}`)
}
