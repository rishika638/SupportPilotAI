import { TicketStatus } from "@prisma/client";
import { ErrorCodes } from "../../shared/errors/error-codes";
import { BadRequestError } from "../../shared/errors/app.error";

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.ASSIGNED, TicketStatus.ESCALATED],
  [TicketStatus.ASSIGNED]: [TicketStatus.IN_PROGRESS, TicketStatus.ESCALATED],
  [TicketStatus.IN_PROGRESS]: [
    TicketStatus.WAITING_CUSTOMER,
    TicketStatus.RESOLVED,
    TicketStatus.ESCALATED,
  ],
  [TicketStatus.WAITING_CUSTOMER]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.ESCALATED,
  ],
  [TicketStatus.ESCALATED]: [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
};

export class TicketStateMachine {
  canTransition(from: TicketStatus, to: TicketStatus): boolean {
    return ALLOWED_TRANSITIONS[from].includes(to);
  }

  assertTransition(from: TicketStatus, to: TicketStatus): void {
    if (!this.canTransition(from, to)) {
      throw new BadRequestError(
        `Invalid status transition from ${from} to ${to}`,
        ErrorCodes.INVALID_STATE_TRANSITION,
        [{ from, to }],
      );
    }
  }

  getAllowedTransitions(from: TicketStatus): TicketStatus[] {
    return [...ALLOWED_TRANSITIONS[from]];
  }
}

export const ticketStateMachine = new TicketStateMachine();
