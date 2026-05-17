# Clinical Trial Intelligence — Domain Reference

*Module 4 — TrialSafety + TrialMatch*

---

## The Clinical Trial Lifecycle Problem

Clinical trials move through three phases where data-driven decisions are critical:

```
Recruitment          →   In-Trial Safety         →   Regulatory Reporting
(TrialMatch)             (TrialSafety)                (ICH E2B narrative)
"Who can enrol?"         "Are participants safe?"      "What happened and why?"
```

**Both apps in this module address real, paid problems in the same commercial ecosystem** (pharma sponsors, CROs, academic research sites).

---

## Part 1 — Pharmacovigilance and Adverse Event Safety

### What Is Pharmacovigilance?

Pharmacovigilance (PV) is the science of detecting, assessing, understanding, and preventing adverse effects of medicines. During a clinical trial, every adverse event (AE) must be:

1. Captured at the site (done by TrialCapture, Module 2)
2. Assessed for seriousness and causality
3. Reported to the sponsor and regulator within defined timelines
4. Monitored for signals — patterns that suggest a previously unknown risk

**Signal detection** is the highest-value function: spotting that 4 participants developed the same AE in a 7-day window is not noise — it may be a product safety issue requiring trial suspension.

### Adverse Event Grading — CTCAE Scale

The Common Terminology Criteria for Adverse Events (CTCAE v5.0) is the standard grading system used in oncology and clinical trials worldwide. Every AE gets a grade:

| Grade | Description | Action |
|-------|-------------|--------|
| 1 | Mild — asymptomatic or mild symptoms | Monitor |
| 2 | Moderate — limiting instrumental ADL | Local intervention |
| 3 | Severe — limiting self-care ADL | Hospitalisation likely |
| 4 | Life-threatening | Urgent intervention required |
| 5 | Death | Fatal outcome |

**Serious Adverse Events (SAEs)** are any AE that results in death, is life-threatening, requires hospitalisation, or causes persistent disability — regardless of grade. SAEs require expedited reporting (within 24 hours in many jurisdictions).

### ICH E2B — Regulatory Safety Reporting Standard

The International Council for Harmonisation (ICH) E2B guideline defines the standard electronic format for Individual Case Safety Reports (ICSRs). A signal narrative in ICH E2B format contains:

1. **Identification** — case ID, date of receipt, report source
2. **Patient** — demographics, medical history (de-identified)
3. **Reaction(s)** — description, onset date, severity, outcome
4. **Suspect drug** — name, dose, route, start/stop dates
5. **Causality assessment** — probable / possible / unlikely (WHO-UMC scale)
6. **Narrative** — free-text clinical summary integrating all the above

Writing these narratives is currently done by trained PV specialists at £80–£120/hour, taking 2–3 hours per signal. TrialSafety's AI narrative generator automates the first draft.

### Signal Detection Concepts

**Disproportionality analysis** — comparing AE rates in the trial to background population rates. A signal is flagged when the observed rate exceeds expectation.

**Temporal clustering** — multiple participants experiencing the same AE within a narrow time window. This is what TrialSafety's AQL queries detect.

**Causality assessment vocabulary (WHO-UMC):**
- **Certain** — plausible time sequence, confirmed on rechallenge, no other explanation
- **Probable/Likely** — plausible time sequence, response to dechallenge, not clearly attributable to other causes
- **Possible** — plausible time sequence, but another explanation is equally plausible
- **Unlikely** — temporal relationship makes a contribution unlikely
- **Conditional/Unclassified** — more data needed
- **Unassessable** — insufficient information to assess

### Common Trial AE Types (Seed Data Reference)

| AE Name | System Organ Class | Common Grade | Notes |
|---------|-------------------|--------------|-------|
| Fatigue | General disorders | 1–2 | Most common trial AE; often background noise |
| Headache | Nervous system | 1–2 | High background prevalence |
| Nausea | GI disorders | 1–2 | Common with many trial drugs |
| Injection site reaction | Skin | 1 | Esp. in vaccine/biologics trials |
| Hypertension | Cardiac disorders | 2–3 | Often pre-existing, trial-exacerbated |
| ALT elevation | Investigations (liver) | 2–3 | Hepatotoxicity signal concern |
| QT prolongation | Cardiac disorders | 3 | Serious — always flagged |
| Anaphylaxis | Immune system | 4–5 | Rare but trial-stopping |

