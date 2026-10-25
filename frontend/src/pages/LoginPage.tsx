import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Command, LockKeyhole, Mail } from 'lucide-react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'

export function LoginPage() {
  const { login, user, loading, sessionError, retrySession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const logoutWarning = (location.state as { logoutWarning?: string } | null)?.logoutWarning

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/'
      navigate(destination, { replace: true })
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to sign in. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <section className="login-panel">
        <Link to="/" className="login-brand"><span className="brand-icon"><Command size={19} /></span>supportpilot<span className="brand-ai">.ai</span></Link>
        <div className="login-form-wrap">
          <div className="login-kicker"><span className="live-dot" /> CUSTOMER OPERATIONS PLATFORM</div>
          <h1>Welcome back</h1>
          <p className="login-subtitle">Sign in to your support workspace to pick up where you left off.</p>
          {logoutWarning && <div className="login-error" role="alert">You were signed out of this browser, but the server could not confirm session revocation: {logoutWarning}</div>}
          {sessionError && <div className="login-error" role="alert">{sessionError}{sessionStorage.getItem('supportpilot.accessToken') && <button className="session-retry" type="button" onClick={() => { void retrySession() }} disabled={loading}>Retry session</button>}</div>}
          {error && <div className="login-error" role="alert">{error}</div>}
          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="email">Work email</label>
            <div className="input-with-icon"><Mail size={17} /><input id="email" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} /></div>
            <div className="password-label"><label htmlFor="password">Password</label><span>Secure sign in</span></div>
            <div className="input-with-icon"><LockKeyhole size={17} /><input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={128} /></div>
            <button className="button button-primary login-submit" type="submit" disabled={submitting || loading}>
              {submitting ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">New to SupportPilot? <Link to="/register">Create an account</Link></p>
          <p className="login-footnote">Protected workspace access · Your organization controls permissions</p>
        </div>
        <div className="login-footer"><span>© 2026 SupportPilot AI</span><span>Built for better support</span></div>
      </section>
      <aside className="login-aside">
        <div className="aside-grid" />
        <div className="aside-content">
          <div className="aside-quote-mark">“</div>
          <p className="aside-quote">Every conversation is an opportunity to build trust.</p>
          <p className="aside-copy">Bring your team, tickets, and customer context together in one calm, considered workspace.</p>
          <div className="aside-footer"><div className="aside-avatars"><span>SP</span><span>AI</span><span>✦</span></div><span>Thoughtful support, at scale.</span></div>
        </div>
        <div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" />
      </aside>
    </div>
  )
}
