import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Command, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'

export function RegisterPage() {
  const { register, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        organizationName: organizationName.trim(),
        email: email.trim(),
        password,
      })
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/'
      navigate(destination, { replace: true, state: { accountCreated: true } })
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to create your account. Check your connection and try again.')
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
          <h1>Create your workspace</h1>
          <p className="login-subtitle">Start bringing your team, tickets, and customer context together.</p>
          {error && <div className="login-error" role="alert">{error}</div>}
          <form className="login-form register-form" onSubmit={handleSubmit}>
            <div className="form-grid register-name-fields">
              <div><label htmlFor="first-name">First name</label><div className="input-with-icon"><UserRound size={17} /><input id="first-name" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required maxLength={100} /></div></div>
              <div><label htmlFor="last-name">Last name</label><div className="input-with-icon"><UserRound size={17} /><input id="last-name" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required maxLength={100} /></div></div>
            </div>
            <label htmlFor="organization-name">Organization name</label>
            <div className="input-with-icon"><Command size={17} /><input id="organization-name" autoComplete="organization" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required minLength={2} maxLength={255} /></div>
            <label htmlFor="register-email">Work email</label>
            <div className="input-with-icon"><Mail size={17} /><input id="register-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} /></div>
            <label htmlFor="register-password">Password</label>
            <div className="input-with-icon"><LockKeyhole size={17} /><input id="register-password" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={128} /></div>
            <button className="button button-primary login-submit" type="submit" disabled={submitting || loading}>
              {submitting ? 'Creating account…' : 'Create account'} <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
          <p className="login-footnote">Your organization workspace will be created with your account.</p>
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