**Deliberate signal in Module 4 seed data:** 4 participants develop Grade 2 fatigue + headache cluster in the same 7-day window (week 8 of trial). This is the signal TrialSafety will detect and narrate.

---

## Part 2 — Clinical Trial Recruitment

### The Recruitment Crisis

> **80% of clinical trials fail to enrol on time.** Each delayed trial day costs a sponsor $600,000–$8,000,000 in direct costs (staff, site fees, delayed product launch revenue).

The root cause is not patient scarcity — it is information failure. Patients who match eligibility criteria exist in clinical records, but:

- Eligibility criteria are written in dense protocol language that clinicians find impractical to screen against
- Most sites still search manually (reviewing patient lists by memory or partial EMR search)
- Structured queries against CDRs are technically possible but require AQL expertise sites don't have

TrialMatch solves the information failure: natural language criteria in → matched patient list out.

### Eligibility Criteria Structure

Every clinical trial protocol includes:

**Inclusion criteria** — conditions the patient MUST meet to participate:
- Age range (e.g., 18–65)
- Confirmed diagnosis (ICD-10 or SNOMED code)
- Score threshold met (e.g., ASRS Part A ≥ 4)
- No prior treatment with the study drug
- Adequate organ function (lab value ranges)

**Exclusion criteria** — conditions that disqualify the patient:
- Pregnancy or lactation
- Serious comorbidities (cardiac, renal, hepatic impairment)
- Concurrent trial participation
- Specific concomitant medications (contraindicated)
- Recent hospitalisation

**Protocol example (simplified):**
```
INCLUSION:
- Age 18–55 years
- DSM-5 diagnosis of ADHD (ICD-10: F90.0, F90.1, or F90.2)
- ASRS Part A score ≥ 4
- RAADS-R total score < 65 (to exclude autism comorbidity as primary)

EXCLUSION:
- Currently enrolled in another interventional trial
- Diagnosis of Autism Spectrum Disorder as primary condition (ICD-10: F84.0)
- Current use of any stimulant medication
```

### AI Translation: Natural Language → AQL

The AI translates the above protocol text into parameterized AQL queries by:

1. **Extraction** — identifying each criterion as inclusion or exclusion, with type (diagnosis, score, age, medication, enrollment status)
2. **Mapping** — linking each criterion to its archetype path in the openEHR CDR:
   - Diagnosis → `EVALUATION.problem_diagnosis.v1` code_string
   - ASRS score → CLUSTER path in `adhd_initial_assessment`
   - Current enrollment → presence of `trial_encounter` composition in EHR
3. **AQL generation** — producing a parameterized query per criterion, then combining with AND/NOT IN logic
4. **Execution and refinement** — running the query, evaluating count, adjusting if zero results (explaining which criterion is most restrictive)

### Why openEHR Is Uniquely Suited to This

Standard EMRs (EMIS, SystmOne, Epic) require custom HL7/FHIR extraction pipelines with institution-specific field mapping. openEHR provides:

- **Semantic typing** — an ASRS score is not just a number; it is an `openEHR-EHR-CLUSTER.asrs_v1_1.v0` element with archetype meaning
- **Standard paths** — the same AQL path works across any conformant EHRbase deployment
- **No extraction step** — data is already structured for query; no ETL needed
- **Provenance** — every composition includes who recorded the data, when, and in what context

This is the core commercial argument: openEHR as an AI-ready data foundation. The AI doesn't need to understand document structure or field naming conventions — it reasons about archetypes.

---

## Part 3 — Data Substrate (Module 4 CDR Contents)

### Three Templates in One EHRbase

| Template | Source Module | Clinical Domain | Subject Namespace |
|----------|-------------|-----------------|------------------|
| `trial_encounter` | Module 2 | Trial visit — vitals + AEs + medications | `trial_participants` |
| `adhd_initial_assessment` | Module 3 | ADHD diagnostic assessment (ASRS + DIVA-5) | `neuro_patients` |
| `autism_initial_assessment` | Module 3 | Autism diagnostic assessment (AQ-10 + RAADS-R) | `neuro_patients` |

