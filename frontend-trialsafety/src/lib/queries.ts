import { runAql } from './ehrbase';
import type { AqlResult } from './ehrbase';

export interface AeSummary {
  name: string;
  count: number;
  moderateCount: number;
  severeCount: number;
}

export interface SignalHit {
  ehrId: string;
  participantId: string;
  visitDate: string;
  aeName: string;
  severity: string;
}

export interface ParticipantVisit {
  visitDate: string;
  aes: { name: string; severity: string }[];
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  temperature: number | null;
}

export interface VisitCompletion {
  ehrId: string;
  participantId: string;
  visitCount: number;
}

// Archetype IDs used in trial_encounter
const AE_ARCH  = 'openEHR-EHR-EVALUATION.problem_diagnosis.v1';
const BP_ARCH  = 'openEHR-EHR-OBSERVATION.blood_pressure.v2';
const PUL_ARCH = 'openEHR-EHR-OBSERVATION.pulse.v2';
const TMP_ARCH = 'openEHR-EHR-OBSERVATION.body_temperature.v2';

// AQL paths within problem_diagnosis.v1
const AE_NAME_PATH = 'a/data[at0001]/items[at0002]/value/value';
const AE_SEV_PATH  = 'a/data[at0001]/items[at0005]/value/value';

export async function fetchAeFrequency(): Promise<AeSummary[]> {
  const q = `
    SELECT
      ${AE_NAME_PATH} AS ae_name,
      ${AE_SEV_PATH} AS severity,
      COUNT(*) AS cnt
    FROM EHR e
    CONTAINS COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1]
    CONTAINS EVALUATION a[${AE_ARCH}]
    WHERE c/archetype_details/template_id/value = 'trial_encounter'`;
  const res = await runAql(q);
  const map = new Map<string, AeSummary>();
  for (const row of res.rows) {
    const name = row[0] as string;
    const sev  = row[1] as string;
    const cnt  = Number(row[2]);
    if (!map.has(name)) map.set(name, { name, count: 0, moderateCount: 0, severeCount: 0 });
    const entry = map.get(name)!;
    entry.count += cnt;
    if (sev === 'Moderate') entry.moderateCount += cnt;
    if (sev === 'Severe')   entry.severeCount   += cnt;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// Signal detection: Grade 2+ (Moderate/Severe) AEs in a given window
export async function fetchSignalHits(from: string, to: string): Promise<SignalHit[]> {
  const q = `
    SELECT
      e/ehr_id/value,
      s/subject/external_ref/id/value,
      c/context/start_time/value,
      ${AE_NAME_PATH},
      ${AE_SEV_PATH}
    FROM EHR e
    CONTAINS (EHR_STATUS s AND COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1]
      CONTAINS EVALUATION a[${AE_ARCH}])
    WHERE c/archetype_details/template_id/value = 'trial_encounter'
      AND c/context/start_time/value >= '${from}'
      AND c/context/start_time/value <= '${to}'
      AND ${AE_SEV_PATH} != 'Mild'
    ORDER BY c/context/start_time/value ASC`;
  const res = await runAql(q);
  return res.rows.map(row => ({
    ehrId:         row[0] as string,
    participantId: row[1] as string,
    visitDate:     row[2] as string,
    aeName:        row[3] as string,
    severity:      row[4] as string,
  }));
}

// All AEs for a specific participant (by subject ID)
export async function fetchParticipantAes(participantId: string): Promise<ParticipantVisit[]> {
  const q = `
    SELECT
      c/context/start_time/value,
      ${AE_NAME_PATH},
      ${AE_SEV_PATH}
    FROM EHR e
    CONTAINS (EHR_STATUS s AND COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1]
      CONTAINS EVALUATION a[${AE_ARCH}])
    WHERE c/archetype_details/template_id/value = 'trial_encounter'
      AND s/subject/external_ref/id/value = '${participantId}'
    ORDER BY c/context/start_time/value ASC`;
  const res = await runAql(q);
  const map = new Map<string, ParticipantVisit>();
  for (const row of res.rows) {
    const date = row[0] as string;
    if (!map.has(date)) {
      map.set(date, { visitDate: date, aes: [], systolic: null, diastolic: null, pulse: null, temperature: null });
    }
    map.get(date)!.aes.push({ name: row[1] as string, severity: row[2] as string });
  }

  // Fetch blood pressure (separate simple query)
  try {
    const bpRes = await runAql(`
      SELECT c/context/start_time/value,
        v/data[at0001]/events[at0006]/data[at0003]/items[at0004]/value/magnitude,
        v/data[at0001]/events[at0006]/data[at0003]/items[at0005]/value/magnitude
      FROM EHR e
      CONTAINS (EHR_STATUS s AND COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1]
        CONTAINS OBSERVATION v[${BP_ARCH}])
      WHERE c/archetype_details/template_id/value = 'trial_encounter'
        AND s/subject/external_ref/id/value = '${participantId}'
      ORDER BY c/context/start_time/value ASC`);
    for (const row of bpRes.rows) {
      const date = row[0] as string;
      if (!map.has(date)) map.set(date, { visitDate: date, aes: [], systolic: null, diastolic: null, pulse: null, temperature: null });
      const entry = map.get(date)!;
      entry.systolic  = row[1] as number | null;
      entry.diastolic = row[2] as number | null;
    }
  } catch (e) { console.warn('BP vitals query:', e); }

  // Fetch pulse
  try {
    const pulseRes = await runAql(`
      SELECT c/context/start_time/value,
        p/data[at0002]/events[at0003]/data[at0001]/items[at0004]/value/magnitude
      FROM EHR e
      CONTAINS (EHR_STATUS s AND COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1]
        CONTAINS OBSERVATION p[${PUL_ARCH}])
      WHERE c/archetype_details/template_id/value = 'trial_encounter'
        AND s/subject/external_ref/id/value = '${participantId}'
      ORDER BY c/context/start_time/value ASC`);
    for (const row of pulseRes.rows) {
      const date = row[0] as string;
      if (!map.has(date)) map.set(date, { visitDate: date, aes: [], systolic: null, diastolic: null, pulse: null, temperature: null });
      map.get(date)!.pulse = row[1] as number | null;
    }
  } catch (e) { console.warn('Pulse vitals query:', e); }

  // Fetch temperature
  try {
    const tempRes = await runAql(`
      SELECT c/context/start_time/value,
        t/data[at0002]/events[at0003]/data[at0001]/items[at0004]/value/magnitude
      FROM EHR e
      CONTAINS (EHR_STATUS s AND COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1]
        CONTAINS OBSERVATION t[${TMP_ARCH}])
      WHERE c/archetype_details/template_id/value = 'trial_encounter'
        AND s/subject/external_ref/id/value = '${participantId}'
      ORDER BY c/context/start_time/value ASC`);
    for (const row of tempRes.rows) {
      const date = row[0] as string;
      if (!map.has(date)) map.set(date, { visitDate: date, aes: [], systolic: null, diastolic: null, pulse: null, temperature: null });
      map.get(date)!.temperature = row[1] as number | null;
    }
  } catch (e) { console.warn('Temp vitals query:', e); }

  // For participants with no AEs in a visit, add the visit via a simpler compositions query
  const allVisitsQ = `
    SELECT c/context/start_time/value
    FROM EHR e
    CONTAINS (EHR_STATUS s AND COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1])
    WHERE c/archetype_details/template_id/value = 'trial_encounter'
      AND s/subject/external_ref/id/value = '${participantId}'
    ORDER BY c/context/start_time/value ASC`;
  try {
    const allRes = await runAql(allVisitsQ);
    for (const row of allRes.rows) {
      const date = row[0] as string;
      if (!map.has(date)) {
        map.set(date, { visitDate: date, aes: [], systolic: null, diastolic: null, pulse: null, temperature: null });
      }
    }
  } catch {
    // ignore
  }

  return [...map.values()].sort((a, b) => a.visitDate.localeCompare(b.visitDate));
}

// Visit completion per trial participant
export async function fetchVisitCompletion(): Promise<VisitCompletion[]> {
  const q = `
    SELECT
      e/ehr_id/value,
      s/subject/external_ref/id/value,
      COUNT(c/uid/value)
    FROM EHR e
    CONTAINS (EHR_STATUS s AND COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1])
    WHERE c/archetype_details/template_id/value = 'trial_encounter'
      AND s/subject/external_ref/namespace = 'trial_participants'
    ORDER BY s/subject/external_ref/id/value ASC`;
  const res = await runAql(q);
  return res.rows.map(row => ({
    ehrId:         row[0] as string,
    participantId: row[1] as string,
    visitCount:    Number(row[2]),
  }));
}

export const STORED_QUERIES = [
  {
    id: 'ae_frequency',
    label: 'AE Frequency by Type',
    description: 'Count of each adverse event type and severity across all trial visits',
    aql: `SELECT a/data[at0001]/items[at0002]/value/value AS ae_name,
       a/data[at0001]/items[at0005]/value/value AS severity,
       COUNT(*) AS cnt
FROM EHR e
CONTAINS COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1]
CONTAINS EVALUATION a[openEHR-EHR-EVALUATION.problem_diagnosis.v1]
WHERE c/archetype_details/template_id/value = 'trial_encounter'`,
  },
  {
    id: 'signal_window',
    label: 'Signal Window (2026-02-20 → 2026-02-27)',
    description: 'All AEs in the deliberate safety signal window',
    aql: `SELECT s/subject/external_ref/id/value AS participant,
       c/context/start_time/value AS visit_date,
       a/data[at0001]/items[at0002]/value/value AS ae_name,
       a/data[at0001]/items[at0005]/value/value AS severity
FROM EHR e
CONTAINS (EHR_STATUS s
  AND COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1]
    CONTAINS EVALUATION a[openEHR-EHR-EVALUATION.problem_diagnosis.v1])
WHERE c/archetype_details/template_id/value = 'trial_encounter'
  AND c/context/start_time/value >= '2026-02-20'
  AND c/context/start_time/value <= '2026-02-27'
ORDER BY c/context/start_time/value ASC`,
  },
  {
    id: 'visit_completion',
    label: 'Visit Completion Tracker',
    description: 'Number of completed visits per trial participant',
    aql: `SELECT s/subject/external_ref/id/value AS participant, COUNT(c/uid/value) AS visit_count
FROM EHR e
CONTAINS (EHR_STATUS s AND COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1])
WHERE c/archetype_details/template_id/value = 'trial_encounter'
  AND s/subject/external_ref/namespace = 'trial_participants'
ORDER BY s/subject/external_ref/id/value ASC`,
  },
  {
    id: 'grade2_aes',
    label: 'Grade 2+ Adverse Events',
    description: 'All participants with Moderate or Severe adverse events (Grade 2 and above)',
    aql: `SELECT s/subject/external_ref/id/value,
       a/data[at0001]/items[at0002]/value/value,
       a/data[at0001]/items[at0005]/value/value
FROM EHR e
CONTAINS (EHR_STATUS s
  AND COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1]
    CONTAINS EVALUATION a[openEHR-EHR-EVALUATION.problem_diagnosis.v1])
WHERE c/archetype_details/template_id/value = 'trial_encounter'
  AND a/data[at0001]/items[at0005]/value/value != 'Mild'
ORDER BY s/subject/external_ref/id/value ASC`,
  },
];

export type { AqlResult };
