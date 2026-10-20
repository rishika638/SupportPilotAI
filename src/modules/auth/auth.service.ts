import { Organization, OrganizationMember, Prisma, User } from "@prisma/client";
import { jwtConfig } from "../../config/jwt";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../infrastructure/auth/jwt.service";
import { hashPassword, verifyPassword } from "../../infrastructure/auth/password.service";
import { prisma } from "../../infrastructure/database/prisma.client";
import { logger } from "../../infrastructure/logger/pino.logger";
import {
  AuthenticationError,
  ConflictError,
  ForbiddenError,
} from "../../shared/errors/auth.errors";
import { generateUniqueSlug } from "../../shared/utils/slug.util";
import {
  AuthRequestContext,
  AuthResponseDto,
  LogoutResponseDto,
  MeResponseDto,
  RefreshResponseDto,
} from "./auth.dto";
import {
  LoginInput,
  LogoutInput,
  RefreshTokenInput,
  RegisterInput,
} from "./auth.schemas";
import { organizationRepository } from "./repositories/organization.repository";
import { refreshTokenRepository } from "./repositories/refresh-token.repository";
import { userRepository } from "./repositories/user.repository";

export class AuthService {
  async register(
    input: RegisterInput,
    context: AuthRequestContext = {},
  ): Promise<AuthResponseDto> {
    const email = input.email.toLowerCase();
    const existingUser = await userRepository.findByEmail(email);

    if (existingUser) {
      throw new ConflictError("Email is already registered", "EMAIL_ALREADY_EXISTS");
    }

    const passwordHash = await hashPassword(input.password);

    const slug = await generateUniqueSlug(input.organizationName, async (candidate) => {
      const organization = await organizationRepository.findBySlug(candidate);
      return organization !== null;
    });

    const { user, organization, membership } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
        },
      });

      const createdOrganization = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug,
        },
      });

      const createdMembership = await tx.organizationMember.create({
        data: {
          userId: createdUser.id,
          organizationId: createdOrganization.id,
          role: "ADMIN",
          status: "ACTIVE",
          invitedAt: new Date(),
          joinedAt: new Date(),
        },
      });

      return {
        user: createdUser,
        organization: createdOrganization,
        membership: createdMembership,
      };
    });

    const tokens = await this.issueTokenPair(user, membership, organization, context);

    return this.buildAuthResponse(user, organization, membership, tokens);
  }

  async login(
    input: LoginInput,
    context: AuthRequestContext = {},
  ): Promise<AuthResponseDto> {
    const email = input.email.toLowerCase();
    const user = await userRepository.findByEmail(email);

    if (!user || !user.passwordHash || !user.isActive) {
      throw new AuthenticationError("Invalid email or password", "INVALID_CREDENTIALS");
    }

    const passwordValid = await verifyPassword(input.password, user.passwordHash);

    if (!passwordValid) {
      throw new AuthenticationError("Invalid email or password", "INVALID_CREDENTIALS");
    }

    const userWithMemberships = await userRepository.findByIdWithMemberships(user.id);

    if (!userWithMemberships || userWithMemberships.memberships.length === 0) {
      throw new ForbiddenError(
        "No active organization membership found",
        "NO_ACTIVE_MEMBERSHIP",
      );
    }

    const primaryMembership = userWithMemberships.memberships[0];
    const organization = primaryMembership.organization;

    if (organization.deletedAt) {
      throw new ForbiddenError(
        "Organization is no longer available",
        "ORGANIZATION_UNAVAILABLE",
      );
    }

    await userRepository.updateLastLogin(user.id);

    const tokens = await this.issueTokenPair(
      user,
      primaryMembership,
      organization,
      context,
    );

    return this.buildAuthResponse(user, organization, primaryMembership, tokens);
  }

  async refresh(
    input: RefreshTokenInput,
    context: AuthRequestContext = {},
  ): Promise<RefreshResponseDto> {
    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(input.refreshToken);
    } catch {
      throw new AuthenticationError("Invalid refresh token", "INVALID_REFRESH_TOKEN");
    }
    const tokenHash = hashToken(input.refreshToken);

    // Pre-validate user and membership BEFORE opening the write transaction.
    // This prevents ForbiddenError throws inside the tx from rolling back the
    // already-committed step-1 token revocation.
    // This read is a consistent snapshot; the token's atomic revoke inside the
    // tx below still guards against concurrent refresh races.
    const userSnapshot = await prisma.user.findFirst({
      where: { id: payload.sub, isActive: true, deletedAt: null },
      include: {
        memberships: {
          where: { deletedAt: null, status: "ACTIVE" },
          include: { organization: true },
        },
      },
    });

    if (!userSnapshot || userSnapshot.memberships.length === 0) {
      throw new ForbiddenError(
        "No active organization membership found",
        "NO_ACTIVE_MEMBERSHIP",
      );
    }

    const primaryMembership = userSnapshot.memberships[0];
    const organization = primaryMembership.organization;

    if (organization.deletedAt) {
      throw new ForbiddenError(
        "Organization is no longer available",
        "ORGANIZATION_UNAVAILABLE",
      );
    }

    let tokens: { accessToken: string; refreshToken: string; expiresIn: string };
    try {
      tokens = await prisma.$transaction(async (tx) => {
        const now = new Date();

        // 1. Atomically revoke the presented token — this is the only write
        //    in this transaction, so no ForbiddenError can roll it back.
        const revokeResult = await tx.refreshToken.updateMany({
          where: {
            tokenHash,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { revokedAt: now },
        });

        if (revokeResult.count === 0) {
          // Token was already revoked, expired, or doesn't exist.
          const existing = await tx.refreshToken.findFirst({
            where: { tokenHash },
          });

          if (existing && existing.revokedAt !== null) {
            // Token reuse detected — carry userId out via error property so
            // the catch block can commit revocations in a separate transaction
            // (throwing here rolls back this tx, which is intentional: we
            // must not issue a new token pair).
            throw Object.assign(
              new AuthenticationError(
                "Refresh token reuse detected. All sessions revoked.",
                "INVALID_REFRESH_TOKEN",
              ),
              { _revokeUserId: existing.userId },
            );
          }

          throw new AuthenticationError("Invalid refresh token", "INVALID_REFRESH_TOKEN");
        }

        // 2. Issue and persist new token pair within the same transaction.
        //    Uses the pre-validated snapshot — no ForbiddenError can fire here.
        return this.issueTokenPair(
          userSnapshot,
          primaryMembership,
          organization,
          context,
          tx,
        );
      });
    } catch (err: unknown) {
      // If reuse was detected the tx rolled back (no new token issued).
      // Commit the full-session revocation in a fresh transaction so it
      // actually persists.
      const revokeUserId = (err as Record<string, unknown>)._revokeUserId;
      if (typeof revokeUserId === "string") {
        await refreshTokenRepository.revokeAllForUser(revokeUserId).catch((revokeErr) => {
          logger.error(
            { err: revokeErr, userId: revokeUserId },
            "CRITICAL: failed to revoke all sessions after token reuse detection",
          );
        });
      }
      throw err;
    }

    return { tokens };
  }

  async logout(input: LogoutInput): Promise<LogoutResponseDto> {
    try {
      verifyRefreshToken(input.refreshToken);
    } catch {
      throw new AuthenticationError("Invalid refresh token", "INVALID_REFRESH_TOKEN");
    }

    const tokenHash = hashToken(input.refreshToken);
    const revoked = await refreshTokenRepository.revokeByHash(tokenHash);

    return { revoked };
  }

  async getMe(
    user: User,
    organization: Organization,
    membership: OrganizationMember,
  ): Promise<MeResponseDto> {
    return {
      ...this.buildIdentityResponse(user, organization, membership),
      role: membership.role,
    };
  }

  private async issueTokenPair(
    user: User,
    membership: OrganizationMember,
    organization: Organization,
    context: AuthRequestContext,
    tx?: Prisma.TransactionClient,
  ) {
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      organizationId: organization.id,
      role: membership.role,
    });

    const refresh = signRefreshToken(user.id);

    await refreshTokenRepository.create(
      {
        userId: user.id,
        tokenHash: hashToken(refresh.token),
        expiresAt: refresh.expiresAt,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      },
      tx,
    );

    return {
      accessToken,
      refreshToken: refresh.token,
      expiresIn: jwtConfig.accessExpiresIn,
    };
  }

  private buildAuthResponse(
    user: User,
    organization: Organization,
    membership: OrganizationMember,
    tokens: { accessToken: string; refreshToken: string; expiresIn: string },
  ): AuthResponseDto {
    return {
      ...this.buildIdentityResponse(user, organization, membership),
      tokens,
    };
  }

  private buildIdentityResponse(
    user: User,
    organization: Organization,
    membership: OrganizationMember,
  ): MeResponseDto {
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      membership: {
        id: membership.id,
        organizationId: membership.organizationId,
        role: membership.role,
        status: membership.status,
      },
      role: membership.role,
    };
  }
}

export const authService = new AuthService();
