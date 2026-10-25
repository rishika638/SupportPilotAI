import { createContext } from 'react'
import type { Membership, Organization, RegisterInput, User } from '../api/types'

export interface AuthContextValue {
  user: User | null
  organization: Organization | null
  role: Membership['role'] | null
  loading: boolean
  sessionError: string | null
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  retrySession: () => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
