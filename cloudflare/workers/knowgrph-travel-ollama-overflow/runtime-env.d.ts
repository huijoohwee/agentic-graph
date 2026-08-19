interface OllamaOverflowEnv {
  /** Provision with `wrangler secret put`; must match the travel-commerce caller secret. */
  INFERENCE_OVERFLOW_TOKEN: string
  OLLAMA_CONTAINER: DurableObjectNamespace<import('./src/index').OllamaContainer>
  ALLOWED_MODELS_JSON: string
  MODEL_MANIFEST_DIGESTS_JSON: string
}
