import { Router } from "express";
import { expenseCreateSchema, expenseFilterSchema, expenseUpdateSchema } from "@splitmint/shared";
import { prisma } from "../prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { assertOwnerAccess } from "../services/groupGuard.js";
import { computeExpenseShares } from "../services/splitEngine.js";
import { HttpError } from "../utils/httpError.js";

export const expensesRouter = Router({ mergeParams: true });

expensesRouter.use(authMiddleware);

async function ensureGroupParticipants(groupId: string, participantIds: string[]): Promise<void> {
  const records = await prisma.participant.findMany({ where: { id: { in: participantIds }, groupId } });
  if (records.length !== new Set(participantIds).size) {
    throw new HttpError(400, "Payer and split participants must belong to the group");
  }
}

function serializeExpense(expense: {
  payerParticipant: { name: string };
  [key: string]: unknown;
}) {
  return {
    ...expense,
    payerParticipantName: expense.payerParticipant.name
  };
}

expensesRouter.get("/", validateQuery(expenseFilterSchema), async (req, res) => {
  const groupId = String((req.params as Record<string, string>).id);
  await assertOwnerAccess(groupId, req.user!.userId);

  const filters = req.query as unknown as {
    query?: string;
    participantId?: string;
    startDate?: string;
    endDate?: string;
    minAmountMinor?: number;
    maxAmountMinor?: number;
  };

  const where = {
    groupId,
    description: filters.query ? { contains: filters.query, mode: "insensitive" as const } : undefined,
    amountMinor: filters.minAmountMinor || filters.maxAmountMinor ? {
      gte: filters.minAmountMinor,
      lte: filters.maxAmountMinor
    } : undefined,
    expenseDate: filters.startDate || filters.endDate ? {
      gte: filters.startDate ? new Date(filters.startDate) : undefined,
      lte: filters.endDate ? new Date(filters.endDate) : undefined
    } : undefined,
    OR: filters.participantId ? [
      { payerParticipantId: filters.participantId },
      { shares: { some: { participantId: filters.participantId } } }
    ] : undefined
  };

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      shares: true,
      payerParticipant: { select: { name: true } }
    },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }]
  });

  res.json({
    expenses: expenses.map((expense) => serializeExpense(expense as any)),
    metadata: {
      appliedFilters: filters,
      count: expenses.length
    }
  });
});

expensesRouter.post("/", validateBody(expenseCreateSchema), async (req, res) => {
  const groupId = String((req.params as Record<string, string>).id);
  await assertOwnerAccess(groupId, req.user!.userId);

  const payload = req.body;
  await ensureGroupParticipants(groupId, [payload.payerParticipantId, ...payload.participantIds]);

  const shares = computeExpenseShares({
    splitMode: payload.splitMode,
    amountMinor: payload.amountMinor,
    payerParticipantId: payload.payerParticipantId,
    participantIds: payload.participantIds,
    customShares: payload.customShares,
    percentageShares: payload.percentageShares
  });

  const expense = await prisma.expense.create({
    data: {
      groupId,
      payerParticipantId: payload.payerParticipantId,
      description: payload.description,
      amountMinor: payload.amountMinor,
      expenseDate: new Date(payload.expenseDate),
      splitMode: payload.splitMode,
      shares: {
        create: shares
      }
    },
    include: {
      shares: true,
      payerParticipant: { select: { name: true } }
    }
  });

  res.status(201).json({ expense: serializeExpense(expense) });
});

expensesRouter.put("/:expenseId", validateBody(expenseUpdateSchema), async (req, res) => {
  const params = req.params as Record<string, string>;
  const groupId = String(params.id);
  const expenseId = String(params.expenseId);
  await assertOwnerAccess(groupId, req.user!.userId);

  const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!existing || existing.groupId !== groupId) {
    throw new HttpError(404, "Expense not found");
  }

  const payload = req.body;
  await ensureGroupParticipants(groupId, [payload.payerParticipantId, ...payload.participantIds]);

  const shares = computeExpenseShares({
    splitMode: payload.splitMode,
    amountMinor: payload.amountMinor,
    payerParticipantId: payload.payerParticipantId,
    participantIds: payload.participantIds,
    customShares: payload.customShares,
    percentageShares: payload.percentageShares
  });

  const expense = await prisma.$transaction(async (tx: any) => {
    await tx.expenseShare.deleteMany({ where: { expenseId } });
    return tx.expense.update({
      where: { id: expenseId },
      data: {
        payerParticipantId: payload.payerParticipantId,
        description: payload.description,
        amountMinor: payload.amountMinor,
        expenseDate: new Date(payload.expenseDate),
        splitMode: payload.splitMode,
        shares: {
          create: shares
        }
      },
      include: {
        shares: true,
        payerParticipant: { select: { name: true } }
      }
    });
  });

  res.json({ expense: serializeExpense(expense) });
});

expensesRouter.delete("/:expenseId", async (req, res) => {
  const params = req.params as Record<string, string>;
  const groupId = String(params.id);
  const expenseId = String(params.expenseId);
  await assertOwnerAccess(groupId, req.user!.userId);

  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense || expense.groupId !== groupId) {
    throw new HttpError(404, "Expense not found");
  }

  await prisma.expense.delete({ where: { id: expenseId } });
  res.json({ ok: true });
});
