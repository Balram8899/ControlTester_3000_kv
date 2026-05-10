# Wealth Management Operations — Synthetic Dataset Data Dictionary

**Data origin:** All records in this dataset are fully synthetic. No real client, employee, account, legal, security, issuer, branch, email, file path, or proprietary data has been used or reproduced. Names of people, firms, securities, identifiers (CUSIP/ISIN/SEDOL), and account numbers are randomly generated and do not refer to real entities.

**Coverage period:** 2024-01-01 through 2026-05-30 (varies by table).

**Output format:** UTF-8 CSV files, one per table.

---

## Table inventory

| # | Table | Rows | Primary key |
|---|-------|------|-------------|
| 1 | `risk_register` | 107 | (`ERIC Risk Number`, `ERIC Control Number`) — composite |
| 2 | `controls_inventory` | 25 | `ERIC Control Number` |
| 3 | `operational_risk_events` | 180 | `Impact ID` (with `Event ID` as parent) |
| 4 | `issues_actions` | 120 | `Issue ID` |
| 5 | `voluntary_ca_events` | 150 | `Voluntary Event ID` |
| 6 | `voluntary_bulletin_reviews` | 301 | `Bulletin Review ID` |
| 7 | `critical_date_report` | 221 | `Critical Date Report ID` |
| 8 | `mandatory_equity_events` | 140 | `Mandatory Event ID` |
| 9 | `fixed_income_bond_events` | 110 | `Bond Event ID` |
| 10 | `entitlement_events` | 120 | `Entitlement Event ID` |
| 11 | `optional_dividend_elections` | 70 | `Optional Dividend Event ID` |
| 12 | `physical_certificate_exchanges` | 90 | `Physical Exchange ID` |
| 13 | `process_flow_steps` | 142 | `Process Flow ID` |

**Total rows:** 1,876

---

## Foreign key relationships

```
controls_inventory (ERIC Control Number)
    ←── risk_register.ERIC Control Number       [many-to-one]
    ←── issues_actions.Related Control ID       [many-to-one]

voluntary_ca_events (Voluntary Event ID, Depository Event ID)
    ←── voluntary_bulletin_reviews.Depository Event ID   [many-to-one]
    ←── critical_date_report.Event ID                    [many-to-one]

securities universe (CUSIP / ISIN / Security Code)        [shared lookup]
    ←── voluntary_ca_events
    ←── voluntary_bulletin_reviews
    ←── critical_date_report
    ←── mandatory_equity_events
    ←── fixed_income_bond_events
    ←── entitlement_events
    ←── optional_dividend_elections
    ←── physical_certificate_exchanges
```

Risk classifications, root causes, business units, control names, and procedure names are aligned across `risk_register`, `controls_inventory`, `operational_risk_events`, and `issues_actions` so analytics joining these tables produce sensible co-occurrences.

---

## 1. risk_register

Granularity: one row per risk × control mapping. A single ERIC Risk Number may appear in multiple rows (one per linked control).

| Column | Type | Description / values |
|---|---|---|
| ORMS Business Unit Lvl 1 | string | Top-level business unit (e.g., Wealth Management Operations). |
| ORMS Business Unit Lvl 2 | string | Sub-unit (e.g., Corporate Actions). |
| Risk Classification Level 1 | enum | One of 13 risk categories (see source spec). |
| Risk Classification Level 2 | string | Subcategory consistent with L1. |
| Inherent Risk Rating Final | enum | High / Medium / Low. |
| Residual Risk Rating Final | enum | High / Medium / Low; cannot exceed inherent. |
| Root Cause Classification Level 1 | enum | Process / People / System / External / Third Party Failure. |
| Root Cause Classification Level 2 | enum | 14 source-spec values. |
| ERIC Risk Number | string | `ERIC-R-#####`. |
| Risk Statement | string | Templated statement aligned to L1. |
| Risk Owner | string | Synthetic person. |
| Risk Status | enum | Active / Under Review / Closed. |
| ERIC Control Number | FK | References `controls_inventory.ERIC Control Number`. |
| Control Environment Rating | enum | Strong / Adequate / Needs Improvement. |
| Control Name | string | Mirrors control. |
| RCM Control Identifier | string | RCM identifier. |
| Key Control | enum | Yes / No. |
| Most Recent Published CA Conclusion | enum | Effective / Effective with Exceptions / Adequate / Not Yet Concluded / Ineffective. |
| SOX Control | enum | Y / N. |

---

## 2. controls_inventory

Granularity: one row per control. 25 controls covering account transfers, KYC/AML, payments, trade confirmations, statements, corporate actions, fee billing, reconciliations, journals, security counts, vault access, regulatory reporting, privacy, third-party monitoring, IT access, BCP.

Fields and allowed values follow the source spec exactly. Notable enums:

