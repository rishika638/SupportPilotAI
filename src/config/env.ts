import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).optional(),
  FRONTEND_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .url()
      .refine((value) => {
        const origin = new URL(value);
        return origin.pathname === "/" && !origin.search && !origin.hash;
      }, "must be an origin without a path, query, or fragment")
      .transform((value) => new URL(value).origin)
      .optional(),
  ),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_HOST: z.string().min(1).default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_TLS: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(["openai", "gemini", "ollama"]).default("gemini"),
  OLLAMA_BASE_URL: z.string().url().optional().default("http://localhost:11434/v1"),
  OLLAMA_MODEL: z.string().optional().default("llama3"),
  OLLAMA_API_KEY: z.string().optional().default(""),
  METRICS_TOKEN: z.string().min(16).optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
}).superRefine((configuration, context) => {
  if (configuration.NODE_ENV !== "production") return;

  const placeholderSecret = /^(change[-_ ]?me|replace[-_ ]?me|your[-_ ]|example)/i;
  if (!configuration.FRONTEND_URL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["FRONTEND_URL"],
      message: "must be set to the exact HTTPS frontend origin in production",
    });
  } else if (!configuration.FRONTEND_URL.startsWith("https://")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["FRONTEND_URL"],
      message: "must use HTTPS in production",
    });
  }
  if (configuration.TRUST_PROXY_HOPS === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TRUST_PROXY_HOPS"],
      message: "must be set to the verified proxy hop count in production",
    });
  }
  if (configuration.REDIS_TLS === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_TLS"],
      message: "must be explicitly set to match the Redis endpoint scheme in production",
    });
  }

  let databaseUrl: URL | undefined;
  try {
    databaseUrl = new URL(configuration.DATABASE_URL);
  } catch {
    // The required-value validation below reports malformed URLs to production.
  }
  if (
    !databaseUrl ||
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !["require", "verify-ca", "verify-full"].includes(
      databaseUrl.searchParams.get("sslmode")?.toLowerCase() ?? "",
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "must be a PostgreSQL URL with sslmode=require, verify-ca, or verify-full in production",
    });
  }

  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
    if (placeholderSecret.test(configuration[key])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: "must be replaced with a unique, randomly generated production secret",
      });
    }
  }

  if (configuration.JWT_ACCESS_SECRET === configuration.JWT_REFRESH_SECRET) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_REFRESH_SECRET"],
      message: "must differ from JWT_ACCESS_SECRET",
    });
  }

  if (configuration.METRICS_TOKEN && placeholderSecret.test(configuration.METRICS_TOKEN)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["METRICS_TOKEN"],
      message: "must be replaced with a randomly generated production token",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const envSource = { ...process.env };
  if (envSource.NODE_ENV === "test") {
    envSource.DATABASE_URL =
      envSource.DATABASE_URL || "postgresql://test:test@localhost:5432/test_db";
    envSource.JWT_ACCESS_SECRET =
      envSource.JWT_ACCESS_SECRET || "test-jwt-access-secret-minimum-32-chars-long";
    envSource.JWT_REFRESH_SECRET =
      envSource.JWT_REFRESH_SECRET || "test-jwt-refresh-secret-minimum-32-chars-long";
  }

  const parsed = envSchema.safeParse(envSource);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
