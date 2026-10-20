import { z } from "zod";

export const aiAnalysisSchema = z.object({
  summary: z.string().min(1, "Summary is required"),
  category: z.string().min(1, "Category is required"),
  subcategory: z.string().optional().nullable().transform((v) => v ?? undefined),
  sentiment: z.enum(["positive", "neutral", "negative"]).catch("neutral"),
  suggestedPriority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).catch("MEDIUM"),
  suggestedResponse: z.string().min(1, "Suggested response is required"),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).catch(0.8),
  modelVersion: z.string().default("unknown"),
  tokenCount: z.number().int().nonnegative().optional(),
});

export type AIAnalysisResult = z.infer<typeof aiAnalysisSchema>;

export interface AIProvider {
  analyze(subject: string, description: string): Promise<AIAnalysisResult>;
}
