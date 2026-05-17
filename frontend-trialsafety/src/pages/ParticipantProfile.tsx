import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchParticipantAes } from '../lib/queries';
import type { ParticipantVisit } from '../lib/queries';

function severityBadge(sev: string) {
  if (sev === 'Severe')   return <span className="badge badge-red">{sev}</span>;
  if (sev === 'Moderate') return <span className="badge badge-orange">{sev}</span>;
  return <span className="badge badge-yellow">{sev}</span>;
}

function vitalCell(val: number | null, unit: string, warnFn?: (v: number) => boolean) {
  if (val === null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const warn = warnFn?.(val);
  return <span style={{ color: warn ? 'var(--orange)' : 'inherit' }}>{val} {unit}</span>;
}

export default function ParticipantProfile() {
  const { id } = useParams<{ id: string }>();
  const [visits, setVisits] = useState<ParticipantVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetchParticipantAes(id)
      .then(setVisits)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page"><p className="loading">Loading participant data…</p></div>;
  if (error)   return <div className="page"><p className="error-msg">{error}</p></div>;

  const allAes = visits.flatMap(v => v.aes);
  const grade2Count = allAes.filter(a => a.severity === 'Moderate' || a.severity === 'Severe').length;

  return (
    <div className="page">
      <div className="row">
        <div>
          <div className="page-title">Participant Safety Profile</div>
          <div className="page-sub">{id} &nbsp;·&nbsp; {visits.length} visits &nbsp;·&nbsp; {allAes.length} AE occurrences</div>
        </div>
        <div className="spacer" />
        <Link to="/" className="btn-ghost"
          style={{ display: 'inline-block', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--muted)' }}>
          ← Dashboard
        </Link>
      </div>

      <div className="grid-4 mb24" style={{ marginBottom: 20 }}>
        <div className="card stat">
          <div className="stat-value">{visits.length}</div>
          <div className="stat-label">Visits Completed</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{allAes.length}</div>
          <div className="stat-label">Total AEs</div>
        </div>
        <div className="card stat">
          <div className="stat-value" style={{ color: grade2Count > 0 ? 'var(--orange)' : 'inherit' }}>
            {grade2Count}
          </div>
          <div className="stat-label">Grade 2+ Events</div>
        </div>
        <div className="card stat">
          <div className="stat-value">
            {visits.filter(v => v.systolic !== null && v.systolic >= 140).length}
          </div>
          <div className="stat-label">High BP Visits</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Visit-by-Visit Safety Record</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Adverse Events</th>
                <th>Systolic</th>
                <th>Diastolic</th>
                <th>Pulse</th>
                <th>Temp</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>{v.visitDate.slice(0, 10)}</td>
                  <td>
                    {v.aes.length === 0
                      ? <span style={{ color: 'var(--muted)' }}>None reported</span>
                      : v.aes.map((ae, j) => (
                          <span key={j} style={{ marginRight: 8 }}>
                            {ae.name} {severityBadge(ae.severity)}
                          </span>
                        ))
                    }
                  </td>
                  <td>{vitalCell(v.systolic, 'mmHg', x => x >= 140)}</td>
                  <td>{vitalCell(v.diastolic, 'mmHg', x => x >= 90)}</td>
                  <td>{vitalCell(v.pulse, '/min', x => x > 100 || x < 50)}</td>
                  <td>{vitalCell(v.temperature, '°C', x => x >= 37.8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
