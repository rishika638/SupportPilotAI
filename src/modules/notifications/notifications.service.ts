import { NotificationType } from "@prisma/client";
import { getQueue, QUEUE_NAMES } from "../../infrastructure/queue/queue.factory";
import { notificationRepository } from "./repositories/notification.repository";

export interface NotificationJobPayload {
  organizationId: string;
  userId: string;
  ticketId?: string;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

export class NotificationService {
  async dispatch(input: NotificationJobPayload, customJobId?: string): Promise<void> {
    const jobId =
      customJobId ??
      `notif-${input.organizationId}-${input.userId}-${input.type}-${Date.now()}`;
    await getQueue(QUEUE_NAMES.NOTIFICATION_DISPATCH).add(
      "send-notification",
      input,
      { jobId },
    );
  }

  async notifyTicketAssigned(
    organizationId: string,
    assigneeId: string,
    ticketId: string,
    ticketNumber: string,
    isReassign: boolean,
  ): Promise<void> {
    const type = isReassign ? NotificationType.TICKET_ASSIGNED : NotificationType.TICKET_ASSIGNED;
    await this.dispatch({
      organizationId,
      userId: assigneeId,
      ticketId,
      type,
      title: isReassign ? "Ticket Reassigned to You" : "New Ticket Assigned",
      body: `Ticket ${ticketNumber} has been ${isReassign ? "reassigned" : "assigned"} to you.`,
      payload: { ticketId, ticketNumber, event: isReassign ? "TICKET_REASSIGNED" : "TICKET_ASSIGNED" },
    });
  }

  async notifyTicketEscalated(
    organizationId: string,
    assigneeId: string,
    ticketId: string,
    ticketNumber: string,
  ): Promise<void> {
    await this.dispatch({
      organizationId,
      userId: assigneeId,
      ticketId,
      type: NotificationType.ESCALATION,
      title: "Ticket Escalated",
      body: `Ticket ${ticketNumber} has been escalated.`,
      payload: { ticketId, ticketNumber, event: "TICKET_ESCALATED" },
    });
  }

  async notifyTicketResolved(
    organizationId: string,
    userId: string,
    ticketId: string,
    ticketNumber: string,
  ): Promise<void> {
    await this.dispatch({
      organizationId,
      userId,
      ticketId,
      type: NotificationType.SYSTEM,
      title: "Ticket Resolved",
      body: `Ticket ${ticketNumber} has been resolved.`,
      payload: { ticketId, ticketNumber, event: "TICKET_RESOLVED" },
    });
  }

  async notifySLABreach(
    organizationId: string,
    assigneeId: string,
    ticketId: string,
    ticketNumber: string,
  ): Promise<void> {
    await this.dispatch(
      {
        organizationId,
        userId: assigneeId,
        ticketId,
        type: NotificationType.SLA_BREACH,
        title: "SLA Breach",
        body: `Ticket ${ticketNumber} has breached its SLA deadline.`,
        payload: { ticketId, ticketNumber, event: "SLA_BREACH" },
      },
      `notif-sla-breach-${ticketId}`,
    );
  }

  async listForUser(
    organizationId: string,
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number; offset?: number },
  ) {
    return notificationRepository.findManyByUser(organizationId, userId, opts);
  }

  async markRead(organizationId: string, userId: string, notificationId: string) {
    return notificationRepository.markRead(organizationId, userId, notificationId);
  }

  async markAllRead(organizationId: string, userId: string) {
    return notificationRepository.markAllRead(organizationId, userId);
  }
}

export const notificationService = new NotificationService();
