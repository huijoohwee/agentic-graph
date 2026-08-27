import { ANNOTATION_MODEL_IDS, AGENTICGRAPH_ANNOTATION_MODEL } from './annotationEngineSsot'

export type AnnotationModelResolveOk = { ok: true; modelId: string }
export type AnnotationModelResolveError = {
  ok: false
  errorCode: 'model_not_configured'
  modelId: string
}
export type AnnotationModelResolveResult = AnnotationModelResolveOk | AnnotationModelResolveError

const cleanString = (value: unknown): string => String(value || '').trim()

const readRuntimeEnv = (name: string): string => {
  const env = typeof process !== 'undefined' ? process.env : undefined
  return cleanString(env?.[name])
}

const isRegisteredAnnotationModel = (modelId: string): boolean => {
  return Object.values(ANNOTATION_MODEL_IDS).includes(modelId as never)
}

export function resolveAnnotationModel(modelHint?: string): AnnotationModelResolveResult {
  const hintedModelId = cleanString(modelHint)
  if (hintedModelId) {
    return isRegisteredAnnotationModel(hintedModelId)
      ? { ok: true, modelId: hintedModelId }
      : { ok: false, errorCode: 'model_not_configured', modelId: hintedModelId }
  }

  const envModelId = readRuntimeEnv(AGENTICGRAPH_ANNOTATION_MODEL)
  if (envModelId && isRegisteredAnnotationModel(envModelId)) return { ok: true, modelId: envModelId }
  return { ok: true, modelId: ANNOTATION_MODEL_IDS.florence2Base }
}
