import { Router } from "express";
import OpenAI from "openai";
import { aiGroupSummarySchema, aiParseExpenseSchema } from "@splitmint/shared";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { assertOwnerAccess } from "../services/groupGuard.js";
import { deriveBalances, deriveSettlements } from "../services/balanceService.js";
import { HttpError } from "../utils/httpError.js";

export const aiRouter = Router();

aiRouter.use(authMiddleware);

aiRouter.post("/parse-expense", validateBody(aiParseExpenseSchema), async (req, res) => {
  if (!config.openAIKey) {
    throw new HttpError(503, "MintSense is unavailable: missing API key");
  }

  const { text, groupId } = req.body;
  await assertOwnerAccess(groupId, req.user!.userId);

  const participants = await prisma.participant.findMany({
    where: { groupId },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  const client = new OpenAI({ apiKey: config.openAIKey });
  const prompt = [
    "Parse this group expense text into strict JSON.",
    "Return keys: amountMinor, description, expenseDate, payerParticipantId, payerParticipantName, participantIds, participantNames, splitModeCandidate, expenseCategory.",
    "Use splitModeCandidate from: equal, custom, percentage.",
    "Use expenseCategory from: Food, Transport, Housing, Utilities, Entertainment, Shopping, Health, Travel, Other.",
    "Only use participants from this list:",
    JSON.stringify(participants),
    "If unsure, keep fields null and preserve safety.",
    `Text: ${text}`
  ].join("\n");

  const completion = await client.responses.create({
    model: "gpt-4o-mini",
    input: prompt,
    temperature: 0
  });

  const raw = completion.output_text?.trim();
  if (!raw) {
    throw new HttpError(502, "No parse result returned by model");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(502, "Model returned malformed parse result");
  }

  res.json({ parsed });
});

aiRouter.post("/group-summary", validateBody(aiGroupSummarySchema), async (req, res) => {
  if (!config.openAIKey) {
    throw new HttpError(503, "MintSense is unavailable: missing API key");
  }

  const { groupId } = req.body;
  await assertOwnerAccess(groupId, req.user!.userId);

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      participants: { orderBy: { name: "asc" } },
      expenses: {
        include: {
          shares: true
        },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
        take: 40
      }
    }
  });

  if (!group) {
    throw new HttpError(404, "Group not found");
  }

  const participantMap = Object.fromEntries(group.participants.map((participant) => [participant.id, participant.name]));
  const { netByParticipant } = deriveBalances(group.participants, group.expenses);
  const deterministicSettlements = deriveSettlements(netByParticipant);

  const client = new OpenAI({ apiKey: config.openAIKey });
  const prompt = [
    "You are MintSense, an expense-sharing assistant.",
    "Return strict JSON with keys: summary, topCategory, aiSettlementSuggestions.",
    "summary: short human-readable overview (2-3 sentences).",
    "topCategory: one of Food, Transport, Housing, Utilities, Entertainment, Shopping, Health, Travel, Other.",
    "aiSettlementSuggestions: array of objects { fromParticipantId, toParticipantId, amountMinor, reason }.",
    "Keep aiSettlementSuggestions realistic, concise, and aligned with net balances.",
    "Group context:",
    JSON.stringify({
      groupName: group.name,
      participants: group.participants.map((participant) => ({
        id: participant.id,
        name: participant.name
      })),
      recentExpenses: group.expenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        amountMinor: expense.amountMinor,
        expenseDate: expense.expenseDate,
        payerParticipantId: expense.payerParticipantId,
        shares: expense.shares
      })),
      netByParticipant,
      deterministicSettlements
    }),
    "Use participant ids exactly as provided."
  ].join("\n");

  const completion = await client.responses.create({
    model: "gpt-4o-mini",
    input: prompt,
    temperature: 0.2
  });

  const raw = completion.output_text?.trim();
  if (!raw) {
    throw new HttpError(502, "No summary result returned by model");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(502, "Model returned malformed summary result");
  }

  res.json({ summary: parsed, participantMap });
});
