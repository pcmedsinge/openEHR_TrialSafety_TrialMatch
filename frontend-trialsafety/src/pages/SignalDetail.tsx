import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fetchSignalHits } from '../lib/queries';
import type { SignalHit } from '../lib/queries';
import { generateSafetyNarrative } from '../lib/claude';

const SIGNAL_FROM = '2026-02-20';
const SIGNAL_TO   = '2026-02-27';

function severityBadge(sev: string) {
  if (sev === 'Severe')   return <span className="badge badge-red">{sev}</span>;
  if (sev === 'Moderate') return <span className="badge badge-orange">{sev}</span>;
  return <span className="badge badge-yellow">{sev}</span>;
}

export default function SignalDetail() {
  const [signals, setSignals] = useState<SignalHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [narrative, setNarrative] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const narrativeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSignalHits(SIGNAL_FROM, SIGNAL_TO)
      .then(setSignals)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const signalParticipants = [...new Set(signals.map(s => s.participantId))];

  async function handleGenerate() {
    setGenerating(true);
    setNarrative('');
    setGenError('');
    try {
      await generateSafetyNarrative(
        signals,
        { from: SIGNAL_FROM, to: SIGNAL_TO },
        chunk => setNarrative(prev => {
          const next = prev + chunk;
          setTimeout(() => narrativeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
          return next;
        })
      );
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(narrative);
  }

  function handleDownload() {
    const blob = new Blob([narrative], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safety-narrative-${SIGNAL_FROM}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="page"><p className="loading">Loading signal data…</p></div>;
  if (error)   return <div className="page"><p className="error-msg">{error}</p></div>;

  // Group by participant + visit date
  const grouped = signalParticipants.map(pid => ({
    participantId: pid,
    events: signals.filter(s => s.participantId === pid),
  }));

  return (
    <div className="page">
      <div className="row">
        <div>
          <div className="page-title">Signal Detail</div>
          <div className="page-sub">
            Window: {SIGNAL_FROM} – {SIGNAL_TO} &nbsp;·&nbsp; {signalParticipants.length} participants &nbsp;·&nbsp; {signals.length} Grade 2+ events
          </div>
        </div>
        <div className="spacer" />
        <Link to="/" className="btn-ghost" style={{ display: 'inline-block', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--muted)' }}>
          ← Dashboard
        </Link>
      </div>

      <div className="signal-banner">
        <div className="signal-banner-icon">⚠</div>
        <div className="signal-banner-body">
          <h3>Potential Safety Signal — Fatigue + Headache (Grade 2)</h3>
          <p>
            {signalParticipants.length} participants experienced co-occurring Moderate Fatigue and Moderate Headache
            within the same 7-day window at Week 8 of the trial. This pattern exceeds background rate and
            warrants pharmacovigilance review.
          </p>
        </div>
      </div>

      <div className="card mb24">
        <div className="card-title">Affected Participants — Event Timeline</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Visit Date</th>
                <th>Adverse Event</th>
                <th>Severity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grouped.flatMap(g =>
                g.events.map((ev, i) => (
                  <tr key={`${g.participantId}-${i}`}>
                    {i === 0 && (
                      <td rowSpan={g.events.length} style={{ fontWeight: 600, verticalAlign: 'top', paddingTop: 12 }}>
                        {g.participantId}
                      </td>
                    )}
                    <td>{ev.visitDate.slice(0, 10)}</td>
                    <td>{ev.aeName}</td>
                    <td>{severityBadge(ev.severity)}</td>
                    {i === 0 && (
                      <td rowSpan={g.events.length} style={{ verticalAlign: 'top', paddingTop: 10 }}>
                        <Link to={`/participant/${g.participantId}`}
                          style={{ fontSize: 12, padding: '3px 10px', display: 'inline-block',
                            border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)' }}>
                          Profile
                        </Link>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">ICH E2B Safety Narrative — AI Generated</div>
        <div className="row mb16">
          <button
            className="btn-primary"
            onClick={handleGenerate}
            disabled={generating || !import.meta.env.VITE_OPENAI_API_KEY}
          >
            {generating ? 'Generating…' : narrative ? 'Regenerate Narrative' : 'Generate Narrative'}
          </button>
          {!import.meta.env.VITE_OPENAI_API_KEY && (
            <span className="error-msg" style={{ marginTop: 0 }}>
              Set VITE_OPENAI_API_KEY in .env to enable AI narrative
            </span>
          )}
          {narrative && !generating && (
            <>
              <button className="btn-ghost" onClick={handleCopy}>Copy</button>
              <button className="btn-ghost" onClick={handleDownload}>Download .txt</button>
            </>
          )}
        </div>

        {genError && <p className="error-msg">{genError}</p>}

        <div className={`narrative-box ${generating ? 'streaming' : ''}`} ref={narrativeRef}>
          {narrative || (
            <span className="narrative-placeholder">
              Click "Generate Narrative" to produce an ICH E2B-style pharmacovigilance case narrative
              using Claude AI with live EHRbase data retrieval.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
