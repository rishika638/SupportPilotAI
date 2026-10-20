import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { TicketPriority, TicketStatus } from '../api/types'
import { EmptyState, ErrorNotice, LoadingBlock, PageHeading, PriorityBadge, StatusBadge } from '../components/Primitives'
import { formatRelative } from '../utils/date'

export function InboxPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [priority, setPriority] = useState<TicketPriority | ''>('')
  const [page, setPage] = useState(1)
  const tickets = useQuery({
    queryKey: ['tickets', 'inbox', { search, status, priority, page }],
    queryFn: () => api.listTickets({ search: search.trim() || undefined, status: status || undefined, priority: priority || undefined, page, limit: 20 }),
  })

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  return (
    <>
      <PageHeading eyebrow="CUSTOMER SUPPORT" title="Inbox" description="Keep every customer conversation moving." action={<Link className="button button-primary" to="/tickets/new"><Plus size={17} />New ticket</Link>} />
      <section className="inbox-panel">
        <div className="inbox-toolbar">
          <div className="search-field"><Search size={17} /><input aria-label="Search tickets" placeholder="Search by subject or customer…" value={search} onChange={(event) => updateSearch(event.target.value)} /></div>
          <div className="filter-control"><SlidersHorizontal size={16} /><select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value as TicketStatus | ''); setPage(1) }}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></div>
          <div className="filter-control"><select aria-label="Filter by priority" value={priority} onChange={(event) => { setPriority(event.target.value as TicketPriority | ''); setPage(1) }}><option value="">Any priority</option>{priorities.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
        </div>
        {tickets.isLoading ? <LoadingBlock label="Loading your inbox…" /> : tickets.isError ? <ErrorNotice message={tickets.error.message} /> : !tickets.data ? <LoadingBlock label="Loading your inbox…" /> : tickets.data.tickets.length === 0 ? (
          <EmptyState title={search || status || priority ? 'No matching tickets' : 'Nothing in your inbox yet'} description={search || status || priority ? 'Try adjusting your search or filters.' : 'Create your first ticket to start a conversation.'} action={!search && !status && !priority ? <Link className="button button-secondary" to="/tickets/new"><Plus size={16} />Create ticket</Link> : undefined} />
        ) : (
          <>
            <div className="ticket-table-wrap">
              <table className="ticket-table inbox-table">
                <thead><tr><th>Ticket</th><th>Customer</th><th>Assigned to</th><th>Status</th><th>Priority</th><th>Updated</th></tr></thead>
                <tbody>{tickets.data.tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td><Link className="ticket-title-link" to={`/tickets/${ticket.id}`}><span className="ticket-number">{ticket.ticketNumber}</span><strong>{ticket.title}</strong></Link></td>
                    <td><span className="customer-cell">{ticket.customerName || ticket.customerEmail || 'Unknown customer'}</span>{ticket.customerEmail && ticket.customerName && <small className="secondary-cell">{ticket.customerEmail}</small>}</td>
                    <td>{ticket.assignee ? <span className="assignee-cell"><span className="avatar avatar-small">{ticket.assignee.firstName.slice(0, 1)}{ticket.assignee.lastName.slice(0, 1)}</span>{ticket.assignee.firstName} {ticket.assignee.lastName}</span> : <span className="muted-cell">{ticket.teamName || 'Unassigned'}</span>}</td>
                    <td><StatusBadge status={ticket.status} /></td>
                    <td><PriorityBadge priority={ticket.priority} /></td>
                    <td className="date-cell">{formatRelative(ticket.updatedAt)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="pagination">
              <span>Showing <strong>{(tickets.data.pagination.page - 1) * tickets.data.pagination.limit + 1}–{Math.min(tickets.data.pagination.page * tickets.data.pagination.limit, tickets.data.pagination.total)}</strong> of {tickets.data.pagination.total} tickets</span>
              <div className="pagination-actions">
                <button className="button button-secondary button-small" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}><ChevronLeft size={15} />Previous</button>
                <span className="page-count">{tickets.data.pagination.page} / {Math.max(tickets.data.pagination.totalPages, 1)}</span>
                <button className="button button-secondary button-small" onClick={() => setPage((current) => current + 1)} disabled={page >= tickets.data.pagination.totalPages}>Next<ChevronRight size={15} /></button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  )
}

const statuses: TicketStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED']
const priorities: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
