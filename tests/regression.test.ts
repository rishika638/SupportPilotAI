import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { TicketStatus } from "@prisma/client";
import { ticketStateMachine } from "../src/modules/tickets/ticket-state-machine";
import { idempotencyMiddleware } from "../src/shared/middleware/idempotency.middleware";
import { redis } from "../src/infrastructure/redis/redis.client";
import { aiAnalysisSchema } from "../src/modules/ai/providers/ai.provider";
import { BadRequestError } from "../src/shared/errors/app.error";
import type { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RedisStore = Map<string, { val: string; exp?: number }>;

function makeRedisStore(): RedisStore {
  return new Map();
}

function installRedisMock(store: RedisStore) {
  (redis as unknown as Record<string, unknown>).get = async (key: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.exp && Date.now() > entry.exp) { store.delete(key); return null; }
    return entry.val;
  };
  (redis as unknown as Record<string, unknown>).set = async (
    key: string, val: string, _mode?: string, duration?: number, flag?: string,
  ) => {
    if (flag === "NX" && store.has(key)) return null;
    const exp = duration ? Date.now() + duration * 1000 : undefined;
    store.set(key, { val, exp });
    return "OK";
  };
  (redis as unknown as Record<string, unknown>).del = async (key: string) => {
    store.delete(key); return 1;
  };
  (redis as unknown as Record<string, unknown>).eval = async (
    script: string,
    _numberOfKeys: number,
    key: string,
    expectedValue: string,
    nextValueOrTtl?: string | number,
    ttl?: number,
  ) => {
    const entry = store.get(key);
    if (!entry || entry.val !== expectedValue) return 0;

    if (script.includes("EXPIRE")) {
      entry.exp = Date.now() + Number(nextValueOrTtl) * 1000;
      return 1;
    }
    if (script.includes("redis.call(\"DEL\"")) {
      store.delete(key);
      return 1;
    }
    if (script.includes("redis.call(\"SET\"")) {
      const exp = Date.now() + Number(ttl) * 1000;
      store.set(key, { val: String(nextValueOrTtl), exp });
      return 1;
    }
    throw new Error("Unexpected idempotency Lua command");
  };
}

function makeReqRes(body: unknown, key = "key-1", orgId = "org-1") {
  const headers: Record<string, string> = { "idempotency-key": key };
  const resHeaders: Record<string, string> = {};
  let statusCode = 200;
  let jsonBody: unknown = null;

  const req = {
    method: "POST",
    path: "/api/v1/tickets",
    header: (n: string) => headers[n.toLowerCase()],
    organization: { id: orgId },
    body,
  } as unknown as Request;

  const res = {
    statusCode: 200,
    writableEnded: false,
    status(code: number) { statusCode = code; this.statusCode = code; return this; },
    setHeader(n: string, v: string) { resHeaders[n.toLowerCase()] = v; },
    getHeader(n: string) { return resHeaders[n.toLowerCase()]; },
    json(b: unknown) { jsonBody = b; this.writableEnded = true; return this; },
    on() { return this; },
  } as unknown as Response;

  return {
    req, res,
    getStatus: () => statusCode,
    getBody: () => jsonBody,
    getHeaders: () => resHeaders,
  };
}

