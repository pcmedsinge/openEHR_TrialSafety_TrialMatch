import OpenAI from 'openai';
import { runAql } from './ehrbase';
import type { ExtractedCriteria } from './storage';

const client = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY as string,
  dangerouslyAllowBrowser: true,
});

// ── Criterion extraction ──────────────────────────────────────────────────────

const EXTRACT_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'save_extracted_criteria',
    description: 'Save the structured eligibility criteria and the generated AQL query for patient matching.',
    parameters: {
      type: 'object',
      properties: {
        inclusion: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of inclusion criteria (plain English, one per item)',
        },
        exclusion: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of exclusion criteria (plain English, one per item)',
        },
        primaryFocus: {
          type: 'string',
          enum: ['ADHD', 'autism', 'trial', 'ADHD+autism', 'general'],
          description: 'Primary clinical focus of this trial',
        },
        aqlQuery: {
          type: 'string',
          description: 'A valid AQL query to find matching patients in EHRbase',
        },
        queryExplanation: {
          type: 'string',
          description: 'One or two sentences explaining what the AQL query finds and why. Note any criteria that cannot be queried from available data.',
        },
      },
      required: ['inclusion', 'exclusion', 'primaryFocus', 'aqlQuery', 'queryExplanation'],
    },
  },
};

const EXTRACT_SYSTEM = `You are a clinical trial eligibility specialist working with EHRbase (OpenEHR CDR).
Extract structured criteria from free-text protocol text and generate a valid AQL query.

=== DATA IN EHRBASE ===
Three templates exist — each represents a different patient group:

  'adhd_initial_assessment'   → patients with an ADHD diagnosis
  'autism_initial_assessment' → patients with an autism spectrum diagnosis
  'trial_encounter'           → patients enrolled in the clinical trial (visit records with AEs)
    AE name path:     a/data[at0001]/items[at0002]/value/value
    AE severity path: a/data[at0001]/items[at0005]/value/value  (Mild | Moderate | Severe)

Age, medication history, cardiovascular history, weight — NOT stored. Do not filter on them.
If a criterion cannot be queried, note it in queryExplanation. Do not invent AQL paths.

=== FOUR EXACT PATTERNS — COPY ONE, DO NOT MODIFY THE FROM/CONTAINS CLAUSES ===

PATTERN A — ADHD patients:
SELECT DISTINCT e/ehr_id/value, s/subject/external_ref/id/value
FROM EHR e
CONTAINS (EHR_STATUS s AND COMPOSITION c)
WHERE c/archetype_details/template_id/value = 'adhd_initial_assessment'

PATTERN B — Autism patients:
SELECT DISTINCT e/ehr_id/value, s/subject/external_ref/id/value
FROM EHR e
CONTAINS (EHR_STATUS s AND COMPOSITION c)
WHERE c/archetype_details/template_id/value = 'autism_initial_assessment'

PATTERN C — ADHD OR autism patients:
SELECT DISTINCT e/ehr_id/value, s/subject/external_ref/id/value
FROM EHR e
CONTAINS (EHR_STATUS s AND COMPOSITION c)
WHERE c/archetype_details/template_id/value IN ('adhd_initial_assessment', 'autism_initial_assessment')

PATTERN D — Trial participants with Moderate or Severe adverse events:
SELECT DISTINCT e/ehr_id/value, s/subject/external_ref/id/value,
  a/data[at0001]/items[at0002]/value/value,
  a/data[at0001]/items[at0005]/value/value
FROM EHR e
CONTAINS (EHR_STATUS s
  AND COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1]
    CONTAINS EVALUATION a[openEHR-EHR-EVALUATION.problem_diagnosis.v1])
WHERE c/archetype_details/template_id/value = 'trial_encounter'
  AND a/data[at0001]/items[at0005]/value/value IN ('Moderate', 'Severe')

=== STRICT RULES — NEVER BREAK THESE ===
1. Never reference a path variable (a, v, p, t) that is not declared in the CONTAINS clause.
2. Never use vitals paths (v/, p/, t/) — they require complex joins not shown above.
3. Always wrap EHR_STATUS s with parentheses: CONTAINS (EHR_STATUS s AND COMPOSITION c ...).
4. Use DISTINCT to avoid duplicate patients.
5. Pick exactly one pattern above. Do not mix or invent new patterns.

Call save_extracted_criteria with your results.`;

export interface ExtractionResult {
  criteria: ExtractedCriteria;
  aql: string;
}

