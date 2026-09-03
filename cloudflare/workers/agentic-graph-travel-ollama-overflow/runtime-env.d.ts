interface WorkersAiOverflowEnv {
  /** Provision with `wrangler secret put`; must match the travel-commerce caller secret. */
  INFERENCE_OVERFLOW_TOKEN: string
  AI: Ai
  ALLOWED_MODELS_JSON: string
}
