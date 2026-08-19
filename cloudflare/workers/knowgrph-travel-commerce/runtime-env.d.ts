interface TravelCommerceEnv {
  /** Provision with `wrangler secret put`; never store the value in source control. */
  TRAVEL_COMMERCE_API_TOKEN: string
  /** Distinct bearer secret for irreversible reconciliation decisions. */
  RECONCILIATION_OPERATOR_TOKEN?: string
  /** Provision independently on caller and overflow Workers; never store the value in source control. */
  INFERENCE_OVERFLOW_TOKEN: string
}
