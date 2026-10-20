import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CircleHelp } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { TicketChannel, TicketPriority } from '../api/types'
import { ErrorNotice, PageHeading } from '../components/Primitives'

export function NewTicketPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM')
  const [channel, setChannel] = useState<TicketChannel>('WEB')
  const [tags, setTags] = useState('')
  const create = useMutation({
    mutationFn: () => api.createTicket({
      title: title.trim(),
      description: description.trim(),
      customerName: customerName.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      priority,
      channel,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    }),
    onSuccess: async (ticket) => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] })
      await queryClient.invalidateQueries({ queryKey: ['analytics'] })
      navigate(`/tickets/${ticket.id}`, { state: { created: true } })
    },
  })

  return (
    <>
      <Link className="back-link" to="/tickets"><ArrowLeft size={16} />Back to inbox</Link>
      <PageHeading eyebrow="INBOX / NEW" title="Create a ticket" description="Capture the customer’s issue and your team can take it from there." />
      <div className="form-layout">
        <form className="card ticket-form" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          {create.isError && <ErrorNotice message={create.error instanceof ApiError ? create.error.message : 'Could not create ticket. Please try again.'} />}
          <div className="form-section">
            <div className="form-section-heading"><span className="section-step">01</span><div><h2>Ticket details</h2><p>What does the customer need help with?</p></div></div>
            <label className="field-label" htmlFor="ticket-title">Subject <span className="required">*</span></label>
            <input id="ticket-title" className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={500} placeholder="A brief summary of the issue" required />
            <label className="field-label" htmlFor="ticket-description">Description <span className="required">*</span></label>
            <textarea id="ticket-description" className="text-input textarea" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context, steps to reproduce, or any details that could help…" rows={6} required />
          </div>
          <div className="form-divider" />
          <div className="form-section">
            <div className="form-section-heading"><span className="section-step">02</span><div><h2>Customer</h2><p>Optional contact information for the requester.</p></div></div>
            <div className="form-grid">
              <div><label className="field-label" htmlFor="customer-name">Customer name</label><input id="customer-name" className="text-input" value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={255} placeholder="Full name" /></div>
              <div><label className="field-label" htmlFor="customer-email">Email address</label><input id="customer-email" className="text-input" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} maxLength={320} placeholder="customer@company.com" /></div>
            </div>
          </div>
          <div className="form-divider" />
          <div className="form-section">
            <div className="form-section-heading"><span className="section-step">03</span><div><h2>Routing & context</h2><p>Set the starting priority and how the ticket arrived.</p></div></div>
            <div className="form-grid">
              <div><label className="field-label" htmlFor="priority">Priority</label><select id="priority" className="text-input" value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)}>{priorities.map((item) => <option key={item} value={item}>{item[0]}{item.slice(1).toLowerCase()}</option>)}</select></div>
              <div><label className="field-label" htmlFor="channel">Channel</label><select id="channel" className="text-input" value={channel} onChange={(event) => setChannel(event.target.value as TicketChannel)}>{channels.map((item) => <option key={item} value={item}>{item === 'API' ? 'API' : item[0] + item.slice(1).toLowerCase()}</option>)}</select></div>
              <div className="form-grid-full"><label className="field-label" htmlFor="tags">Tags <span className="field-optional">comma separated</span></label><input id="tags" className="text-input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="billing, account-access" /></div>
            </div>
          </div>
          <div className="form-actions"><Link className="button button-secondary" to="/tickets">Cancel</Link><button className="button button-primary" type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create ticket'}{!create.isPending && <ArrowRight size={16} />}</button></div>
        </form>
        <aside className="creation-aside">
          <div className="aside-tip-icon"><CircleHelp size={19} /></div>
          <h3>Good tickets get great answers</h3>
          <p>A clear subject and detailed description help your team resolve issues faster.</p>
          <div className="tip-divider" />
          <div className="tip-list"><span><i />Add steps the customer has already tried</span><span><i />Include relevant account or order details</span><span><i />Set an honest priority to help your team triage</span></div>
          <div className="ai-note"><span className="ai-spark">✦</span><span>AI analysis is generated in the background after ticket creation.</span></div>
        </aside>
      </div>
    </>
  )
}

const priorities: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const channels: TicketChannel[] = ['WEB', 'EMAIL', 'CHAT', 'PHONE', 'API']
