import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TicketStatus } from "@prisma/client";
import { ticketStateMachine } from "../src/modules/tickets/ticket-state-machine";
import { BadRequestError } from "../src/shared/errors/app.error";

describe("Ticket State Machine", () => {
  it("allows valid transitions from OPEN", () => {
    assert.equal(ticketStateMachine.canTransition(TicketStatus.OPEN, TicketStatus.ASSIGNED), true);
    assert.equal(ticketStateMachine.canTransition(TicketStatus.OPEN, TicketStatus.ESCALATED), true);
    assert.equal(ticketStateMachine.canTransition(TicketStatus.OPEN, TicketStatus.RESOLVED), false);
    assert.equal(ticketStateMachine.canTransition(TicketStatus.OPEN, TicketStatus.CLOSED), false);
  });

  it("allows valid transitions from ASSIGNED", () => {
    assert.equal(ticketStateMachine.canTransition(TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS), true);
    assert.equal(ticketStateMachine.canTransition(TicketStatus.ASSIGNED, TicketStatus.ESCALATED), true);
    assert.equal(ticketStateMachine.canTransition(TicketStatus.ASSIGNED, TicketStatus.CLOSED), false);
  });

  it("prevents transitions out of CLOSED", () => {
    assert.equal(ticketStateMachine.canTransition(TicketStatus.CLOSED, TicketStatus.OPEN), false);
    assert.equal(ticketStateMachine.canTransition(TicketStatus.CLOSED, TicketStatus.ESCALATED), false);
    assert.deepEqual(ticketStateMachine.getAllowedTransitions(TicketStatus.CLOSED), []);
  });

  it("prevents escalating a RESOLVED ticket", () => {
    assert.equal(ticketStateMachine.canTransition(TicketStatus.RESOLVED, TicketStatus.ESCALATED), false);
  });

  it("throws BadRequestError with INVALID_STATE_TRANSITION on illegal transition", () => {
    assert.throws(
      () => ticketStateMachine.assertTransition(TicketStatus.RESOLVED, TicketStatus.OPEN),
      (err: unknown) => {
        return err instanceof BadRequestError && err.code === "INVALID_STATE_TRANSITION";
      },
    );
  });
});
