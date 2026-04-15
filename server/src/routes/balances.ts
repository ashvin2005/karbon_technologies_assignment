import { Router } from "express";
import { prisma } from "../prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { assertOwnerAccess } from "../services/groupGuard.js";
import { deriveBalances, deriveSettlements, ownerSummary } from "../services/balanceService.js";

export const balancesRouter = Router({ mergeParams: true });

balancesRouter.use(authMiddleware);

balancesRouter.get("/balances", async (req, res) => {
  const groupId = String((req.params as Record<string, string>).id);
  await assertOwnerAccess(groupId, req.user!.userId);

  const participants = await prisma.participant.findMany({ where: { groupId }, orderBy: { name: "asc" } });
  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: {
      shares: { select: { participantId: true, amountMinor: true } }
    }
  });

  const ownerParticipant = participants.find((p) => p.isOwnerParticipant);
  const { matrixEntries, netByParticipant } = deriveBalances(participants, expenses);

  res.json({
    participants,
    matrixEntries,
    netByParticipant,
    ownerSummary: ownerParticipant ? ownerSummary(ownerParticipant.id, matrixEntries) : null
  });
});

balancesRouter.get("/settlements", async (req, res) => {
  const groupId = String((req.params as Record<string, string>).id);
  await assertOwnerAccess(groupId, req.user!.userId);

  const participants = await prisma.participant.findMany({ where: { groupId }, orderBy: { name: "asc" } });
  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: {
      shares: { select: { participantId: true, amountMinor: true } }
    }
  });

  const { netByParticipant } = deriveBalances(participants, expenses);
  const recommendations = deriveSettlements(netByParticipant);

  res.json({ recommendations });
});
