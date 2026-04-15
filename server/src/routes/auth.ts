import { Router } from "express";
import bcrypt from "bcryptjs";
import { loginSchema, registerSchema } from "@splitmint/shared";
import { prisma } from "../prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { clearAuthCookie, issueAuthCookie } from "../utils/authCookie.js";
import { validateBody } from "../middleware/validate.js";
import { HttpError } from "../utils/httpError.js";

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), async (req, res) => {
  const { email, password } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(400, "User already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: { id: true, email: true, createdAt: true }
  });

  issueAuthCookie(res, { userId: user.id, email: user.email });
  res.status(201).json({ user });
});

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new HttpError(401, "Invalid credentials");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new HttpError(401, "Invalid credentials");
  }

  issueAuthCookie(res, { userId: user.id, email: user.email });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt
    }
  });
});

authRouter.get("/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, createdAt: true }
  });

  if (!user) {
    clearAuthCookie(res);
    throw new HttpError(401, "Session invalid");
  }

  res.json({ user });
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});
