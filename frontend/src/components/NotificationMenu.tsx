import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Notification } from '../api/types'
import { ErrorNotice, LoadingBlock } from './Primitives'
import { formatRelative } from '../utils/date'

export function NotificationMenu() {
  const [open, setOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications(),
    refetchInterval: 60_000,
  })

  const markRead = useMutation({
    mutationFn: (notification: Notification) => api.markNotificationRead(notification.id),
    onSuccess: async (_, notification) => {
      setActionError('')
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setOpen(false)
      if (notification.ticketId) navigate(`/tickets/${notification.ticketId}`)
    },
    onError: (error: Error) => setActionError(error.message),
  })
  const markAllRead = useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: async () => {
      setActionError('')
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (error: Error) => setActionError(error.message),
  })

  const unreadCount = notifications.data?.total ?? 0

  return (
    <div className="notification-menu">
      <button
        className="icon-button top-notifications"
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => { setOpen((value) => !value); setActionError('') }}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-panel" id="notification-panel" aria-label="Notifications">
          <div className="notification-panel-heading">
            <div><strong>Notifications</strong><span>{unreadCount} unread</span></div>
            <button
              type="button"
              className="notification-mark-all"
              onClick={() => markAllRead.mutate()}
              disabled={unreadCount === 0 || markAllRead.isPending}
            >
              <CheckCheck size={14} />{markAllRead.isPending ? 'Marking…' : 'Mark all read'}
            </button>
          </div>
          {actionError && <ErrorNotice message={actionError} />}
          {notifications.isLoading ? <LoadingBlock label="Loading notifications…" /> : notifications.isError ? (
            <ErrorNotice message={notifications.error.message} />
          ) : !notifications.data ? <LoadingBlock label="Loading notifications…" /> : notifications.data.notifications.length === 0 ? (
            <p className="notifications-empty">You’re all caught up.</p>
          ) : (
            <div className="notification-list">
              {notifications.data.notifications.map((notification) => (
                <button
                  className="notification-item"
                  type="button"
                  key={notification.id}
                  onClick={() => markRead.mutate(notification)}
                  disabled={markRead.isPending}
                >
                  <span className="notification-unread-dot" />
                  <span className="notification-copy">
                    <strong>{notification.title}</strong>
                    <span>{notification.body}</span>
                    <small>{formatRelative(notification.createdAt)}{notification.ticketId ? ' · Open ticket' : ''}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
