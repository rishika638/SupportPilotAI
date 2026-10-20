import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aiAnalysisSchema } from "../src/modules/ai/providers/ai.provider";

describe("AI Analysis Response Schema Validation", () => {
  it("validates a complete, correctly typed AI response", () => {
    const valid = {
      summary: "Customer cannot reset their password due to 404 on reset link.",
      category: "Authentication",
      subcategory: "Password Reset",
      sentiment: "negative",
      suggestedPriority: "HIGH",
      suggestedResponse: "Hello, we have regenerated your reset link and verified it is active.",
      tags: ["auth", "password-reset"],
      confidence: 0.95,
      modelVersion: "gpt-4o-mini",
      tokenCount: 150,
    };

    const parsed = aiAnalysisSchema.parse(valid);
    assert.equal(parsed.summary, valid.summary);
    assert.equal(parsed.suggestedPriority, "HIGH");
    assert.equal(parsed.suggestedResponse, valid.suggestedResponse);
    assert.equal(parsed.confidence, 0.95);
  });

  it("fails when summary is missing", () => {
    const invalid = {
      category: "Billing",
      sentiment: "neutral",
      suggestedPriority: "LOW",
      suggestedResponse: "Here is your invoice.",
    };

    assert.throws(() => aiAnalysisSchema.parse(invalid));
  });

  it("fails when suggestedResponse is empty or missing", () => {
    const invalid = {
      summary: "Billing inquiry",
      category: "Billing",
      sentiment: "neutral",
      suggestedPriority: "LOW",
      suggestedResponse: "",
    };

    assert.throws(() => aiAnalysisSchema.parse(invalid));
  });

  it("safely falls back for non-standard sentiment and priority values", () => {
    const lenient = {
      summary: "Login issue",
      category: "Auth",
      sentiment: "very-angry", // should catch to default "neutral"
      suggestedPriority: "CRITICAL", // should catch to default "MEDIUM"
      suggestedResponse: "We are investigating.",
    };

    const parsed = aiAnalysisSchema.parse(lenient);
    assert.equal(parsed.sentiment, "neutral");
    assert.equal(parsed.suggestedPriority, "MEDIUM");
  });
});
