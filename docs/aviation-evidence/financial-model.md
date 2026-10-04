---
title: "Aviation Evidence — financial model preparation"
doc_type: "Financial model"
version: "0.4.2"
continuity_id: "aviation-evidence-layer"
source_revision: "aviation-evidence-layer@0.4.2"
date: "2026-10-04"
owner: "Financial Modeler"
---
# Financial model preparation

This is the formula and input owner for the [joined plan](prd-tad-adr-mvp-gtm.md), as of 2026-10-04. It prepares the model structure; numeric forecasts and independent reconciliation remain incomplete. Inputs marked unknown propagate as unknown; division by zero/unknown is undefined. No numeric market, price, customer, revenue, cash or profit result is invented.

The117-fact ODbL Singapore–Riau sample changes no market/demand assumption. Offline/attribution/recovery work belongs in A08/A09; labour and TCO remain unknown.

All money must use one declared currency per scenario, currently unset. Currency conversion needs dated sourced rates; do not add currencies. Hours, users, tasks, ratios and money remain distinct units. Every changed assumption requires source, date, owner, estimate/observed/constraint disposition and revision.

## Assumption register

| ID | Input / unit | Value / disposition / source and next check |
|---|---|---|
| A01 | pilot price / currency per pilot | Unknown; Founder sets an authorized offer, EXP-3 |
| A02 | qualified leads, offers, orders / count per month | Unknown; actual consented funnel, EXP-1/3 |
| A03 | delivered pilots / count per month | Unknown, ≤capacity; fulfilment receipts |
| A04 | receipt fraction and lag / ratio and days | Unknown; actual terms/payment, EXP-3 |
| A05 | refunds and cancellations / currency and count | Unknown; actual terms/events |
| A06 | delivery, support and admin / hours per pilot | Unknown; timed pilot/recovery/support records |
| A07 | operator labour valuation / currency per hour | Unknown; owner-declared opportunity-cost input, not a fabricated wage |
| A08 | build hours and allocation / hours, currency | Unknown; actual execution ledger and declared allocation policy |
| A09 | compute, data, storage, security / currency per month by variant | Unknown economic cost; incremental paid provider spend capped0 by user instruction |
| A10 | serving model/API use and unit price | Constraint0; Historical PR9 observed0 external requests; Graph serving effects/offline measurement pending; nonzero serving path disallowed |
| A11 | available operating hours / hours per month | Unknown; one-pilot-at-a-time planning cap is not a measured hourly capacity |
| A12 | opening cash, assets, liabilities, owner capital / currency | Unknown; owner-supplied balances, no funding assumed |
| A13 | tax and revenue recognition basis | Unknown; actual entity/jurisdiction/qualified review before commercial reporting |
| A14 | analyst frequency, tasks, reach and minutes saved | Unknown; comparable EXP-1/4 observations |
| A15 | active authoring prompt/completion/cache tokens and billed cost | Unknown absent real telemetry; bytes, elapsed time and zero serving use do not substitute |
| A16 | market organisations/teams, reachable share, annual tested value | Unknown; two independent sourced market methods plus EXP-3/4 |

## Separate deployment variants

One proposed pilot at the same task volume is the comparison scale. Do not blend local, hosted and customer-operated costs.

| Variant | Ownership / included costs | Status |
|---|---|---|
| DM-A local/device | Existing hardware; build allocation, electricity/compute opportunity cost, storage/recovery, operator support, security work, any permitted data | Selected MVP; incremental provider cash ceiling0, economic TCO unknown |
| DM-B hosted single tenant | Hosting/egress/storage/backup/patching/security, data terms, operator support, build allocation | Deferred; unknown free quota/overage and rights, no provider adopted |
| DM-C customer environment | Customer deployment/approval, integration, compute/storage/security operations, support responsibility and data agreement | Deferred; customer inputs and contract unknown |

For each variant x: `TCO12_x = allocatedBuild_x + 12 × (compute_x + data_x + storage_x + support_x + security_x)`. Keep yearly/monthly units consistent; add one-time deployment separately. Compare managed/self-managed/hybrid at equal workload/responsibility. Unknown inputs prevent numeric ranking; DM-A selection is not proof of cheapest TCO.

## Linked monthly statements

Use months m=1…12 after the agreed pilot start. All formulas below are algebraically defined; cells stay unknown until inputs exist. Cash received and revenue recognized are separate.

