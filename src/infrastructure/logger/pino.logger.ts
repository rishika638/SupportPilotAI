import pino, { Logger, LoggerOptions } from "pino";
import { env, isDevelopment } from "../../config/env";

const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: {
    service: "support-pilot-ai",
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "passwordHash",
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
    ],
    remove: true,
  },
};

if (isDevelopment) {
  loggerOptions.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  };
}

export const logger: Logger = pino(loggerOptions);

export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
