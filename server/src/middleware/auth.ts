import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AUTH_COOKIE_NAME, config } from "../config.js";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded !== "object" || !("userId" in decoded)) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    req.user = decoded as { userId: string; email: string };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