export async function extractCriteriaAndAql(
  rawText: string,
  onStatus: (msg: string) => void,
): Promise<ExtractionResult> {
  onStatus('Sending criteria to GPT-4o…');

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: EXTRACT_SYSTEM },
    {
      role: 'user',
      content: `Extract eligibility criteria and generate an AQL matching query for the following trial protocol text:\n\n${rawText}`,
    },
  ];

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'function', function: { name: 'save_extracted_criteria' } },
  });

  onStatus('Parsing GPT-4o response…');

  const tc = response.choices[0]?.message?.tool_calls?.[0];
  if (!tc) throw new Error('GPT-4o did not return a tool call');

  const args = JSON.parse(tc.function.arguments) as {
    inclusion: string[];
    exclusion: string[];
    primaryFocus: string;
    aqlQuery: string;
    queryExplanation: string;
  };

  return {
    criteria: {
      inclusion: args.inclusion,
      exclusion: args.exclusion,
      primaryFocus: args.primaryFocus,
      queryExplanation: args.queryExplanation,
    },
    aql: args.aqlQuery,
  };
}

// ── Match narrative ───────────────────────────────────────────────────────────

const EXECUTE_AQL_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'execute_aql',
    description: 'Execute an AQL query against the EHRbase clinical data repository.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The AQL query to execute' },
        parameters: {
          type: 'object',
          description: 'Optional query parameters',
          additionalProperties: true,
        },
      },
      required: ['query'],
    },
  },
};

const NARRATIVE_SYSTEM = `You are a clinical trial recruitment analyst. Given a list of matched patients and their eligibility criteria, generate a concise cohort summary narrative for a site coordinator.

You have access to execute_aql to fetch additional context. When querying EHRbase use only these patterns:

Find ADHD patients:
SELECT DISTINCT e/ehr_id/value, s/subject/external_ref/id/value
FROM EHR e CONTAINS (EHR_STATUS s AND COMPOSITION c)
WHERE c/archetype_details/template_id/value = 'adhd_initial_assessment'

Find autism patients:
SELECT DISTINCT e/ehr_id/value, s/subject/external_ref/id/value
FROM EHR e CONTAINS (EHR_STATUS s AND COMPOSITION c)
WHERE c/archetype_details/template_id/value = 'autism_initial_assessment'

Never use vitals paths (v/, p/, t/) or variables not declared in CONTAINS.

Your narrative should cover:
1. Cohort size and composition
2. Which criteria drove the match
3. Any notable patient sub-groups
4. Recommended next steps for site coordinators
Keep it factual, under 4 paragraphs.`;

export async function generateMatchNarrative(
  matchedPatients: { ehrId: string; subjectId: string }[],
  criteria: ExtractedCriteria,
  aql: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: NARRATIVE_SYSTEM },
    {
      role: 'user',
      content: `Generate a cohort summary narrative for the following match results.

Inclusion criteria: ${criteria.inclusion.join('; ')}
Exclusion criteria: ${criteria.exclusion.join('; ')}
Primary focus: ${criteria.primaryFocus}
AQL used: ${aql}

Matched patients (${matchedPatients.length} total):
${matchedPatients.map(p => `- Subject ${p.subjectId} (EHR: ${p.ehrId})`).join('\n')}

You may call execute_aql to get additional context about these patients if helpful.
Then write the cohort summary narrative.`,
    },
  ];

  while (true) {
    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: [EXECUTE_AQL_TOOL],
      tool_choice: 'auto',
      stream: true,
    });

    let finishReason: string | null = null;
    const toolCallAccum: Record<number, { id: string; name: string; args: string }> = {};
    let assistantContent = '';

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;

      if (delta.content) {
        assistantContent += delta.content;
        onChunk(delta.content);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCallAccum[tc.index]) toolCallAccum[tc.index] = { id: '', name: '', args: '' };
          if (tc.id) toolCallAccum[tc.index].id = tc.id;
          if (tc.function?.name) toolCallAccum[tc.index].name += tc.function.name;
          if (tc.function?.arguments) toolCallAccum[tc.index].args += tc.function.arguments;
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    const toolCalls = Object.values(toolCallAccum);

    const assistantMsg: OpenAI.Chat.ChatCompletionMessageParam = toolCalls.length > 0
      ? {
          role: 'assistant',
          content: assistantContent || null,
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.args },
          })),
        }
      : { role: 'assistant', content: assistantContent };

    messages.push(assistantMsg);

    if (finishReason === 'stop') break;

    if (finishReason === 'tool_calls' && toolCalls.length > 0) {
      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];
      for (const tc of toolCalls) {
        if (tc.name === 'execute_aql') {
          const input = JSON.parse(tc.args) as { query: string; parameters?: Record<string, unknown> };
          let result: string;
          try {
            const data = await runAql(input.query, input.parameters);
            result = JSON.stringify({ rows: data.rows, columns: data.columns, resultsize: data.resultsize });
          } catch (e) {
            result = JSON.stringify({ error: String(e) });
          }
          toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result });
        }
      }
      messages.push(...toolResults);
    } else {
      break;
    }
  }
}