| Output | Formula / measurement basis |
|---|---|
| Orders_m | qualifiedLeads_m × offerRate_m × acceptanceRate_m, checked against actual integer counts |
| Capacity_m | floor(availableHours_m / totalHoursPerPilot_m), undefined for absent/nonpositive denominator |
| Deliveries_m | min(acceptedBacklog_m, Capacity_m); actual accepted fulfilment overrides forecast |
| ClosingBacklog_m | OpeningBacklog_m + Orders_m − Deliveries_m − cancellations_m |
| EarnedRevenue_m | sum of consideration allocated to fulfilled, accepted obligations under A13; not automatically equal orders or receipts |
| DirectCost_m | deliveryHours_m × labourRate + directData_m + directCompute_m + servingModelCost_m |
| GrossProfit_m | EarnedRevenue_m − DirectCost_m |
| OperatingProfit_m | GrossProfit_m − support/admin/security/marketing/buildExpense_m |
| NetIncome_m | OperatingProfit_m − interest_m − tax_m; tax unknown until A13 |
| CashReceipts_m | actual settled customer receipts, or forecast invoice schedule×collection fraction shifted by agreed lag |
| ClosingReceivables_m | OpeningReceivables_m + invoicedEarnedRevenue_m − receiptsAppliedToInvoices_m − writeoffs_m |
| ClosingDeferredRevenue_m | OpeningDeferredRevenue_m + unearnedPrepayments_m − revenueReleasedFromPrepayments_m |
| OperatingCashflow_m | CashReceipts_m − cashDirectCosts_m − cashOperatingCosts_m − cashTax_m − refunds_m |
| ClosingCash_m | OpeningCash_m + OperatingCashflow_m − capitalPurchases_m + ownerCapital_m + financing_m − repayments_m − distributions_m |
| Assets_m | ClosingCash_m + ClosingReceivables_m + netCapitalAssets_m + otherAssets_m |
| Liabilities_m | payables_m + debt_m + ClosingDeferredRevenue_m + otherLiabilities_m |
| Equity_m | OpeningEquity_m + ownerCapital_m + NetIncome_m − distributions_m |
| BalanceCheck_m | Assets_m − Liabilities_m − Equity_m must equal0; unknown balances are not a passing reconciliation |

Separate imputed economic cost from cash; never count labour/build twice. Accounting/capitalisation basis remains unselected. Opening balances roll from prior closings.

## Unit economics, ROI and decision rules

- Economic contribution/pilot = earned price − direct data/compute/model − delivery/support hours×declared labour valuation.
- Cash contribution/pilot = collected net cash − attributable actual cash outflows.
- Gross margin = gross profit / earned revenue; undefined when revenue≤0 or unknown.
- CAC = attributable acquisition cost / new paying customers; both denominator and costs include actual observation period.
- LTV requires observed retention/contribution basis; do not extrapolate four weeks into perpetual value.
- Payback = acquisition cost / positive recurring contribution per period; undefined without both.
- Break-even units = fixed economic costs / positive contribution per pilot; ceiling to whole units; unknown/nonpositive margin yields no finite claim.
- Cash-floor runway = first forecast month closing cash falls below the owner-defined floor; no numeric runway without opening cash and cash flows.
- Customer value = comparable tasks×observed saved minutes/60×declared analyst value/hour. Frequency, accuracy and causality require EXP-4, not demo timing.
- Feature ROI ratio = incremental attributable benefit in currency / total incremental build+operating cost in the same currency and period. Planning threshold≥1; impact1–5 and reach are separately sourced drivers, never added to currency or presented as observed ROI.

Reconcile the guideline's required feature inputs in one row per Must: impact1–5, monthly reach, build hours, monthly TCO, serving-token cost, period, source and threshold result. Currently all economic benefit drivers are unknown; serving token use0 has bounded predecessor evidence; historical PR9 observed0 external requests; Graph 0.4.2 effects checks remain pending. Cost-free provider access does not make development or customer effort free.

## Base, Downside and Upside

| Scenario | Driver definitions, not invented values | Decision |
|---|---|---|
| Base | Most supported current estimates for A01–A14; no customer until evidence | Unknown outputs; one-pilot capacity bound |
| Downside | Lower conversion/retention, longer delivery/support/collection, greater refunds | Stop expansion if cash-floor/capacity/free-tier constraint fails |
| Upside | Evidence-supported conversion/use gain, still capacity-capped and no paid overage | Do not add pilots beyond observed solo capacity |
| Sensitivities | Vary price, support hours, conversion and payment lag one at a time over sourced ranges | Report break-even crossings and unresolved inputs, not arbitrary optimistic percentages |

Top-down market = eligible organisations×relevant teams×tested annual value. Bottom-up = reachable qualified teams×observed conversion×capacity-capped tested annual value. Sources, geography/date, exclusions, overlap and reconciliation are mandatory; outputs remain unknown. A sector investment figure is not either method.

## ADLC cost ledger and source proof

| Ledger line | Basis | Current value / limitation |
|---|---|---|
| L-DISCOVERY | source review/research/consent preparation time and tool use | Active time partially observable; no numeric allocation yet |
| L-BUILD | code/test/docs active work, failed attempts, compute and authoring tokens | Exact execution receipts to be joined; token/cost absent stays unknown |
| L-VERIFY | contracts, parity, browser/offline, resource measurement and evaluator time | Runbook binds focused/build/live passes, repaired discovery checks, pending reconciled-candidate CI and open offline proof; active time unknown |
| L-RELEASE | native source/CI/publication/integration |Retirement PR10 merged as59b3fc81 with native source closeout complete/checkout retained; Graph0.4.2 blocked on alignment/unpublished; no deployment receipt |
| L-PILOT | onboarding/support/fulfilment/retention observations | No pilot; not zero-cost evidence |
| L-SERVING | runtime model/API/provider calls per accepted operation | Constraint0; Historical PR9 observed0 external requests; Graph serving effects/offline measurement pending |

Record elapsed versus active time separately and do not count parallel wall time twice. Store failed-work cost, retained reusable outputs and opportunity-cost assumptions; no savings claim without a comparable baseline. Projection numbers must cite these owned inputs, formulas and dates. Before audience or commercial use, populate/reconcile independently or retain an explicit incomplete status.
