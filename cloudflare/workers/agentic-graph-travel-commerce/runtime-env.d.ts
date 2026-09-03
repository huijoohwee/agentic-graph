interface TravelCommerceEnv {
  /** Provision with `wrangler secret put`; never store the value in source control. */
  TRAVEL_COMMERCE_API_TOKEN: string
  /** Distinct bearer secret for irreversible reconciliation decisions. */
  RECONCILIATION_OPERATOR_TOKEN: string
  /** Provision independently on caller and overflow Workers; never store the value in source control. */
  INFERENCE_OVERFLOW_TOKEN: string
  /** Authenticates Commerce checkout control and operation requests. */
  CHECKOUT_PROVIDER_AUTH_SECRET: string
  /** Authenticates Commerce marketplace control requests used by runtime proof. */
  MARKETPLACE_PROVIDER_AUTH_SECRET: string
  /** Exact protected candidate revision injected by the release controller. */
  COMMERCE_PROVIDER_SOURCE_REVISION: string
  /** Storage compatibility identifier for the checkout provider journal. */
  COMMERCE_PROVIDER_STORAGE_REVISION: string
  /** Immutable deployed checkout provider version identifier. */
  COMMERCE_PROVIDER_VERSION_ID: string
}
