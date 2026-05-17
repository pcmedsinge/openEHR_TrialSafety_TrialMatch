/**
 * Seed Script — Clinical Trial Intelligence Suite
 * Populates EHRbase (port 8084) with synthetic clinical trial intelligence data.
 *
 * Creates:
 *   30 trial participant EHRs  (namespace: trial_participants)
 *   ~150 trial_encounter compositions with vitals + AEs
 *   15 ADHD-only EHRs          (namespace: neuro_patients)
 *   15 autism-only EHRs        (namespace: neuro_patients)
 *   5  overlap EHRs            (namespace: neuro_patients) — each gets BOTH compositions
 *   ── Total: 65 EHRs ──
 *
 * Signal planted:
 *   TRIAL-M4-001 through TRIAL-M4-004 → Week 8 visit has Fatigue + Headache (Grade 2/Moderate)
 *   All four visits fall in the window 2026-02-20 to 2026-02-27
 *
 * Run: npx ts-node seed.ts
 */

// ─── Configuration ────────────────────────────────────────────────────────────

const EHRBASE = 'http://localhost:8084/ehrbase/rest';
const AUTH = 'Basic ' + Buffer.from('ehrbase:ehrbase').toString('base64');
const HEADERS: Record<string, string> = {
  Authorization: AUTH,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const SIGNAL_PARTICIPANT_COUNT = 4; // TRIAL-M4-001 through 004 carry the safety signal

// Visit schedule: days relative to each participant's individual trial start date
const VISIT_SCHEDULE = [
  { name: 'Screening',    day: -14 },
  { name: 'Baseline',     day: 0   },
  { name: 'Week 4',       day: 28  },
  { name: 'Week 8',       day: 56  },
  { name: 'Week 12',      day: 84  },
  { name: 'End of Study', day: 168 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randomFloat(min: number, max: number, dp = 1): number {
  return parseFloat((min + Math.random() * (max - min)).toFixed(dp));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function iso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function pad(n: number, len = 3): string {
  return String(n).padStart(len, '0');
}

function atCode(n: number): string {
  return 'at' + String(n).padStart(4, '0');
}

// ─── EHRbase API ─────────────────────────────────────────────────────────────

async function createEhr(subjectId: string, namespace: string): Promise<string> {
  const res = await fetch(`${EHRBASE}/openehr/v1/ehr`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify({
      _type: 'EHR_STATUS',
      archetype_node_id: 'openEHR-EHR-EHR_STATUS.generic.v1',
      name: { _type: 'DV_TEXT', value: 'EHR Status' },
      subject: {
        external_ref: {
          id: { _type: 'GENERIC_ID', value: subjectId, scheme: 'id-scheme' },
          namespace,
          type: 'PERSON',
        },
      },
      is_modifiable: true,
      is_queryable: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`createEhr ${subjectId}: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { ehr_id: { value: string } };
  return data.ehr_id.value;
}

async function postComposition(
  ehrId: string,
  templateId: string,
  flat: Record<string, unknown>
): Promise<string> {
  const url = `${EHRBASE}/openehr/v1/ehr/${ehrId}/composition?format=FLAT&templateId=${templateId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(flat),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`postComposition ${templateId}: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  const body = await res.json() as Record<string, unknown>;
  const uidKey = Object.keys(body).find(k => k.endsWith('/_uid'));
  return uidKey ? (body[uidKey] as string) : '(uid-unavailable)';
}

// ─── Trial encounter builder ──────────────────────────────────────────────────

interface AEDef {
  name: string;
  probability: number;
  severityCode: string; // at0047=Mild, at0048=Moderate, at0049=Severe
  severityLabel: string;
}

const AE_POOL: AEDef[] = [
  { name: 'Fatigue',                 probability: 0.40, severityCode: 'at0047', severityLabel: 'Mild'     },
  { name: 'Headache',                probability: 0.30, severityCode: 'at0047', severityLabel: 'Mild'     },
  { name: 'Nausea',                  probability: 0.20, severityCode: 'at0047', severityLabel: 'Mild'     },
  { name: 'Injection site reaction', probability: 0.15, severityCode: 'at0047', severityLabel: 'Mild'     },
  { name: 'Hypertension',            probability: 0.05, severityCode: 'at0048', severityLabel: 'Moderate' },
];

// Deliberate safety signal: both AEs are Grade 2 (Moderate)
const SIGNAL_AES: AEDef[] = [
  { name: 'Fatigue',  probability: 1, severityCode: 'at0048', severityLabel: 'Moderate' },
  { name: 'Headache', probability: 1, severityCode: 'at0048', severityLabel: 'Moderate' },
];

function selectAEs(isSignalVisit: boolean): AEDef[] {
  if (isSignalVisit) return SIGNAL_AES;
  return AE_POOL.filter(ae => Math.random() < ae.probability);
}

function buildTrialEncounter(
  visitDate: Date,
  aes: AEDef[]
): Record<string, unknown> {
  const dt = iso(visitDate);
  const systolic = randomInt(108, 148);
  const diastolic = randomInt(68, 96);
  const pulse = randomInt(56, 98);
  const temp = randomFloat(36.1, 37.6);
  const spo2 = randomInt(95, 100);
  const resp = randomInt(12, 20);

  const flat: Record<string, unknown> = {
    'trial_encounter/category|code':        '433',
    'trial_encounter/category|value':       'event',
    'trial_encounter/category|terminology': 'openehr',
    'trial_encounter/context/start_time':   dt,
    'trial_encounter/context/setting|code':        '238',
    'trial_encounter/context/setting|value':       'other care',
    'trial_encounter/context/setting|terminology': 'openehr',
    'trial_encounter/composer|name':     'Seed Script',
    'trial_encounter/territory|code':    'GB',
    'trial_encounter/territory|terminology': 'ISO_3166-1',

    // Vitals — FLAT JSON omits HISTORY and inner ITEM_TREE nodes; use any_event:0 directly
    'trial_encounter/blood_pressure/any_event:0/systolic|magnitude':  systolic,
    'trial_encounter/blood_pressure/any_event:0/systolic|unit':       'mm[Hg]',
    'trial_encounter/blood_pressure/any_event:0/diastolic|magnitude': diastolic,
    'trial_encounter/blood_pressure/any_event:0/diastolic|unit':      'mm[Hg]',

    'trial_encounter/pulse_heart_beat/any_event:0/rate|magnitude': pulse,
    'trial_encounter/pulse_heart_beat/any_event:0/rate|unit':      '/min',

    'trial_encounter/body_temperature/any_event:0/temperature|magnitude': temp,
    'trial_encounter/body_temperature/any_event:0/temperature|unit':      'Cel',

    // SpO2 — DV_PROPORTION: numerator=%, denominator=100, type=2 (percentage)
    'trial_encounter/pulse_oximetry/any_event:0/spo|numerator':   spo2,
    'trial_encounter/pulse_oximetry/any_event:0/spo|denominator': 100,
    'trial_encounter/pulse_oximetry/any_event:0/spo|type':        2,

    'trial_encounter/respiration/any_event:0/rate|magnitude': resp,
    'trial_encounter/respiration/any_event:0/rate|unit':      '/min',
  };

  // Adverse events (repeatable with :N index)
  // DV_TEXT: no suffix; DV_CODED_TEXT: |code |value |terminology on element; DV_DATE_TIME: no suffix
  aes.forEach((ae, i) => {
    const p = `trial_encounter/adverse_event:${i}`;
    flat[`${p}/problem_diagnosis_name`] = ae.name;
    flat[`${p}/severity|code`]          = ae.severityCode;
    flat[`${p}/severity|value`]         = ae.severityLabel;
    flat[`${p}/severity|terminology`]   = 'local';
    flat[`${p}/date_time_of_onset`]     = dt;
  });

  return flat;
}

// ─── ADHD composition builder ─────────────────────────────────────────────────

const ASRS_ITEM_NAMES = [
  'item_1','item_2','item_3','item_4','item_5','item_6',
  'item_7','item_8','item_9','item_10','item_11','item_12',
  'item_13','item_14','item_15','item_16','item_17','item_18',
];
const ASRS_CODES: string[][] = [
  ['at0002','at0003','at0004','at0005','at0006'], // item 1
  ['at0008','at0009','at0010','at0011','at0012'], // item 2
  ['at0014','at0015','at0016','at0017','at0018'], // item 3
  ['at0020','at0021','at0022','at0023','at0024'], // item 4
  ['at0026','at0027','at0028','at0029','at0030'], // item 5
  ['at0113','at0114','at0115','at0116','at0117'], // item 6 (late-add base)
  ['at0038','at0039','at0040','at0041','at0042'], // item 7
  ['at0044','at0045','at0046','at0047','at0048'], // item 8
  ['at0050','at0051','at0052','at0053','at0054'], // item 9
  ['at0056','at0057','at0058','at0059','at0060'], // item 10
  ['at0062','at0063','at0064','at0065','at0066'], // item 11
  ['at0068','at0069','at0070','at0071','at0072'], // item 12
  ['at0074','at0075','at0076','at0077','at0078'], // item 13
  ['at0080','at0081','at0082','at0083','at0084'], // item 14
  ['at0086','at0087','at0088','at0089','at0090'], // item 15
  ['at0092','at0093','at0094','at0095','at0096'], // item 16
  ['at0098','at0099','at0100','at0101','at0102'], // item 17
  ['at0104','at0105','at0106','at0107','at0108'], // item 18
];
const ASRS_LABELS = ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'];

function generateAsrsOrdinals(positiveScreen: boolean): number[] {
  // Part A positive: items 1-3 score if ordinal ≥2, items 4-6 score if ordinal ≥3; screen+ if ≥4 score
  if (positiveScreen) {
    const partA = [
      randomInt(2, 4), randomInt(2, 4), randomInt(2, 4), // items 1-3
      randomInt(3, 4), randomInt(3, 4), randomInt(3, 4), // items 4-6
    ];
    const partB = Array.from({ length: 12 }, () => randomInt(0, 4));
    return [...partA, ...partB];
  } else {
    const partA = [
      randomInt(0, 1), randomInt(0, 2), randomInt(0, 1),
      randomInt(0, 2), randomInt(0, 2), randomInt(0, 2),
    ];
    const partB = Array.from({ length: 12 }, () => randomInt(0, 3));
    return [...partA, ...partB];
  }
}

const FUNC_KEYS = [
  'occupational_work_impairment', 'academic_educational_impairment',
  'relationship_family_impairment', 'social_functioning_impairment',
  'daily_living_self_care_impairment', 'financial_management_impairment',
  'global_functional_impairment',
];
const FUNC_CODES: string[][] = [
  ['at0002','at0003','at0004','at0005'],
  ['at0007','at0008','at0009','at0010'],
  ['at0012','at0013','at0014','at0015'],
  ['at0017','at0018','at0019','at0020'],
  ['at0022','at0023','at0024','at0025'],
  ['at0027','at0028','at0029','at0030'],
  ['at0034','at0035','at0036','at0037'],
];
const FUNC_LABELS = ['None', 'Mild', 'Moderate', 'Severe'];

const COMORB_KEYS = [
  'anxiety', 'depression', 'sleep_disorder', 'mood_disorder_bipolar',
  'ocd', 'trauma_ptsd', 'eating_disorder', 'substance_use_concern',
];
const COMORB_CODES: string[][] = [
  ['at0002','at0003','at0004'],
  ['at0007','at0008','at0009'],
  ['at0012','at0013','at0014'],
  ['at0017','at0018','at0019'],
  ['at0022','at0023','at0024'],
  ['at0027','at0028','at0029'],
  ['at0032','at0033','at0034'],
  ['at0037','at0038','at0039'],
];
const COMORB_LABELS = ['No concern', 'Possible concern', 'Significant concern'];

function addSharedClinicalFields(
  flat: Record<string, unknown>,
  b: string,
  funcOrdinals: number[],
  comorbOrdinals: number[]
): void {
  // Developmental history — minimal required coded fields
  flat[`${b}/developmental_history/informant|code`]      = 'at0002';
  flat[`${b}/developmental_history/informant|value`]     = 'Self only';
  flat[`${b}/developmental_history/informant|terminology`] = 'local';
  flat[`${b}/developmental_history/developmental_milestones/motor_development|code`]       = 'at0014';
  flat[`${b}/developmental_history/developmental_milestones/motor_development|value`]      = 'Normal';
  flat[`${b}/developmental_history/developmental_milestones/motor_development|terminology`] = 'local';
  flat[`${b}/developmental_history/developmental_milestones/speech_and_language|code`]       = 'at0019';
  flat[`${b}/developmental_history/developmental_milestones/speech_and_language|value`]      = 'Normal';
  flat[`${b}/developmental_history/developmental_milestones/speech_and_language|terminology`] = 'local';
  flat[`${b}/developmental_history/developmental_milestones/social_development|code`]       = 'at0024';
  flat[`${b}/developmental_history/developmental_milestones/social_development|value`]      = 'Normal';
  flat[`${b}/developmental_history/developmental_milestones/social_development|terminology`] = 'local';
  flat[`${b}/developmental_history/special_educational_needs`]  = false;
  flat[`${b}/developmental_history/ehcp_or_sen_statement`]      = false;
  flat[`${b}/developmental_history/previous_professional_input`] = false;
  flat[`${b}/developmental_history/collateral_documentation|code`]       = 'at0034';
  flat[`${b}/developmental_history/collateral_documentation|value`]      = 'None available';
  flat[`${b}/developmental_history/collateral_documentation|terminology`] = 'local';

  // Functional impact (7 domains)
  funcOrdinals.forEach((ordinal, i) => {
    flat[`${b}/functional_impact/${FUNC_KEYS[i]}|ordinal`] = ordinal;
    flat[`${b}/functional_impact/${FUNC_KEYS[i]}|code`]    = FUNC_CODES[i][ordinal];
    flat[`${b}/functional_impact/${FUNC_KEYS[i]}|value`]   = FUNC_LABELS[ordinal];
  });
  flat[`${b}/functional_impact/number_of_domains_impaired`] =
    funcOrdinals.slice(0, 6).filter(v => v > 0).length;

  // Comorbidity screening (8 conditions)
  comorbOrdinals.forEach((ordinal, i) => {
    flat[`${b}/comorbidity_screening/${COMORB_KEYS[i]}|ordinal`] = ordinal;
    flat[`${b}/comorbidity_screening/${COMORB_KEYS[i]}|code`]    = COMORB_CODES[i][ordinal];
    flat[`${b}/comorbidity_screening/${COMORB_KEYS[i]}|value`]   = COMORB_LABELS[ordinal];
  });
  flat[`${b}/comorbidity_screening/dyslexia`]             = false;
  flat[`${b}/comorbidity_screening/dyscalculia`]          = false;
  flat[`${b}/comorbidity_screening/dcd_dyspraxia`]        = false;
  flat[`${b}/comorbidity_screening/cross_condition_screen|code`]        = 'at0046';
  flat[`${b}/comorbidity_screening/cross_condition_screen|value`]       = 'Not screened';
  flat[`${b}/comorbidity_screening/cross_condition_screen|terminology`] = 'local';
  flat[`${b}/comorbidity_screening/referral_recommended`] = false;
}

function buildAdhdComposition(
  assessmentDate: Date,
  positiveScreen: boolean
): Record<string, unknown> {
  const b = 'adhd_initial_assessment/story_history/any_event:0';
  const dt = iso(assessmentDate);
  const asrsOrdinals = generateAsrsOrdinals(positiveScreen);

  const partAScore = asrsOrdinals.slice(0, 6).reduce((s, v) => s + v, 0);
  const partBScore = asrsOrdinals.slice(6).reduce((s, v) => s + v, 0);
  const totalScore = partAScore + partBScore;

  // NICE NG87 threshold: items 1-3 ≥2 or items 4-6 ≥3; screen+ if ≥4 positive
  let posCount = 0;
  for (let i = 0; i < 3; i++) if (asrsOrdinals[i] >= 2) posCount++;
  for (let i = 3; i < 6; i++) if (asrsOrdinals[i] >= 3) posCount++;
  const partAPositive = posCount >= 4;

  const funcOrdinals  = Array.from({ length: 7 }, () => randomInt(0, 3));
  const comorbOrdinals = Array.from({ length: 8 }, () => randomInt(0, 2));

  const flat: Record<string, unknown> = {
    'adhd_initial_assessment/category|code':        '433',
    'adhd_initial_assessment/category|value':       'event',
    'adhd_initial_assessment/category|terminology': 'openehr',
    'adhd_initial_assessment/context/start_time':   dt,
    'adhd_initial_assessment/context/setting|code':        '225',
    'adhd_initial_assessment/context/setting|value':       'home',
    'adhd_initial_assessment/context/setting|terminology': 'openehr',
    'adhd_initial_assessment/composer|name':          'Seed Script',
    'adhd_initial_assessment/territory|code':         'GB',
    'adhd_initial_assessment/territory|terminology':  'ISO_3166-1',
    [`${b}/time`]:     dt,
    [`${b}/story:0`]:  'ADHD initial assessment',
  };

  // ASRS v1.1 — all 18 items
  asrsOrdinals.forEach((ordinal, i) => {
    const key = ASRS_ITEM_NAMES[i];
    flat[`${b}/asrs_v11_screener/${key}|ordinal`] = ordinal;
    flat[`${b}/asrs_v11_screener/${key}|code`]    = ASRS_CODES[i][ordinal];
    flat[`${b}/asrs_v11_screener/${key}|value`]   = ASRS_LABELS[ordinal];
  });
  flat[`${b}/asrs_v11_screener/part_a_score`]         = partAScore;
  flat[`${b}/asrs_v11_screener/part_b_score`]         = partBScore;
  flat[`${b}/asrs_v11_screener/total_score`]          = totalScore;
  flat[`${b}/asrs_v11_screener/part_a_positive_screen`] = partAPositive;

  addSharedClinicalFields(flat, b, funcOrdinals, comorbOrdinals);

  return flat;
}

// ─── Autism composition builder ───────────────────────────────────────────────

const AQ10_CODES: string[][] = Array.from({ length: 10 }, (_, i) => {
  const base = i * 5 + 2;
  return [atCode(base), atCode(base + 1), atCode(base + 2), atCode(base + 3)];
});
const AQ10_LABELS = ['Definitely agree', 'Slightly agree', 'Slightly disagree', 'Definitely disagree'];
// Items 1,7,8,10 (0-based: 0,6,7,9) score on AGREE (ordinal ≤1 = 1pt)
// Items 2-6,9 (0-based: 1-5,8) score on DISAGREE (ordinal ≥2 = 1pt)
const AQ10_AGREE_ITEMS = new Set([0, 6, 7, 9]);
function aq10Score(index: number, ordinal: number): number {
  return AQ10_AGREE_ITEMS.has(index) ? (ordinal <= 1 ? 1 : 0) : (ordinal >= 2 ? 1 : 0);
}

function generateAq10Ordinals(targetPositive: boolean): number[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ordinals = Array.from({ length: 10 }, () => randomInt(0, 3));
    const total = ordinals.reduce((s, ord, i) => s + aq10Score(i, ord), 0);
    if (targetPositive ? total >= 6 : total < 6) return ordinals;
  }
  // Fallback: guaranteed result
  return Array.from({ length: 10 }, (_, i) =>
    targetPositive
      ? (AQ10_AGREE_ITEMS.has(i) ? 0 : 3)   // all positive
      : (AQ10_AGREE_ITEMS.has(i) ? 3 : 0)    // all negative
  );
}

const RAADS_CODES: string[][] = Array.from({ length: 80 }, (_, i) => {
  const base = i * 5 + 2;
  return [atCode(base), atCode(base + 1), atCode(base + 2), atCode(base + 3)];
});
const RAADS_LABELS = [
  'Never true',
  'True only when I was younger than 16',
  'True only now',
  'True now and when I was younger than 16',
];

function generateRaadsOrdinals(targetPositive: boolean): number[] {
  // Positive: mean ordinal ~1.2 → total ~96 (threshold 65); negative: mean ~0.4 → total ~32
  return Array.from({ length: 80 }, () => {
    const r = Math.random();
    if (targetPositive) {
      if (r < 0.15) return 3;
      if (r < 0.40) return 2;
      if (r < 0.75) return 1;
      return 0;
    } else {
      if (r < 0.05) return 3;
      if (r < 0.15) return 2;
      if (r < 0.35) return 1;
      return 0;
    }
  });
}

function buildAutismComposition(
  assessmentDate: Date,
  aq10Positive: boolean,
  raadsPositive: boolean
): Record<string, unknown> {
  const b = 'autism_initial_assessment/story_history/any_event:0';
  const dt = iso(assessmentDate);
  const aq10Ordinals   = generateAq10Ordinals(aq10Positive);
  const raadsOrdinals  = generateRaadsOrdinals(raadsPositive);
  const funcOrdinals   = Array.from({ length: 7 }, () => randomInt(0, 3));
  const comorbOrdinals = Array.from({ length: 8 }, () => randomInt(0, 2));

  const aq10Total  = aq10Ordinals.reduce((s, ord, i) => s + aq10Score(i, ord), 0);
  const raadsTotal = raadsOrdinals.reduce((s, ord) => s + ord, 0);

  const flat: Record<string, unknown> = {
    'autism_initial_assessment/category|code':        '433',
    'autism_initial_assessment/category|value':       'event',
    'autism_initial_assessment/category|terminology': 'openehr',
    'autism_initial_assessment/context/start_time':   dt,
    'autism_initial_assessment/context/setting|code':        '225',
    'autism_initial_assessment/context/setting|value':       'home',
    'autism_initial_assessment/context/setting|terminology': 'openehr',
    'autism_initial_assessment/composer|name':         'Seed Script',
    'autism_initial_assessment/territory|code':        'GB',
    'autism_initial_assessment/territory|terminology': 'ISO_3166-1',
    [`${b}/time`]:    dt,
    [`${b}/story:0`]: 'Autism initial assessment',
  };

  // AQ-10 (10 items)
  aq10Ordinals.forEach((ordinal, i) => {
    flat[`${b}/aq10_screener/item_${i + 1}|ordinal`] = ordinal;
    flat[`${b}/aq10_screener/item_${i + 1}|code`]    = AQ10_CODES[i][ordinal];
    flat[`${b}/aq10_screener/item_${i + 1}|value`]   = AQ10_LABELS[ordinal];
  });
  flat[`${b}/aq10_screener/total_score`]  = aq10Total;
  flat[`${b}/aq10_screener/threshold_met`] = aq10Total >= 6;

  // RAADS-R (80 items, raw ordinal scoring 0-3, total max 240)
  raadsOrdinals.forEach((ordinal, i) => {
    flat[`${b}/raads_r_assessment/item_${i + 1}|ordinal`] = ordinal;
    flat[`${b}/raads_r_assessment/item_${i + 1}|code`]    = RAADS_CODES[i][ordinal];
    flat[`${b}/raads_r_assessment/item_${i + 1}|value`]   = RAADS_LABELS[ordinal];
  });
  flat[`${b}/raads_r_assessment/total_score`]  = raadsTotal;
  flat[`${b}/raads_r_assessment/threshold_met`] = raadsTotal >= 65;

  addSharedClinicalFields(flat, b, funcOrdinals, comorbOrdinals);

  return flat;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Seed Script — Clinical Trial Intelligence Suite         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`EHRbase: ${EHRBASE}`);
  console.log();

  let totalTrialVisits = 0;
  const adhdEhrMap = new Map<string, string>(); // subjectId → ehrId (for overlap reuse)

  // ════════════════════════════════════════════════════════════════════════
  // STEP 1 — Trial participant EHRs (namespace: trial_participants)
  // ════════════════════════════════════════════════════════════════════════
  console.log('▶ Step 1/6 — Creating 30 trial participant EHRs');

  type TrialParticipant = {
    subjectId: string;
    ehrId: string;
    trialStart: Date;
    isSignal: boolean;
  };
  const trialParticipants: TrialParticipant[] = [];

  for (let i = 1; i <= 30; i++) {
    const subjectId = `TRIAL-M4-${pad(i)}`;
    const isSignal  = i <= SIGNAL_PARTICIPANT_COUNT;

    // Signal participants: Week 8 (day 56) must land in 2026-02-20 to 2026-02-27
    // → trial start must be in 2025-12-26 to 2026-01-02
    const trialStart = isSignal
      ? randomDate(new Date('2025-12-26'), new Date('2026-01-02'))
      : randomDate(new Date('2026-01-01'), new Date('2026-01-14'));

    try {
      const ehrId = await createEhr(subjectId, 'trial_participants');
      trialParticipants.push({ subjectId, ehrId, trialStart, isSignal });
      console.log(`  ✓ ${subjectId}  [start: ${trialStart.toISOString().slice(0,10)}${isSignal ? '  ⚠ SIGNAL' : ''}]`);
    } catch (err) {
      console.error(`  ✗ ${subjectId}:`, (err as Error).message);
    }
  }

  console.log();

  // ════════════════════════════════════════════════════════════════════════
  // STEP 2 — Trial encounter compositions (~150 total)
  // ════════════════════════════════════════════════════════════════════════
  console.log('▶ Step 2/6 — Creating trial_encounter compositions');

  for (const p of trialParticipants) {
    // Signal participants always complete all 6 visits; others complete 4-6
    const numVisits  = p.isSignal ? 6 : randomInt(4, 6);
    const visits     = VISIT_SCHEDULE.slice(0, numVisits);

    for (const visit of visits) {
      const visitDate     = addDays(p.trialStart, visit.day);
      const isWeek8       = visit.name === 'Week 8';
      const isSignalVisit = p.isSignal && isWeek8;
      const aes           = selectAEs(isSignalVisit);

      try {
        const flat = buildTrialEncounter(visitDate, aes);
        await postComposition(p.ehrId, 'trial_encounter', flat);
        const aeNote = aes.length > 0 ? ` [${aes.map(a => `${a.name}(${a.severityLabel})`).join(', ')}]` : '';
        console.log(`  ✓ ${p.subjectId}/${visit.name}${isSignalVisit ? ' ⚠' : ''}${aeNote}`);
        totalTrialVisits++;
      } catch (err) {
        console.error(`  ✗ ${p.subjectId}/${visit.name}:`, (err as Error).message);
      }
    }
  }

  console.log(`  → ${totalTrialVisits} trial encounter compositions created`);
  console.log();

  // ════════════════════════════════════════════════════════════════════════
  // STEP 3 — ADHD-only EHRs: NEURO-ADHD-001 through NEURO-ADHD-015
  //           (15/15 positive screeners by design; overlaps get ADHD too)
  // ════════════════════════════════════════════════════════════════════════
  console.log('▶ Step 3/6 — Creating 15 ADHD-only neuro EHRs');

  for (let i = 1; i <= 15; i++) {
    const subjectId = `NEURO-ADHD-${pad(i)}`;
    try {
      const ehrId = await createEhr(subjectId, 'neuro_patients');
      adhdEhrMap.set(subjectId, ehrId);
      console.log(`  ✓ ${subjectId}`);
    } catch (err) {
      console.error(`  ✗ ${subjectId}:`, (err as Error).message);
    }
  }

  console.log();

  // ════════════════════════════════════════════════════════════════════════
  // STEP 4 — ADHD compositions for ADHD-only patients (15 positive, 0 negative)
  //          Also creates 5 overlap EHRs (NEURO-OVERLAP-001 through 005) and
  //          posts adhd_initial_assessment to them too
  // ════════════════════════════════════════════════════════════════════════
  console.log('▶ Step 4/6 — Creating ADHD compositions (15 ADHD-only + 5 overlap)');

  // 15 ADHD-only patients: all 15 are positive screeners
  for (const [subjectId, ehrId] of adhdEhrMap) {
    const assessDate = randomDate(new Date('2025-09-01'), new Date('2025-12-31'));
    try {
      const flat = buildAdhdComposition(assessDate, true);
      await postComposition(ehrId, 'adhd_initial_assessment', flat);
      console.log(`  ✓ ${subjectId}: ASRS Part A POSITIVE`);
    } catch (err) {
      console.error(`  ✗ ${subjectId}:`, (err as Error).message);
    }
  }

  // 5 overlap patients: create EHR then add ADHD composition
  // These patients also appear as TRIAL-M4-026 through TRIAL-M4-030
  const overlapEhrMap = new Map<string, string>(); // subjectId → ehrId

  for (let i = 1; i <= 5; i++) {
    const subjectId = `NEURO-OVERLAP-${pad(i)}`;
    const positiveAdhd = i <= 3; // 3/5 are positive ADHD screeners
    const assessDate   = randomDate(new Date('2025-09-01'), new Date('2025-12-31'));

    try {
      const ehrId = await createEhr(subjectId, 'neuro_patients');
      overlapEhrMap.set(subjectId, ehrId);
      const flat = buildAdhdComposition(assessDate, positiveAdhd);
      await postComposition(ehrId, 'adhd_initial_assessment', flat);
      console.log(`  ✓ ${subjectId}: ASRS Part A ${positiveAdhd ? 'POSITIVE' : 'negative'} (overlap patient)`);
    } catch (err) {
      console.error(`  ✗ ${subjectId}:`, (err as Error).message);
    }
  }

  console.log();

  // ════════════════════════════════════════════════════════════════════════
  // STEP 5 — Autism-only EHRs: NEURO-ASD-001 through NEURO-ASD-015
  // ════════════════════════════════════════════════════════════════════════
  console.log('▶ Step 5/6 — Creating 15 autism-only neuro EHRs');

  const autismEhrMap = new Map<string, string>();

  for (let i = 1; i <= 15; i++) {
    const subjectId = `NEURO-ASD-${pad(i)}`;
    try {
      const ehrId = await createEhr(subjectId, 'neuro_patients');
      autismEhrMap.set(subjectId, ehrId);
      console.log(`  ✓ ${subjectId}`);
    } catch (err) {
      console.error(`  ✗ ${subjectId}:`, (err as Error).message);
    }
  }

  console.log();

  // ════════════════════════════════════════════════════════════════════════
  // STEP 6 — Autism compositions (15 autism-only + 5 overlap)
  //          Distribution: 12/20 AQ-10 positive, 10/20 RAADS-R positive
  // ════════════════════════════════════════════════════════════════════════
  console.log('▶ Step 6/6 — Creating autism compositions (15 autism-only + 5 overlap)');

  // Autism-only (15 patients): indices 0-14 determine positive/negative
  let autismIdx = 0;
  for (const [subjectId, ehrId] of autismEhrMap) {
    const aq10Positive   = autismIdx < 9;  // 9/15 autism-only are AQ-10 positive
    const raadsPositive  = autismIdx < 7;  // 7/15 autism-only are RAADS-R positive
    const assessDate     = randomDate(new Date('2025-09-01'), new Date('2025-12-31'));

    try {
      const flat = buildAutismComposition(assessDate, aq10Positive, raadsPositive);
      await postComposition(ehrId, 'autism_initial_assessment', flat);
      console.log(`  ✓ ${subjectId}: AQ-10 ${aq10Positive ? 'POSITIVE' : 'negative'} / RAADS-R ${raadsPositive ? 'POSITIVE' : 'negative'}`);
    } catch (err) {
      console.error(`  ✗ ${subjectId}:`, (err as Error).message);
    }
    autismIdx++;
  }

  // Overlap (5 patients): add autism_initial_assessment to their existing neuro EHRs
  // Results: 3/5 AQ-10 positive, 3/5 RAADS-R positive (reaches ~12 and ~10 totals)
  let overlapIdx = 0;
  for (const [subjectId, ehrId] of overlapEhrMap) {
    const aq10Positive  = overlapIdx < 3;
    const raadsPositive = overlapIdx < 3;
    const assessDate    = randomDate(new Date('2025-09-01'), new Date('2025-12-31'));

    try {
      const flat = buildAutismComposition(assessDate, aq10Positive, raadsPositive);
      await postComposition(ehrId, 'autism_initial_assessment', flat);
      console.log(`  ✓ ${subjectId}: AQ-10 ${aq10Positive ? 'POSITIVE' : 'negative'} / RAADS-R ${raadsPositive ? 'POSITIVE' : 'negative'} (overlap patient)`);
    } catch (err) {
      console.error(`  ✗ ${subjectId}:`, (err as Error).message);
    }
    overlapIdx++;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════════
  const totalNeuroEhrs = adhdEhrMap.size + autismEhrMap.size + overlapEhrMap.size;
  const totalEhrs      = trialParticipants.length + totalNeuroEhrs;

  console.log();
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  SEED COMPLETE                                           ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Trial participant EHRs:    ${String(trialParticipants.length).padStart(3)}                            ║`);
  console.log(`║  Trial encounter comps:     ${String(totalTrialVisits).padStart(3)}                            ║`);
  console.log(`║  ADHD-only neuro EHRs:      ${String(adhdEhrMap.size).padStart(3)}                            ║`);
  console.log(`║  Autism-only neuro EHRs:    ${String(autismEhrMap.size).padStart(3)}                            ║`);
  console.log(`║  Overlap neuro EHRs:          ${String(overlapEhrMap.size).padStart(1)}  (ADHD + autism comps)    ║`);
  console.log(`║  Total EHRs:                ${String(totalEhrs).padStart(3)}  (expect 65)              ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  SIGNAL PLANTED:                                         ║');
  console.log('║  TRIAL-M4-001 through TRIAL-M4-004                      ║');
  console.log('║  Week 8 visit: Fatigue(Moderate) + Headache(Moderate)   ║');
  console.log('║  Dates: 2026-02-20 to 2026-02-27                        ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Verify in Swagger UI:                                   ║');
  console.log('║  http://localhost:8084/ehrbase/swagger-ui/               ║');
  console.log('║  AQL: SELECT COUNT(*) FROM EHR e  → expect 65           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('\n✗ Seed failed:', err);
  process.exit(1);
});