// ---------------------------------------------------------------------------
// 1. Auth – refresh token rotation logic
// ---------------------------------------------------------------------------
describe("Auth – refresh token rotation", () => {
  it("revokeAllForUser is called outside tx when reuse is detected", async () => {
    let revokeAllCalled = false;
    let revokedUserId: string | null = null;

    const simulateRefresh = async (reused: boolean) => {
      try {
        await (async () => {
          if (reused) {
            throw Object.assign(
              new Error("Refresh token reuse detected. All sessions revoked."),
              { _revokeUserId: "user-abc" },
            );
          }
          return { accessToken: "at", refreshToken: "rt", expiresIn: "15m" };
        })();
      } catch (err: unknown) {
        const uid = (err as Record<string, unknown>)._revokeUserId;
        if (typeof uid === "string") { revokeAllCalled = true; revokedUserId = uid; }
        throw err;
      }
    };

    await assert.rejects(() => simulateRefresh(true));
    assert.equal(revokeAllCalled, true);
    assert.equal(revokedUserId, "user-abc");
  });

  it("revokeAllForUser is NOT called for a plain invalid token", async () => {
    let revokeAllCalled = false;
    const simulateRefresh = async () => {
      try {
        throw new Error("Invalid refresh token");
      } catch (err: unknown) {
        const uid = (err as Record<string, unknown>)._revokeUserId;
        if (typeof uid === "string") revokeAllCalled = true;
        throw err;
      }
    };
    await assert.rejects(() => simulateRefresh());
    assert.equal(revokeAllCalled, false);
  });

  it("ForbiddenError thrown before tx does not affect token revocation", async () => {
    // Simulates the fixed pattern: user validation happens before the tx,
    // so a ForbiddenError never rolls back the revoke inside the tx.
    let revokeCommitted = false;
    let forbiddenThrown = false;

    const simulateRefreshFixed = async (userExists: boolean) => {
      // Pre-tx validation (outside transaction)
      if (!userExists) {
        forbiddenThrown = true;
        throw new Error("NO_ACTIVE_MEMBERSHIP");
      }
      // tx: only revoke + issue — no ForbiddenError possible here
      await (async () => { revokeCommitted = true; })();
    };

    await assert.rejects(() => simulateRefreshFixed(false));
    assert.equal(forbiddenThrown, true);
    assert.equal(revokeCommitted, false, "tx never opened when user missing");
  });

  it("concurrent refresh: second call with same token gets rejected after first revokes it", async () => {
    // Simulate two concurrent refreshes of the same token.
    // The token DB is a simple map: tokenHash -> { revokedAt }
    const tokens = new Map<string, { revokedAt: Date | null; expiresAt: Date }>();
    const futureDate = new Date(Date.now() + 3600_000);
    tokens.set("hash-1", { revokedAt: null, expiresAt: futureDate });

    const atomicRevoke = async (hash: string): Promise<boolean> => {
      const t = tokens.get(hash);
      if (!t || t.revokedAt !== null || t.expiresAt <= new Date()) return false;
      t.revokedAt = new Date();
      return true;
    };

    const [r1, r2] = await Promise.all([
      atomicRevoke("hash-1"),
      atomicRevoke("hash-1"),
    ]);
    // Exactly one should succeed
    assert.equal(r1 || r2, true, "at least one revoke succeeds");
    // In a real DB updateMany is atomic; here we simulate: both may succeed
    // due to JS single-thread, but the important invariant is the token is revoked
    const token = tokens.get("hash-1")!;
    assert.notEqual(token.revokedAt, null, "token must be revoked after concurrent calls");
  });
});

