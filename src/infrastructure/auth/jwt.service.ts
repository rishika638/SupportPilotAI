import { createHash, randomUUID } from "node:crypto";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { jwtConfig } from "../../config/jwt";
import { AuthenticationError } from "../../shared/errors/auth.errors";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  organizationId: string;
  role: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: "refresh";
}

type TokenPayload = AccessTokenPayload | RefreshTokenPayload;

function signToken(
  payload: TokenPayload,
  secret: string,
  expiresIn: string,
): string {
  const options: SignOptions = { expiresIn: expiresIn as SignOptions["expiresIn"] };
  return jwt.sign(payload, secret, options);
}

export function signAccessToken(payload: Omit<AccessTokenPayload, "type">): string {
  return signToken(
    { ...payload, type: "access" },
    jwtConfig.accessSecret,
    jwtConfig.accessExpiresIn,
  );
}

export function signRefreshToken(userId: string): {
  token: string;
  tokenId: string;
  expiresAt: Date;
} {
  const tokenId = randomUUID();
  const token = signToken(
    { sub: userId, jti: tokenId, type: "refresh" },
    jwtConfig.refreshSecret,
    jwtConfig.refreshExpiresIn,
  );

  const decoded = jwt.decode(token) as JwtPayload | null;
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return { token, tokenId, expiresAt };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return verifyToken<AccessTokenPayload>(token, jwtConfig.accessSecret, "access");
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return verifyToken<RefreshTokenPayload>(token, jwtConfig.refreshSecret, "refresh");
}

function verifyToken<T extends TokenPayload>(
  token: string,
  secret: string,
  expectedType: T["type"],
): T {
  try {
    const payload = jwt.verify(token, secret) as T;

    if (payload.type !== expectedType) {
      throw new AuthenticationError("Invalid token type", "INVALID_TOKEN");
    }

    return payload;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }

    throw new AuthenticationError("Invalid or expired token", "INVALID_TOKEN");
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
