import OpenAI from "openai";
import type { AIAnalysisResult, AIProvider } from "./ai.provider";

const MODEL = "gpt-4o-mini";
const PROMPT_VERSION = "v1";

function buildPrompt(subject: string, description: string): string {
  return `Analyze this support ticket and return ONLY valid JSON with no markdown.

Subject: ${subject}
Description: ${description}

Required JSON schema:
{
  "summary": "string (1-2 sentences)",
  "category": "string",
  "subcategory": "string",
  "sentiment": "positive" | "neutral" | "negative",
  "suggestedPriority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  "suggestedResponse": "string (professional reply draft)",
  "tags": ["string"],
  "confidence": number (0.0-1.0)
}`;
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async analyze(subject: string, description: string): Promise<AIAnalysisResult> {
    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: buildPrompt(subject, description) }],
      response_format: { type: "json_object" },
    });

    const text = response.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(text);

    return {
      ...parsed,
      modelVersion: MODEL,
      promptVersion: PROMPT_VERSION,
      tokenCount: response.usage?.total_tokens,
    };
  }
}
