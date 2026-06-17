import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).optional(),
  isDefault: z.boolean().optional().default(false),
});

export const updateTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const addTeamMemberSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  isLead: z.boolean().optional().default(false),
});

export const teamIdParamsSchema = z.object({
  id: z.string().uuid("Invalid team ID"),
});

export const teamMemberParamsSchema = z.object({
  id: z.string().uuid("Invalid team ID"),
  memberId: z.string().uuid("Invalid member ID"),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;
export type TeamIdParams = z.infer<typeof teamIdParamsSchema>;
export type TeamMemberParams = z.infer<typeof teamMemberParamsSchema>;
