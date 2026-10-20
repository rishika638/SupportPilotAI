import type { ReactNode } from 'react'
import { AlertCircle, Check, LoaderCircle } from 'lucide-react'

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading-block" role="status">
      <LoaderCircle className="spin" size={18} />
      <span>{label}</span>
    </div>
  )
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  )
}

export function SuccessNotice({ message }: { message: string }) {
  return (
    <div className="notice notice-success" role="status">
      <Check size={18} />
      <span>{message}</span>
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status.toLowerCase()}`}>{status.replaceAll('_', ' ')}</span>
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`badge priority-${priority.toLowerCase()}`}>{priority}</span>
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-mark">SP</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}
