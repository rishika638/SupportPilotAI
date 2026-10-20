import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, clearTokens, hasAccessToken, saveTokens } from '../api/client'
import type { AuthResponse, MeResponse, Organization, User } from '../api/types'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(() => hasAccessToken())

  const setIdentity = useCallback((identity: Pick<MeResponse, 'user' | 'organization'>) => {
    setUser(identity.user)
    setOrganization(identity.organization)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result: AuthResponse = await api.login(email, password)
    saveTokens(result.tokens)
    setIdentity(result)
  }, [setIdentity])

  const logout = useCallback(async () => {
    const refreshToken = sessionStorage.getItem('supportpilot.refreshToken')
    try {
      if (refreshToken) await api.logout(refreshToken)
    } finally {
      clearTokens()
      setUser(null)
      setOrganization(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const onSessionExpired = () => {
      if (!mounted) return
      clearTokens()
      setUser(null)
      setOrganization(null)
    }

    window.addEventListener('supportpilot:session-expired', onSessionExpired)
    if (hasAccessToken()) {
      api.me()
        .then((identity) => { if (mounted) setIdentity(identity) })
        .catch(() => {
          if (mounted) {
            clearTokens()
            setUser(null)
            setOrganization(null)
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
    () => ({ user, organization, loading, login, logout }),
    [user, organization, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
