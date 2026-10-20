import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { authRateLimiter } from "../src/shared/middleware/rate-limit.middleware";

describe("public authentication rate limit", () => {
  it("limits repeated requests from the same client IP", async () => {
    const app = express();
    app.post("/auth/login", authRateLimiter, (_req, res) => res.sendStatus(204));
    const server: Server = await new Promise((resolve) => {
      const listeningServer = app.listen(0, "127.0.0.1", () => resolve(listeningServer));
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 11; attempt += 1) {
        const response = await fetch(`http://127.0.0.1:${address.port}/auth/login`, {
          method: "POST",
        });
        statuses.push(response.status);
      }

      assert.deepEqual(statuses.slice(0, 10), Array(10).fill(204));
      assert.equal(statuses[10], 429);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
