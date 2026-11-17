import jwt, { type JwtPayload } from "jsonwebtoken";
import type { UserRoute } from "../types/UserRole.js";

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 bytes");
  }

  return secret;
};

export const assertJwtConfiguration = (): void => {
  getJwtSecret();
};

export const createAccessToken = (userId: string, role: UserRoute): string =>
  jwt.sign({ role }, getJwtSecret(), {
    algorithm: "HS256",
    subject: userId,
    expiresIn: "15m",
  });

export const verifyAccessToken = (token: string): string | JwtPayload =>
  jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
