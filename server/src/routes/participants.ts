import { Router } from "express";
import { createParticipantSchema, updateParticipantSchema } from "@splitmint/shared";
import { prisma } from "../prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { HttpError } from "../utils/httpError.js";
import { assertOwnerAccess } from "../services/groupGuard.js";

export const participantsRouter = Router({ mergeParams: true });

participantsRouter.use(authMiddleware);

participantsRouter.get("/", async (req, res) => {
  const groupId = String((req.params as Record<string, string>).id);
  await assertOwnerAccess(groupId, req.user!.userId);

  const participants = await prisma.participant.findMany({ where: { groupId }, orderBy: { name: "asc" } });
  res.json({ participants });
});

participantsRouter.post("/", validateBody(createParticipantSchema), async (req, res) => {
  const groupId = String((req.params as Record<string, string>).id);
  await assertOwnerAccess(groupId, req.user!.userId);

  const total = await prisma.participant.count({ where: { groupId } });
  if (total >= 4) {
    throw new HttpError(400, "A group can have a maximum of 4 participants");
  }

  const participant = await prisma.participant.create({
    data: {
      groupId,
      name: req.body.name,
      avatarColor: req.body.avatarColor,
      isOwnerParticipant: false
    }
  });

  res.status(201).json({ participant });
});

participantsRouter.put("/:participantId", validateBody(updateParticipantSchema), async (req, res) => {
  const params = req.params as Record<string, string>;
  const groupId = String(params.id);
  const participantId = String(params.participantId);
  await assertOwnerAccess(groupId, req.user!.userId);

  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant || participant.groupId !== groupId) {
    throw new HttpError(404, "Participant not found");
  }

  const updated = await prisma.participant.update({
    where: { id: participantId },
    data: {
      name: req.body.name,
      avatarColor: req.body.avatarColor
    }
  });

  res.json({ participant: updated });
});

participantsRouter.delete("/:participantId", async (req, res) => {
  const params = req.params as Record<string, string>;
  const groupId = String(params.id);
  const participantId = String(params.participantId);
  await assertOwnerAccess(groupId, req.user!.userId);

  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant || participant.groupId !== groupId) {
    throw new HttpError(404, "Participant not found");
  }

  if (participant.isOwnerParticipant) {
    throw new HttpError(400, "Owner participant cannot be removed");
  }

  // If participant appears in history, remove impacted expenses so balances remain consistent.
  const result = await prisma.$transaction(async (tx: any) => {
    const impactedExpenses = await tx.expense.findMany({
      where: {
        groupId,
        OR: [
          { payerParticipantId: participantId },
          { shares: { some: { participantId } } }
        ]
      },
      select: { id: true }
    });

    const impactedExpenseIds = impactedExpenses.map((expense: { id: string }) => expense.id);

    if (impactedExpenseIds.length > 0) {
      await tx.expenseShare.deleteMany({ where: { expenseId: { in: impactedExpenseIds } } });
      await tx.expense.deleteMany({ where: { id: { in: impactedExpenseIds } } });
    }

    await tx.participant.delete({ where: { id: participantId } });

    return { removedExpenseCount: impactedExpenseIds.length };
  });

  res.json({ ok: true, removedExpenseCount: result.removedExpenseCount });
});
