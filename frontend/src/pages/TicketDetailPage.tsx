import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { ArrowLeft, Bot, CalendarDays, Check, ChevronDown, Clock3, CornerDownRight, Send, Sparkles, UserRound } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { AIAnalysis, TicketPriority, TicketStatus } from '../api/types'
import { ErrorNotice, LoadingBlock, PageHeading, PriorityBadge, StatusBadge, SuccessNotice } from '../components/Primitives'
import { formatRelative } from '../utils/date'
import { useAuth } from '../auth/useAuth'

export function TicketDetailPage() {
  const { id = '' } = useParams()
  const { role } = useAuth()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC')
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState(location.state?.created ? 'Ticket created successfully.' : '')
  const ticket = useQuery({ queryKey: ['ticket', id], queryFn: () => api.getTicket(id), enabled: Boolean(id) })
  const comments = useQuery({ queryKey: ['ticket-comments', id], queryFn: () => api.comments(id), enabled: Boolean(id) })
  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: api.listTeams,
    enabled: role === 'ADMIN' || role === 'MANAGER',
  })
  const analysis = useQuery({
    queryKey: ['ticket-ai', id],
    queryFn: async () => {
      try {
        return await api.aiAnalysis(id)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (query) => {
      const result = query.state.data as AIAnalysis | null | undefined
      return !result || result.status === 'PENDING' || result.status === 'PROCESSING' ? 5000 : false
    },
  })

  async function refreshTicketData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
      queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
    ])
  }

  const priorityUpdate = useMutation({
    mutationFn: (priority: TicketPriority) => api.updateTicket(id, { priority }),
    onSuccess: async () => { setActionError(''); setSuccess('Priority updated.'); await refreshTicketData() },
    onError: (error: Error) => setActionError(error.message),
  })
  const statusUpdate = useMutation({
    mutationFn: (status: TicketStatus) => api.changeStatus(id, status),
    onSuccess: async () => { setActionError(''); setSuccess('Ticket status updated.'); await refreshTicketData() },
    onError: (error: Error) => setActionError(error.message),
  })
  const teamAssignment = useMutation({
    mutationFn: (teamId: string) => api.assignTicketToTeam(id, teamId),
    onSuccess: async () => {
      setActionError('')
      setSuccess('Ticket assigned to team.')
      await refreshTicketData()
    },
    onError: (error: Error) => setActionError(error.message),
  })
  const sendComment = useMutation({
    mutationFn: () => api.addComment(id, comment.trim(), visibility),
    onSuccess: async () => {
      setComment('')
      setActionError('')
      setSuccess(visibility === 'INTERNAL' ? 'Internal note added.' : 'Reply sent.')
      await queryClient.invalidateQueries({ queryKey: ['ticket-comments', id] })
    },
    onError: (error: Error) => setActionError(error.message),
  })

  if (ticket.isLoading) return <LoadingBlock label="Loading ticket…" />
  if (ticket.isError) return <ErrorNotice message={ticket.error.message} />
  if (!ticket.data) return <ErrorNotice message="Ticket not found." />
  const currentTicket = ticket.data

  return (
    <>
      <Link className="back-link" to="/tickets"><ArrowLeft size={16} />Back to inbox</Link>
      {success && <div className="inline-success"><SuccessNotice message={success} /><button className="dismiss-notice" onClick={() => setSuccess('')} aria-label="Dismiss">×</button></div>}
      {actionError && <div className="inline-error"><ErrorNotice message={actionError} /><button className="dismiss-notice" onClick={() => setActionError('')} aria-label="Dismiss">×</button></div>}
      <PageHeading eyebrow={`INBOX / ${currentTicket.ticketNumber}`} title={currentTicket.title} description={`Created ${new Date(currentTicket.createdAt).toLocaleString()} · via ${currentTicket.channel}`} action={<div className="ticket-heading-actions"><StatusBadge status={currentTicket.status} /><PriorityBadge priority={currentTicket.priority} /></div>} />

      <div className="ticket-workspace">
        <section className="conversation-column">
          <article className="card description-card">
            <div className="conversation-author"><div className="avatar avatar-customer"><UserRound size={17} /></div><div><strong>{currentTicket.customerName || 'Customer'}</strong><span>{currentTicket.customerEmail || 'Ticket description'}</span></div><time>{formatRelative(currentTicket.createdAt)}</time></div>
            <p className="description-text">{currentTicket.description}</p>
            {currentTicket.tags.length > 0 && <div className="tag-list">{currentTicket.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>}
          </article>

          <div className="conversation-heading"><h2>Conversation</h2><span>{comments.data?.comments.length ?? 0} messages</span></div>
          {comments.isLoading ? <LoadingBlock label="Loading conversation…" /> : comments.isError ? <ErrorNotice message={comments.error.message} /> : !comments.data ? <LoadingBlock label="Loading conversation…" /> : comments.data.comments.length === 0 ? <div className="conversation-empty"><CornerDownRight size={17} />No replies yet. Send a response or add an internal note.</div> : (
            <div className="comment-list">{comments.data.comments.map((item) => (
              <article className={`comment-card ${item.visibility === 'INTERNAL' ? 'comment-internal' : ''}`} key={item.id}>
                <div className="conversation-author"><div className={`avatar ${item.visibility === 'INTERNAL' ? 'avatar-staff' : ''}`}>{item.author.firstName.slice(0, 1)}{item.author.lastName.slice(0, 1)}</div><div><strong>{item.author.firstName} {item.author.lastName}</strong><span>{item.visibility === 'INTERNAL' ? 'Internal note' : 'Public reply'}</span></div><time>{formatRelative(item.createdAt)}</time></div>
                <p className="comment-body">{item.body}</p>
              </article>
            ))}</div>
          )}

          <form className="reply-card" onSubmit={(event) => { event.preventDefault(); if (comment.trim()) sendComment.mutate() }}>
            <div className="reply-toolbar"><label htmlFor="reply-visibility">Reply type</label><div className="select-with-icon"><select id="reply-visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as 'PUBLIC' | 'INTERNAL')}><option value="PUBLIC">Public reply</option><option value="INTERNAL">Internal note</option></select><ChevronDown size={14} /></div></div>
            <textarea id="reply-body" aria-label="Write a reply" value={comment} onChange={(event) => setComment(event.target.value)} placeholder={visibility === 'PUBLIC' ? 'Write a helpful response to the customer…' : 'Add a note for your team…'} rows={4} required />
            <div className="reply-footer"><span>{visibility === 'PUBLIC' ? 'Visible to the customer' : 'Only visible to your team'}</span><button className="button button-primary button-small" type="submit" disabled={sendComment.isPending || !comment.trim()}>{sendComment.isPending ? 'Sending…' : visibility === 'PUBLIC' ? 'Send reply' : 'Add note'}<Send size={14} /></button></div>
          </form>
        </section>

        <aside className="ticket-sidebar">
          <section className="card sidebar-card">
            <div className="card-heading"><h2>Ticket details</h2><span className="detail-mark">#</span></div>
            <label className="detail-label" htmlFor="ticket-status">Status</label>
            <select id="ticket-status" className="detail-select" value={currentTicket.status} onChange={(event) => statusUpdate.mutate(event.target.value as TicketStatus)} disabled={statusUpdate.isPending}>
              {statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
            </select>
            <label className="detail-label detail-label-spaced" htmlFor="ticket-priority">Priority</label>
            <select id="ticket-priority" className="detail-select" value={currentTicket.priority} onChange={(event) => priorityUpdate.mutate(event.target.value as TicketPriority)} disabled={priorityUpdate.isPending}>
              {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
            <div className="detail-divider" />
            {(role === 'ADMIN' || role === 'MANAGER') && (
              <>
                <label className="detail-label" htmlFor="ticket-team">Team assignment</label>
                {teams.isLoading ? <LoadingBlock label="Loading teams…" /> : teams.isError ? (
                  <ErrorNotice message={teams.error.message} />
                ) : teams.data?.teams.length ? (
                  <select
                    id="ticket-team"
                    className="detail-select"
                    value={currentTicket.teamId ?? ''}
                    onChange={(event) => { if (event.target.value) teamAssignment.mutate(event.target.value) }}
                    disabled={teamAssignment.isPending}
                  >
                    <option value="" disabled>Select a team to assign</option>
                    {teams.data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                ) : <p className="muted-cell">No teams are available.</p>}
              </>
            )}
            <DetailRow label="Assignee" value={currentTicket.assignee ? `${currentTicket.assignee.firstName} ${currentTicket.assignee.lastName}` : currentTicket.teamName || 'Unassigned'} icon={<UserRound size={15} />} />
            <DetailRow label="Created" value={new Date(currentTicket.createdAt).toLocaleDateString()} icon={<CalendarDays size={15} />} />
            <DetailRow label="Last updated" value={formatRelative(currentTicket.updatedAt)} icon={<Clock3 size={15} />} />
            {currentTicket.resolvedAt && <DetailRow label="Resolved" value={new Date(currentTicket.resolvedAt).toLocaleDateString()} icon={<Check size={15} />} />}
          </section>

          <AIAnalysisCard query={analysis} />
        </aside>
      </div>
    </>
  )
}

function DetailRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="detail-row"><span className="detail-row-label">{icon}{label}</span><strong>{value}</strong></div>
}

function AIAnalysisCard({ query }: { query: UseQueryResult<AIAnalysis | null, Error> }) {
  const analysis = query.data
  return (
    <section className="card ai-card">
      <div className="ai-card-heading"><div className="ai-card-icon"><Sparkles size={17} /></div><div><h2>AI insights</h2><span>Ticket analysis</span></div><Bot size={17} className="ai-bot-icon" /></div>
      {query.isLoading ? <div className="ai-state"><span className="mini-spinner" />Preparing analysis…</div> : query.isError ? <div className="ai-state ai-error">Analysis could not be loaded. Please try again.</div> : !analysis || analysis.status === 'PENDING' || analysis.status === 'PROCESSING' ? (
        <div className="ai-state"><span className="mini-spinner" />Analysis is {analysis?.status === 'PROCESSING' ? 'in progress' : 'queued'}<small>This panel will update automatically.</small></div>
      ) : analysis.status === 'FAILED' ? (
        <div className="ai-state ai-error">Analysis could not be completed. Your ticket is still available to work on.</div>
      ) : (
        <div className="ai-analysis-content">
          <div className="ai-summary-label">SUMMARY</div>
          <p className="ai-summary">{analysis.summary || 'No summary was returned.'}</p>
          <div className="ai-attribute-grid">
            <AIAttribute label="Category" value={analysis.category} />
            <AIAttribute label="Subcategory" value={analysis.subcategory} />
            <AIAttribute label="Sentiment" value={analysis.sentiment} />
            <AIAttribute label="Suggested priority" value={analysis.suggestedPriority} />
          </div>
          {analysis.confidence !== null && <div className="confidence-row"><span>Confidence</span><strong>{Math.round(analysis.confidence * 100)}%</strong></div>}
          {analysis.confidence !== null && <div className="confidence-track"><span style={{ width: `${Math.min(100, Math.max(0, analysis.confidence * 100))}%` }} /></div>}
          {analysis.tags.length > 0 && <div className="tag-list ai-tags">{analysis.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>}
          <div className="ai-generated"><span><Sparkles size={13} />Generated by {analysis.modelVersion || 'AI'}</span><span>{analysis.completedAt ? formatRelative(analysis.completedAt) : ''}</span></div>
        </div>
      )}
    </section>
  )
}

function AIAttribute({ label, value }: { label: string; value: string | null }) {
  return <div className="ai-attribute"><span>{label}</span><strong>{value || '—'}</strong></div>
}

const statuses: TicketStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED']
const priorities: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