- `Control Status`: Published.
- `RCM Control Flag`: RCM Plus / RCM Only / Non RCM.
- `SOX Control`: Y / N (skewed toward financial-reporting and reconciliation controls).
- `Key Control`: Yes / No.
- `Control Type`: Preventative / Detective.
- `Control Method`: Manual / Automatic / Combination.
- `Control Effectiveness`: Effective / Ineffective / Effective with Exceptions / Not Yet Rated / Adequate.

Control descriptions include frequency, responsible team, system/report, evidence retention, maker-checker, and escalation path.

---

## 3. operational_risk_events

Granularity: one row per impact. `Event ID` (`LE_########`) groups impacts; `Impact ID` (`LI_########`) is unique per row.

Notable rules:
- `Impact Type` distribution: Loss 55% · Timing Errors 20% · Other Incidents 15% · Gain 10%.
- 95% of losses are < CAD 25k; 5% are large outliers (CAD 50k–750k).
- Near misses, stakeholder impacts, and reputational impacts always have CAD 0 impact.
- Risk classifications and root causes match scenarios (e.g., "phishing attempt" → Fraud Risk / External fraud - digital).

---

## 4. issues_actions

Granularity: one issue per row. Includes 25+ realistic issue scenarios across procedures, audit trails, FATCA refresh, SOX evidence, access reviews, and remediation tracking.

Notable rules:
- 30% of issues are retargeted (1–3 retargets), with `Issue Slippage Reason` populated.
- `Issue Workflow Status` distribution: In Progress 45% · Closed 30% · Past Due 10% · Pending Validation 10% · On Hold 5%.
- `Related Control ID` always references a real control in `controls_inventory`.
- `Related Procedure` drawn from a 15-item procedure library used across the dataset.

---

## 5. voluntary_ca_events

Granularity: one row per voluntary corporate action event.

Notable rules:
- Reorg expiry = Issuer expiry − 2 calendar days for **all** rows (validated).
- ~5% of events have zero holders (modelling no-holder / archive workflow).
- Status distribution: Released 55% · Closed 20% · Pending 15% · On Hold 5% · Cancelled 5%.
- DSNet/REOR flags are `Y` only when status is Released or Closed.
- `Dutch Auction Flag = Y` only when Event Type = Dutch Auction.
- `Oversubscription Flag = Y` only for Tender / Rights events.

Identifiers:
- `Voluntary Event ID`: `VES-######`.
- `Bank Event ID`: `BNK-#######`.
- `Depository Event ID`: `DEP-########` (FK target for bulletin reviews and CDR).

---

## 6. voluntary_bulletin_reviews

Granularity: one row per (event × bulletin pull). Each voluntary event surfaces in 1–3 bulletin reviews.

Depository-specific logic:
- **CDS:** `CA Type` ∈ {V, MWO, G, M}. Distribution: V≈G > MWO > M.
- **DTC:** `Report Type` ∈ {RPA Create with Position, RPA Updated with Position, Declared Payable Redemptions}.
- **I&TS:** `Report Type` ∈ {Email Attachment, PDF Binder, Excel Conversion, Macro-Created Report}.
- **Euroclear:** Daily Notice.
- `Routed To Mandatory Team Flag = Y` only for DTC events without a CA Type (validated).
- `Input Date Updated Flag = N` for all rows (per rule that released event input dates do not change).
- `Existing VES Record Flag = N` on first bulletin (`New`); `Y` on later bulletins (`Update`).

---

## 7. critical_date_report

Granularity: one row per (report run date × event surfaced). Reports run weekly across the period.

Notable rules:
- Events surface only when `Issuer Expiry` is within ~22 calendar days (~15 BD) of the report date.
- `Account Number` populated only for DTC.
- `Duplicate Removed Flag = Y` only for DTC entries.
- `Odd Lot Offer Flag = Y` only when event type is Odd Lot Offer.
- `Added To VES Flag = Y` only when not already in VES and not a duplicate.

---

## 8. mandatory_equity_events

Granularity: one row per mandatory equity event.

Notable rules:
- Receive security populated only for events that issue a new security (Exchange, Cash and Shares, Merger, Spin-Off, Unit Split, ADR Termination, Stock Split, Stock Dividend).
- `Cash Rate` populated only for events with cash payment.
- Payment workflow chain: required → received → processed (each step gates the next).
- ~8% of events have a discrepancy flag with resolution notes.
- `Payment Required Flag = N` for: Name Change, No Payment / Deemed Worthless, Warrant Expiration, Rights Expiration.

---

## 9. fixed_income_bond_events

Granularity: one row per bond redemption / maturity / call event.

Notable rules:
- `Greater Than 5MM Flag = Y` exactly when `Net Amount` > 5,000,000 CAD-equivalent (validated 91/91).
- Physical certificate workflow fields populated only when `Physical Certificate Flag = Y` (Israel maturities + ~5% of others).
- Manual journal fields populated only when `Manual Journal Required Flag = Y`.
- `JEFE Required Flag` implies manual journal required.
- Backdated entries flagged when client payment booked retroactively.
- Sources: CDS, DTC (full call vs maturity), Euroclear (final redemption, cash-and-share), Bank of New York, State of Israel (physical).

