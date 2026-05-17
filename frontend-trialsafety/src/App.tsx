import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import SignalDashboard from './pages/SignalDashboard';
import SignalDetail from './pages/SignalDetail';
import ParticipantProfile from './pages/ParticipantProfile';
import StoredQueries from './pages/StoredQueries';

function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="brand-icon">⚕</span>
        <span className="brand-name">TrialAI</span>
        <span className="brand-divider" />
        <span className="brand-module safety">Signal Monitor</span>
      </div>
      <nav className="topbar-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Dashboard</NavLink>
        <NavLink to="/signal-detail" className={({ isActive }) => isActive ? 'active' : ''}>Signal Detail</NavLink>
        <NavLink to="/queries" className={({ isActive }) => isActive ? 'active' : ''}>AQL Queries</NavLink>
        <span className="nav-divider" />
        <a href="http://localhost:5174" className="app-switch">Eligibility Screener ↗</a>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Topbar />
        <Routes>
          <Route path="/" element={<SignalDashboard />} />
          <Route path="/signal-detail" element={<SignalDetail />} />
          <Route path="/participant/:id" element={<ParticipantProfile />} />
          <Route path="/queries" element={<StoredQueries />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
