import type { Response } from "express";
import jwt from "jsonwebtoken";
import { AUTH_COOKIE_NAME, config } from "../config.js";

type SessionUser = {
  userId: string;
  email: string;
};

export function issueAuthCookie(res: Response, user: SessionUser): void {
  const token = jwt.sign(user, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"]
  });

  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 7
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction
  });
}
