import bcrypt from "bcrypt";
import { authConfig } from "../../config/auth";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, authConfig.bcryptSaltRounds);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
