import express, { type RequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { groupsRouter } from "./routes/groups.js";
import { participantsRouter } from "./routes/participants.js";
import { expensesRouter } from "./routes/expenses.js";
import { balancesRouter } from "./routes/balances.js";
import { aiRouter } from "./routes/ai.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser() as unknown as RequestHandler);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/groups/:id/participants", participantsRouter);
app.use("/api/groups/:id/expenses", expensesRouter);
app.use("/api/groups/:id", balancesRouter);
app.use("/api/ai", aiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
