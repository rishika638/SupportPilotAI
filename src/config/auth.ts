import { env } from "./env";

export const authConfig = {
  bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
} as const;
