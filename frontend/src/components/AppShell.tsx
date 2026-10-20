import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Activity,
  Command,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/useAuth'

const navigation = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/tickets', label: 'Inbox', icon: Inbox },
  { to: '/#analytics', label: 'Analytics', icon: Activity, end: true },
]

export function AppShell() {
  const { user, organization, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const navigate = useNavigate()

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-icon"><Command size={19} strokeWidth={2.4} /></div>
          <span>supportpilot<span className="brand-ai">.ai</span></span>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X size={19} />
          </button>
        </div>

        <div className="workspace-switch">
          <span className="workspace-logo">{organization?.name.slice(0, 1).toUpperCase() ?? 'S'}</span>
          <span className="workspace-name"><strong>{organization?.name ?? 'Workspace'}</strong><small>Support workspace</small></span>
        </div>

        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
          <NavLink to="/tickets/new" onClick={() => setMobileOpen(false)}>
            <Plus size={18} />
            <span>New ticket</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-row">
            <div className="avatar">{user?.firstName.slice(0, 1)}{user?.lastName.slice(0, 1)}</div>
            <div className="profile-copy"><strong>{user?.firstName} {user?.lastName}</strong><small>{user?.email}</small></div>
            <button className="icon-button" onClick={handleLogout} disabled={loggingOut} aria-label="Log out" title="Log out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

      <main className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="breadcrumb"><span>Support</span><span className="crumb-slash">/</span><strong>Workspace</strong></div>
          <div className="topbar-actions">
            <Link className="quick-search" to="/tickets"><Search size={16} /><span>Search tickets</span></Link>
            <Link className="button button-primary button-small top-new" to="/tickets/new"><Plus size={16} />New ticket</Link>
          </div>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  )
}
