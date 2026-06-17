export interface AIAnalysisResult {
  summary: string;
  category: string;
  subcategory?: string;
  sentiment: "positive" | "neutral" | "negative";
  suggestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  suggestedResponse: string;
  tags: string[];
  confidence: number;
  modelVersion: string;
  tokenCount?: number;
}

export interface AIProvider {
  analyze(subject: string, description: string): Promise<AIAnalysisResult>;
}
