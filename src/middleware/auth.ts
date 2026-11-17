import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { Types } from "mongoose";
import { verifyAccessToken } from "../config/jwt.js";
import type { UserRoute } from "../types/UserRole.js";

const isUserRoute = (role: unknown): role is UserRoute =>
  role === "user" || role === "admin";

const unauthorized = (res: Response): void => {
  res.status(401).json({
    success: false,
    message: "Invalid or expired token",
  });
};

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const authorization = req.get("authorization");
  if (!authorization) {
    res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
    return;
  }

  const [scheme, token, ...extra] = authorization.trim().split(/\s+/);
  if (
    scheme.toLowerCase() !== "bearer" ||
    !token ||
    extra.length > 0
  ) {
    unauthorized(res);
    return;
  }

  let payload: string | JwtPayload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      unauthorized(res);
      return;
    }

    next(error);
    return;
  }

  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    !Types.ObjectId.isValid(payload.sub) ||
    !isUserRoute(payload.role)
  ) {
    unauthorized(res);
    return;
  }

  req.user = {
    id: payload.sub,
    role: payload.role,
  };
  next();
};