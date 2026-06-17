import { UserRole } from "@prisma/client";

export interface ExampleProfileDto {
  message: string;
  userId: string;
  organizationId: string;
  role: UserRole;
}

export interface ExampleAdminDto {
  message: string;
  organizationId: string;
}

export interface ExampleReportsDto {
  message: string;
  organizationId: string;
  accessibleRoles: UserRole[];
}
