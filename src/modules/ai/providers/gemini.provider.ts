import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIAnalysisResult, AIProvider } from "./ai.provider";

const MODEL = "gemini-2.0-flash";
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

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async analyze(subject: string, description: string): Promise<AIAnalysisResult> {
    const model = this.client.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(buildPrompt(subject, description));
    let text = result.response.text().trim();
    // Strip markdown code fences that Gemini occasionally wraps around JSON
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }
    const parsed = JSON.parse(text);

    return {
      ...parsed,
      modelVersion: MODEL,
      promptVersion: PROMPT_VERSION,
    };
  }
}
