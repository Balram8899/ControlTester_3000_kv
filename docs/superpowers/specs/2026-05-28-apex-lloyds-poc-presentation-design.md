# Apex — Lloyds Banking Group PoC Presentation Design
**Date:** 2026-05-28
**Status:** Approved
**Audience:** Mixed room — executive sponsor (CISO / Chief Risk Officer) + technical evaluator (Cloud / Security Engineering)
**Client:** Lloyds Banking Group
**Ask:** Approve the paid Proof of Concept engagement

---

## Context

Apex (formerly TRACE / ControlTester 3000) is an AI-native controls intelligence platform for internal audit, risk, and compliance. The client (Lloyds Banking Group) has been approached to commission a paid PoC, deployed fully inside their own GCP organisation and VPC, leading to a full-scale SaaS build.

**Key positioning decisions locked in this session:**
- Platform name is **Apex** — not TRACE, not ControlTester
- Audience framing is **function-agnostic** — "any team with regulatory obligations or controls ownership" — do NOT call out LoD1/LoD2 or Internal Audit specifically. Any line of defence may use any module.
- Deployment model is **Lloyds' own GCP org / VPC** — tenant-isolated, zero data egress — this is the primary trust differentiator
- Regulatory context is **UK banking**: FCA/PRA supervisory expectations, DORA, Basel IV, PCI-DSS
- Scoring models, thresholds, and frameworks are **configurable** — never present implementation specifics (e.g. "CIA 1–5") as fixed constraints

---

## Deck Structure — 4 Slides

### Slide 1 — The Apex Platform

**Headline:** Apex — AI-Native Controls Intelligence for Enterprise Audit

**Sub-headline:** A complete internal audit operating system: from regulatory ingestion to signed workpapers

**Body — three capability groups:**

#### Assurance & Testing
- **Controls Assurance** — AI-guided end-to-end testing pipeline with evidence analysis, sampling, and workpaper generation
- **Control Testing** — Upload evidence documents; the platform maps, analyses, and identifies gaps automatically
- **Control 360** — Single-pane view of any control: health, issues, evidence, and regulatory linkages
- **Controls Diagnostics** — Real-time quality scoring and coverage dashboards across your entire control population

#### Risk & Compliance Intelligence
- **Regulatory Library** — Ingest regulatory documents; AI extracts and structures individual obligations automatically
- **Regulatory Testing** — Map your controls to obligations and score coverage across any framework
- **Risk Assessment** — Structured AI-facilitated risk questionnaires with configurable scoring and reporting
- **Regulation → Controls Coverage** — Visual heat map of where your controls meet — or miss — regulatory obligations

#### Operations & Governance
- **Controls Library** — Centralised control repository with AI quality analysis and a validation review queue
- **Document Uplift** — AI-driven improvement of control statements against configurable quality standards
- **Asset Registry** — Asset intelligence with criticality scoring and control linkage
- **Issue Management** — End-to-end findings workflow from identification through to resolution
- **Reports & Exception Management** — Audit workpapers, PDF exports, and exception tracking

**Footer callout:**
> All scoring models, frameworks, and thresholds are configurable. Fully provider-agnostic LLM layer — runs on Vertex AI or any approved model endpoint. Zero data leaves your perimeter.

---

### Slide 2 — Why Apex for Lloyds Banking Group

**Headline:** Why Apex for Lloyds Banking Group

**Sub-headline:** Built for any team with regulatory obligations, controls ownership, or compliance oversight

**Five priority pillars:**

**1 — Regulatory Coverage at Scale**
Ingest FCA/PRA, DORA, Basel IV, and PCI-DSS as structured obligation libraries. Map your controls estate against them and surface gaps, overlaps, and coverage scores — without manual crosswalking — for any team that needs to demonstrate regulatory alignment.

**2 — Controls Assurance for ITGC & ITAC**
Automates evidence collection, completeness and accuracy verification, sampling, testing, and SOX-format workpaper generation. Any function running control assessments gets a fully auditable, signed-off record.

**3 — AI Inside Your Perimeter**
Deployed into Lloyds' own GCP organisation and VPC. No data leaves your boundary. LLM inference runs on Vertex AI within your approved cloud boundary — meeting FCA operational resilience and data residency requirements.

**4 — Configurable to Lloyds' Standards**
Scoring models, control quality thresholds, risk frameworks, and workflow rules are all configurable. Apex adapts to your internal methodology, not the other way around.

