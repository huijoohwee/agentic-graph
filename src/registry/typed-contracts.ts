type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type AgentId = Brand<string, "AgentId">;
export type IntentId = Brand<string, "IntentId">;
export type OfferId = Brand<string, "OfferId">;
export type SessionId = Brand<string, "SessionId">;
export type OperatorId = Brand<string, "OperatorId">;
export type PrincipalId = Brand<string, "PrincipalId">;
export type ContentHash = Brand<string, "ContentHash">;
export type SchemaRevisionId = Brand<string, "SchemaRevisionId">;
export type ValidationPassId = Brand<string, "ValidationPassId">;
export type CategoryLabel = Brand<string, "CategoryLabel">;
export type CurrencyCode = Brand<string, "CurrencyCode">;
export type IsoTimestamp = Brand<string, "IsoTimestamp">;
export type RevisionId = Brand<string, "RevisionId">;

export interface OfferConstraints {
  readonly budgetMinor: number;
  readonly currency: CurrencyCode;
  readonly earliestIso?: IsoTimestamp;
  readonly latestIso?: IsoTimestamp;
  readonly quantity?: number;
}

export interface DiscoveryInput {
  readonly intentId: IntentId;
  readonly category: CategoryLabel;
  readonly constraints: OfferConstraints;
}

export interface DiscoveryOutputFields {
  readonly offerId: OfferId;
  readonly title: string;
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly merchantName: string;
  readonly detailUrl: string;
}

export interface TypedIntent {
  readonly intentId: IntentId;
  readonly category: string;
  readonly constraints: OfferConstraints;
  readonly principalId: PrincipalId;
}

export interface TypedOffer {
  readonly offer: DiscoveryOutputFields;
  readonly agentId: AgentId;
  readonly intentId: IntentId;
}

export interface AgentDefinition {
  readonly agentId: AgentId;
  readonly declaredCategory: string;
  readonly declaredToolAllowlist: readonly string[];
  readonly trustStatus: "declared-and-present";
  readonly schemaRevision: SchemaRevisionId;
  readonly contentHash: ContentHash;
}

export interface RoutingTableEntry {
  readonly normalizedCategory: CategoryLabel;
  readonly agentId: AgentId;
  readonly passResultId: ValidationPassId;
  readonly boundContentHash: ContentHash;
  readonly committedAt: IsoTimestamp;
}

export type SessionLogEventType =
  | "routing"
  | "registration-rejected"
  | "gate-pass"
  | "gate-fail"
  | "human-confirm"
  | "issuance"
  | "fail-closed";

export interface SessionLogEntry {
  readonly sessionId: SessionId;
  readonly seq: number;
  readonly eventType: SessionLogEventType;
  readonly intentId?: IntentId;
  readonly offerId?: OfferId;
  readonly agentId: AgentId | null;
  readonly reason?: NoMatchReason | FailClosedCode | string;
  readonly recordedAt: IsoTimestamp;
}

export interface SchemaViolation {
  readonly fieldId: string;
  readonly reason: "missing" | "invalid" | "not-allowed" | "schema-unavailable";
}

export type NoMatchReason =
  | "unmatched-category"
  | "ambiguous-category"
  | "invalid-category"
  | "registration-state-unavailable"
  | "agent-not-registered";

export type FailClosedCode =
  | "gate-pass-absent"
  | "human-confirm-absent"
  | "confirmation-expired"
  | "unrecognized-agent"
  | "unauthorized-payment-caller";

export interface ValidationPassResult {
  readonly status: "pass";
  readonly passResultId: ValidationPassId;
  readonly contentHash: ContentHash;
  readonly schemaRevision: SchemaRevisionId;
}

export interface ValidationRejectResult {
  readonly status: "reject";
  readonly violations: readonly SchemaViolation[];
}

export type ValidationResult = ValidationPassResult | ValidationRejectResult;

export interface NoMatchResult {
  readonly status: "no-match";
  readonly intentId: IntentId;
  readonly reason: NoMatchReason;
  readonly categoryReceived: string | undefined;
}

export interface DispatchResult {
  readonly status: "dispatch";
  readonly intentId: IntentId;
  readonly agentId: AgentId;
  readonly discoveryInput: DiscoveryInput;
}

export type RouteOutcome = DispatchResult | NoMatchResult;
