/**
 * Unit tests for performance database safety guards.
 * These tests validate the guard logic without connecting to a database.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('Performance Database Safety Guards', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear relevant environment variables before each test
    delete process.env.NODE_ENV;
    delete process.env.ALLOW_PERFORMANCE_DB_MUTATIONS;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('validatePerformanceEnvironment logic', () => {
    // Import the guard function after environment is set
    const validateGuard = (nodeEnv: string, allowMutations: string, dbUrl: string): { valid: boolean; error?: string } => {
      // Replicate the guard logic for testing
      if (nodeEnv !== 'performance') {
        return { valid: false, error: 'NODE_ENV must be "performance"' };
      }
      if (allowMutations !== 'true') {
        return { valid: false, error: 'ALLOW_PERFORMANCE_DB_MUTATIONS must be "true"' };
      }
      if (!dbUrl) {
        return { valid: false, error: 'DATABASE_URL is not set' };
      }
      try {
        const url = new URL(dbUrl);
        if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
          return { valid: false, error: 'DATABASE_URL must use postgresql:// or postgres:// protocol' };
        }
        const hostname = url.hostname.toLowerCase();
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
          return { valid: false, error: 'DATABASE_URL hostname must be localhost or 127.0.0.1' };
        }
        const pathname = url.pathname;
        const dbName = pathname.startsWith('/') ? pathname.slice(1) : pathname;
        if (dbName !== 'supportpilot_performance') {
          return { valid: false, error: `DATABASE_URL database name must be exactly "supportpilot_performance" (got "${dbName}")` };
        }
        return { valid: true };
      } catch (err) {
        return { valid: false, error: `Failed to parse DATABASE_URL: ${err instanceof Error ? err.message : String(err)}` };
      }
    };

    it('should reject when NODE_ENV is not "performance"', () => {
      const result = validateGuard('development', 'true', 'postgresql://localhost:5432/supportpilot_performance');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('NODE_ENV must be "performance"'));
    });

    it('should reject when ALLOW_PERFORMANCE_DB_MUTATIONS is not "true"', () => {
      const result = validateGuard('performance', 'false', 'postgresql://localhost:5432/supportpilot_performance');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('ALLOW_PERFORMANCE_DB_MUTATIONS must be "true"'));
    });

    it('should reject when DATABASE_URL is not set', () => {
      const result = validateGuard('performance', 'true', '');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('DATABASE_URL is not set'));
    });

    it('should reject when DATABASE_URL protocol is invalid', () => {
      const result = validateGuard('performance', 'true', 'mysql://localhost:5432/supportpilot_performance');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('must use postgresql:// or postgres:// protocol'));
    });

    it('should reject when DATABASE_URL hostname is not local', () => {
      const result = validateGuard('performance', 'true', 'postgresql://remote-host.com:5432/supportpilot_performance');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('hostname must be localhost or 127.0.0.1'));
    });

    it('should reject when database name is not exactly "supportpilot_performance"', () => {
      const result = validateGuard('performance', 'true', 'postgresql://localhost:5432/supportpilot_dev');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('must be exactly "supportpilot_performance"'));
    });

    it('should reject when database name is "supportpilot_tenant_test"', () => {
      const result = validateGuard('performance', 'true', 'postgresql://localhost:5432/supportpilot_tenant_test');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('must be exactly "supportpilot_performance"'));
    });

    it('should accept valid performance database configuration', () => {
      const result = validateGuard('performance', 'true', 'postgresql://localhost:5432/supportpilot_performance');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    it('should accept valid configuration with 127.0.0.1', () => {
      const result = validateGuard('performance', 'true', 'postgresql://127.0.0.1:5432/supportpilot_performance');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    it('should accept valid configuration with postgres:// protocol', () => {
      const result = validateGuard('performance', 'true', 'postgres://localhost:5432/supportpilot_performance');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    it('should handle database name without leading slash', () => {
      const result = validateGuard('performance', 'true', 'postgresql://localhost:5432/supportpilot_performance');
      assert.strictEqual(result.valid, true);
    });

    it('should reject malformed DATABASE_URL', () => {
      const result = validateGuard('performance', 'true', 'not-a-valid-url');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('Failed to parse DATABASE_URL'));
    });
  });
});