**5 — Defensible Audit Trail End-to-End**
Every AI output is logged, reviewable, and overridable by a human. Validation queues, exception management, and issue workflows give any team a documented, challengeable process — ready for regulatory scrutiny.

---

### Slide 3 — POC Scope, Timeline & Ask

**Headline:** Phase 1: Paid Proof of Concept — Deployed in Lloyds' GCP Environment

#### POC Scope — What Gets Built

| Module | Phase |
|---|---|
| Regulatory Library (ingest FCA/PRA, DORA obligations) | PoC |
| Regulatory Testing (controls-to-obligations mapping + coverage scoring) | PoC |
| Controls Assurance (ITGC pipeline — evidence upload, sampling, workpaper output) | PoC |
| Controls Library (repository + AI quality analysis) | PoC |
| Issue Management | PoC |
| Dashboard & Reporting | PoC |
| Document Uplift, Risk Assessment, Asset Registry | Phase 2 |

#### Proposed Timeline — [X] weeks

| Week | Milestone |
|---|---|
| 1–2 | GCP environment setup, infrastructure provisioning in Lloyds VPC |
| 3–4 | Core platform deployment + regulatory library seeded with Lloyds frameworks |
| 5–6 | Controls Assurance pipeline configured + first ITGC test run |
| 7–8 | Regulatory Testing live + coverage dashboard populated |
| 9–[X] | UAT, refinement, stakeholder demo |

#### Success Criteria
- Regulatory obligations extracted and mapped from at least [N] Lloyds frameworks
- End-to-end ITGC workpaper generated from live evidence within the platform
- All data processed and stored within Lloyds' GCP boundary — verified by Lloyds security team
- Any nominated team within Lloyds can independently operate the platform and produce a complete regulatory coverage or controls assurance output without vendor support

#### The Ask
- Approve paid PoC engagement: **[£X]**
- Lloyds GCP org access for deployment
- Nominated risk/compliance + IT sponsor for the duration of the PoC

---

### Slide 4 — GCP Architecture

**Headline:** Apex on GCP — Deployed Within Lloyds' Cloud Boundary

**Sub-headline:** Every component runs inside Lloyds' own GCP org and VPC. No data egress. No shared tenancy.

**[Architecture diagram — Apex PoC Architecture on Google Cloud Platform v3]**

Diagram shows three layers inside the Lloyds GCP Org / Project Boundary > Lloyds VPC / Private Service Boundary:

- **Ingress & Security:** Cloud DNS → HTTPS Load Balancer → Cloud Armor → Cloud Run Web → Cloud Run API
- **Application Runtime:** Cloud Tasks → Cloud Run Jobs → Document AI → Vertex AI → AI Safety (Model Armor / DLP)
- **Data, AI & Governance:** MongoDB Atlas on GCP | Cloud Storage | Vector Search | Cloud KMS | Secret Manager | Cloud Logging / Monitoring | Cloud Audit Logs

Full-scale SaaS additions (out of scope for PoC): Identity Platform, Tenant Admin, Billing, Feature Flags, Support Ops, CI/CD, Product Analytics, Client Integrations

**Three supporting callouts:**

> **Data Residency** — All data at rest and in transit stays within Lloyds' GCP org and VPC. MongoDB Atlas on GCP, Cloud Storage, and Vector Search never leave your approved boundary.

> **AI Governance** — Vertex AI inference is contained within the VPC. Model Armor and DLP scan every AI output before it surfaces to users. Cloud Audit Logs give a complete, immutable record of every AI action and human decision.

> **Path to Full SaaS** — The PoC foundation is production-grade from day one. Identity Platform, Tenant Admin, CI/CD, and Client Integrations are scoped for the full-scale build — no architectural rework required.

---

## Design Guardrails

- **Never** name LoD1, LoD2, or Internal Audit as the specific buyer — always use "any team with regulatory obligations or controls ownership"
- **Never** present scoring scales (e.g. 1–5, 1–10) as fixed — always frame as configurable
- **Never** call the platform TRACE — it is **Apex**
- **Always** lead with the Lloyds VPC boundary as the primary trust anchor in any technical conversation
- **Always** present Phase 2 modules (Document Uplift, Risk Assessment, Asset Registry) as available and scoped — not missing features

---

## Open Placeholders (to be filled before the deck goes out)

| Placeholder | Owner |
|---|---|
| PoC timeline total length [X weeks] | Engagement lead |
| Number of regulatory frameworks in scope [N] | Engagement lead |
| PoC commercial figure [£X] | Commercial lead |
| Lloyds-specific framework names to call out by name | Client confirmation |
