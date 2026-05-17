import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import ProtocolInput from './pages/ProtocolInput';
import QueryBuilder from './pages/QueryBuilder';
import MatchResults from './pages/MatchResults';
import StoredProtocols from './pages/StoredProtocols';

function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="brand-icon">⚕</span>
        <span className="brand-name">TrialAI</span>
        <span className="brand-divider" />
        <span className="brand-module match">Eligibility Screener</span>
      </div>
      <nav className="topbar-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>New Protocol</NavLink>
        <NavLink to="/query-builder" className={({ isActive }) => isActive ? 'active' : ''}>Query Builder</NavLink>
        <NavLink to="/match-results" className={({ isActive }) => isActive ? 'active' : ''}>Match Results</NavLink>
        <NavLink to="/protocols" className={({ isActive }) => isActive ? 'active' : ''}>Saved Protocols</NavLink>
        <span className="nav-divider" />
        <a href="http://localhost:5173" className="app-switch">Signal Monitor ↗</a>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/match">
      <div className="app">
        <Topbar />
        <Routes>
          <Route path="/" element={<ProtocolInput />} />
          <Route path="/query-builder" element={<QueryBuilder />} />
          <Route path="/match-results" element={<MatchResults />} />
          <Route path="/protocols" element={<StoredProtocols />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