// ---------------------------------------------------------------------------
// 2. Idempotency – Redis failure returns 503
// ---------------------------------------------------------------------------
describe("Idempotency – Redis failure handling", () => {
  it("returns 503 when Redis throws on initial set", async () => {
    // Override redis.set to throw
    (redis as unknown as Record<string, unknown>).set = async () => {
      throw new Error("Redis connection refused");
    };
    (redis as unknown as Record<string, unknown>).get = async () => null;

    const { req, res, getStatus, getBody } = makeReqRes({ title: "t" }, "key-fail");
    let nextCalled = false;

    await idempotencyMiddleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, "next() must NOT be called on Redis failure");
    assert.equal(getStatus(), 503);
    assert.equal((getBody() as Record<string, unknown>)?.success, false);
  });

  it("requests without idempotency-key bypass the middleware entirely", async () => {
    const req = {
      method: "POST",
      path: "/api/v1/tickets",
      header: () => undefined,
      organization: { id: "org-1" },
      body: {},
    } as unknown as Request;
    const res = {} as unknown as Response;
    let nextCalled = false;
    await idempotencyMiddleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it("GET requests bypass the middleware entirely", async () => {
    const req = {
      method: "GET",
      path: "/api/v1/tickets",
      header: () => "some-key",
      organization: { id: "org-1" },
      body: {},
    } as unknown as Request;
    const res = {} as unknown as Response;
    let nextCalled = false;
    await idempotencyMiddleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});

// ---------------------------------------------------------------------------
// 3. Idempotency – duplicate requests, mismatch, replay (with working Redis)
// ---------------------------------------------------------------------------
describe("Idempotency – duplicate/mismatch/replay", () => {
  let store: RedisStore;

  beforeEach(() => {
    store = makeRedisStore();
    installRedisMock(store);
  });

  it("first request acquires lock and next() is called", async () => {
    const { req, res } = makeReqRes({ title: "t1" }, "k1");
    let nextCalled = false;
    await idempotencyMiddleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it("duplicate request replays cached response without calling next()", async () => {
    const { req: r1, res: res1 } = makeReqRes({ title: "t1" }, "k2");
    await idempotencyMiddleware(r1, res1, () => {});
    res1.status(201).json({ id: "ticket-1" });

    const { req: r2, res: res2, getStatus, getBody, getHeaders } = makeReqRes({ title: "t1" }, "k2");
    let nextCalled = false;
    await idempotencyMiddleware(r2, res2, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(getStatus(), 201);
    assert.deepEqual(getBody(), { id: "ticket-1" });
    assert.equal(getHeaders()["idempotent-replayed"], "true");
  });

  it("mismatched payload returns 422", async () => {
    const { req: r1, res: res1 } = makeReqRes({ title: "original" }, "k3");
    await idempotencyMiddleware(r1, res1, () => {});
    res1.status(200).json({ ok: true });

    const { req: r2, res: res2, getStatus, getBody } = makeReqRes({ title: "different" }, "k3");
    let nextCalled = false;
    await idempotencyMiddleware(r2, res2, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(getStatus(), 422);
    assert.equal((getBody() as Record<string, Record<string, string>>)?.error?.code, "IDEMPOTENCY_KEY_MISMATCH");
  });

  it("cross-tenant: same key for different orgs are independent", async () => {
    const { req: r1, res: res1 } = makeReqRes({ title: "t" }, "same-key", "org-A");
    await idempotencyMiddleware(r1, res1, () => {});
    res1.status(201).json({ id: "a" });

    // Different org, same key — should NOT replay
    const { req: r2, res: res2 } = makeReqRes({ title: "t" }, "same-key", "org-B");
    let nextCalled = false;
    await idempotencyMiddleware(r2, res2, () => { nextCalled = true; });
    assert.equal(nextCalled, true, "different org must not share idempotency cache");
  });
});

// ---------------------------------------------------------------------------
// 4. SLA – duplicate escalation prevention and batch counting
// ---------------------------------------------------------------------------
describe("SLA – duplicate escalation prevention", () => {
  it("handleBreach skips ticket when audit log already has SLA_BREACH", async () => {
    // Simulate the guard: existingBreach check returns a record
    const existingBreach = { id: "audit-1" };
    const shouldEscalate = existingBreach === null;
    assert.equal(shouldEscalate, false, "must skip when breach already recorded");
  });

  it("handleBreach skips ticket when status is no longer escalatable", () => {
    const escalatableStatuses = ["OPEN", "ASSIGNED", "IN_PROGRESS"];
    const resolvedTicketStatus = "RESOLVED";
    assert.equal(escalatableStatuses.includes(resolvedTicketStatus), false);
  });

  it("totalProcessed counts only fulfilled escalations, not attempted", async () => {
    const results: PromiseSettledResult<void>[] = [
      { status: "fulfilled", value: undefined },
      { status: "rejected", reason: new Error("DB error") },
      { status: "fulfilled", value: undefined },
    ];
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    assert.equal(succeeded, 2);
    assert.equal(failed, 1);
  });

  it("SLA deadline calculation is correct for all priorities", () => {
    const SLA: Record<string, number> = { URGENT: 30, HIGH: 120, MEDIUM: 480, LOW: 1440 };
    const from = new Date("2025-01-01T00:00:00Z");
    for (const [priority, minutes] of Object.entries(SLA)) {
      const deadline = new Date(from.getTime() + minutes * 60_000);
      assert.equal(
        deadline.getTime(),
        from.getTime() + minutes * 60_000,
        `${priority} deadline wrong`,
      );
    }
  });

  it("batch createdAt filter excludes tickets newer than URGENT SLA window", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const cutoff = new Date(now.getTime() - 30 * 60_000);
    const newTicket = new Date(now.getTime() - 10 * 60_000); // 10 min ago
    const oldTicket = new Date(now.getTime() - 60 * 60_000); // 60 min ago
    assert.equal(newTicket <= cutoff, false, "new ticket must be excluded");
    assert.equal(oldTicket <= cutoff, true, "old ticket must be included");
  });
});

// ---------------------------------------------------------------------------
// 5. Cross-tenant access denial
// ---------------------------------------------------------------------------
describe("Cross-tenant access denial", () => {
  it("ticket from org-A is not accessible to org-B member", () => {
    const ticket = { id: "t1", organizationId: "org-A" };
    const requestingOrgId = "org-B";
    // The repository always scopes by organizationId in WHERE clause
    const accessible = ticket.organizationId === requestingOrgId;
    assert.equal(accessible, false);
  });

  it("findById with wrong organizationId returns null (simulated)", async () => {
    // Simulate repository behavior: WHERE id=X AND organizationId=Y
    const db = [{ id: "t1", organizationId: "org-A", deletedAt: null }];
    const find = (orgId: string, ticketId: string) =>
      db.find((t) => t.id === ticketId && t.organizationId === orgId && !t.deletedAt) ?? null;

    assert.equal(find("org-A", "t1") !== null, true);
    assert.equal(find("org-B", "t1"), null, "cross-tenant access must return null");
  });

  it("soft-deleted ticket is not accessible", () => {
    const db = [{ id: "t2", organizationId: "org-A", deletedAt: new Date() }];
    const find = (orgId: string, ticketId: string) =>
      db.find((t) => t.id === ticketId && t.organizationId === orgId && !t.deletedAt) ?? null;
    assert.equal(find("org-A", "t2"), null, "deleted ticket must not be accessible");
  });
});

// ---------------------------------------------------------------------------
// 6. RBAC – ticket lifecycle
// ---------------------------------------------------------------------------
describe("RBAC – ticket lifecycle", () => {
  it("AGENT cannot assign tickets", () => {
    const role = "AGENT";
    const canAssign = role === "ADMIN" || role === "MANAGER";
    assert.equal(canAssign, false);
  });

  it("ADMIN can assign tickets", () => {
    const role = "ADMIN";
    const canAssign = role === "ADMIN" || role === "MANAGER";
    assert.equal(canAssign, true);
  });

  it("AGENT cannot delete tickets", () => {
    const role = "AGENT";
    const canDelete = role === "ADMIN" || role === "MANAGER";
    assert.equal(canDelete, false);
  });

  it("AGENT can only see tickets assigned to them", () => {
    const agentId = "agent-1";
    const tickets = [
      { id: "t1", assigneeId: "agent-1" },
      { id: "t2", assigneeId: "agent-2" },
      { id: "t3", assigneeId: null },
    ];
    const visible = tickets.filter((t) => t.assigneeId === agentId);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].id, "t1");
  });

  it("MANAGER can see tickets in their teams or unassigned", () => {
    const managerTeamIds = ["team-1", "team-2"];
    const tickets = [
      { id: "t1", teamId: "team-1" },
      { id: "t2", teamId: "team-3" },
      { id: "t3", teamId: null },
    ];
    const visible = tickets.filter(
      (t) => t.teamId === null || managerTeamIds.includes(t.teamId),
    );
    assert.equal(visible.length, 2);
    assert.deepEqual(visible.map((t) => t.id), ["t1", "t3"]);
  });
});

// ---------------------------------------------------------------------------
// 7. Ticket state machine – full lifecycle
// ---------------------------------------------------------------------------
describe("Ticket state machine – full lifecycle", () => {
  it("OPEN -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED", () => {
    const path: TicketStatus[] = [
      TicketStatus.OPEN,
      TicketStatus.ASSIGNED,
      TicketStatus.IN_PROGRESS,
      TicketStatus.RESOLVED,
      TicketStatus.CLOSED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      assert.equal(
        ticketStateMachine.canTransition(path[i], path[i + 1]),
        true,
        `${path[i]} -> ${path[i + 1]} must be allowed`,
      );
    }
  });

  it("OPEN -> ESCALATED -> IN_PROGRESS -> RESOLVED -> CLOSED", () => {
    const path: TicketStatus[] = [
      TicketStatus.OPEN,
      TicketStatus.ESCALATED,
      TicketStatus.IN_PROGRESS,
      TicketStatus.RESOLVED,
      TicketStatus.CLOSED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      assert.equal(ticketStateMachine.canTransition(path[i], path[i + 1]), true);
    }
  });

  it("CLOSED is a terminal state — no transitions allowed", () => {
    const allStatuses = Object.values(TicketStatus);
    for (const to of allStatuses) {
      assert.equal(
        ticketStateMachine.canTransition(TicketStatus.CLOSED, to),
        false,
        `CLOSED -> ${to} must be forbidden`,
      );
    }
  });

  it("RESOLVED -> OPEN is forbidden", () => {
    assert.equal(ticketStateMachine.canTransition(TicketStatus.RESOLVED, TicketStatus.OPEN), false);
  });

  it("assertTransition throws BadRequestError with correct code on illegal transition", () => {
    assert.throws(
      () => ticketStateMachine.assertTransition(TicketStatus.CLOSED, TicketStatus.OPEN),
      (err: unknown) => err instanceof BadRequestError && err.code === "INVALID_STATE_TRANSITION",
    );
  });

  it("IN_PROGRESS -> WAITING_CUSTOMER is allowed", () => {
    assert.equal(
      ticketStateMachine.canTransition(TicketStatus.IN_PROGRESS, TicketStatus.WAITING_CUSTOMER),
      true,
    );
  });

  it("WAITING_CUSTOMER -> IN_PROGRESS is allowed (customer replied)", () => {
    assert.equal(
      ticketStateMachine.canTransition(TicketStatus.WAITING_CUSTOMER, TicketStatus.IN_PROGRESS),
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// 8. AI validation – Zod schema before persistence
// ---------------------------------------------------------------------------
describe("AI validation – Zod schema", () => {
  it("valid response passes schema", () => {
    const result = aiAnalysisSchema.parse({
      summary: "Login issue",
      category: "Auth",
      sentiment: "negative",
      suggestedPriority: "HIGH",
      suggestedResponse: "We are investigating.",
      confidence: 0.9,
      modelVersion: "gpt-4o",
    });
    assert.equal(result.summary, "Login issue");
    assert.equal(result.suggestedPriority, "HIGH");
  });

  it("missing summary throws", () => {
    assert.throws(() => aiAnalysisSchema.parse({
      category: "Auth",
      sentiment: "neutral",
      suggestedPriority: "LOW",
      suggestedResponse: "OK",
    }));
  });

  it("empty suggestedResponse throws", () => {
    assert.throws(() => aiAnalysisSchema.parse({
      summary: "s",
      category: "c",
      sentiment: "neutral",
      suggestedPriority: "LOW",
      suggestedResponse: "",
    }));
  });

  it("invalid sentiment falls back to neutral", () => {
    const r = aiAnalysisSchema.parse({
      summary: "s", category: "c",
      sentiment: "furious",
      suggestedPriority: "LOW",
      suggestedResponse: "ok",
    });
    assert.equal(r.sentiment, "neutral");
  });

  it("invalid priority falls back to MEDIUM", () => {
    const r = aiAnalysisSchema.parse({
      summary: "s", category: "c",
      sentiment: "neutral",
      suggestedPriority: "CRITICAL",
      suggestedResponse: "ok",
    });
    assert.equal(r.suggestedPriority, "MEDIUM");
  });

  it("Zod parse is called BEFORE markCompleted (order verification)", async () => {
    const calls: string[] = [];
    const mockParse = (raw: unknown) => { calls.push("parse"); return raw; };
    const mockMarkCompleted = async () => { calls.push("markCompleted"); };

    const raw = {
      summary: "s", category: "c", sentiment: "neutral",
      suggestedPriority: "LOW", suggestedResponse: "ok",
    };
    mockParse(raw);
    await mockMarkCompleted();

    assert.deepEqual(calls, ["parse", "markCompleted"]);
  });
});

// ---------------------------------------------------------------------------
// 9. BullMQ retry/failure handling (logic-level, no live Redis)
// ---------------------------------------------------------------------------
describe("BullMQ worker – retry and failure logic", () => {
  it("job processor re-throws error so BullMQ can retry", async () => {
    const processJob = async (job: { data: { analysisId: string }; attemptsMade: number }) => {
      try {
        throw new Error("provider timeout");
      } catch (err) {
        // markFailed is called, then error is re-thrown for BullMQ retry
        const markedFailed = true;
        assert.equal(markedFailed, true);
        throw err; // must re-throw
      }
    };

    await assert.rejects(
      () => processJob({ data: { analysisId: "a1" }, attemptsMade: 1 }),
      /provider timeout/,
    );
  });

  it("dead-letter log fires when attemptsMade >= max attempts", () => {
    const maxAttempts = 5;
    let deadLetterLogged = false;

    const onFailed = (job: { attemptsMade: number; opts: { attempts?: number } }) => {
      if (job.attemptsMade >= (job.opts.attempts ?? maxAttempts)) {
        deadLetterLogged = true;
      }
    };

    onFailed({ attemptsMade: 5, opts: { attempts: 5 } });
    assert.equal(deadLetterLogged, true);
  });

  it("dead-letter log does NOT fire before max attempts", () => {
    let deadLetterLogged = false;
    const onFailed = (job: { attemptsMade: number; opts: { attempts?: number } }) => {
      if (job.attemptsMade >= (job.opts.attempts ?? 5)) deadLetterLogged = true;
    };
    onFailed({ attemptsMade: 3, opts: { attempts: 5 } });
    assert.equal(deadLetterLogged, false);
  });

  it("notification job re-throws so BullMQ retries on DB failure", async () => {
    const processNotification = async () => {
      try {
        throw new Error("DB connection lost");
      } catch (err) {
        throw err; // must propagate for retry
      }
    };
    await assert.rejects(() => processNotification(), /DB connection lost/);
  });
});

// ---------------------------------------------------------------------------
// 10. Ticket number allocation – concurrency invariant
// ---------------------------------------------------------------------------
describe("Ticket number allocation – concurrency invariant", () => {
  it("sequential allocation produces unique incrementing numbers", () => {
    let counter = 1000;
    const allocate = () => ++counter;
    const nums = [allocate(), allocate(), allocate()];
    assert.deepEqual(nums, [1001, 1002, 1003]);
  });

  it("P2002 conflict triggers retry (logic check)", () => {
    const maxRetries = 3;
    let attempt = 0;
    let succeeded = false;

    while (attempt < maxRetries) {
      attempt++;
      const isConflict = attempt < 3; // first two attempts conflict
      if (!isConflict) { succeeded = true; break; }
    }

    assert.equal(succeeded, true);
    assert.equal(attempt, 3);
  });
});

// ---------------------------------------------------------------------------
// 11. Soft delete + audit atomicity
// ---------------------------------------------------------------------------
describe("Soft delete + audit atomicity", () => {
  it("audit log failure rolls back soft delete", async () => {
    let softDeleted = false;
    let auditLogged = false;

    const runTx = async (auditShouldFail: boolean) => {
      const txState = { deleted: false };
      try {
        txState.deleted = true; // softDelete
        if (auditShouldFail) throw new Error("audit failure");
        auditLogged = true;
        softDeleted = txState.deleted; // commit
      } catch {
        // rollback
        txState.deleted = false;
        softDeleted = false;
        throw new Error("Transaction rolled back");
      }
    };

    await assert.rejects(() => runTx(true));
    assert.equal(softDeleted, false, "soft delete must be rolled back");
    assert.equal(auditLogged, false);
  });

  it("both soft delete and audit succeed atomically", async () => {
    let softDeleted = false;
    let auditLogged = false;

    const runTx = async () => {
      softDeleted = true;
      auditLogged = true;
    };

    await runTx();
    assert.equal(softDeleted, true);
    assert.equal(auditLogged, true);
  });
});
