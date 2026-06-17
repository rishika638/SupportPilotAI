import { verifyAccessToken } from "../../infrastructure/auth/jwt.service";
import { ErrorCodes } from "../../shared/errors/error-codes";
import {
  AuthenticationError,
  ForbiddenError,
} from "../../shared/errors/auth.errors";
import { ResolvedAuthContext } from "../../shared/types/auth.types";
import { organizationMemberRepository } from "./repositories/organization-member.repository";
import { organizationRepository } from "./repositories/organization.repository";
import { userRepository } from "./repositories/user.repository";

export class AuthContextService {
  async resolveFromBearerToken(token: string): Promise<ResolvedAuthContext> {
    const payload = verifyAccessToken(token);
    return this.resolveFromAccessClaims(payload.sub, payload.organizationId);
  }

  async resolveFromAccessClaims(
    userId: string,
    organizationId: string,
  ): Promise<ResolvedAuthContext> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new AuthenticationError(
        "User account is inactive or unavailable",
        ErrorCodes.UNAUTHORIZED,
      );
    }

    if (!user.isActive) {
      throw new AuthenticationError(
        "User account is inactive or unavailable",
        ErrorCodes.UNAUTHORIZED,
      );
    }

    const organization = await organizationRepository.findById(organizationId);

    if (!organization) {
      throw new ForbiddenError(
        "Organization is no longer available",
        ErrorCodes.ORGANIZATION_UNAVAILABLE,
      );
    }

    const membership = await organizationMemberRepository.findActiveByUserAndOrganization(
      userId,
      organizationId,
    );

    if (!membership) {
      throw new ForbiddenError(
        "Organization membership is inactive or unavailable",
        ErrorCodes.NO_ACTIVE_MEMBERSHIP,
      );
    }

    return {
      user,
      organization,
      membership,
      auth: {
        userId: user.id,
        email: user.email,
        organizationId: organization.id,
        membershipId: membership.id,
        role: membership.role,
      },
    };
  }
}

export const authContextService = new AuthContextService();
