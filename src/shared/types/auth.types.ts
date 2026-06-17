import {
  Organization,
  OrganizationMember,
  User,
  UserRole,
} from "@prisma/client";

export interface AuthenticatedUserContext {
  userId: string;
  email: string;
  organizationId: string;
  membershipId: string;
  role: UserRole;
}

export interface ResolvedAuthContext {
  user: User;
  organization: Organization;
  membership: OrganizationMember;
  auth: AuthenticatedUserContext;
}
