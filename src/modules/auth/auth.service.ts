import { Organization, OrganizationMember, User } from "@prisma/client";
import { jwtConfig } from "../../config/jwt";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../infrastructure/auth/jwt.service";
import { hashPassword, verifyPassword } from "../../infrastructure/auth/password.service";
import { prisma } from "../../infrastructure/database/prisma.client";
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
    const payload = verifyRefreshToken(input.refreshToken);
    const tokenHash = hashToken(input.refreshToken);

    const storedToken = await refreshTokenRepository.findValidByHash(tokenHash);

    if (!storedToken || storedToken.userId !== payload.sub) {
      throw new AuthenticationError("Invalid refresh token", "INVALID_REFRESH_TOKEN");
    }

    const user = await userRepository.findByIdWithMemberships(payload.sub);

    if (!user || user.memberships.length === 0) {
      throw new ForbiddenError(
        "No active organization membership found",
        "NO_ACTIVE_MEMBERSHIP",
      );
    }

    const primaryMembership = user.memberships[0];
    const organization = primaryMembership.organization;

    await refreshTokenRepository.revokeByHash(tokenHash);

    const tokens = await this.issueTokenPair(
      user,
      primaryMembership,
      organization,
      context,
    );

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
  ) {
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      organizationId: organization.id,
      role: membership.role,
    });

    const refresh = signRefreshToken(user.id);

    await refreshTokenRepository.create({
      userId: user.id,
      tokenHash: hashToken(refresh.token),
      expiresAt: refresh.expiresAt,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });

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
