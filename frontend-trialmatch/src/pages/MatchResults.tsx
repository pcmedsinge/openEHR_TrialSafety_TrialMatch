import { useState, useEffect } from 'react';
import { getDraft, updateMatchCount } from '../lib/storage';
import type { Draft } from '../lib/storage';
import { runAql } from '../lib/ehrbase';
import { generateMatchNarrative } from '../lib/openai';
import { StepBar } from './ProtocolInput';
import { getProtocols } from '../lib/storage';

interface MatchedPatient {
  ehrId: string;
  subjectId: string;
  extra: Record<string, string>;
}

export default function MatchResults() {
  const [draft, setLocalDraft] = useState<Draft | null>(null);
  const [patients, setPatients] = useState<MatchedPatient[]>([]);
  const [extraCols, setExtraCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [narrative, setNarrative] = useState('');
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState('');

  useEffect(() => {
    const d = getDraft();
    if (d) {
      setLocalDraft(d);
      runQuery(d);
    }
  }, []);

  async function runQuery(d: Draft) {
    setLoading(true);
    setError('');
    setPatients([]);
    try {
      const result = await runAql(d.aql);
      const cols = result.columns.map(c => c.name);
      const ehrIdx = cols.findIndex(c => c.toLowerCase().includes('ehr_id') || c.toLowerCase() === 'e/ehr_id/value');
      const subIdx = cols.findIndex(c => c.toLowerCase().includes('subject') || c.toLowerCase().includes('external_ref'));

      const parsed: MatchedPatient[] = result.rows.map(row => {
        const extra: Record<string, string> = {};
        cols.forEach((col, i) => {
          if (i !== ehrIdx && i !== subIdx) {
            extra[col] = String(row[i] ?? '');
          }
        });
        return {
          ehrId: String(ehrIdx >= 0 ? row[ehrIdx] : row[0] ?? ''),
          subjectId: String(subIdx >= 0 ? row[subIdx] : row[1] ?? ''),
          extra,
        };
      });

      // deduplicate by EHR ID
      const seen = new Set<string>();
      const deduped = parsed.filter(p => {
        if (seen.has(p.ehrId)) return false;
        seen.add(p.ehrId);
        return true;
      });

      const extraKeys = cols.filter((_, i) => i !== ehrIdx && i !== subIdx);
      setExtraCols(extraKeys);
      setPatients(deduped);

      // update match count on saved protocol if we find one
      const protocols = getProtocols();
      const match = protocols.find(p => p.aql === d.aql);
      if (match) updateMatchCount(match.id, deduped.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleNarrative() {
    if (!draft || patients.length === 0) return;
    setNarrativeLoading(true);
    setNarrativeError('');
    setNarrative('');
    try {
      await generateMatchNarrative(patients, draft.criteria, draft.aql, chunk => {
        setNarrative(prev => prev + chunk);
      });
    } catch (e) {
      setNarrativeError(String(e));
    } finally {
      setNarrativeLoading(false);
    }
  }

  function handleRerun() {
    if (draft) runQuery(draft);
  }

  if (!draft) {
    return (
      <main className="page">
        <StepBar active={3} />
        <div className="empty-state">
          <div className="empty-state-icon">&#128202;</div>
          <div>No protocol loaded. Go to <a href="/">New Protocol</a> to start.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <StepBar active={3} />

      <div className="page-title">Match Results</div>
      <div className="page-sub">Patients from EHRbase matching your eligibility criteria.</div>

      {/* Stat cards */}
      <div className="grid-3 mb24">
        <div className="card stat">
          <div className="stat-value" style={{ color: 'var(--accent)' }}>
            {loading ? '…' : patients.length}
          </div>
          <div className="stat-label">Matched Patients</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{draft.criteria.inclusion.length}</div>
          <div className="stat-label">Inclusion Criteria</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{draft.criteria.exclusion.length}</div>
          <div className="stat-label">Exclusion Criteria</div>
        </div>
      </div>

      {/* Narrative — shown before table so user doesn't scroll */}
      <div className="card mb16">
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>GPT-4o Cohort Narrative</div>
          <div className="spacer" />
          {narrative && (
            <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(narrative)}>
              Copy
            </button>
          )}
          <button
            className="btn-primary"
            onClick={handleNarrative}
            disabled={narrativeLoading || patients.length === 0}
          >
            {narrativeLoading ? 'Generating…' : 'Generate Narrative'}
          </button>
        </div>
        <div className={`narrative-box ${narrativeLoading ? 'streaming' : ''}`}>
          {narrative
            ? narrative
            : <span className="narrative-placeholder">
                Click "Generate Narrative" to have GPT-4o summarise this cohort and suggest next steps.
              </span>}
        </div>
        {narrativeError && <div className="error-msg">{narrativeError}</div>}
      </div>

      {/* Criteria summary */}
      <div className="card mb16">
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Active Criteria</div>
          <span className="badge badge-purple">{draft.criteria.primaryFocus}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            {draft.criteria.inclusion.map((c, i) => (
              <div key={i} className="criteria-item inclusion" style={{ marginBottom: 4 }}>
                <span className="criteria-item-icon">+</span><span>{c}</span>
              </div>
            ))}
          </div>
          <div>
            {draft.criteria.exclusion.map((c, i) => (
              <div key={i} className="criteria-item exclusion" style={{ marginBottom: 4 }}>
                <span className="criteria-item-icon">−</span><span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Patient table */}
      <div className="card mb16">
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Matched Patient Cohort</div>
          <div className="spacer" />
          <button className="btn-ghost" onClick={handleRerun} disabled={loading}>
            {loading ? 'Running…' : 'Re-run Query'}
          </button>
        </div>

        {loading && <div className="loading">Running AQL query against EHRbase…</div>}
        {error && <div className="error-msg">{error}</div>}

        {!loading && !error && patients.length === 0 && (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <div className="empty-state-icon">&#128269;</div>
            <div>No patients matched the query.</div>
          </div>
        )}

        {!loading && patients.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Subject ID</th>
                  <th>EHR ID</th>
                  {extraCols.map(col => <th key={col}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {patients.map((p, i) => (
                  <tr key={p.ehrId}>
                    <td>{i + 1}</td>
                    <td><span className="badge badge-purple">{p.subjectId}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {p.ehrId.slice(0, 8)}…
                    </td>
                    {extraCols.map(col => (
                      <td key={col}>{p.extra[col] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AQL used */}
      <div className="card">
        <div className="card-title">AQL Query Used</div>
        <div className="aql-block">{draft.aql}</div>
      </div>
    </main>
  );
}
