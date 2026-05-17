import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { extractCriteriaAndAql } from '../lib/openai';
import { setDraft } from '../lib/storage';

const EXAMPLE_CRITERIA = `Inclusion Criteria:
- Adults aged 18 to 65 years
- Confirmed diagnosis of ADHD (Attention Deficit Hyperactivity Disorder)
- No prior exposure to stimulant medications

Exclusion Criteria:
- Comorbid autism spectrum disorder diagnosis
- Currently enrolled in another clinical trial
- History of cardiovascular disease`;

function StepBar({ active }: { active: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: 'Paste Criteria' },
    { n: 2, label: 'Review AQL' },
    { n: 3, label: 'Match Results' },
  ];
  return (
    <div className="step-bar mb24">
      {steps.map((s, i) => (
        <>
          <div key={s.n} className={`step ${active === s.n ? 'active' : active > s.n ? 'done' : ''}`}>
            <div className="step-num">{active > s.n ? '✓' : s.n}</div>
            {s.label}
          </div>
          {i < steps.length - 1 && <div key={`d${i}`} className="step-divider" />}
        </>
      ))}
    </div>
  );
}

export { StepBar };

export default function ProtocolInput() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleExtract() {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    setStatus('');
    try {
      const result = await extractCriteriaAndAql(text.trim(), setStatus);
      setDraft({ rawText: text.trim(), criteria: result.criteria, aql: result.aql });
      navigate('/query-builder');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  function loadExample() {
    setText(EXAMPLE_CRITERIA);
  }

  return (
    <main className="page">
      <StepBar active={1} />

      <div className="page-title">Trial Protocol Input</div>
      <div className="page-sub">Paste eligibility criteria from your trial protocol — GPT-4o will extract the criteria and build an AQL query.</div>

      <div className="info-banner mb24">
        <div className="info-banner-icon">&#9654;</div>
        <div className="info-banner-body">
          <h3>How it works</h3>
          <p>Paste free-text inclusion/exclusion criteria. GPT-4o reads them, extracts structured logic, and generates an AQL query targeting your EHRbase patient database.</p>
        </div>
      </div>

      <div className="card mb16">
        <div className="card-title">Eligibility Criteria Text</div>
        <textarea
          className="criteria-textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste your trial eligibility criteria here…&#10;&#10;Example:&#10;Inclusion: Adults 18–65 with confirmed ADHD&#10;Exclusion: Comorbid autism, prior stimulant exposure"
          disabled={loading}
        />
        <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
          <button className="btn-ghost" onClick={loadExample} disabled={loading}>
            Load Example
          </button>
          <div className="spacer" />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {text.length > 0 ? `${text.length} chars` : ''}
          </span>
          <button
            className="btn-primary"
            onClick={handleExtract}
            disabled={loading || !text.trim()}
          >
            {loading ? 'Extracting…' : 'Extract & Build Query →'}
          </button>
        </div>
        {status && <div className="loading" style={{ marginTop: 8 }}>{status}</div>}
        {error && <div className="error-msg">{error}</div>}
      </div>

      <div className="card">
        <div className="card-title">What happens after you click Extract</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['1', 'GPT-4o reads your protocol text and pulls out every inclusion and exclusion criterion.'],
            ['2', 'It generates an AQL query tailored to your criteria, targeting the EHRbase patient database.'],
            ['3', 'You land on the Query Builder where you can review, edit the criteria and AQL, then run the match.'],
          ].map(([n, desc]) => (
            <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-dim)',
                border: '1px solid var(--accent)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
              }}>{n}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
