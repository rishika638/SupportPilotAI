import {
  AssignmentType,
  CommentVisibility,
  TicketChannel,
  TicketPriority,
  TicketStatus,
} from "@prisma/client";

export interface TicketUserSummaryDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface TicketDto {
  id: string;
  organizationId: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  channel: TicketChannel;
  customerName: string | null;
  customerEmail: string | null;
  tags: string[];
  assigneeId: string | null;
  assignee: TicketUserSummaryDto | null;
  teamId: string | null;
  teamName: string | null;
  createdById: string | null;
  createdBy: TicketUserSummaryDto | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListResponseDto {
  tickets: TicketDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TicketCommentDto {
  id: string;
  ticketId: string;
  body: string;
  visibility: CommentVisibility;
  authorId: string;
  author: TicketUserSummaryDto;
  isFirstResponse: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketCommentListResponseDto {
  comments: TicketCommentDto[];
}

export interface TicketAssignmentDto {
  id: string;
  ticketId: string;
  assigneeId: string | null;
  assignee: TicketUserSummaryDto | null;
  teamId: string | null;
  teamName: string | null;
  assignedById: string | null;
  assignmentType: AssignmentType;
  reason: string | null;
  createdAt: string;
}

export interface TicketAssignResponseDto {
  ticket: TicketDto;
  assignment: TicketAssignmentDto;
}

export interface TicketStatusChangeResponseDto {
  ticket: TicketDto;
  previousStatus: TicketStatus;
  newStatus: TicketStatus;
}