---

## 10. entitlement_events

Granularity: one row per stock distribution / entitlement event.

Notable rules:
- Position reconciliation: Box / Depository / Broadridge positions within ±10 → reconciled.
- `Cash In Lieu Required = Y` whenever fractional shares present.
- Taxable events: Optional Stock Dividend, Taxable Stock Dividend → carry FMV, RAJ amount, tax form.
- Due Bill End Date populated only for Due Bill Events.
- P&S report and break amount populated only when not reconciled.

---

## 11. optional_dividend_elections

Granularity: one row per optional dividend event.

Notable rules:
- DTC expiry = Pay date − 5 to 15 calendar days.
- Broadridge cutoff = DTC expiry − 2 calendar days.
- Election tracking window between record date and DTC expiry.
- Default option number 1 = Cash, 2 = Stock; aligned to `Issuer Default Option`.
- All events have REOR created, DSNet published, and entitlements team notified.

---

## 12. physical_certificate_exchanges

Granularity: one row per physical certificate submission.

Notable rules:
- `Medallion Guarantee Present = Y` ⇒ certificate negotiable.
- Submission methods: Over-the-Counter / CDS Envelope / DTC Damp / Courier (with method-specific tracking IDs).
- DTC Deposit ID populated only for DTC Damp; Courier Tracking only for Courier.
- JEFE entry required ~55% of submissions (name change, exchange, redemption, CIL, accrued div, cash & shares, multi-shares received, cheque deposit).
- Reject reason populated when returned to branch.
- Estate accounts ~12%; POA required ~15%.

---

## 13. process_flow_steps

Granularity: one row per (process × step). 17 processes × 5–12 steps each.

Fields capture team swimlane, system, input/output artifacts, SLA target, decision points, manual vs. automated indicators, control points, handoffs, and pain points.

Notable rules:
- ~70% of steps are Manual Step Flag = Y.
- Macro counts populated for manual steps; bot counts for automated steps.
- Pain points and holistic-review comments populated for ~50–60% of steps to support automation candidate identification.

---

## Cross-table consistency rules applied

1. Risk categories and root causes align across `risk_register`, `operational_risk_events`, `issues_actions`, and `controls_inventory`.
2. Every risk references a real control; every issue references a real control.
3. Bulletin reviews and Critical Date Report reference real voluntary events.
4. All corporate-actions tables share the same 220-security synthetic catalog (consistent CUSIP/ISIN/SEDOL/jurisdiction).
5. Reorg expiry = Issuer expiry − 2 BD for all voluntary events.
6. Zero-holder voluntary events do not progress to publishing/processing flags.
7. Released events do not have input dates updated in subsequent bulletin reviews.
8. Bond payments > CAD 5MM correctly flagged.
9. DTC routing to mandatory team only occurs for DTC depositories.
10. Mandatory equity payment workflow is gated (required → received → processed).
11. Physical certificate workflow preserves chain of custody (source → box → scan → submission method → tracking → final).
12. Process flow steps include manual/automated split and team handoffs.

---

## Assumptions

- Dataset volumes are sized for analytics prototyping (~1,800 rows total). Volumes can be scaled up by changing the loop counts in the generator scripts.
- Control population is intentionally compact (25 controls) so risk × control fan-out stays interpretable; expand by adding entries to `CONTROL_FAMILIES`.
- Calendar days are used as a proxy for business days where the source spec said "BD" (e.g., reorg expiry "2BD before issuer"). For analytics purposes this is acceptable; for production simulation, swap in a business-day calendar.
- Currency is CAD-equivalent throughout for ORE and bond events.
- Synthetic personas, firm names, issuers, and law firms are randomly generated and do not match any real entities.
- Identifier formats (CUSIP, ISIN, SEDOL) follow the structural pattern of real identifiers (length, character set) but are not validated against real registries — they are guaranteed to be invalid in real systems.

---

## Validation rules applied

| Rule | Result |
|---|---|
| Risk → Control FK integrity | 0 missing |
| Issue → Control FK integrity | 0 missing |
| Bulletin → Voluntary Event FK integrity | 150/150 |
| CDR → Voluntary Event FK integrity | 93/93 |
| Voluntary events: Reorg = Issuer − 2 days | 150/150 |
| Bond > 5MM correctly flagged | 91/91 |
| Non-DTC rows wrongly routed to Mandatory team | 0 |

---

## Confirmation

This dataset is **fully synthetic**. It contains no real client, employee, account, legal, security, issuer, vendor, or proprietary data. Any resemblance of generated names, identifiers, or amounts to real entities is coincidental and unintended. The dataset is suitable for prototyping, model training where synthetic data is acceptable, demonstrations, and analytics testing.
