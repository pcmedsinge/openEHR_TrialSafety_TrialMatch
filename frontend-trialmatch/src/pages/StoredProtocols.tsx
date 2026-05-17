import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProtocols, deleteProtocol, setDraft } from '../lib/storage';
import type { Protocol } from '../lib/storage';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function StoredProtocols() {
  const navigate = useNavigate();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setProtocols(getProtocols());
  }, []);

  function handleLoad(p: Protocol) {
    setDraft({ rawText: p.rawText, criteria: p.criteria, aql: p.aql });
    navigate('/match-results');
  }

  function handleEdit(p: Protocol) {
    setDraft({ rawText: p.rawText, criteria: p.criteria, aql: p.aql });
    navigate('/query-builder');
  }

  function handleDelete(id: string) {
    deleteProtocol(id);
    setProtocols(getProtocols());
  }

  if (protocols.length === 0) {
    return (
      <main className="page">
        <div className="page-title">Saved Protocols</div>
        <div className="page-sub">Trial eligibility protocols you have saved for re-use.</div>
        <div className="empty-state">
          <div className="empty-state-icon">&#128196;</div>
          <div>No protocols saved yet.</div>
          <div style={{ marginTop: 12 }}>
            <a href="/">Create your first protocol →</a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-title">Saved Protocols</div>
      <div className="page-sub">{protocols.length} saved protocol{protocols.length !== 1 ? 's' : ''}.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {protocols.map(p => (
          <div key={p.id} className="card">
            <div className="row" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
              <span className="badge badge-purple">{p.criteria.primaryFocus}</span>
              {p.lastMatchCount !== undefined && (
                <span className="badge badge-green">{p.lastMatchCount} matched</span>
              )}
              <div className="spacer" />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Saved {formatDate(p.savedAt)}
              </span>
            </div>

            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              {p.criteria.queryExplanation}
            </div>

            {expanded === p.id && (
              <div style={{ marginBottom: 12 }}>
                <div className="grid-2 mb16">
                  <div>
                    <div className="label mb8">Inclusion</div>
                    <div className="criteria-list">
                      {p.criteria.inclusion.map((c, i) => (
                        <div key={i} className="criteria-item inclusion">
                          <span className="criteria-item-icon">+</span><span>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="label mb8">Exclusion</div>
                    <div className="criteria-list">
                      {p.criteria.exclusion.map((c, i) => (
                        <div key={i} className="criteria-item exclusion">
                          <span className="criteria-item-icon">−</span><span>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="label mb8">AQL Query</div>
                <div className="aql-block">{p.aql}</div>
              </div>
            )}

            <div className="row" style={{ marginBottom: 0 }}>
              <button
                className="btn-ghost"
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              >
                {expanded === p.id ? 'Collapse' : 'View Details'}
              </button>
              <button className="btn-ghost" onClick={() => handleEdit(p)}>
                Edit AQL
              </button>
              <div className="spacer" />
              <button
                className="btn-danger"
                onClick={() => handleDelete(p.id)}
                style={{ fontSize: 12, padding: '5px 10px' }}
              >
                Delete
              </button>
              <button className="btn-primary" onClick={() => handleLoad(p)}>
                Run Match →
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
