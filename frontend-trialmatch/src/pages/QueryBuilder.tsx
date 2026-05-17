import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDraft, setDraft, saveProtocol } from '../lib/storage';
import type { Draft } from '../lib/storage';
import { StepBar } from './ProtocolInput';

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'transparent', border: 'none', outline: 'none',
  color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
};

const removeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--muted)',
  cursor: 'pointer', padding: '0 6px', fontSize: 18, lineHeight: 1,
  flexShrink: 0,
};

export default function QueryBuilder() {
  const navigate = useNavigate();
  const [draft, setLocalDraft] = useState<Draft | null>(null);
  const [aql, setAql] = useState('');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [inclusion, setInclusion] = useState<string[]>([]);
  const [exclusion, setExclusion] = useState<string[]>([]);

  useEffect(() => {
    const d = getDraft();
    if (d) {
      setLocalDraft(d);
      setAql(d.aql);
      setInclusion(d.criteria.inclusion.filter(c => c.trim()));
      setExclusion(d.criteria.exclusion.filter(c => c.trim()));
    }
  }, []);

  function syncCriteria(inc: string[], exc: string[], currentDraft: Draft) {
    const updated = { ...currentDraft, criteria: { ...currentDraft.criteria, inclusion: inc, exclusion: exc } };
    setLocalDraft(updated);
    setDraft(updated);
    setSaved(false);
  }

  function updateInclusion(idx: number, val: string) {
    const updated = inclusion.map((c, i) => i === idx ? val : c);
    setInclusion(updated);
    if (draft) syncCriteria(updated, exclusion, draft);
  }

  function removeInclusion(idx: number) {
    const updated = inclusion.filter((_, i) => i !== idx);
    setInclusion(updated);
    if (draft) syncCriteria(updated, exclusion, draft);
  }

  function addInclusion() {
    const updated = [...inclusion, ''];
    setInclusion(updated);
    if (draft) syncCriteria(updated, exclusion, draft);
  }

  function updateExclusion(idx: number, val: string) {
    const updated = exclusion.map((c, i) => i === idx ? val : c);
    setExclusion(updated);
    if (draft) syncCriteria(inclusion, updated, draft);
  }

  function removeExclusion(idx: number) {
    const updated = exclusion.filter((_, i) => i !== idx);
    setExclusion(updated);
    if (draft) syncCriteria(inclusion, updated, draft);
  }

  function addExclusion() {
    const updated = [...exclusion, ''];
    setExclusion(updated);
    if (draft) syncCriteria(inclusion, updated, draft);
  }

  function handleAqlChange(val: string) {
    setAql(val);
    setSaved(false);
    if (draft) {
      const updated = { ...draft, aql: val };
      setLocalDraft(updated);
      setDraft(updated);
    }
  }

  function handleSave() {
    if (!draft || !name.trim()) return;
    saveProtocol({
      id: crypto.randomUUID(),
      name: name.trim(),
      rawText: draft.rawText,
      criteria: draft.criteria,
      aql,
      savedAt: new Date().toISOString(),
    });
    setSaved(true);
  }

  function handleRun() {
    if (draft) setDraft({ ...draft, aql });
    navigate('/match-results');
  }

  if (!draft) {
    return (
      <main className="page">
        <StepBar active={2} />
        <div className="empty-state">
          <div className="empty-state-icon">&#128196;</div>
          <div>No protocol loaded. Go to <a href="/">New Protocol</a> to paste eligibility criteria first.</div>
        </div>
      </main>
    );
  }

  const { criteria } = draft;
  const hasCriteria = inclusion.length > 0 || exclusion.length > 0;

  return (
    <main className="page">
      <StepBar active={2} />

      <div className="page-title">Eligibility Query Builder</div>
      <div className="page-sub">Edit criteria or the AQL query below, then run the match.</div>

      <div className="grid-2 mb24">
        {/* Inclusion */}
        <div className="card">
          <div className="card-title">Inclusion Criteria</div>
          <div className="criteria-list">
            {inclusion.map((c, i) => (
              <div key={i} className="criteria-item inclusion" style={{ alignItems: 'center' }}>
                <span className="criteria-item-icon">+</span>
                <input
                  style={inputStyle}
                  value={c}
                  onChange={e => updateInclusion(i, e.target.value)}
                  placeholder="Enter criterion…"
                />
                <button style={removeBtn} onClick={() => removeInclusion(i)} title="Remove">×</button>
              </div>
            ))}
            {inclusion.length === 0 && <span className="loading">None extracted</span>}
            <button
              className="btn-ghost"
              style={{ marginTop: 8, fontSize: 12, padding: '5px 10px' }}
              onClick={addInclusion}
            >
              + Add criterion
            </button>
          </div>
        </div>

        {/* Exclusion */}
        <div className="card">
          <div className="card-title">Exclusion Criteria</div>
          <div className="criteria-list">
            {exclusion.map((c, i) => (
              <div key={i} className="criteria-item exclusion" style={{ alignItems: 'center' }}>
                <span className="criteria-item-icon">−</span>
                <input
                  style={inputStyle}
                  value={c}
                  onChange={e => updateExclusion(i, e.target.value)}
                  placeholder="Enter criterion…"
                />
                <button style={removeBtn} onClick={() => removeExclusion(i)} title="Remove">×</button>
              </div>
            ))}
            {exclusion.length === 0 && <span className="loading">None extracted</span>}
            <button
              className="btn-ghost"
              style={{ marginTop: 8, fontSize: 12, padding: '5px 10px' }}
              onClick={addExclusion}
            >
              + Add criterion
            </button>
          </div>
        </div>
      </div>

      {!hasCriteria && (
        <div className="info-banner mb16">
          <div className="info-banner-icon">&#8629;</div>
          <div className="info-banner-body">
            <h3>No criteria extracted yet</h3>
            <p>Go back to <a href="/">New Protocol</a>, paste your trial protocol text and click "Extract & Build Query" first.</p>
          </div>
        </div>
      )}

      {hasCriteria && <div className="card mb16">
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Generated AQL Query</div>
          <div className="spacer" />
          <span className="badge badge-purple">{criteria.primaryFocus}</span>
        </div>
        <div className="label mb8">Query Explanation</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
          {criteria.queryExplanation}
        </div>
        <div className="label mb8">AQL (editable)</div>
        <textarea
          className="aql-textarea"
          value={aql}
          onChange={e => handleAqlChange(e.target.value)}
          spellCheck={false}
        />
      </div>}

      {hasCriteria && <div className="card mb24">
        <div className="card-title">Save Protocol</div>
        <div className="label mb8">Protocol Name</div>
        <input
          className="name-input mb16"
          value={name}
          onChange={e => { setName(e.target.value); setSaved(false); }}
          placeholder="e.g. ADHD Phase II Recruitment Q1-2026"
        />
        <div className="row" style={{ marginBottom: 0 }}>
          <button className="btn-ghost" onClick={handleSave} disabled={!name.trim()}>
            {saved ? '✓ Saved' : 'Save Protocol'}
          </button>
          <div className="spacer" />
          <button className="btn-primary" onClick={handleRun}>
            Run Match Query →
          </button>
        </div>
      </div>}
    </main>
  );
}
