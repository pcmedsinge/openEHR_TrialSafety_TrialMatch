# Module 4 — Build Plan & Session State

*Clinical Trial Intelligence Suite: TrialSafety + TrialMatch*

> **How to use this file:** Read this at the start of every session before touching any code or config. Update the "Current State" section and tick completed tasks as you go. This is the single source of truth for where we are and what comes next.

---

## Quick Reference

| Item | Value |
|------|-------|
| EHRbase port | **8084** |
| PostgreSQL port | **5435** |
| TrialSafety frontend | **5173** |
| TrialMatch frontend | **5174** |
| Composition format | **FLAT JSON** |
| AI model | **claude-sonnet-4-6** |
| AI pattern | **Tool use** (Claude calls AQL endpoint as a tool) |
| Planning doc | `OPENEHR_Starting/handoffs/module4_planning.md` |
| Domain reference | `CLINICAL_TRIAL_INTELLIGENCE_DOMAIN.md` (this folder) |

---

## Two Apps — What They Do

### App 1 — TrialSafety (build first)
Pharmacovigilance dashboard. Queries `trial_encounter` compositions for AE patterns across 30 trial participants. Detects signals (same AE type, narrow time window). Claude generates ICH E2B-style safety narrative via tool use.

### App 2 — TrialMatch (build second)
Eligibility screener. User pastes trial protocol criteria in natural language. Claude extracts structured criteria, generates parameterized AQL, executes it via tool use, refines if needed, outputs matched patient cohort with narrative.

---

## Templates in This Module's EHRbase

All three OPT files must be loaded into EHRbase (port 8084) before seed data runs.

| Template ID | OPT file location | Subject namespace |
|-------------|------------------|-------------------|
| `trial_encounter` | `Module2_TrialCapture/trial_encounter.opt` | `trial_participants` |
| `adhd_initial_assessment` | `Module3_ADHDCapture_AutismCapture/` (find .opt) | `neuro_patients` |
| `autism_initial_assessment` | `Module3_ADHDCapture_AutismCapture/` (find .opt) | `neuro_patients` |

Upload via: `POST /ehrbase/rest/openehr/v1/definition/template/adl1.4` (Content-Type: application/xml)

---

## Seed Cohort — What Must Be In It

| Dataset | Target volume | Notes |
|---------|--------------|-------|
| Trial participants | 30 | Each gets 4–6 `trial_encounter` compositions |
| Trial visit compositions | ~150 | Vitals + realistic AE distribution |
| ADHD assessments | 20 patients | `adhd_initial_assessment` FLAT JSON |
| Autism assessments | 20 patients | `autism_initial_assessment` FLAT JSON |
| Overlap patients | 5 | Both `trial_participants` + `neuro_patients` data |

**Deliberate safety signal (required):** 4 participants develop Grade 2 fatigue + headache in the same 7-day window (week 8 of trial, ~day 50–57 from trial start). This is what TrialSafety will detect and narrate.

AE distribution for the remaining data:
- Fatigue Grade 1: ~40% of visits
- Headache Grade 1: ~30% of visits
- Nausea Grade 1: ~20% of visits
- Injection site reaction Grade 1: ~15% of visits
- Hypertension Grade 2: ~5% of visits (2–3 participants, consistent across visits)

Score distributions:
- ASRS Part A: 15/20 patients ≥4 (positive screen)
- AQ-10: 12/20 patients ≥6 (positive screen)
- RAADS-R: 10/20 patients ≥65 (positive screen)

---

## AI Integration — Claude API Pattern

Both apps share the same tool use pattern. Build as a shared utility (`/src/lib/claude.ts` or equivalent).

```
System prompt (CACHED — put template schemas + AQL reference here):
  - trial_encounter FLAT paths
  - adhd_initial_assessment FLAT paths
  - autism_initial_assessment FLAT paths
  - EHRbase AQL syntax reference
  - Domain context (ICH E2B structure for TrialSafety / eligibility patterns for TrialMatch)

Tool definition:
  name: execute_aql
  description: Execute an AQL query against EHRbase and return results
  input_schema: { query: string, parameters?: object }

Tool handler (backend/server route):
  POST /ehrbase/rest/openehr/v1/query/aql
  Body: { q: query, query_parameters: parameters }
  Returns: { rows: [...], columns: [...] }
```

