import { env } from "../../../config/env";
import { logger } from "../../../infrastructure/logger/pino.logger";
import type { AIProvider } from "./ai.provider";
import { GeminiProvider } from "./gemini.provider";
import { OllamaProvider } from "./ollama.provider";
import { OpenAIProvider } from "./openai.provider";

let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_provider) return _provider;

  logger.info(
    { provider: env.AI_PROVIDER, baseUrl: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL, keyPrefix: env.OLLAMA_API_KEY?.slice(0, 8) },
    "Initializing AI provider",
  );

  if (env.AI_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
    _provider = new OpenAIProvider(env.OPENAI_API_KEY);
  } else if (env.AI_PROVIDER === "ollama") {
    _provider = new OllamaProvider(env.OLLAMA_BASE_URL!, env.OLLAMA_MODEL!, env.OLLAMA_API_KEY!);
  } else {
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
    _provider = new GeminiProvider(env.GEMINI_API_KEY);
  }

  return _provider;
}
