import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAeFrequency, fetchSignalHits, fetchVisitCompletion } from '../lib/queries';
import type { AeSummary, SignalHit, VisitCompletion } from '../lib/queries';

const SIGNAL_FROM = '2026-02-20';
const SIGNAL_TO   = '2026-02-27';

function severityBadge(sev: string) {
  if (sev === 'Severe')   return <span className="badge badge-red">{sev}</span>;
  if (sev === 'Moderate') return <span className="badge badge-orange">{sev}</span>;
  return <span className="badge badge-yellow">{sev}</span>;
}

export default function SignalDashboard() {
  const [aes, setAes] = useState<AeSummary[]>([]);
  const [signals, setSignals] = useState<SignalHit[]>([]);
  const [visits, setVisits] = useState<VisitCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetchAeFrequency(),
      fetchSignalHits(SIGNAL_FROM, SIGNAL_TO),
      fetchVisitCompletion(),
    ])
      .then(([a, s, v]) => { setAes(a); setSignals(s); setVisits(v); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const totalAes = aes.reduce((s, a) => s + a.count, 0);
  const grade2Plus = aes.reduce((s, a) => s + a.moderateCount + a.severeCount, 0);
  const signalParticipants = [...new Set(signals.map(s => s.participantId))];
  const avgVisits = visits.length ? (visits.reduce((s, v) => s + v.visitCount, 0) / visits.length).toFixed(1) : '—';

  if (loading) return <div className="page"><p className="loading">Loading dashboard…</p></div>;
  if (error)   return <div className="page"><p className="error-msg">{error}</p></div>;

  return (
    <div className="page">
      <div className="page-title">Signal Dashboard</div>
      <div className="page-sub">Trial Safety Monitoring — 30 participants, {visits.reduce((s,v)=>s+v.visitCount,0)} visits total</div>

      {signals.length > 0 && (
        <div className="signal-banner">
          <div className="signal-banner-icon">⚠</div>
          <div className="signal-banner-body">
            <h3>Safety Signal Detected — {SIGNAL_FROM} to {SIGNAL_TO}</h3>
            <p>
              {signalParticipants.length} participants reported Grade 2 Fatigue + Headache within a 7-day window.
              Participants: {signalParticipants.join(', ')}.{' '}
              <Link to="/signal-detail">View detail &rarr;</Link>
            </p>
          </div>
        </div>
      )}

      <div className="grid-4">
        <div className="card stat">
          <div className="stat-value">{visits.length}</div>
          <div className="stat-label">Trial Participants</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{totalAes}</div>
          <div className="stat-label">Total AE Occurrences</div>
        </div>
        <div className="card stat">
          <div className="stat-value" style={{ color: 'var(--orange)' }}>{grade2Plus}</div>
          <div className="stat-label">Grade 2+ Events</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{avgVisits}</div>
          <div className="stat-label">Avg Visits / Participant</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">AE Frequency by Type</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Adverse Event</th>
                  <th>Total</th>
                  <th>Grade 2</th>
                  <th>Grade 3+</th>
                </tr>
              </thead>
              <tbody>
                {aes.map(ae => (
                  <tr key={ae.name}>
                    <td>{ae.name}</td>
                    <td>{ae.count}</td>
                    <td style={{ color: ae.moderateCount > 0 ? 'var(--orange)' : 'inherit' }}>
                      {ae.moderateCount || '—'}
                    </td>
                    <td style={{ color: ae.severeCount > 0 ? 'var(--red)' : 'inherit' }}>
                      {ae.severeCount || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Signal Window Events ({SIGNAL_FROM} → {SIGNAL_TO})</div>
          {signals.length === 0 ? (
            <p className="loading">No Grade 2+ events in this window.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Date</th>
                    <th>Event</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s, i) => (
                    <tr key={i}>
                      <td>
                        <Link to={`/participant/${s.participantId}`}>{s.participantId}</Link>
                      </td>
                      <td>{s.visitDate.slice(0, 10)}</td>
                      <td>{s.aeName}</td>
                      <td>{severityBadge(s.severity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card mb16">
        <div className="card-title">Visit Completion by Participant</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Visits Completed</th>
                <th>Progress</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visits.map(v => (
                <tr key={v.ehrId}>
                  <td>{v.participantId}</td>
                  <td>{v.visitCount} / 6</td>
                  <td style={{ width: 140 }}>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${Math.min(100, (v.visitCount / 6) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td>
                    <Link to={`/participant/${v.participantId}`} className="btn-ghost" style={{ padding: '3px 10px', fontSize: 12, display: 'inline-block', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)' }}>
                      Profile
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
