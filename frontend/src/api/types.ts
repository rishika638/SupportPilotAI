export interface ApiEnvelope<T> {
  success: true
  data: T
  meta: Record<string, unknown>
}

export interface ApiErrorEnvelope {
  success: false
  error: {
    code: string
    message: string
    details?: unknown[]
  }
}

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
}

export interface Organization {
  id: string
  name: string
  slug: string
}

export interface Membership {
  id: string
  organizationId: string
  role: 'ADMIN' | 'MANAGER' | 'AGENT'
  status: string
}

export interface Tokens {
  accessToken: string
  refreshToken: string
  expiresIn: string
}

export interface AuthResponse {
  user: User
  organization: Organization
  membership: Membership
  tokens: Tokens
}

export interface MeResponse {
  user: User
  organization: Organization
  membership: Membership
  role: Membership['role']
}

export type TicketStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING_CUSTOMER'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED'

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type TicketChannel = 'EMAIL' | 'CHAT' | 'PHONE' | 'WEB' | 'API'

export interface TicketUser {
  id: string
  email: string
  firstName: string
  lastName: string
}

export interface Ticket {
  id: string
  organizationId: string
  ticketNumber: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  channel: TicketChannel
  customerName: string | null
  customerEmail: string | null
  tags: string[]
  assigneeId: string | null
  assignee: TicketUser | null
  teamId: string | null
  teamName: string | null
  createdById: string | null
  createdBy: TicketUser | null
  firstResponseAt: string | null
  resolvedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TicketPage {
  tickets: Ticket[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface TicketComment {
  id: string
  ticketId: string
  body: string
  visibility: 'PUBLIC' | 'INTERNAL'
  authorId: string
  author: TicketUser
  isFirstResponse: boolean
  createdAt: string
  updatedAt: string
}

export interface TicketComments {
  comments: TicketComment[]
}

export interface AIAnalysis {
  id: string
  ticketId: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  summary: string | null
  category: string | null
  subcategory: string | null
  sentiment: string | null
  suggestedPriority: TicketPriority | null
  confidence: number | null
  tags: string[]
  modelVersion: string | null
  completedAt: string | null
  createdAt: string
}

export interface AnalyticsOverview {
  totalTickets: number
  openTickets: number
  resolvedTickets: number
  escalatedTickets: number
  avgResolutionTimeMs: number | null
  slaComplianceRate: number | null
}

export interface TicketListParams {
  page?: number
  limit?: number
  status?: TicketStatus
  priority?: TicketPriority
  search?: string
}
