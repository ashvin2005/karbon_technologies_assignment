import { Router } from "express";
import { createGroupSchema, updateGroupSchema } from "@splitmint/shared";
import { prisma } from "../prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { HttpError } from "../utils/httpError.js";
import { assertOwnerAccess, getGroupParticipants } from "../services/groupGuard.js";

export const groupsRouter = Router();

groupsRouter.use(authMiddleware);

groupsRouter.get("/", async (req, res) => {
  const groups = await prisma.group.findMany({
    where: { ownerUserId: req.user!.userId },
    include: {
      participants: {
        select: { id: true, isOwnerParticipant: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  res.json({
    groups: groups.map((group: {
      id: string;
      name: string;
      ownerUserId: string;
      participants: Array<{ id: string; isOwnerParticipant: boolean }>;
      createdAt: Date;
      updatedAt: Date;
    }) => ({
      id: group.id,
      name: group.name,
      ownerUserId: group.ownerUserId,
      participantCount: group.participants.length,
      ownerParticipantId: group.participants.find((p: { id: string; isOwnerParticipant: boolean }) => p.isOwnerParticipant)?.id,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    }))
  });
});

groupsRouter.get("/:id", async (req, res) => {
  const groupId = String(req.params.id);
  await assertOwnerAccess(groupId, req.user!.userId);

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      participants: { orderBy: { name: "asc" } }
    }
  });

  if (!group) {
    throw new HttpError(404, "Group not found");
  }

  const ownerParticipant = group.participants.find((p: { id: string; isOwnerParticipant: boolean }) => p.isOwnerParticipant);

  res.json({
    group: {
      id: group.id,
      name: group.name,
      ownerUserId: group.ownerUserId,
      participantCount: group.participants.length,
      ownerParticipantId: ownerParticipant?.id,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      participants: group.participants
    }
  });
});

groupsRouter.post("/", validateBody(createGroupSchema), async (req, res) => {
  const { name } = req.body;

  const group = await prisma.$transaction(async (tx: any) => {
    const created = await tx.group.create({
      data: {
        name,
        ownerUserId: req.user!.userId
      }
    });

    await tx.participant.create({
      data: {
        groupId: created.id,
        name: "You",
        avatarColor: "teal",
        isOwnerParticipant: true
      }
    });

    return created;
  });

  const participants = await getGroupParticipants(group.id);
  const ownerParticipant = participants.find((p: { id: string; isOwnerParticipant: boolean }) => p.isOwnerParticipant);

  res.status(201).json({
    group: {
      id: group.id,
      name: group.name,
      ownerUserId: group.ownerUserId,
      participantCount: participants.length,
      ownerParticipantId: ownerParticipant?.id,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      participants
    }
  });
});

groupsRouter.put("/:id", validateBody(updateGroupSchema), async (req, res) => {
  const groupId = String(req.params.id);
  await assertOwnerAccess(groupId, req.user!.userId);

  const updated = await prisma.group.update({
    where: { id: groupId },
    data: { name: req.body.name }
  });

  res.json({ group: updated });
});

groupsRouter.delete("/:id", async (req, res) => {
  const groupId = String(req.params.id);
  await assertOwnerAccess(groupId, req.user!.userId);

  await prisma.group.delete({ where: { id: groupId } });
  res.json({ ok: true });
});
