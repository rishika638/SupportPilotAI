import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Organization,
  OrganizationMember,
  RefreshToken,
  User,
} from "@prisma/client";
import { prisma } from "../src/infrastructure/database/prisma.client";
import { verifyAccessToken, verifyRefreshToken, signRefreshToken } from "../src/infrastructure/auth/jwt.service";
import { hashPassword } from "../src/infrastructure/auth/password.service";
import { AuthService } from "../src/modules/auth/auth.service";
import { refreshTokenRepository } from "../src/modules/auth/repositories/refresh-token.repository";
import { userRepository } from "../src/modules/auth/repositories/user.repository";

const user = {
  id: "user-auth-test",
  email: "agent@example.test",
  firstName: "Test",
  lastName: "Agent",
  isActive: true,
  deletedAt: null,
  passwordHash: "",
} as unknown as User;
const organization = {
  id: "org-auth-test",
  name: "Test Organization",
  slug: "test-organization",
  deletedAt: null,
} as unknown as Organization;
const membership = {
  id: "membership-auth-test",
  userId: user.id,
  organizationId: organization.id,
  role: "AGENT",
  status: "ACTIVE",
  organization,
} as unknown as OrganizationMember & { organization: Organization };

describe("AuthService login and refresh", () => {
  it("authenticates valid credentials and issues organization-bound tokens", async () => {
    const original = {
      findByEmail: userRepository.findByEmail,
      findByIdWithMemberships: userRepository.findByIdWithMemberships,
      updateLastLogin: userRepository.updateLastLogin,
      createRefresh: refreshTokenRepository.create,
    };
    user.passwordHash = await hashPassword("valid-test-password");
    let persistedRefreshToken = false;

    userRepository.findByEmail = async (email) =>
      email === user.email ? user : null;
    userRepository.findByIdWithMemberships = async () => ({
      ...user,
      memberships: [membership],
    });
    userRepository.updateLastLogin = async () => {};
    refreshTokenRepository.create = async () => {
      persistedRefreshToken = true;
      return {} as RefreshToken;
    };

    try {
      const response = await new AuthService().login({
        email: user.email.toUpperCase(),
        password: "valid-test-password",
      });

      assert.equal(response.organization.id, organization.id);
      assert.equal(verifyAccessToken(response.tokens.accessToken).organizationId, organization.id);
      assert.equal(verifyRefreshToken(response.tokens.refreshToken).sub, user.id);
      assert.equal(persistedRefreshToken, true);
    } finally {
      userRepository.findByEmail = original.findByEmail;
      userRepository.findByIdWithMemberships = original.findByIdWithMemberships;
      userRepository.updateLastLogin = original.updateLastLogin;
      refreshTokenRepository.create = original.createRefresh;
    }
  });

  it("rotates a refresh token once and revokes user sessions on reuse", async () => {
    const originalUserFindFirst = prisma.user.findFirst;
    const originalTransaction = prisma.$transaction;
    const originalCreate = refreshTokenRepository.create;
    const originalRevokeAll = refreshTokenRepository.revokeAllForUser;
    const presented = signRefreshToken(user.id).token;
    let revoked = false;
    let revokedAllUserSessions = false;

    const database = prisma as unknown as {
      user: { findFirst: (...args: never[]) => Promise<unknown> };
      $transaction: <T>(callback: (tx: unknown) => Promise<T>) => Promise<T>;
    };
    database.user.findFirst = async () => ({
      ...user,
      memberships: [membership],
    });
    database.$transaction = async (callback) => callback({
      refreshToken: {
        updateMany: async () => {
          if (revoked) return { count: 0 };
          revoked = true;
          return { count: 1 };
        },
        findFirst: async () => ({
          userId: user.id,
          revokedAt: revoked ? new Date() : null,
        }),
      },
    });
    refreshTokenRepository.create = async () => ({} as RefreshToken);
    refreshTokenRepository.revokeAllForUser = async () => {
      revokedAllUserSessions = true;
      return 1;
    };

    try {
      const service = new AuthService();
      const rotated = await service.refresh({ refreshToken: presented });
      assert.equal(verifyRefreshToken(rotated.tokens.refreshToken).sub, user.id);
      await assert.rejects(
        service.refresh({ refreshToken: presented }),
        /Refresh token reuse detected/,
      );
      assert.equal(revokedAllUserSessions, true);
    } finally {
      database.user.findFirst = originalUserFindFirst as unknown as (...args: never[]) => Promise<unknown>;
      database.$transaction = originalTransaction as unknown as typeof database.$transaction;
      refreshTokenRepository.create = originalCreate;
      refreshTokenRepository.revokeAllForUser = originalRevokeAll;
    }
  });
});
