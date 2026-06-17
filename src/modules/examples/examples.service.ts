import { UserRole } from "@prisma/client";
import { AuthenticatedUserContext } from "../../shared/types/auth.types";
import {
  ExampleAdminDto,
  ExampleProfileDto,
  ExampleReportsDto,
} from "./examples.dto";

export class ExamplesService {
  getProfile(auth: AuthenticatedUserContext): ExampleProfileDto {
    return {
      message: "Authenticated profile access granted",
      userId: auth.userId,
      organizationId: auth.organizationId,
      role: auth.role,
    };
  }

  getAdminDashboard(auth: AuthenticatedUserContext): ExampleAdminDto {
    return {
      message: "Admin-only dashboard access granted",
      organizationId: auth.organizationId,
    };
  }

  getReports(auth: AuthenticatedUserContext): ExampleReportsDto {
    return {
      message: "Manager or admin reports access granted",
      organizationId: auth.organizationId,
      accessibleRoles: [UserRole.ADMIN, UserRole.MANAGER],
    };
  }
}

export const examplesService = new ExamplesService();
