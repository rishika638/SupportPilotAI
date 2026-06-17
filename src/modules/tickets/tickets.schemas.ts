import {
  AssignmentType,
  CommentVisibility,
  TicketChannel,
  TicketPriority,
  TicketStatus,
} from "@prisma/client";
import { z } from "zod";

export const ticketIdParamsSchema = z.object({
  id: z.string().uuid("Invalid ticket ID"),
});

export const createTicketSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1),
  customerName: z.string().trim().max(255).optional(),
  customerEmail: z.string().trim().email().max(320).optional(),
  priority: z.nativeEnum(TicketPriority).optional().default(TicketPriority.MEDIUM),
  channel: z.nativeEnum(TicketChannel).optional().default(TicketChannel.WEB),
  tags: z.array(z.string().trim().min(1).max(100)).max(20).optional().default([]),
  teamId: z.string().uuid("Invalid team ID").optional(),
});

export const updateTicketSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().min(1).optional(),
    customerName: z.string().trim().max(255).nullable().optional(),
    customerEmail: z.string().trim().email().max(320).nullable().optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    channel: z.nativeEnum(TicketChannel).optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    teamId: z.string().uuid("Invalid team ID").nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const changeTicketStatusSchema = z.object({
  status: z.nativeEnum(TicketStatus),
});

export const assignTicketSchema = z
  .object({
    assigneeId: z.string().uuid("Invalid assignee ID").optional(),
    teamId: z.string().uuid("Invalid team ID").optional(),
    assignmentType: z.nativeEnum(AssignmentType).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.assigneeId !== undefined || data.teamId !== undefined, {
    message: "Either assigneeId or teamId must be provided",
  });

export const createTicketCommentSchema = z.object({
  body: z.string().trim().min(1),
  visibility: z
    .nativeEnum(CommentVisibility)
    .optional()
    .default(CommentVisibility.PUBLIC),
});

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  assigneeId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  createdById: z.string().uuid().optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sortBy: z
    .enum(["createdAt", "updatedAt", "priority", "status", "ticketNumber"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type TicketIdParams = z.infer<typeof ticketIdParamsSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type ChangeTicketStatusInput = z.infer<typeof changeTicketStatusSchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export type CreateTicketCommentInput = z.infer<typeof createTicketCommentSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
