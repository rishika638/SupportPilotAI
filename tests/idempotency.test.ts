import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { idempotencyMiddleware } from "../src/shared/middleware/idempotency.middleware";
import { redis } from "../src/infrastructure/redis/redis.client";
import { Request, Response } from "express";

describe("Idempotency Middleware", () => {
  const store = new Map<string, { val: string; exp?: number }>();

  beforeEach(() => {
    store.clear();
    // Mock redis methods
    (redis as any).get = async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.exp && Date.now() > entry.exp) {
        store.delete(key);
        return null;
      }
      return entry.val;
    };

    (redis as any).set = async (key: string, val: string, mode?: string, duration?: number, flag?: string) => {
      if (flag === "NX" && store.has(key)) {
        return null; // Key already exists, NX claim fails
      }
      const exp = duration ? Date.now() + duration * 1000 : undefined;
      store.set(key, { val, exp });
      return "OK";
    };

    (redis as any).del = async (key: string) => {
      store.delete(key);
      return 1;
    };
    (redis as any).eval = async (
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
        store.set(key, {
          val: String(nextValueOrTtl),
          exp: Date.now() + Number(ttl) * 1000,
        });
        return 1;
      }
      throw new Error("Unexpected idempotency Lua command");
    };
  });

  function createMockReqRes(body: unknown, key = "test-key-123") {
    const headers: Record<string, string> = {
      "idempotency-key": key,
    };
    const responseHeaders: Record<string, string> = {};

    const req = {
      method: "POST",
      path: "/api/v1/tickets",
      header: (name: string) => headers[name.toLowerCase()],
      organization: { id: "org-uuid-1" },
      body,
    } as unknown as Request;

    let statusCode = 200;
    let jsonBody: unknown = null;

    const res = {
      statusCode: 200,
      headersSent: false,
      writableEnded: false,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      setHeader(name: string, value: string) {
        responseHeaders[name.toLowerCase()] = value;
      },
      getHeader(name: string) {
        return responseHeaders[name.toLowerCase()];
      },
      json(body: unknown) {
        jsonBody = body;
        this.writableEnded = true;
        return this;
      },
      on() {
        return this;
      },
    } as unknown as Response;

    return { req, res, getStatus: () => statusCode, getBody: () => jsonBody, getHeaders: () => responseHeaders };
  }

  it("executes handler for first request and saves response to cache", async () => {
    const { req, res, getStatus, getBody } = createMockReqRes({ title: "Issue 1" });
    let nextCalled = false;

    await idempotencyMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);

    // Handler sends response
    res.status(201).json({ id: "ticket-1", title: "Issue 1" });

    assert.equal(getStatus(), 201);
    assert.deepEqual(getBody(), { id: "ticket-1", title: "Issue 1" });

    // Verify stored in redis
    const cached = await redis.get("idempotency:org-uuid-1:test-key-123");
    assert.notEqual(cached, null);
    const parsed = JSON.parse(cached!);
    assert.equal(parsed.status, 201);
    assert.equal(parsed.completed, true);
  });

  it("replays cached response with Idempotent-Replayed header for duplicate request", async () => {
    // Prime cache with completed response
    const { req: req1, res: res1 } = createMockReqRes({ title: "Issue 1" });
    await idempotencyMiddleware(req1, res1, () => {});
    res1.status(201).json({ id: "ticket-1" });

    // Send identical request with same key
    const { req: req2, res: res2, getStatus, getBody, getHeaders } = createMockReqRes({ title: "Issue 1" });
    let nextCalled2 = false;

    await idempotencyMiddleware(req2, res2, () => {
      nextCalled2 = true;
    });

    assert.equal(nextCalled2, false, "next() should NOT be called on cache replay");
    assert.equal(getStatus(), 201);
    assert.deepEqual(getBody(), { id: "ticket-1" });
    assert.equal(getHeaders()["idempotent-replayed"], "true");
  });

  it("rejects request with 422 if payload does not match original key hash", async () => {
    // Prime cache with first payload
    const { req: req1, res: res1 } = createMockReqRes({ title: "Original payload" });
    await idempotencyMiddleware(req1, res1, () => {});
    res1.status(200).json({ ok: true });

    // Send different payload with same idempotency key
    const { req: req2, res: res2, getStatus, getBody } = createMockReqRes({ title: "Different payload" });
    let nextCalled2 = false;

    await idempotencyMiddleware(req2, res2, () => {
      nextCalled2 = true;
    });

    assert.equal(nextCalled2, false);
    assert.equal(getStatus(), 422);
    assert.equal((getBody() as any)?.error?.code, "IDEMPOTENCY_KEY_MISMATCH");
  });

  it("renews an in-flight claim and only commits its response while it owns the lock", async () => {
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    const originalNow = Date.now;
    let renewal: (() => void) | undefined;
    let now = originalNow();
    const timers = globalThis as unknown as {
      setInterval: typeof setInterval;
      clearInterval: typeof clearInterval;
    };
    timers.setInterval = ((callback: () => void) => {
      renewal = callback;
      return { unref() {} } as NodeJS.Timeout;
    }) as typeof setInterval;
    timers.clearInterval = (() => {}) as typeof clearInterval;
    Date.now = () => now;

    try {
      const { req, res } = createMockReqRes({ title: "Long-running request" }, "long-request");
      let nextCalled = false;
      await idempotencyMiddleware(req, res, () => { nextCalled = true; });
      assert.equal(nextCalled, true);
      assert.ok(renewal);

      now += 40_000;
      renewal();
      await new Promise((resolve) => setImmediate(resolve));

      now += 21_000;
      const claim = await redis.get("idempotency:org-uuid-1:long-request");
      assert.ok(claim, "renewed claim should remain present past its original 60-second expiry");

      res.status(201).json({ id: "ticket-long" });
      await new Promise((resolve) => setImmediate(resolve));

      const cached = await redis.get("idempotency:org-uuid-1:long-request");
      assert.ok(cached);
      assert.equal(JSON.parse(cached).completed, true);
    } finally {
      timers.setInterval = originalSetInterval;
      timers.clearInterval = originalClearInterval;
      Date.now = originalNow;
    }
  });

  it("rejects a concurrent duplicate while the original request is still processing", async () => {
    const first = createMockReqRes({ title: "Concurrent request" }, "concurrent-key");
    let firstNextCalled = false;
    await idempotencyMiddleware(first.req, first.res, () => { firstNextCalled = true; });

    const duplicate = createMockReqRes({ title: "Concurrent request" }, "concurrent-key");
    let duplicateNextCalled = false;
    await idempotencyMiddleware(duplicate.req, duplicate.res, () => { duplicateNextCalled = true; });

    assert.equal(firstNextCalled, true);
    assert.equal(duplicateNextCalled, false);
    assert.equal(duplicate.getStatus(), 409);

    first.res.status(201).json({ id: "ticket-concurrent" });
    await new Promise((resolve) => setImmediate(resolve));

    const replay = createMockReqRes({ title: "Concurrent request" }, "concurrent-key");
    let replayNextCalled = false;
    await idempotencyMiddleware(replay.req, replay.res, () => { replayNextCalled = true; });
    assert.equal(replayNextCalled, false);
    assert.equal(replay.getStatus(), 201);
  });

  it("does not overwrite a replacement owner's lock when the original response arrives late", async () => {
    const request = createMockReqRes({ title: "Late completion" }, "replacement-owner");
    await idempotencyMiddleware(request.req, request.res, () => {});
    const key = "idempotency:org-uuid-1:replacement-owner";
    const replacement = JSON.stringify({
      status: 0,
      body: null,
      hash: "replacement-request",
      processing: true,
      claimId: "replacement-claim",
    });
    store.set(key, { val: replacement, exp: Date.now() + 60_000 });

    request.res.status(201).json({ id: "older-request-result" });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(await redis.get(key), replacement);
  });
});
