import { Organization, OrganizationMember, User } from "@prisma/client";
import { RequestContext } from "./response.types";

declare module "express-serve-static-core" {
  interface Request {
    context: RequestContext;
    user?: User;
    organization?: Organization;
    membership?: OrganizationMember;
  }
}
