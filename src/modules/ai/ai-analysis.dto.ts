import { AIAnalysisStatus, TicketPriority } from "@prisma/client";

export interface AIAnalysisDto {
  id: string;
  ticketId: string;
  status: AIAnalysisStatus;
  summary: string | null;
  category: string | null;
  subcategory: string | null;
  sentiment: string | null;
  suggestedPriority: TicketPriority | null;
  confidence: number | null;
  tags: string[];
  modelVersion: string | null;
  completedAt: string | null;
  createdAt: string;
}
