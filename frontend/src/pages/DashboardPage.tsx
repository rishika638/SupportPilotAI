import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Clock3, Inbox, Plus, TicketCheck, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { EmptyState, ErrorNotice, LoadingBlock, PageHeading, PriorityBadge, StatusBadge } from '../components/Primitives'
import { formatRelative } from '../utils/date'

const WEEKDAY_LABEL = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date()).toUpperCase()

export function DashboardPage() {
  const { user } = useAuth()
  const analytics = useQuery({
    queryKey: ['analytics'],
    queryFn: async () => {
      try {
        return await api.analytics()
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) return null
        throw error
      }
    },
  })
  const recent = useQuery({
    queryKey: ['tickets', 'recent'],
    queryFn: () => api.listTickets({ page: 1, limit: 5 }),
  })

  return (
    <>
      <PageHeading
        eyebrow={`${WEEKDAY_LABEL} · YOUR SUPPORT DESK`}
        title={`Good day, ${user?.firstName ?? 'there'}`}
        description="Here’s what’s happening across your support queue."
        action={<Link className="button button-primary" to="/tickets/new"><Plus size={17} />Create ticket</Link>}
      />

      {analytics.isLoading ? <div id="analytics" className="stats-grid">{[1, 2, 3, 4].map((key) => <div className="stat-card skeleton" key={key} />)}</div> : analytics.isError ? <ErrorNotice message={analytics.error.message} /> : analytics.data ? (
        <section id="analytics" className="stats-grid" aria-label="Ticket analytics">
          <StatCard label="Total tickets" value={analytics.data.totalTickets.toLocaleString()} icon={<Inbox size={18} />} tone="blue" hint="Across your workspace" />
          <StatCard label="Open tickets" value={analytics.data.openTickets.toLocaleString()} icon={<Clock3 size={18} />} tone="amber" hint="Needs a response" />
          <StatCard label="Resolved" value={analytics.data.resolvedTickets.toLocaleString()} icon={<CheckCircle2 size={18} />} tone="green" hint="Resolved or closed" />
          <StatCard label="SLA compliance" value={analytics.data.slaComplianceRate === null ? '—' : `${analytics.data.slaComplianceRate}%`} icon={<TrendingUp size={18} />} tone="violet" hint={analytics.data.avgResolutionTimeMs === null ? 'No resolution data yet' : `Avg. resolution ${formatDuration(analytics.data.avgResolutionTimeMs)}`} />
        </section>
      ) : (
        <div className="notice notice-info"><TicketCheck size={18} />Analytics overview is available to managers and admins. Your ticket inbox is ready below.</div>
      )}

      <section className="section-block">
        <div className="section-heading">
          <div><h2>Recent tickets</h2><p>Your latest conversations across the queue</p></div>
          <Link className="text-link" to="/tickets">View inbox <ArrowRight size={15} /></Link>
        </div>
        {recent.isLoading ? <LoadingBlock label="Loading recent tickets…" /> : recent.isError ? <ErrorNotice message={recent.error.message} /> : !recent.data ? <LoadingBlock label="Loading recent tickets…" /> : recent.data.tickets.length === 0 ? (
          <EmptyState title="Your queue is clear" description="New tickets will appear here when they arrive." action={<Link className="button button-secondary" to="/tickets/new"><Plus size={16} />Create a ticket</Link>} />
        ) : (
          <div className="ticket-table-wrap">
            <table className="ticket-table">
              <thead><tr><th>Ticket</th><th>Customer</th><th>Status</th><th>Priority</th><th>Updated</th></tr></thead>
              <tbody>{recent.data.tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td><Link className="ticket-title-link" to={`/tickets/${ticket.id}`}><span className="ticket-number">{ticket.ticketNumber}</span><strong>{ticket.title}</strong></Link></td>
                  <td><span className="customer-cell">{ticket.customerName || ticket.customerEmail || 'Unknown customer'}</span></td>
                  <td><StatusBadge status={ticket.status} /></td>
                  <td><PriorityBadge priority={ticket.priority} /></td>
                  <td className="date-cell">{formatRelative(ticket.updatedAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <div className="dashboard-footnote"><span className="live-dot" />Data is live from your workspace</div>
    </>
  )
}

function StatCard({ label, value, icon, tone, hint }: { label: string; value: string; icon: React.ReactNode; tone: string; hint: string }) {
  return <article className="stat-card"><div className={`stat-icon stat-${tone}`}>{icon}</div><p className="stat-label">{label}</p><div className="stat-value">{value}</div><p className="stat-hint">{hint}</p></article>
}

function formatDuration(milliseconds: number) {
  const minutes = Math.round(milliseconds / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`
}
