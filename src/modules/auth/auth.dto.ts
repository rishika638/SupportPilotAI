import { MembershipStatus, UserRole } from "@prisma/client";

export interface AuthUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthOrganizationDto {
  id: string;
  name: string;
  slug: string;
}

export interface AuthMembershipDto {
  id: string;
  organizationId: string;
  role: UserRole;
  status: MembershipStatus;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthResponseDto {
  user: AuthUserDto;
  organization: AuthOrganizationDto;
  membership: AuthMembershipDto;
  tokens: AuthTokensDto;
}

export interface MeResponseDto {
  user: AuthUserDto;
  organization: AuthOrganizationDto;
  membership: AuthMembershipDto;
  role: UserRole;
}

export interface RefreshResponseDto {
  tokens: AuthTokensDto;
}

export interface LogoutResponseDto {
  revoked: boolean;
}

export interface AuthRequestContext {
  ipAddress?: string;
  userAgent?: string;
}
