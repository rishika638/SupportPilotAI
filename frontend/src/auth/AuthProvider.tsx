import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, clearTokens, hasAccessToken, saveTokens } from '../api/client'
import type { AuthResponse, Membership, MeResponse, Organization, RegisterInput, User } from '../api/types'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [role, setRole] = useState<Membership['role'] | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => hasAccessToken())

  const setIdentity = useCallback((identity: Pick<MeResponse, 'user' | 'organization' | 'membership'>) => {
    setUser(identity.user)
    setOrganization(identity.organization)
    setRole(identity.membership.role)
    setSessionError(null)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result: AuthResponse = await api.login(email, password)
    saveTokens(result.tokens)
    setIdentity(result)
  }, [setIdentity])

  const register = useCallback(async (input: RegisterInput) => {
    const result: AuthResponse = await api.register(input)
    saveTokens(result.tokens)
    setIdentity(result)
  }, [setIdentity])

  const retrySession = useCallback(async () => {
    if (!hasAccessToken()) return
    setLoading(true)
    setSessionError(null)
    try {
      const identity = await api.me()
      setIdentity(identity)
    } catch (cause) {
      if (hasAccessToken()) {
        setSessionError(cause instanceof Error ? cause.message : 'Unable to restore your session. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [setIdentity])

  const logout = useCallback(async () => {
    const refreshToken = sessionStorage.getItem('supportpilot.refreshToken')
    try {
      if (refreshToken) await api.logout(refreshToken)
    } finally {
      clearTokens()
      setUser(null)
      setOrganization(null)
      setRole(null)
      setSessionError(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const onSessionExpired = () => {
      if (!mounted) return
      clearTokens()
      setUser(null)
      setOrganization(null)
      setRole(null)
      setSessionError('Your session expired. Please sign in again.')
    }

    window.addEventListener('supportpilot:session-expired', onSessionExpired)
    if (hasAccessToken()) {
      api.me()
        .then((identity) => { if (mounted) setIdentity(identity) })
        .catch((cause) => {
          if (mounted && hasAccessToken()) {
            setSessionError(cause instanceof Error ? cause.message : 'Unable to restore your session. Please try again.')
          }
        })
        .finally(() => {
          if (mounted) setLoading(false)
        })
    }

    return () => {
      mounted = false
      window.removeEventListener('supportpilot:session-expired', onSessionExpired)
    }
  }, [setIdentity])

  const value = useMemo(
    () => ({ user, organization, role, loading, sessionError, login, register, retrySession, logout }),
    [user, organization, role, loading, sessionError, login, register, retrySession, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
