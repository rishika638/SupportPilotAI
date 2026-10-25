import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import type { Server } from "node:http";

const databaseUrl = process.env.TENANT_TEST_DATABASE_URL;
assert.equal(process.env.NODE_ENV, "test", "Integration tests must run with NODE_ENV=test.");
assert.ok(databaseUrl, "TENANT_TEST_DATABASE_URL must be explicitly configured.");

const parsedDatabaseUrl = new URL(databaseUrl);
assert.ok(
  ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsedDatabaseUrl.hostname),
  "Integration tests refuse remote PostgreSQL hosts.",
);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)).toLowerCase();
assert.match(databaseName, /(?:^|[_-])test(?:$|[_-])/);
assert.doesNotMatch(databaseName, /prod|production|render|live/);
process.env.DATABASE_URL = databaseUrl;

export interface HttpResponse {
  status: number;
  body: unknown;
  text: string;
  headers: Record<string, string>;
}

export interface TestRequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface TestApplication {
  request(path: string, options?: TestRequestOptions): Promise<HttpResponse>;
  close(): Promise<void>;
  prisma: import("@prisma/client").PrismaClient;
}

export async function startTestApp(): Promise<TestApplication> {
  const [{ createApp }, { prisma }] = await Promise.all([
    import("../../../src/app"),
    import("../../../src/infrastructure/database/prisma.client"),
  ]);
  await prisma.$connect();

  const server: Server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

  return {
    prisma,
    async request(path, options = {}) {
      const headers = new Headers();
      if (options.headers) {
        new Headers(options.headers).forEach((value, key) => {
          headers.set(key, value);
        });
      }
      if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
      if (options.body !== undefined) headers.set("Content-Type", "application/json");

      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
      const text = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
      return {
        status: response.status,
        body,
        text,
        headers: Object.fromEntries(response.headers.entries()),
      };
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      await prisma.$disconnect();
    },
  };
}