5 patients have data across both namespaces — they are trial participants who also have neurodevelopmental assessments. These are the most interesting patients for TrialMatch eligibility queries.

### Key Archetype Paths for AQL (Reference)

**From `trial_encounter`:**

| Data Point | Archetype | FLAT path (approximate) |
|-----------|-----------|------------------------|
| Systolic BP | `OBSERVATION.blood_pressure.v2` | `trial_encounter/blood_pressure/any_event:0/systolic` |
| AE name | `EVALUATION.adverse_reaction_risk.v2` | `trial_encounter/adverse_reaction_risk:N/specific_substance` |
| AE severity | `EVALUATION.adverse_reaction_risk.v2` | `trial_encounter/adverse_reaction_risk:N/criticality` |
| AE onset date | `EVALUATION.adverse_reaction_risk.v2` | `trial_encounter/adverse_reaction_risk:N/reaction_details:0/onset_of_last_reaction` |
| Medication name | `EVALUATION.medication_summary.v1` | `trial_encounter/medication_summary:N/medication_name` |
| Visit type | Composition context | `c/name/value` |

**From `adhd_initial_assessment`:**

| Data Point | FLAT path fragment |
|-----------|-------------------|
| ASRS Part A score | `.../asrs_v1_1/part_a_score` |
| ASRS total score | `.../asrs_v1_1/total_score` |
| ASRS threshold met | `.../asrs_v1_1/threshold_met` |
| Global functional impact | `.../functional_impact/global_functioning` |
| Comorbidity: ASD | `.../comorbidity_screening/autism_spectrum_disorder` |

**From `autism_initial_assessment`:**

| Data Point | FLAT path fragment |
|-----------|-------------------|
| AQ-10 total score | `.../aq10_assessment/total_score` |
| AQ-10 threshold met | `.../aq10_assessment/threshold_met` |
| RAADS-R total score | `.../raads_r_assessment/total_score` |
| RAADS-R threshold met | `.../raads_r_assessment/threshold_met` |

---

## Part 4 — AI Integration Architecture

### Claude API — Tool Use Pattern

Both apps use the **tool use** pattern where Claude is given a tool that calls the EHRbase AQL endpoint. This means Claude can fetch its own data rather than being handed pre-fetched results.

```
User request
    ↓
System prompt (cached):
  - Template schema / archetype definitions
  - AQL syntax reference
  - Domain context (ICH E2B structure / eligibility criteria patterns)
    ↓
Claude decides to call tool: execute_aql(query_string)
    ↓
Tool handler: POST /ehrbase/rest/openehr/v1/query/aql
    ↓
AQL results returned to Claude
    ↓
Claude generates narrative / cohort summary / refined AQL
    ↓
Response streamed to UI
```

### Prompt Caching

Template schemas and archetype definitions are large, static, and repeated across requests. They are placed in the system prompt and marked for caching:

- Reduces latency on subsequent requests significantly
- Reduces token cost per call after first cache population
- Cache TTL: 5 minutes (kept warm by the volume of requests during active use)

The cached portion includes:
- Full template definitions for all three OPT files
- FLAT JSON path reference for all queryable fields
- AQL syntax cheatsheet with EHRbase-specific extensions
- ICH E2B narrative structure template (TrialSafety only)

### TrialSafety — Narrative Generator Flow

```
Signal detected by AQL (N AEs, same type, narrow time window)
    ↓
User: "Generate Signal Narrative"
    ↓
AI system prompt: ICH E2B structure + PV terminology (cached)
AI user message: "Analyse this safety signal and write an ICH E2B narrative"
    ↓
AI tool call: execute_aql(signal query — all matching AEs with participant context)
    ↓
AI generates structured narrative:
  1. Signal description
  2. Affected participants summary
  3. Temporal pattern analysis
  4. Causality assessment
  5. Recommended actions
    ↓
Narrative streamed to UI → user reviews → exports
```

### TrialMatch — Eligibility Screener Flow

```
User pastes eligibility criteria text
    ↓
AI (extraction step): parse criteria → structured list (inclusion/exclusion, type, values)
User confirms/edits extracted criteria
    ↓
AI (generation step): map criteria to archetype paths → generate parameterized AQL
AQL shown to user for review/edit
    ↓
AI (execution loop):
  Tool call: execute_aql(generated_query)
  If result_count == 0: refine query, explain restriction, retry (max 3 iterations)
  If result_count > 0: proceed
    ↓
AI (characterisation): generate cohort summary narrative
    ↓
User saves as stored AQL for this trial protocol
```

