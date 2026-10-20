import OpenAI from "openai";
import { aiAnalysisSchema, type AIAnalysisResult, type AIProvider } from "./ai.provider";

function buildPrompt(subject: string, description: string): string {
  return `Analyze this support ticket and return ONLY valid JSON with no markdown fences.

Subject: ${subject}
Description: ${description}

Return exactly this JSON structure:
{
  "summary": "<1-2 sentence summary>",
  "category": "<category>",
  "subcategory": "<subcategory>",
  "sentiment": "positive or neutral or negative",
  "suggestedPriority": "LOW or MEDIUM or HIGH or URGENT",
  "suggestedResponse": "<professional reply draft>",
  "tags": ["tag1", "tag2"],
  "confidence": 0.9
}`;
}

export class OllamaProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(baseUrl: string, model: string, apiKey: string) {
    this.client = new OpenAI({
      baseURL: baseUrl,
      apiKey,
    });
    this.model = model;
  }

  async analyze(subject: string, description: string): Promise<AIAnalysisResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: buildPrompt(subject, description) }],
      temperature: 0.1,
    });

    let text = response.choices[0].message.content ?? "{}";
    // Strip markdown fences if model wraps output
    if (text.includes("```")) {
      text = text.replace(/^```(?:json)?\s*/im, "").replace(/\s*```$/m, "").trim();
    }

    const parsed = JSON.parse(text);

    return aiAnalysisSchema.parse({
      summary: parsed.summary ?? "",
      category: parsed.category ?? "General",
      subcategory: parsed.subcategory,
      sentiment: parsed.sentiment ?? "neutral",
      suggestedPriority: parsed.suggestedPriority ?? "MEDIUM",
      suggestedResponse: parsed.suggestedResponse ?? "",
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
      modelVersion: this.model,
      tokenCount: response.usage?.total_tokens,
    });
  }
}
