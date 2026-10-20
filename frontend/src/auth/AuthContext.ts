import { createContext } from 'react'
import type { Organization, User } from '../api/types'

export interface AuthContextValue {
  user: User | null
  organization: Organization | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