---

## Part 5 — Regulatory and Commercial Context

### Regulatory Landscape

**ICH E6 GCP (Good Clinical Practice):** The international ethical and scientific quality standard for clinical trials. Requires audit trails, investigator accountability, and contemporaneous data recording. TrialCapture (Module 2) addresses this; TrialSafety queries that data.

**ICH E2A (Clinical Safety Data Management):** Defines expedited reporting requirements. SAEs must be reported to regulators within 7 days (fatal/life-threatening) or 15 days (other serious). Signal narrative export supports this workflow.

**21 CFR Part 11 (FDA):** US regulation governing electronic records in clinical trials. Requires audit trails, version control, and access controls. Addressed by EHRbase's versioned compositions.

**EU Clinical Trials Regulation (536/2014):** Replaced CTD, mandates EudraVigilance integration for SAE reporting within EU. Narrative export supports the free-text fields in EudraVigilance.

**GDPR / UK GDPR:** All seed data in Module 4 is synthetic. No real patient data is used. In production, subject IDs would be pseudonymised (trial participant IDs, not names or NHS numbers).

### Commercial Ecosystem

| Buyer | Problem | Willingness to Pay |
|-------|---------|-------------------|
| Pharma sponsor (PV team) | Signal narrative writing at scale | £100K–£1M/year for PV software |
| CRO (Contract Research Organisation) | Faster site activation via smart recruitment | Per-site license, £20K–£100K |
| Academic research site (NHS trust) | Can't afford Medidata Rave or Oracle InForm | SaaS model, £5K–£30K/year |
| Biotech (early-stage, cost-sensitive) | Full Medidata license > annual revenue | Usage-based, £500–£2K/month |

**Adjacent market:** Real World Evidence (RWE) studies — same eligibility screening problem but against longitudinal routine care data rather than trial data. TrialMatch's architecture transfers directly.

---

## Part 6 — Terminology Reference

| Term | Definition |
|------|-----------|
| AE | Adverse Event — any untoward medical occurrence in a trial participant |
| SAE | Serious Adverse Event — death, life-threatening, hospitalisation, disability |
| SUSAR | Suspected Unexpected Serious Adverse Reaction — expedited reporting required |
| PV / Pharmacovigilance | Science of monitoring drug safety post-authorization (and in trials) |
| CTCAE | Common Terminology Criteria for Adverse Events — grading scale (v5.0) |
| ICH | International Council for Harmonisation — global regulatory harmonization body |
| E2B | ICH guideline defining ICSR electronic format |
| ICSR | Individual Case Safety Report — single AE report submitted to regulator |
| GCP | Good Clinical Practice — ICH E6 ethical/quality standard |
| CRO | Contract Research Organisation — company running trials on behalf of sponsors |
| DCT | Decentralised Clinical Trial — patients seen at community/home sites, not central hospital |
| EDC | Electronic Data Capture — trial data management system (e.g. Medidata Rave, Oracle InForm) |
| CTMS | Clinical Trial Management System — site and study management (separate from EDC) |
| IEC | Informed and Eligibility Criteria — protocol section listing inclusion/exclusion criteria |
| MedDRA | Medical Dictionary for Regulatory Activities — standard AE coding dictionary |
| SOC | System Organ Class — top-level MedDRA category (e.g. Cardiac disorders) |
| PT | Preferred Term — MedDRA term below SOC level |
| AQL | Archetype Query Language — openEHR's SQL-like query language |
| OPT | Operational Template — compiled archetype template uploaded to EHRbase |
| CDR | Clinical Data Repository — the database storing all openEHR compositions |
| FLAT JSON | Simplified openEHR serialisation format (dot-path notation) |
| Composition | Single clinical document in openEHR (e.g. one visit encounter) |
| EHR | Electronic Health Record — one patient's longitudinal record in EHRbase |
| WHO-UMC | Uppsala Monitoring Centre causality classification scale |
| RWE | Real World Evidence — analysis of routine clinical data rather than trial data |
