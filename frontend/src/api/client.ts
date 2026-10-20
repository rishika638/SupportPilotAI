import type {
  AIAnalysis,
  AnalyticsOverview,
  ApiEnvelope,
  ApiErrorEnvelope,
  AuthResponse,
  MeResponse,
  Ticket,
  TicketComments,
  TicketListParams,
  TicketPage,
  TicketStatus,
  Tokens,
} from './types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '')
const ACCESS_TOKEN_KEY = 'supportpilot.accessToken'
const REFRESH_TOKEN_KEY = 'supportpilot.refreshToken'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function saveTokens(tokens: Tokens) {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken)
  sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
}

export function clearTokens() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function hasAccessToken() {
  return Boolean(sessionStorage.getItem(ACCESS_TOKEN_KEY))
}

function expireSession() {
  clearTokens()
  window.dispatchEvent(new Event('supportpilot:session-expired'))
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json() as ApiEnvelope<T> | ApiErrorEnvelope
  if (!response.ok || !body.success) {
    const apiError = body.success
      ? undefined
      : body.error
    throw new ApiError(
      apiError?.message || `Request failed with status ${response.status}`,
      response.status,
      apiError?.code,
    )
  }
  return body.data
}

let refreshRequest: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) return false

  if (!refreshRequest) {
    refreshRequest = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        const data = await responseJson<{ tokens: Tokens }>(response)
        saveTokens(data.tokens)
        return true
      } catch {
        expireSession()
        return false
      } finally {
        refreshRequest = null
      }
    })()
  }
  return refreshRequest
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  allowRefresh = true,
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  const publicAuthPaths = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']
  const isPublicAuthRequest = publicAuthPaths.some((authPath) => path.startsWith(authPath))
  if (response.status === 401 && allowRefresh && !isPublicAuthRequest) {
    if (await refreshAccessToken()) return request<T>(path, init, false)
    expireSession()
  } else if (response.status === 401 && !allowRefresh) {
    expireSession()
  }
  return responseJson<T>(response)
}

const json = (value: unknown): string => JSON.stringify(value)

export const api = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: json({ email, password }),
    }),
  me: () => request<MeResponse>('/auth/me'),
  logout: (refreshToken: string) =>
    request<{ revoked: boolean }>('/auth/logout', {
      method: 'POST',
      body: json({ refreshToken }),
    }),
  listTickets: (params: TicketListParams = {}) => {
    const query = new URLSearchParams()
    query.set('page', String(params.page ?? 1))
    query.set('limit', String(params.limit ?? 20))
    query.set('sortBy', 'createdAt')
    query.set('sortOrder', 'desc')
    if (params.status) query.set('status', params.status)
    if (params.priority) query.set('priority', params.priority)
    if (params.search) query.set('search', params.search)
    return request<TicketPage>(`/tickets?${query.toString()}`)
  },
  getTicket: (id: string) => request<Ticket>(`/tickets/${encodeURIComponent(id)}`),
  createTicket: (payload: {
    title: string
    description: string
    customerName?: string
    customerEmail?: string
    priority: Ticket['priority']
    channel: Ticket['channel']
    tags: string[]
  }) => request<Ticket>('/tickets', { method: 'POST', body: json(payload) }),
  updateTicket: (id: string, payload: { priority: Ticket['priority'] }) =>
    request<Ticket>(`/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json(payload),
    }),
  changeStatus: (id: string, status: TicketStatus) =>
    request<{ ticket: Ticket; previousStatus: TicketStatus; newStatus: TicketStatus }>(
      `/tickets/${encodeURIComponent(id)}/status`,
      { method: 'POST', body: json({ status }) },
    ),
  comments: (id: string) =>
    request<TicketComments>(`/tickets/${encodeURIComponent(id)}/comments`),
  addComment: (id: string, body: string, visibility: 'PUBLIC' | 'INTERNAL') =>
    request<unknown>(`/tickets/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      body: json({ body, visibility }),
    }),
  aiAnalysis: (id: string) =>
    request<AIAnalysis>(`/tickets/${encodeURIComponent(id)}/ai-analysis`),
  analytics: () => request<AnalyticsOverview>('/analytics/overview'),
}
