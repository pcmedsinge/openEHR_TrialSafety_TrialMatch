import { useState } from 'react';
import { STORED_QUERIES } from '../lib/queries';
import { runAql } from '../lib/ehrbase';
import type { AqlResult } from '../lib/ehrbase';

export default function StoredQueries() {
  const [selected, setSelected] = useState(STORED_QUERIES[0].id);
  const [result, setResult] = useState<AqlResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const query = STORED_QUERIES.find(q => q.id === selected)!;

  async function handleRun() {
    setRunning(true);
    setResult(null);
    setError('');
    try {
      const res = await runAql(query.aql);
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="page">
      <div className="page-title">Stored AQL Queries</div>
      <div className="page-sub">Standard pharmacovigilance report queries for the trial_encounter template</div>

      <div className="grid-2">
        <div>
          <div className="card mb24" style={{ marginBottom: 16 }}>
            <div className="card-title">Query Library</div>
            {STORED_QUERIES.map(q => (
              <div
                key={q.id}
                onClick={() => { setSelected(q.id); setResult(null); setError(''); }}
                style={{
                  padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                  background: selected === q.id ? 'var(--accent-dim)' : 'transparent',
                  border: selected === q.id ? '1px solid var(--accent)' : '1px solid transparent',
                  marginBottom: 6,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: selected === q.id ? 'var(--accent)' : 'var(--text)' }}>
                  {q.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{q.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">{query.label}</div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{query.description}</p>
            <div className="aql-block">{query.aql}</div>
            <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
              <button className="btn-primary" onClick={handleRun} disabled={running}>
                {running ? 'Running…' : 'Run Query'}
              </button>
            </div>
          </div>

          {error && <p className="error-msg">{error}</p>}

          {result && (
            <div className="card">
              <div className="card-title">Results — {result.resultsize} row{result.resultsize !== 1 ? 's' : ''}</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {result.columns.map((col, i) => (
                        <th key={i}>{col.name || col.path || `col${i}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        {(row as unknown[]).map((cell, j) => (
                          <td key={j}>
                            {cell === null ? <span style={{ color: 'var(--muted)' }}>null</span>
                              : typeof cell === 'string' && cell.length > 80 ? cell.slice(0, 80) + '…'
                              : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