**TrialSafety flow:**
1. AQL detects signal (N AEs, same type, 7-day window)
2. User clicks "Generate Narrative"
3. Claude calls `execute_aql` with full AE context query
4. Claude generates ICH E2B narrative (streamed)
5. User copies/downloads

**TrialMatch flow:**
1. User pastes eligibility criteria text
2. Claude extraction call → structured criteria list (no tool use)
3. User confirms criteria
4. Claude generation call → parameterized AQL
5. Claude calls `execute_aql` (agentic loop, max 3 retries if 0 results)
6. Claude generates cohort characterisation narrative
7. User saves as stored AQL

---

## Build Order (strict)

```
Step 1 — Docker stack
  [ ] docker-compose.yml (EHRbase 8084 + PostgreSQL 5435)
  [ ] init.sql (database init)
  [ ] Start containers, verify EHRbase health at http://localhost:8084/ehrbase/swagger-ui/

Step 2 — Templates
  [ ] Load trial_encounter.opt → EHRbase
  [ ] Load adhd_initial_assessment.opt → EHRbase
  [ ] Load autism_initial_assessment.opt → EHRbase
  [ ] Verify: GET /ehrbase/rest/openehr/v1/definition/template/adl1.4 lists all 3

Step 3 — Seed data
  [ ] Write seed/seed.ts (or seed.py / seed.js — choose one)
  [ ] Generate 30 EHRs (trial_participants namespace)
  [ ] Generate ~150 trial_encounter compositions (FLAT JSON)
  [ ] Generate 20 ADHD EHRs (neuro_patients namespace) + compositions
  [ ] Generate 20 Autism EHRs (neuro_patients namespace) + compositions
  [ ] Wire 5 overlap patients across both namespaces
  [ ] Plant deliberate signal (4 participants, fatigue+headache, days 50–57)
  [ ] Run seed script against live EHRbase
  [ ] Verify via Swagger AQL: SELECT COUNT(*) FROM EHR e → expect 65 EHRs
  [ ] Verify signal data: AQL for AEs in the signal window → expect 4+ hits

Step 4 — TrialSafety (frontend-trialsafety/)
  [ ] Scaffold React app (Vite + TypeScript)
  [ ] AQL query set (write + test in Swagger first):
      [ ] AE frequency by type
      [ ] AE breakdown by severity (Grade 1–5)
      [ ] Signal detection (same AE, 7-day window)
      [ ] Visit completion tracker (count per participant)
      [ ] Vitals outside normal range
  [ ] Signal Dashboard page (landing)
  [ ] Signal Detail page (AE list + context)
  [ ] Participant Safety Profile page
  [ ] Stored AQL panel
  [ ] Claude API integration (narrative generator)
  [ ] Narrative export (clipboard + download)

Step 5 — TrialMatch (frontend-trialmatch/)
  [ ] Scaffold React app (Vite + TypeScript)
  [ ] Trial Protocol Input page (criteria paste + extraction)
  [ ] Eligibility Query Builder page (AQL review/edit)
  [ ] Match Results page (cohort list + criteria breakdown)
  [ ] Stored Trial Protocols page
  [ ] Claude API integration (NL → AQL → cohort narrative)
  [ ] Save/re-run stored AQL

Step 6 — Handoff
  [ ] Write MODULE4_HANDOFF.md
  [ ] Update BOOTCAMP_PROGRESS.md (mark Module 4 Completed)
```

---

## Current State

**Session started:** 2026-05-11
**Status:** Planning complete. Folder structure + domain doc created. Nothing else exists yet.

**Completed this session:**
- [x] Read all planning/handoff docs (module2_handoff, module3_handoff, module4_planning)
- [x] Created folder structure (frontend-trialsafety/, frontend-trialmatch/, seed/, templates/)
- [x] Wrote CLINICAL_TRIAL_INTELLIGENCE_DOMAIN.md
- [x] Wrote MODULE4_PLAN.md (this file)

**Next action:** Docker stack — write docker-compose.yml and init.sql, start containers, verify EHRbase health.

---

## Key Decisions (locked — do not revisit)

1. Self-contained EHRbase — Module 4 seeds its own data, no dependency on Modules 2/3 containers
2. Three templates in one EHRbase — demonstrates multi-template AQL on a single CDR
3. FLAT JSON — consistent with Module 3, simpler than Canonical JSON
4. Stored AQL — both apps use EHRbase stored queries for standard report sets
5. claude-sonnet-4-6 tool use pattern with prompt caching for template schemas
6. Ports 8084/5435 — no conflict with Modules 1–3
7. Build TrialSafety first — simpler AQL (single template) proves architecture before TrialMatch
8. Seed script run once against fresh EHRbase; re-run only if containers are wiped

---

## AQL Reference — Key Queries

### TrialSafety

```sql
-- AE frequency by type
SELECT ae/data[at0001]/items[at0002]/value/value AS ae_name,
       COUNT(*) AS frequency
FROM EHR e CONTAINS COMPOSITION c
     CONTAINS EVALUATION ae [openEHR-EHR-EVALUATION.adverse_reaction_risk.v2]
WHERE c/archetype_details/template_id/value = 'trial_encounter'
GROUP BY ae/data[at0001]/items[at0002]/value/value
ORDER BY frequency DESC

-- Signal detection (same AE type, narrow time window)
SELECT e/ehr_id/value, c/context/start_time/value,
       ae/data[at0001]/items[at0002]/value/value AS ae_name,
       ae/data[at0001]/items[at0004]/value/value AS severity
FROM EHR e CONTAINS COMPOSITION c
     CONTAINS EVALUATION ae [openEHR-EHR-EVALUATION.adverse_reaction_risk.v2]
WHERE c/archetype_details/template_id/value = 'trial_encounter'
  AND c/context/start_time/value >= '2026-03-01'
  AND c/context/start_time/value <= '2026-03-08'
ORDER BY c/context/start_time/value ASC

-- Visit completion count per participant
SELECT e/ehr_id/value, COUNT(c/uid/value) AS visit_count
FROM EHR e CONTAINS COMPOSITION c
WHERE c/archetype_details/template_id/value = 'trial_encounter'
GROUP BY e/ehr_id/value
ORDER BY visit_count ASC
```

### TrialMatch

```sql
-- ADHD patients matching inclusion: ASRS threshold met
SELECT e/ehr_id/value, s/subject/external_ref/id/value AS patient_id
FROM EHR e CONTAINS EHR_STATUS s
     CONTAINS COMPOSITION c
     CONTAINS OBSERVATION obs [openEHR-EHR-OBSERVATION.story.v1]
WHERE c/archetype_details/template_id/value = 'adhd_initial_assessment'
  AND obs/data[at0001]/events[at0002]/data[at0003]/items[...]/items[at0053]/value/value = true

-- Exclusion: already in a trial
SELECT e/ehr_id/value
FROM EHR e CONTAINS COMPOSITION c
WHERE c/archetype_details/template_id/value = 'trial_encounter'

-- Cross-template: ADHD patients NOT already in trial
SELECT e/ehr_id/value
FROM EHR e CONTAINS COMPOSITION c1
WHERE c1/archetype_details/template_id/value = 'adhd_initial_assessment'
  AND e/ehr_id/value NOT IN (
    SELECT e2/ehr_id/value
    FROM EHR e2 CONTAINS COMPOSITION c2
    WHERE c2/archetype_details/template_id/value = 'trial_encounter'
  )
```

---

## Gotchas to Carry Forward From Earlier Modules

- **Always filter by template_id** in every AQL query — three templates share the same EHRbase
- **SpO2 stored as proportion (0.0–1.0)** in `pulse_oximetry.v1` — 98% = 0.98, convert for display
- **First directory PUT is a POST** — `directory.ts` handles this; replicate pattern if needed
- **AQL on folders requires experimental flag** in docker-compose: `EHRBASE_EXPERIMENTAL_AQL_EXPERIMENTAL_AQL_ON_FOLDER_ENABLED: true`
- **RAADS-R scoring is raw ordinals 0/1/2/3** (not published 0/1/1/3) — total max 240
- **RAADS-R subscale scores: do NOT submit** — only `total_score` and `threshold_met`
- **AQ-10 scoring direction varies by item** — items 1,7,8,10 score on AGREE; 2,3,4,5,6,9 on DISAGREE
- **EHRbase returns 404 (not empty array)** when no EHR matches subject ID lookup — use try/catch
- **Canonical JSON needs `_type` on every node** — not relevant here (FLAT), but don't drift into Canonical patterns
